import ExpoModulesCore
import Security

/**
 Native backend for libauth's cryptography (secp256k1, SHA-1/256/512, RIPEMD-160,
 HMAC, PBKDF2) and secure randomness. All functions are synchronous JSI calls into
 the shared C core in `cpp/`, which is verified byte-for-byte against libauth's
 WebAssembly implementation (see test/host).

 Inputs are already padded to fixed sizes by the JavaScript wrapper; lengths are
 re-checked here so malformed calls can never read out of bounds.
 */
public class LibauthNativeModule: Module {
  public func definition() -> ModuleDefinition {
    Name("LibauthNative")

    OnCreate {
      _ = lan_secp_init()
    }

    // MARK: - Randomness

    Function("randomBytes") { (length: Int) throws -> Data in
      guard length >= 0 && length <= 1 << 20 else {
        throw InvalidArgumentException("randomBytes length must be between 0 and 1048576")
      }
      var data = Data(count: length)
      if length > 0 {
        let status = data.withUnsafeMutableBytes {
          SecRandomCopyBytes(kSecRandomDefault, length, $0.baseAddress!)
        }
        guard status == errSecSuccess else {
          throw RandomGenerationException(Int(status))
        }
      }
      return data
    }

    // MARK: - Hashes

    Function("hash") { (algorithm: Int, input: Uint8Array) throws -> Data in
      let digestLength = try digestLength(of: algorithm)
      var out = Data(count: digestLength)
      withBytes(input) { pointer, count in
        out.withUnsafeMutableBytes {
          _ = lan_hash(Int32(algorithm), pointer, count, $0.bindMemory(to: UInt8.self).baseAddress)
        }
      }
      return out
    }

    Function("hashInit") { (algorithm: Int) throws -> Data in
      let stateLength = lan_hash_state_length(Int32(algorithm))
      guard stateLength > 0 else { throw InvalidArgumentException("Unknown hash algorithm \(algorithm)") }
      var state = Data(count: stateLength)
      state.withUnsafeMutableBytes { _ = lan_hash_init(Int32(algorithm), $0.bindMemory(to: UInt8.self).baseAddress) }
      return state
    }

    Function("hashUpdate") { (algorithm: Int, state: Uint8Array, input: Uint8Array) throws -> Data in
      let stateLength = lan_hash_state_length(Int32(algorithm))
      guard stateLength > 0, state.byteLength == stateLength else {
        throw InvalidArgumentException("Invalid hash state")
      }
      var next = Data(bytes: state.rawPointer, count: stateLength)
      var ok: Int32 = 0
      withBytes(input) { pointer, count in
        next.withUnsafeMutableBytes {
          ok = lan_hash_update(Int32(algorithm), $0.bindMemory(to: UInt8.self).baseAddress, pointer, count)
        }
      }
      guard ok == 1 else { throw InvalidArgumentException("Invalid hash state") }
      return next
    }

    Function("hashFinal") { (algorithm: Int, state: Uint8Array) throws -> Data in
      let stateLength = lan_hash_state_length(Int32(algorithm))
      guard stateLength > 0, state.byteLength == stateLength else {
        throw InvalidArgumentException("Invalid hash state")
      }
      var out = Data(count: try digestLength(of: algorithm))
      let ok = out.withUnsafeMutableBytes {
        lan_hash_final(Int32(algorithm), bytePointer(state), $0.bindMemory(to: UInt8.self).baseAddress)
      }
      guard ok == 1 else { throw InvalidArgumentException("Invalid hash state") }
      return out
    }

    Function("hmac") { (algorithm: Int, key: Uint8Array, message: Uint8Array) throws -> Data in
      guard algorithm == 1 || algorithm == 2 else {
        throw InvalidArgumentException("HMAC supports sha256 (1) and sha512 (2) only")
      }
      var out = Data(count: try digestLength(of: algorithm))
      withBytes(key) { keyPointer, keyCount in
        withBytes(message) { messagePointer, messageCount in
          out.withUnsafeMutableBytes {
            _ = lan_hmac(Int32(algorithm), keyPointer, keyCount, messagePointer, messageCount,
                         $0.bindMemory(to: UInt8.self).baseAddress)
          }
        }
      }
      return out
    }

    Function("pbkdf2") { (algorithm: Int, password: Uint8Array, salt: Uint8Array, iterations: Int, length: Int) throws -> Data in
      guard algorithm == 1 || algorithm == 2 else {
        throw InvalidArgumentException("PBKDF2 supports sha256 (1) and sha512 (2) only")
      }
      guard iterations > 0 && iterations <= Int(UInt32.max), length > 0 && length <= 1 << 20 else {
        throw InvalidArgumentException("Invalid PBKDF2 parameters")
      }
      var out = Data(count: length)
      withBytes(password) { passwordPointer, passwordCount in
        withBytes(salt) { saltPointer, saltCount in
          out.withUnsafeMutableBytes {
            _ = lan_pbkdf2(Int32(algorithm), passwordPointer, passwordCount, saltPointer, saltCount,
                           UInt32(iterations), $0.bindMemory(to: UInt8.self).baseAddress, length)
          }
        }
      }
      return out
    }

    // MARK: - secp256k1
    // Functions returning `Data` prefix the payload with a one-byte status code
    // (0 = success; otherwise an index into libauth's `Secp256k1Error`).

    Function("secp256k1Randomize") { (seed: Uint8Array) throws -> Bool in
      try expect(seed, 32, "seed")
      return lan_secp_randomize(bytePointer(seed)) == 1
    }

    Function("secp256k1ValidatePrivateKey") { (privateKey: Uint8Array) throws -> Bool in
      try expect(privateKey, 32, "privateKey")
      return lan_secp_validate_private_key(bytePointer(privateKey)) == 1
    }

    Function("secp256k1ValidatePublicKey") { (publicKey: Uint8Array, length: Int) throws -> Bool in
      try expectPublicKey(publicKey, length)
      return lan_secp_validate_public_key(bytePointer(publicKey), length) == 1
    }

    Function("secp256k1DerivePublicKey") { (privateKey: Uint8Array, compressed: Bool) throws -> Data in
      try expect(privateKey, 32, "privateKey")
      return withStatus(65) { out, outLength in
        lan_secp_derive_public_key(bytePointer(privateKey), compressed ? 1 : 0, out, &outLength)
      }
    }

    Function("secp256k1ConvertPublicKey") { (publicKey: Uint8Array, length: Int, compressed: Bool) throws -> Data in
      try expectPublicKey(publicKey, length)
      return withStatus(65) { out, outLength in
        lan_secp_convert_public_key(bytePointer(publicKey), length, compressed ? 1 : 0, out, &outLength)
      }
    }

    Function("secp256k1SignECDSA") { (privateKey: Uint8Array, messageHash: Uint8Array, der: Bool) throws -> Data in
      try expect(privateKey, 32, "privateKey")
      try expect(messageHash, 32, "messageHash")
      return withStatus(72) { out, outLength in
        lan_secp_sign_ecdsa(bytePointer(privateKey), bytePointer(messageHash), der ? 1 : 0, out, &outLength)
      }
    }

    Function("secp256k1SignSchnorr") { (privateKey: Uint8Array, messageHash: Uint8Array) throws -> Data in
      try expect(privateKey, 32, "privateKey")
      try expect(messageHash, 32, "messageHash")
      return withStatus(64) { out, outLength in
        outLength = 64
        return lan_secp_sign_schnorr(bytePointer(privateKey), bytePointer(messageHash), out)
      }
    }

    // Returns [status, recoveryId, ...64-byte signature].
    Function("secp256k1SignRecoverable") { (privateKey: Uint8Array, messageHash: Uint8Array) throws -> Data in
      try expect(privateKey, 32, "privateKey")
      try expect(messageHash, 32, "messageHash")
      var recoveryId: Int32 = 0
      var signature = [UInt8](repeating: 0, count: 64)
      let status = lan_secp_sign_recoverable(bytePointer(privateKey), bytePointer(messageHash), &signature, &recoveryId)
      if status != 0 {
        return Data([UInt8(status)])
      }
      return Data([0, UInt8(recoveryId)] + signature)
    }

    Function("secp256k1RecoverPublicKey") { (signature: Uint8Array, recoveryId: Int, messageHash: Uint8Array, compressed: Bool) throws -> Data in
      try expect(signature, 72, "signature")
      try expect(messageHash, 32, "messageHash")
      return withStatus(65) { out, outLength in
        lan_secp_recover_public_key(bytePointer(signature), Int32(clamping: recoveryId), bytePointer(messageHash),
                                    compressed ? 1 : 0, out, &outLength)
      }
    }

    Function("secp256k1ConvertSignature") { (signature: Uint8Array, length: Int, fromDER: Bool) throws -> Data in
      try expectSignature(signature, length)
      return withStatus(72) { out, outLength in
        lan_secp_convert_signature(bytePointer(signature), length, fromDER ? 1 : 0, out, &outLength)
      }
    }

    Function("secp256k1ModifySignature") { (signature: Uint8Array, length: Int, isDER: Bool, normalize: Bool) throws -> Data in
      try expectSignature(signature, length)
      return withStatus(72) { out, outLength in
        lan_secp_modify_signature(bytePointer(signature), length, isDER ? 1 : 0, normalize ? 1 : 0, out, &outLength)
      }
    }

    Function("secp256k1VerifyECDSA") { (signature: Uint8Array, signatureLength: Int, isDER: Bool, normalize: Bool, publicKey: Uint8Array, publicKeyLength: Int, messageHash: Uint8Array) throws -> Bool in
      try expectSignature(signature, signatureLength)
      try expectPublicKey(publicKey, publicKeyLength)
      try expect(messageHash, 32, "messageHash")
      return lan_secp_verify_ecdsa(bytePointer(signature), signatureLength, isDER ? 1 : 0, normalize ? 1 : 0,
                                   bytePointer(publicKey), publicKeyLength, bytePointer(messageHash)) == 1
    }

    Function("secp256k1VerifySchnorr") { (signature: Uint8Array, publicKey: Uint8Array, publicKeyLength: Int, messageHash: Uint8Array) throws -> Bool in
      try expect(signature, 64, "signature")
      try expectPublicKey(publicKey, publicKeyLength)
      try expect(messageHash, 32, "messageHash")
      return lan_secp_verify_schnorr(bytePointer(signature), bytePointer(publicKey), publicKeyLength,
                                     bytePointer(messageHash)) == 1
    }

    Function("secp256k1TweakPrivateKey") { (privateKey: Uint8Array, tweak: Uint8Array, multiply: Bool) throws -> Data in
      try expect(privateKey, 32, "privateKey")
      try expect(tweak, 32, "tweak")
      return withStatus(32) { out, outLength in
        outLength = 32
        return lan_secp_tweak_private_key(bytePointer(privateKey), bytePointer(tweak), multiply ? 1 : 0, out)
      }
    }

    Function("secp256k1TweakPublicKey") { (publicKey: Uint8Array, length: Int, tweak: Uint8Array, multiply: Bool, compressed: Bool) throws -> Data in
      try expectPublicKey(publicKey, length)
      try expect(tweak, 32, "tweak")
      return withStatus(65) { out, outLength in
        lan_secp_tweak_public_key(bytePointer(publicKey), length, bytePointer(tweak), multiply ? 1 : 0,
                                  compressed ? 1 : 0, out, &outLength)
      }
    }
  }
}

// MARK: - Helpers

/// Stable non-null pointer handed to C for zero-length inputs (never dereferenced for count 0).
nonisolated(unsafe) private let emptyBuffer: UnsafeMutablePointer<UInt8> = {
  let pointer = UnsafeMutablePointer<UInt8>.allocate(capacity: 1)
  pointer.initialize(to: 0)
  return pointer
}()

/// A pointer to the typed array's bytes (zero-copy).
@inline(__always)
private func bytePointer(_ array: Uint8Array) -> UnsafeMutablePointer<UInt8> {
  if array.byteLength == 0 {
    return emptyBuffer
  }
  return array.rawPointer.assumingMemoryBound(to: UInt8.self)
}

@inline(__always)
private func withBytes(_ array: Uint8Array, _ body: (UnsafePointer<UInt8>, Int) -> Void) {
  body(UnsafePointer(bytePointer(array)), array.byteLength)
}

private func digestLength(of algorithm: Int) throws -> Int {
  let length = lan_hash_digest_length(Int32(algorithm))
  guard length > 0 else { throw InvalidArgumentException("Unknown hash algorithm \(algorithm)") }
  return length
}

private func expect(_ array: Uint8Array, _ length: Int, _ name: String) throws {
  guard array.byteLength == length else {
    throw InvalidArgumentException("\(name) must be \(length) bytes, got \(array.byteLength)")
  }
}

private func expectPublicKey(_ array: Uint8Array, _ length: Int) throws {
  try expect(array, 65, "publicKey")
  guard length >= 0 && length <= 65 else { throw InvalidArgumentException("Invalid public key length \(length)") }
}

private func expectSignature(_ array: Uint8Array, _ length: Int) throws {
  try expect(array, 72, "signature")
  guard length >= 0 && length <= 72 else { throw InvalidArgumentException("Invalid signature length \(length)") }
}

/// Runs a C call that writes up to `capacity` bytes and returns `[status, ...payload]`.
private func withStatus(_ capacity: Int, _ body: (UnsafeMutablePointer<UInt8>, inout Int) -> Int32) -> Data {
  var buffer = [UInt8](repeating: 0, count: capacity + 1)
  var outLength = 0
  let status = buffer.withUnsafeMutableBufferPointer { pointer in
    body(pointer.baseAddress! + 1, &outLength)
  }
  if status != 0 {
    return Data([UInt8(truncatingIfNeeded: status)])
  }
  buffer[0] = 0
  return Data(buffer[0..<(outLength + 1)])
}

internal final class InvalidArgumentException: GenericException<String>, @unchecked Sendable {
  override var code: String { "E_LIBAUTH_INVALID_ARGUMENT" }
  override var reason: String { param }
}

internal final class RandomGenerationException: GenericException<Int>, @unchecked Sendable {
  override var code: String { "E_LIBAUTH_RANDOM" }
  override var reason: String { "SecRandomCopyBytes failed with status \(param)" }
}
