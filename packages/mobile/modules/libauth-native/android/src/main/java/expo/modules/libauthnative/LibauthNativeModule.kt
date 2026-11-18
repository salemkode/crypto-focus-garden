package expo.modules.libauthnative

import expo.modules.kotlin.exception.CodedException
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.security.SecureRandom

internal class LibauthInvalidArgumentException(message: String) :
  CodedException("E_LIBAUTH_INVALID_ARGUMENT", message, null)

/**
 * Native backend for libauth's cryptography (secp256k1, SHA-1/256/512, RIPEMD-160,
 * HMAC, PBKDF2) and secure randomness. Mirrors ios/LibauthNativeModule.swift.
 *
 * Inputs are padded to fixed sizes by the JavaScript wrapper; sizes are checked
 * here so malformed calls fail with an exception instead of reading out of bounds.
 */
class LibauthNativeModule : Module() {
  private val secureRandom by lazy { SecureRandom() }

  override fun definition() = ModuleDefinition {
    Name("LibauthNative")

    OnCreate {
      LibauthNativeJni.secpInit()
    }

    // Randomness
    Function("randomBytes") { length: Int ->
      require(length in 0..(1 shl 20), "randomBytes length must be between 0 and 1048576")
      ByteArray(length).also { secureRandom.nextBytes(it) }
    }

    // Hashes
    Function("hash") { algorithm: Int, input: ByteArray ->
      LibauthNativeJni.hash(algorithm, input) ?: throw LibauthInvalidArgumentException("Unknown hash algorithm $algorithm")
    }
    Function("hashInit") { algorithm: Int ->
      LibauthNativeJni.hashInit(algorithm) ?: throw LibauthInvalidArgumentException("Unknown hash algorithm $algorithm")
    }
    Function("hashUpdate") { algorithm: Int, state: ByteArray, input: ByteArray ->
      LibauthNativeJni.hashUpdate(algorithm, state, input) ?: throw LibauthInvalidArgumentException("Invalid hash state")
    }
    Function("hashFinal") { algorithm: Int, state: ByteArray ->
      LibauthNativeJni.hashFinal(algorithm, state) ?: throw LibauthInvalidArgumentException("Invalid hash state")
    }
    Function("hmac") { algorithm: Int, key: ByteArray, message: ByteArray ->
      require(algorithm == 1 || algorithm == 2, "HMAC supports sha256 (1) and sha512 (2) only")
      LibauthNativeJni.hmac(algorithm, key, message) ?: throw LibauthInvalidArgumentException("HMAC failed")
    }
    Function("pbkdf2") { algorithm: Int, password: ByteArray, salt: ByteArray, iterations: Int, length: Int ->
      require(algorithm == 1 || algorithm == 2, "PBKDF2 supports sha256 (1) and sha512 (2) only")
      require(iterations > 0 && length > 0 && length <= (1 shl 20), "Invalid PBKDF2 parameters")
      LibauthNativeJni.pbkdf2(algorithm, password, salt, iterations, length)
        ?: throw LibauthInvalidArgumentException("PBKDF2 failed")
    }

    // secp256k1
    Function("secp256k1Randomize") { seed: ByteArray ->
      expect(seed, 32, "seed")
      LibauthNativeJni.secpRandomize(seed)
    }
    Function("secp256k1ValidatePrivateKey") { privateKey: ByteArray ->
      expect(privateKey, 32, "privateKey")
      LibauthNativeJni.secpValidatePrivateKey(privateKey)
    }
    Function("secp256k1ValidatePublicKey") { publicKey: ByteArray, length: Int ->
      expectPublicKey(publicKey, length)
      LibauthNativeJni.secpValidatePublicKey(publicKey, length)
    }
    Function("secp256k1DerivePublicKey") { privateKey: ByteArray, compressed: Boolean ->
      expect(privateKey, 32, "privateKey")
      LibauthNativeJni.secpDerivePublicKey(privateKey, compressed)
    }
    Function("secp256k1ConvertPublicKey") { publicKey: ByteArray, length: Int, compressed: Boolean ->
      expectPublicKey(publicKey, length)
      LibauthNativeJni.secpConvertPublicKey(publicKey, length, compressed)
    }
    Function("secp256k1SignECDSA") { privateKey: ByteArray, messageHash: ByteArray, der: Boolean ->
      expect(privateKey, 32, "privateKey")
      expect(messageHash, 32, "messageHash")
      LibauthNativeJni.secpSignECDSA(privateKey, messageHash, der)
    }
    Function("secp256k1SignSchnorr") { privateKey: ByteArray, messageHash: ByteArray ->
      expect(privateKey, 32, "privateKey")
      expect(messageHash, 32, "messageHash")
      LibauthNativeJni.secpSignSchnorr(privateKey, messageHash)
    }
    Function("secp256k1SignRecoverable") { privateKey: ByteArray, messageHash: ByteArray ->
      expect(privateKey, 32, "privateKey")
      expect(messageHash, 32, "messageHash")
      LibauthNativeJni.secpSignRecoverable(privateKey, messageHash)
    }
    Function("secp256k1RecoverPublicKey") { signature: ByteArray, recoveryId: Int, messageHash: ByteArray, compressed: Boolean ->
      expect(signature, 72, "signature")
      expect(messageHash, 32, "messageHash")
      LibauthNativeJni.secpRecoverPublicKey(signature, recoveryId, messageHash, compressed)
    }
    Function("secp256k1ConvertSignature") { signature: ByteArray, length: Int, fromDER: Boolean ->
      expectSignature(signature, length)
      LibauthNativeJni.secpConvertSignature(signature, length, fromDER)
    }
    Function("secp256k1ModifySignature") { signature: ByteArray, length: Int, isDER: Boolean, normalize: Boolean ->
      expectSignature(signature, length)
      LibauthNativeJni.secpModifySignature(signature, length, isDER, normalize)
    }
    Function("secp256k1VerifyECDSA") { signature: ByteArray, signatureLength: Int, isDER: Boolean, normalize: Boolean, publicKey: ByteArray, publicKeyLength: Int, messageHash: ByteArray ->
      expectSignature(signature, signatureLength)
      expectPublicKey(publicKey, publicKeyLength)
      expect(messageHash, 32, "messageHash")
      LibauthNativeJni.secpVerifyECDSA(signature, signatureLength, isDER, normalize, publicKey, publicKeyLength, messageHash)
    }
    Function("secp256k1VerifySchnorr") { signature: ByteArray, publicKey: ByteArray, publicKeyLength: Int, messageHash: ByteArray ->
      expect(signature, 64, "signature")
      expectPublicKey(publicKey, publicKeyLength)
      expect(messageHash, 32, "messageHash")
      LibauthNativeJni.secpVerifySchnorr(signature, publicKey, publicKeyLength, messageHash)
    }
    Function("secp256k1TweakPrivateKey") { privateKey: ByteArray, tweak: ByteArray, multiply: Boolean ->
      expect(privateKey, 32, "privateKey")
      expect(tweak, 32, "tweak")
      LibauthNativeJni.secpTweakPrivateKey(privateKey, tweak, multiply)
    }
    Function("secp256k1TweakPublicKey") { publicKey: ByteArray, length: Int, tweak: ByteArray, multiply: Boolean, compressed: Boolean ->
      expectPublicKey(publicKey, length)
      expect(tweak, 32, "tweak")
      LibauthNativeJni.secpTweakPublicKey(publicKey, length, tweak, multiply, compressed)
    }
  }

  private fun require(condition: Boolean, message: String) {
    if (!condition) throw LibauthInvalidArgumentException(message)
  }

  private fun expect(array: ByteArray, length: Int, name: String) {
    require(array.size == length, "$name must be $length bytes, got ${array.size}")
  }

  private fun expectPublicKey(array: ByteArray, length: Int) {
    expect(array, 65, "publicKey")
    require(length in 0..65, "Invalid public key length $length")
  }

  private fun expectSignature(array: ByteArray, length: Int) {
    expect(array, 72, "signature")
    require(length in 0..72, "Invalid signature length $length")
  }
}
