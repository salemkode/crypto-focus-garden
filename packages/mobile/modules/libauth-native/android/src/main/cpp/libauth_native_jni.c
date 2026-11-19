/*
 * JNI bindings for the libauth native core (../../../../cpp).
 * Argument sizes are validated in Kotlin (LibauthNativeModule.kt) before these
 * functions are called; they are re-checked here defensively.
 */
#include <jni.h>
#include <string.h>

#include "lan_hashes.h"
#include "lan_secp256k1.h"

#define JNI_FN(name) Java_expo_modules_libauthnative_LibauthNativeJni_##name

static jbyteArray new_bytes(JNIEnv *env, const uint8_t *data, size_t len) {
  jbyteArray result = (*env)->NewByteArray(env, (jsize)len);
  if (result != NULL && len > 0) {
    (*env)->SetByteArrayRegion(env, result, 0, (jsize)len, (const jbyte *)data);
  }
  return result;
}

/* Copies a Java byte[] of exactly `len` bytes into `out`. Returns 0 on size mismatch. */
static int read_fixed(JNIEnv *env, jbyteArray array, uint8_t *out, jsize len) {
  if (array == NULL || (*env)->GetArrayLength(env, array) != len) return 0;
  (*env)->GetByteArrayRegion(env, array, 0, len, (jbyte *)out);
  return 1;
}

/* Builds the `[status, ...payload]` result used by every fallible secp256k1 call. */
static jbyteArray status_result(JNIEnv *env, int status, const uint8_t *payload, size_t len) {
  uint8_t buffer[1 + 72];
  if (status != 0) {
    buffer[0] = (uint8_t)status;
    return new_bytes(env, buffer, 1);
  }
  buffer[0] = 0;
  memcpy(buffer + 1, payload, len);
  return new_bytes(env, buffer, len + 1);
}

static jbyteArray invalid(JNIEnv *env) {
  uint8_t code = LAN_SECP_INVALID_ARGUMENT;
  return new_bytes(env, &code, 1);
}

/* ------------------------------------------------------------------ hashes */

JNIEXPORT jbyteArray JNICALL JNI_FN(hash)(JNIEnv *env, jclass clazz, jint algorithm, jbyteArray input) {
  (void)clazz;
  uint8_t out[64];
  size_t digest_len = lan_hash_digest_length(algorithm);
  if (digest_len == 0 || input == NULL) return NULL;
  jsize len = (*env)->GetArrayLength(env, input);
  void *data = (*env)->GetPrimitiveArrayCritical(env, input, NULL);
  if (data == NULL && len > 0) return NULL;
  lan_hash(algorithm, (const uint8_t *)data, (size_t)len, out);
  if (data != NULL) (*env)->ReleasePrimitiveArrayCritical(env, input, data, JNI_ABORT);
  return new_bytes(env, out, digest_len);
}

JNIEXPORT jbyteArray JNICALL JNI_FN(hashInit)(JNIEnv *env, jclass clazz, jint algorithm) {
  (void)clazz;
  uint8_t state[512];
  size_t state_len = lan_hash_state_length(algorithm);
  if (state_len == 0 || state_len > sizeof(state)) return NULL;
  lan_hash_init(algorithm, state);
  return new_bytes(env, state, state_len);
}

JNIEXPORT jbyteArray JNICALL JNI_FN(hashUpdate)(JNIEnv *env, jclass clazz, jint algorithm, jbyteArray stateArray,
                                                jbyteArray input) {
  (void)clazz;
  uint8_t state[512];
  size_t state_len = lan_hash_state_length(algorithm);
  if (state_len == 0 || state_len > sizeof(state) || input == NULL) return NULL;
  if (!read_fixed(env, stateArray, state, (jsize)state_len)) return NULL;
  jsize len = (*env)->GetArrayLength(env, input);
  void *data = (*env)->GetPrimitiveArrayCritical(env, input, NULL);
  if (data == NULL && len > 0) return NULL;
  int ok = lan_hash_update(algorithm, state, (const uint8_t *)data, (size_t)len);
  if (data != NULL) (*env)->ReleasePrimitiveArrayCritical(env, input, data, JNI_ABORT);
  if (!ok) return NULL;
  return new_bytes(env, state, state_len);
}

JNIEXPORT jbyteArray JNICALL JNI_FN(hashFinal)(JNIEnv *env, jclass clazz, jint algorithm, jbyteArray stateArray) {
  (void)clazz;
  uint8_t state[512];
  uint8_t out[64];
  size_t state_len = lan_hash_state_length(algorithm);
  if (state_len == 0 || state_len > sizeof(state)) return NULL;
  if (!read_fixed(env, stateArray, state, (jsize)state_len)) return NULL;
  if (!lan_hash_final(algorithm, state, out)) return NULL;
  return new_bytes(env, out, lan_hash_digest_length(algorithm));
}

JNIEXPORT jbyteArray JNICALL JNI_FN(hmac)(JNIEnv *env, jclass clazz, jint algorithm, jbyteArray key,
                                          jbyteArray message) {
  (void)clazz;
  uint8_t out[64];
  if (key == NULL || message == NULL) return NULL;
  jsize key_len = (*env)->GetArrayLength(env, key);
  jsize msg_len = (*env)->GetArrayLength(env, message);
  jbyte *key_data = (*env)->GetByteArrayElements(env, key, NULL);
  jbyte *msg_data = (*env)->GetByteArrayElements(env, message, NULL);
  int ok = lan_hmac(algorithm, (const uint8_t *)key_data, (size_t)key_len, (const uint8_t *)msg_data,
                    (size_t)msg_len, out);
  (*env)->ReleaseByteArrayElements(env, key, key_data, JNI_ABORT);
  (*env)->ReleaseByteArrayElements(env, message, msg_data, JNI_ABORT);
  if (!ok) return NULL;
  return new_bytes(env, out, lan_hash_digest_length(algorithm));
}

JNIEXPORT jbyteArray JNICALL JNI_FN(pbkdf2)(JNIEnv *env, jclass clazz, jint algorithm, jbyteArray password,
                                            jbyteArray salt, jint iterations, jint length) {
  (void)clazz;
  if (password == NULL || salt == NULL || iterations <= 0 || length <= 0) return NULL;
  jbyteArray result = (*env)->NewByteArray(env, length);
  if (result == NULL) return NULL;
  jsize password_len = (*env)->GetArrayLength(env, password);
  jsize salt_len = (*env)->GetArrayLength(env, salt);
  jbyte *password_data = (*env)->GetByteArrayElements(env, password, NULL);
  jbyte *salt_data = (*env)->GetByteArrayElements(env, salt, NULL);
  jbyte *out = (*env)->GetByteArrayElements(env, result, NULL);
  int ok = lan_pbkdf2(algorithm, (const uint8_t *)password_data, (size_t)password_len, (const uint8_t *)salt_data,
                      (size_t)salt_len, (uint32_t)iterations, (uint8_t *)out, (size_t)length);
  (*env)->ReleaseByteArrayElements(env, password, password_data, JNI_ABORT);
  (*env)->ReleaseByteArrayElements(env, salt, salt_data, JNI_ABORT);
  (*env)->ReleaseByteArrayElements(env, result, out, 0);
  return ok ? result : NULL;
}

/* --------------------------------------------------------------- secp256k1 */

JNIEXPORT jboolean JNICALL JNI_FN(secpInit)(JNIEnv *env, jclass clazz) {
  (void)env; (void)clazz;
  return lan_secp_init() ? JNI_TRUE : JNI_FALSE;
}

JNIEXPORT jboolean JNICALL JNI_FN(secpRandomize)(JNIEnv *env, jclass clazz, jbyteArray seedArray) {
  (void)clazz;
  uint8_t seed[32];
  if (!read_fixed(env, seedArray, seed, 32)) return JNI_FALSE;
  int ok = lan_secp_randomize(seed);
  lan_memzero(seed, sizeof(seed));
  return ok ? JNI_TRUE : JNI_FALSE;
}

JNIEXPORT jboolean JNICALL JNI_FN(secpValidatePrivateKey)(JNIEnv *env, jclass clazz, jbyteArray keyArray) {
  (void)clazz;
  uint8_t key[32];
  if (!read_fixed(env, keyArray, key, 32)) return JNI_FALSE;
  int ok = lan_secp_validate_private_key(key);
  lan_memzero(key, sizeof(key));
  return ok ? JNI_TRUE : JNI_FALSE;
}

JNIEXPORT jboolean JNICALL JNI_FN(secpValidatePublicKey)(JNIEnv *env, jclass clazz, jbyteArray pubArray, jint len) {
  (void)clazz;
  uint8_t pub[65];
  if (len < 0 || len > 65 || !read_fixed(env, pubArray, pub, 65)) return JNI_FALSE;
  return lan_secp_validate_public_key(pub, (size_t)len) ? JNI_TRUE : JNI_FALSE;
}

JNIEXPORT jbyteArray JNICALL JNI_FN(secpDerivePublicKey)(JNIEnv *env, jclass clazz, jbyteArray keyArray,
                                                         jboolean compressed) {
  (void)clazz;
  uint8_t key[32], out[65];
  size_t out_len = 0;
  if (!read_fixed(env, keyArray, key, 32)) return invalid(env);
  int status = lan_secp_derive_public_key(key, compressed, out, &out_len);
  lan_memzero(key, sizeof(key));
  return status_result(env, status, out, out_len);
}

JNIEXPORT jbyteArray JNICALL JNI_FN(secpConvertPublicKey)(JNIEnv *env, jclass clazz, jbyteArray pubArray, jint len,
                                                          jboolean compressed) {
  (void)clazz;
  uint8_t pub[65], out[65];
  size_t out_len = 0;
  if (len < 0 || len > 65 || !read_fixed(env, pubArray, pub, 65)) return invalid(env);
  int status = lan_secp_convert_public_key(pub, (size_t)len, compressed, out, &out_len);
  return status_result(env, status, out, out_len);
}

JNIEXPORT jbyteArray JNICALL JNI_FN(secpSignECDSA)(JNIEnv *env, jclass clazz, jbyteArray keyArray,
                                                   jbyteArray msgArray, jboolean der) {
  (void)clazz;
  uint8_t key[32], msg[32], out[72];
  size_t out_len = 0;
  if (!read_fixed(env, keyArray, key, 32) || !read_fixed(env, msgArray, msg, 32)) return invalid(env);
  int status = lan_secp_sign_ecdsa(key, msg, der, out, &out_len);
  lan_memzero(key, sizeof(key));
  return status_result(env, status, out, out_len);
}

JNIEXPORT jbyteArray JNICALL JNI_FN(secpSignSchnorr)(JNIEnv *env, jclass clazz, jbyteArray keyArray,
                                                     jbyteArray msgArray) {
  (void)clazz;
  uint8_t key[32], msg[32], out[64];
  if (!read_fixed(env, keyArray, key, 32) || !read_fixed(env, msgArray, msg, 32)) return invalid(env);
  int status = lan_secp_sign_schnorr(key, msg, out);
  lan_memzero(key, sizeof(key));
  return status_result(env, status, out, 64);
}

JNIEXPORT jbyteArray JNICALL JNI_FN(secpSignRecoverable)(JNIEnv *env, jclass clazz, jbyteArray keyArray,
                                                         jbyteArray msgArray) {
  (void)clazz;
  uint8_t key[32], msg[32], out[65];
  int recovery_id = 0;
  if (!read_fixed(env, keyArray, key, 32) || !read_fixed(env, msgArray, msg, 32)) return invalid(env);
  int status = lan_secp_sign_recoverable(key, msg, out + 1, &recovery_id);
  lan_memzero(key, sizeof(key));
  out[0] = (uint8_t)recovery_id;
  /* Payload layout: [recoveryId, ...64-byte signature] */
  return status_result(env, status, out, 65);
}

JNIEXPORT jbyteArray JNICALL JNI_FN(secpRecoverPublicKey)(JNIEnv *env, jclass clazz, jbyteArray sigArray,
                                                          jint recovery_id, jbyteArray msgArray, jboolean compressed) {
  (void)clazz;
  uint8_t sig[72], msg[32], out[65];
  size_t out_len = 0;
  if (!read_fixed(env, sigArray, sig, 72) || !read_fixed(env, msgArray, msg, 32)) return invalid(env);
  int status = lan_secp_recover_public_key(sig, recovery_id, msg, compressed, out, &out_len);
  return status_result(env, status, out, out_len);
}

JNIEXPORT jbyteArray JNICALL JNI_FN(secpConvertSignature)(JNIEnv *env, jclass clazz, jbyteArray sigArray, jint len,
                                                          jboolean from_der) {
  (void)clazz;
  uint8_t sig[72], out[72];
  size_t out_len = 0;
  if (len < 0 || len > 72 || !read_fixed(env, sigArray, sig, 72)) return invalid(env);
  int status = lan_secp_convert_signature(sig, (size_t)len, from_der, out, &out_len);
  return status_result(env, status, out, out_len);
}

JNIEXPORT jbyteArray JNICALL JNI_FN(secpModifySignature)(JNIEnv *env, jclass clazz, jbyteArray sigArray, jint len,
                                                         jboolean is_der, jboolean normalize) {
  (void)clazz;
  uint8_t sig[72], out[72];
  size_t out_len = 0;
  if (len < 0 || len > 72 || !read_fixed(env, sigArray, sig, 72)) return invalid(env);
  int status = lan_secp_modify_signature(sig, (size_t)len, is_der, normalize, out, &out_len);
  return status_result(env, status, out, out_len);
}

JNIEXPORT jboolean JNICALL JNI_FN(secpVerifyECDSA)(JNIEnv *env, jclass clazz, jbyteArray sigArray, jint sig_len,
                                                   jboolean is_der, jboolean normalize, jbyteArray pubArray,
                                                   jint pub_len, jbyteArray msgArray) {
  (void)clazz;
  uint8_t sig[72], pub[65], msg[32];
  if (sig_len < 0 || sig_len > 72 || pub_len < 0 || pub_len > 65) return JNI_FALSE;
  if (!read_fixed(env, sigArray, sig, 72) || !read_fixed(env, pubArray, pub, 65) || !read_fixed(env, msgArray, msg, 32)) {
    return JNI_FALSE;
  }
  return lan_secp_verify_ecdsa(sig, (size_t)sig_len, is_der, normalize, pub, (size_t)pub_len, msg) ? JNI_TRUE : JNI_FALSE;
}

JNIEXPORT jboolean JNICALL JNI_FN(secpVerifySchnorr)(JNIEnv *env, jclass clazz, jbyteArray sigArray,
                                                     jbyteArray pubArray, jint pub_len, jbyteArray msgArray) {
  (void)clazz;
  uint8_t sig[64], pub[65], msg[32];
  if (pub_len < 0 || pub_len > 65) return JNI_FALSE;
  if (!read_fixed(env, sigArray, sig, 64) || !read_fixed(env, pubArray, pub, 65) || !read_fixed(env, msgArray, msg, 32)) {
    return JNI_FALSE;
  }
  return lan_secp_verify_schnorr(sig, pub, (size_t)pub_len, msg) ? JNI_TRUE : JNI_FALSE;
}

JNIEXPORT jbyteArray JNICALL JNI_FN(secpTweakPrivateKey)(JNIEnv *env, jclass clazz, jbyteArray keyArray,
                                                         jbyteArray tweakArray, jboolean multiply) {
  (void)clazz;
  uint8_t key[32], tweak[32], out[32];
  if (!read_fixed(env, keyArray, key, 32) || !read_fixed(env, tweakArray, tweak, 32)) return invalid(env);
  int status = lan_secp_tweak_private_key(key, tweak, multiply, out);
  lan_memzero(key, sizeof(key));
  jbyteArray result = status_result(env, status, out, 32);
  lan_memzero(out, sizeof(out));
  return result;
}

JNIEXPORT jbyteArray JNICALL JNI_FN(secpTweakPublicKey)(JNIEnv *env, jclass clazz, jbyteArray pubArray, jint len,
                                                        jbyteArray tweakArray, jboolean multiply, jboolean compressed) {
  (void)clazz;
  uint8_t pub[65], tweak[32], out[65];
  size_t out_len = 0;
  if (len < 0 || len > 65 || !read_fixed(env, pubArray, pub, 65) || !read_fixed(env, tweakArray, tweak, 32)) {
    return invalid(env);
  }
  int status = lan_secp_tweak_public_key(pub, (size_t)len, tweak, multiply, compressed, out, &out_len);
  return status_result(env, status, out, out_len);
}
