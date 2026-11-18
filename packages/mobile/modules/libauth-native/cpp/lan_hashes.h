/*
 * Portable SHA-1, SHA-256, SHA-512, RIPEMD-160, HMAC and PBKDF2 used by the
 * libauth native backend. All functions are pure C99 with no allocation.
 */
#ifndef LAN_HASHES_H
#define LAN_HASHES_H

#include <stddef.h>
#include <stdint.h>

#ifdef __cplusplus
extern "C" {
#endif

typedef enum {
  LAN_HASH_SHA1 = 0,
  LAN_HASH_SHA256 = 1,
  LAN_HASH_SHA512 = 2,
  LAN_HASH_RIPEMD160 = 3
} lan_hash_algorithm;

typedef struct {
  uint32_t h[5];
  uint64_t length; /* total bytes processed */
  uint8_t buffer[64];
  uint32_t buffered;
} lan_sha1_ctx;

typedef struct {
  uint32_t h[8];
  uint64_t length;
  uint8_t buffer[64];
  uint32_t buffered;
} lan_sha256_ctx;

typedef struct {
  uint64_t h[8];
  uint64_t length; /* inputs > 2^64 bytes are not supported */
  uint8_t buffer[128];
  uint32_t buffered;
} lan_sha512_ctx;

typedef struct {
  uint32_t h[5];
  uint64_t length;
  uint8_t buffer[64];
  uint32_t buffered;
} lan_ripemd160_ctx;

void lan_sha1_init(lan_sha1_ctx *ctx);
void lan_sha1_update(lan_sha1_ctx *ctx, const uint8_t *data, size_t len);
void lan_sha1_final(lan_sha1_ctx *ctx, uint8_t out[20]);

void lan_sha256_init(lan_sha256_ctx *ctx);
void lan_sha256_update(lan_sha256_ctx *ctx, const uint8_t *data, size_t len);
void lan_sha256_final(lan_sha256_ctx *ctx, uint8_t out[32]);

void lan_sha512_init(lan_sha512_ctx *ctx);
void lan_sha512_update(lan_sha512_ctx *ctx, const uint8_t *data, size_t len);
void lan_sha512_final(lan_sha512_ctx *ctx, uint8_t out[64]);

void lan_ripemd160_init(lan_ripemd160_ctx *ctx);
void lan_ripemd160_update(lan_ripemd160_ctx *ctx, const uint8_t *data, size_t len);
void lan_ripemd160_final(lan_ripemd160_ctx *ctx, uint8_t out[20]);

/* Generic helpers keyed by lan_hash_algorithm. Return 0 on unknown algorithm. */
size_t lan_hash_digest_length(int algorithm);
size_t lan_hash_state_length(int algorithm);
size_t lan_hash_block_length(int algorithm);
/* One-shot hash; `out` must hold lan_hash_digest_length(algorithm) bytes. Returns 1 on success. */
int lan_hash(int algorithm, const uint8_t *data, size_t len, uint8_t *out);
/* Incremental hashing over an opaque, caller-owned state buffer of lan_hash_state_length bytes. */
int lan_hash_init(int algorithm, uint8_t *state);
int lan_hash_update(int algorithm, uint8_t *state, const uint8_t *data, size_t len);
int lan_hash_final(int algorithm, const uint8_t *state, uint8_t *out);

/* HMAC (RFC 2104) over SHA-256 or SHA-512. `out` holds the digest length. Returns 1 on success. */
int lan_hmac(int algorithm, const uint8_t *key, size_t key_len, const uint8_t *msg, size_t msg_len, uint8_t *out);

/* PBKDF2 (RFC 8018) with HMAC-SHA-256 or HMAC-SHA-512. Returns 1 on success. */
int lan_pbkdf2(int algorithm, const uint8_t *password, size_t password_len, const uint8_t *salt, size_t salt_len,
               uint32_t iterations, uint8_t *out, size_t out_len);

/* Best-effort wipe that the optimizer will not elide. */
void lan_memzero(void *ptr, size_t len);

#ifdef __cplusplus
}
#endif

#endif /* LAN_HASHES_H */
