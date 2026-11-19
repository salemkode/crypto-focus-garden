#include "lan_secp256k1.h"

#include <pthread.h>
#include <string.h>

#include "lan_hashes.h"
#include "include/secp256k1.h"
#include "include/secp256k1_recovery.h"
#include "include/secp256k1_schnorr.h"

static secp256k1_context *g_ctx = NULL;
static pthread_once_t g_ctx_once = PTHREAD_ONCE_INIT;
static pthread_mutex_t g_ctx_mutex = PTHREAD_MUTEX_INITIALIZER;

/*
 * libsecp256k1 aborts the process on API misuse by default. The WebAssembly
 * build turns that into a JS exception; on native we must never abort, so the
 * failing call simply returns 0 and is reported as an error by the wrapper.
 */
static void lan_illegal_callback(const char *message, void *data) {
  (void)message;
  (void)data;
}

static void lan_create_context(void) {
  g_ctx = secp256k1_context_create(SECP256K1_CONTEXT_SIGN | SECP256K1_CONTEXT_VERIFY);
  if (g_ctx != NULL) {
    secp256k1_context_set_illegal_callback(g_ctx, lan_illegal_callback, NULL);
  }
}

int lan_secp_init(void) {
  pthread_once(&g_ctx_once, lan_create_context);
  return g_ctx != NULL;
}

#define LAN_CTX_OR_FAIL()                    \
  do {                                       \
    if (!lan_secp_init()) return LAN_SECP_INVALID_ARGUMENT; \
  } while (0)

int lan_secp_randomize(const uint8_t seed[32]) {
  if (!lan_secp_init()) return 0;
  pthread_mutex_lock(&g_ctx_mutex);
  int ok = secp256k1_context_randomize(g_ctx, seed);
  pthread_mutex_unlock(&g_ctx_mutex);
  return ok;
}

static int parse_public_key(secp256k1_pubkey *pubkey, const uint8_t public_key[65], size_t length) {
  return secp256k1_ec_pubkey_parse(g_ctx, pubkey, public_key, length) == 1;
}

static void serialize_public_key(const secp256k1_pubkey *pubkey, int compressed, uint8_t *out, size_t *out_length) {
  *out_length = compressed ? 33 : 65;
  secp256k1_ec_pubkey_serialize(g_ctx, out, out_length, pubkey,
                                compressed ? SECP256K1_EC_COMPRESSED : SECP256K1_EC_UNCOMPRESSED);
}

static int parse_signature(secp256k1_ecdsa_signature *sig, const uint8_t signature[72], size_t length, int is_der) {
  return is_der ? secp256k1_ecdsa_signature_parse_der(g_ctx, sig, signature, length) == 1
                : secp256k1_ecdsa_signature_parse_compact(g_ctx, sig, signature) == 1;
}

static void serialize_signature(const secp256k1_ecdsa_signature *sig, int der, uint8_t *out, size_t *out_length) {
  if (der) {
    *out_length = LAN_SECP_MAX_DER_SIGNATURE;
    secp256k1_ecdsa_signature_serialize_der(g_ctx, out, out_length, sig);
  } else {
    secp256k1_ecdsa_signature_serialize_compact(g_ctx, out, sig);
    *out_length = 64;
  }
}

int lan_secp_validate_private_key(const uint8_t private_key[32]) {
  if (!lan_secp_init()) return 0;
  return secp256k1_ec_seckey_verify(g_ctx, private_key) == 1;
}

int lan_secp_validate_public_key(const uint8_t public_key[65], size_t public_key_length) {
  secp256k1_pubkey pubkey;
  if (!lan_secp_init()) return 0;
  return parse_public_key(&pubkey, public_key, public_key_length);
}

int lan_secp_derive_public_key(const uint8_t private_key[32], int compressed, uint8_t *out, size_t *out_length) {
  secp256k1_pubkey pubkey;
  LAN_CTX_OR_FAIL();
  if (secp256k1_ec_pubkey_create(g_ctx, &pubkey, private_key) != 1) {
    return LAN_SECP_DERIVE_INVALID_PRIVATE_KEY;
  }
  serialize_public_key(&pubkey, compressed, out, out_length);
  return LAN_SECP_OK;
}

int lan_secp_convert_public_key(const uint8_t public_key[65], size_t public_key_length, int compressed, uint8_t *out,
                                size_t *out_length) {
  secp256k1_pubkey pubkey;
  LAN_CTX_OR_FAIL();
  if (!parse_public_key(&pubkey, public_key, public_key_length)) return LAN_SECP_UNPARSABLE_PUBLIC_KEY;
  serialize_public_key(&pubkey, compressed, out, out_length);
  return LAN_SECP_OK;
}

int lan_secp_sign_ecdsa(const uint8_t private_key[32], const uint8_t message_hash[32], int der, uint8_t *out,
                        size_t *out_length) {
  secp256k1_ecdsa_signature sig;
  LAN_CTX_OR_FAIL();
  if (secp256k1_ecdsa_sign(g_ctx, &sig, message_hash, private_key, NULL, NULL) != 1) {
    return LAN_SECP_SIGN_INVALID_PRIVATE_KEY;
  }
  serialize_signature(&sig, der, out, out_length);
  return LAN_SECP_OK;
}

int lan_secp_sign_schnorr(const uint8_t private_key[32], const uint8_t message_hash[32], uint8_t out[64]) {
  LAN_CTX_OR_FAIL();
  if (secp256k1_schnorr_sign(g_ctx, out, message_hash, private_key, NULL, NULL) != 1) {
    return LAN_SECP_SIGN_INVALID_PRIVATE_KEY;
  }
  return LAN_SECP_OK;
}

int lan_secp_sign_recoverable(const uint8_t private_key[32], const uint8_t message_hash[32], uint8_t out[64],
                              int *recovery_id) {
  secp256k1_ecdsa_recoverable_signature rsig;
  LAN_CTX_OR_FAIL();
  if (secp256k1_ecdsa_sign_recoverable(g_ctx, &rsig, message_hash, private_key, NULL, NULL) != 1) {
    return LAN_SECP_SIGN_INVALID_PRIVATE_KEY;
  }
  secp256k1_ecdsa_recoverable_signature_serialize_compact(g_ctx, out, recovery_id, &rsig);
  return LAN_SECP_OK;
}

int lan_secp_recover_public_key(const uint8_t signature[72], int recovery_id, const uint8_t message_hash[32],
                                int compressed, uint8_t *out, size_t *out_length) {
  secp256k1_ecdsa_recoverable_signature rsig;
  secp256k1_pubkey pubkey;
  LAN_CTX_OR_FAIL();
  if (secp256k1_ecdsa_recoverable_signature_parse_compact(g_ctx, &rsig, signature, recovery_id) != 1) {
    return LAN_SECP_RECOVER_UNPARSABLE_SIGNATURE;
  }
  if (secp256k1_ecdsa_recover(g_ctx, &pubkey, &rsig, message_hash) != 1) {
    return LAN_SECP_RECOVER_INVALID_MATERIAL;
  }
  serialize_public_key(&pubkey, compressed, out, out_length);
  return LAN_SECP_OK;
}

int lan_secp_convert_signature(const uint8_t signature[72], size_t signature_length, int from_der, uint8_t *out,
                               size_t *out_length) {
  secp256k1_ecdsa_signature sig;
  LAN_CTX_OR_FAIL();
  if (!parse_signature(&sig, signature, signature_length, from_der)) return LAN_SECP_UNPARSABLE_SIGNATURE;
  serialize_signature(&sig, !from_der, out, out_length);
  return LAN_SECP_OK;
}

int lan_secp_modify_signature(const uint8_t signature[72], size_t signature_length, int is_der, int normalize,
                              uint8_t *out, size_t *out_length) {
  secp256k1_ecdsa_signature sig;
  LAN_CTX_OR_FAIL();
  if (!parse_signature(&sig, signature, signature_length, is_der)) return LAN_SECP_UNPARSABLE_SIGNATURE;
  if (normalize) {
    secp256k1_ecdsa_signature_normalize(g_ctx, &sig, &sig);
  } else {
    secp256k1_ecdsa_signature_malleate(g_ctx, &sig, &sig);
  }
  serialize_signature(&sig, is_der, out, out_length);
  return LAN_SECP_OK;
}

int lan_secp_verify_ecdsa(const uint8_t signature[72], size_t signature_length, int is_der, int normalize,
                          const uint8_t public_key[65], size_t public_key_length, const uint8_t message_hash[32]) {
  secp256k1_pubkey pubkey;
  secp256k1_ecdsa_signature sig;
  if (!lan_secp_init()) return 0;
  if (!parse_public_key(&pubkey, public_key, public_key_length)) return 0;
  if (!parse_signature(&sig, signature, signature_length, is_der)) return 0;
  if (normalize) secp256k1_ecdsa_signature_normalize(g_ctx, &sig, &sig);
  return secp256k1_ecdsa_verify(g_ctx, &sig, message_hash, &pubkey) == 1;
}

int lan_secp_verify_schnorr(const uint8_t signature[64], const uint8_t public_key[65], size_t public_key_length,
                            const uint8_t message_hash[32]) {
  secp256k1_pubkey pubkey;
  if (!lan_secp_init()) return 0;
  if (!parse_public_key(&pubkey, public_key, public_key_length)) return 0;
  return secp256k1_schnorr_verify(g_ctx, signature, message_hash, &pubkey) == 1;
}

int lan_secp_tweak_private_key(const uint8_t private_key[32], const uint8_t tweak[32], int multiply, uint8_t out[32]) {
  LAN_CTX_OR_FAIL();
  memcpy(out, private_key, 32);
  int ok = multiply ? secp256k1_ec_privkey_tweak_mul(g_ctx, out, tweak) : secp256k1_ec_privkey_tweak_add(g_ctx, out, tweak);
  if (ok != 1) {
    lan_memzero(out, 32);
    return multiply ? LAN_SECP_MUL_TWEAK_PRIVATE_KEY : LAN_SECP_ADD_TWEAK_PRIVATE_KEY;
  }
  return LAN_SECP_OK;
}

int lan_secp_tweak_public_key(const uint8_t public_key[65], size_t public_key_length, const uint8_t tweak[32],
                              int multiply, int compressed, uint8_t *out, size_t *out_length) {
  secp256k1_pubkey pubkey;
  LAN_CTX_OR_FAIL();
  if (!parse_public_key(&pubkey, public_key, public_key_length)) return LAN_SECP_UNPARSABLE_PUBLIC_KEY;
  int ok = multiply ? secp256k1_ec_pubkey_tweak_mul(g_ctx, &pubkey, tweak) : secp256k1_ec_pubkey_tweak_add(g_ctx, &pubkey, tweak);
  if (ok != 1) return multiply ? LAN_SECP_MUL_TWEAK_PUBLIC_KEY : LAN_SECP_ADD_TWEAK_PUBLIC_KEY;
  serialize_public_key(&pubkey, compressed, out, out_length);
  return LAN_SECP_OK;
}
