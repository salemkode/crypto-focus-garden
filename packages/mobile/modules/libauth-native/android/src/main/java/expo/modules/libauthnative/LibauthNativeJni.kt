package expo.modules.libauthnative

/**
 * JNI entry points into the shared C core (modules/libauth-native/cpp).
 * Functions returning ByteArray for secp256k1 prefix the payload with a status byte.
 */
internal object LibauthNativeJni {
  init {
    System.loadLibrary("libauth-native")
  }

  @JvmStatic external fun hash(algorithm: Int, input: ByteArray): ByteArray?
  @JvmStatic external fun hashInit(algorithm: Int): ByteArray?
  @JvmStatic external fun hashUpdate(algorithm: Int, state: ByteArray, input: ByteArray): ByteArray?
  @JvmStatic external fun hashFinal(algorithm: Int, state: ByteArray): ByteArray?
  @JvmStatic external fun hmac(algorithm: Int, key: ByteArray, message: ByteArray): ByteArray?
  @JvmStatic external fun pbkdf2(algorithm: Int, password: ByteArray, salt: ByteArray, iterations: Int, length: Int): ByteArray?

  @JvmStatic external fun secpInit(): Boolean
  @JvmStatic external fun secpRandomize(seed: ByteArray): Boolean
  @JvmStatic external fun secpValidatePrivateKey(privateKey: ByteArray): Boolean
  @JvmStatic external fun secpValidatePublicKey(publicKey: ByteArray, length: Int): Boolean
  @JvmStatic external fun secpDerivePublicKey(privateKey: ByteArray, compressed: Boolean): ByteArray
  @JvmStatic external fun secpConvertPublicKey(publicKey: ByteArray, length: Int, compressed: Boolean): ByteArray
  @JvmStatic external fun secpSignECDSA(privateKey: ByteArray, messageHash: ByteArray, der: Boolean): ByteArray
  @JvmStatic external fun secpSignSchnorr(privateKey: ByteArray, messageHash: ByteArray): ByteArray
  @JvmStatic external fun secpSignRecoverable(privateKey: ByteArray, messageHash: ByteArray): ByteArray
  @JvmStatic external fun secpRecoverPublicKey(signature: ByteArray, recoveryId: Int, messageHash: ByteArray, compressed: Boolean): ByteArray
  @JvmStatic external fun secpConvertSignature(signature: ByteArray, length: Int, fromDER: Boolean): ByteArray
  @JvmStatic external fun secpModifySignature(signature: ByteArray, length: Int, isDER: Boolean, normalize: Boolean): ByteArray
  @JvmStatic external fun secpVerifyECDSA(signature: ByteArray, signatureLength: Int, isDER: Boolean, normalize: Boolean, publicKey: ByteArray, publicKeyLength: Int, messageHash: ByteArray): Boolean
  @JvmStatic external fun secpVerifySchnorr(signature: ByteArray, publicKey: ByteArray, publicKeyLength: Int, messageHash: ByteArray): Boolean
  @JvmStatic external fun secpTweakPrivateKey(privateKey: ByteArray, tweak: ByteArray, multiply: Boolean): ByteArray
  @JvmStatic external fun secpTweakPublicKey(publicKey: ByteArray, length: Int, tweak: ByteArray, multiply: Boolean, compressed: Boolean): ByteArray
}
