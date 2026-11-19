/*
 * A thin C layer over libauth's secp256k1 fork that mirrors, operation for
 * operation, the logic of libauth's `wrapSecp256k1Wasm` (crypto/secp256k1.ts).
 *
 * Input buffers are pre-padded by the JavaScript wrapper exactly like
 * libauth's `cloneAndPad` does, so behavior (including edge cases) matches the
 * WebAssembly implementation byte for byte:
 *   - private keys, message hashes and tweaks: 32 bytes
 *   - public keys: 65 bytes + the original length
 *   - ECDSA signatures: 72 bytes + the original length
 *   - Schnorr signatures: 64 bytes
 */
#ifndef LAN_SECP256K1_H
#define LAN_SECP256K1_H

#include <stddef.h>
#include <stdint.h>

#ifdef __cplusplus
extern "C" {
#endif

/* Status codes; JS maps each to the matching `Secp256k1Error` message. */
enum {
  LAN_SECP_OK = 0,
  LAN_SECP_UNPARSABLE_PUBLIC_KEY = 1,
  LAN_SECP_UNPARSABLE_SIGNATURE = 2,
  LAN_SECP_DERIVE_INVALID_PRIVATE_KEY = 3,
  LAN_SECP_SIGN_INVALID_PRIVATE_KEY = 4,
  LAN_SECP_RECOVER_UNPARSABLE_SIGNATURE = 5,
  LAN_SECP_RECOVER_INVALID_MATERIAL = 6,
  LAN_SECP_ADD_TWEAK_PRIVATE_KEY = 7,
  LAN_SECP_MUL_TWEAK_PRIVATE_KEY = 8,
  LAN_SECP_ADD_TWEAK_PUBLIC_KEY = 9,
  LAN_SECP_MUL_TWEAK_PUBLIC_KEY = 10,
  LAN_SECP_INVALID_ARGUMENT = 11
};

#define LAN_SECP_MAX_PUBLIC_KEY 65
#define LAN_SECP_MAX_DER_SIGNATURE 72

/* Creates the shared SIGN|VERIFY context (idempotent, thread-safe). Returns 1 on success. */
int lan_secp_init(void);
/* Re-randomizes the shared context for side-channel protection. Does not change any outputs. */
int lan_secp_randomize(const uint8_t seed[32]);

int lan_secp_validate_private_key(const uint8_t private_key[32]);
int lan_secp_validate_public_key(const uint8_t public_key[65], size_t public_key_length);

int lan_secp_derive_public_key(const uint8_t private_key[32], int compressed, uint8_t *out, size_t *out_length);
int lan_secp_convert_public_key(const uint8_t public_key[65], size_t public_key_length, int compressed, uint8_t *out,
                                size_t *out_length);

int lan_secp_sign_ecdsa(const uint8_t private_key[32], const uint8_t message_hash[32], int der, uint8_t *out,
                        size_t *out_length);
int lan_secp_sign_schnorr(const uint8_t private_key[32], const uint8_t message_hash[32], uint8_t out[64]);
int lan_secp_sign_recoverable(const uint8_t private_key[32], const uint8_t message_hash[32], uint8_t out[64],
                              int *recovery_id);
int lan_secp_recover_public_key(const uint8_t signature[72], int recovery_id, const uint8_t message_hash[32],
                                int compressed, uint8_t *out, size_t *out_length);

/* Converts DER -> compact when `from_der` is set, otherwise compact -> DER. */
int lan_secp_convert_signature(const uint8_t signature[72], size_t signature_length, int from_der, uint8_t *out,
                               size_t *out_length);
/* Normalizes (lower-S) or malleates a signature, preserving its encoding. */
int lan_secp_modify_signature(const uint8_t signature[72], size_t signature_length, int is_der, int normalize,
                              uint8_t *out, size_t *out_length);

/* Returns 1 for a valid signature, 0 otherwise. */
int lan_secp_verify_ecdsa(const uint8_t signature[72], size_t signature_length, int is_der, int normalize,
                          const uint8_t public_key[65], size_t public_key_length, const uint8_t message_hash[32]);
int lan_secp_verify_schnorr(const uint8_t signature[64], const uint8_t public_key[65], size_t public_key_length,
                            const uint8_t message_hash[32]);

int lan_secp_tweak_private_key(const uint8_t private_key[32], const uint8_t tweak[32], int multiply, uint8_t out[32]);
int lan_secp_tweak_public_key(const uint8_t public_key[65], size_t public_key_length, const uint8_t tweak[32],
                              int multiply, int compressed, uint8_t *out, size_t *out_length);

#ifdef __cplusplus
}
#endif

#endif /* LAN_SECP256K1_H */
