#include "lan_hashes.h"

#include <string.h>

/* ---------------------------------------------------------------- helpers */

void lan_memzero(void *ptr, size_t len) {
  volatile uint8_t *p = (volatile uint8_t *)ptr;
  while (len--) *p++ = 0;
}

static inline uint32_t rol32(uint32_t x, unsigned n) { return (x << n) | (x >> (32 - n)); }
static inline uint32_t ror32(uint32_t x, unsigned n) { return (x >> n) | (x << (32 - n)); }
static inline uint64_t ror64(uint64_t x, unsigned n) { return (x >> n) | (x << (64 - n)); }

static inline uint32_t load32_be(const uint8_t *p) {
  return ((uint32_t)p[0] << 24) | ((uint32_t)p[1] << 16) | ((uint32_t)p[2] << 8) | (uint32_t)p[3];
}
static inline uint32_t load32_le(const uint8_t *p) {
  return ((uint32_t)p[3] << 24) | ((uint32_t)p[2] << 16) | ((uint32_t)p[1] << 8) | (uint32_t)p[0];
}
static inline uint64_t load64_be(const uint8_t *p) {
  return ((uint64_t)load32_be(p) << 32) | (uint64_t)load32_be(p + 4);
}
static inline void store32_be(uint8_t *p, uint32_t v) {
  p[0] = (uint8_t)(v >> 24); p[1] = (uint8_t)(v >> 16); p[2] = (uint8_t)(v >> 8); p[3] = (uint8_t)v;
}
static inline void store32_le(uint8_t *p, uint32_t v) {
  p[0] = (uint8_t)v; p[1] = (uint8_t)(v >> 8); p[2] = (uint8_t)(v >> 16); p[3] = (uint8_t)(v >> 24);
}
static inline void store64_be(uint8_t *p, uint64_t v) {
  store32_be(p, (uint32_t)(v >> 32)); store32_be(p + 4, (uint32_t)v);
}
static inline void store64_le(uint8_t *p, uint64_t v) {
  store32_le(p, (uint32_t)v); store32_le(p + 4, (uint32_t)(v >> 32));
}

/*
 * Shared Merkle–Damgård buffering for 64-byte block hashes.
 * `compress` processes exactly one block.
 */
#define LAN_MD_UPDATE(ctx, data, len, block_size, compress)              \
  do {                                                                    \
    (ctx)->length += (uint64_t)(len);                                     \
    if ((ctx)->buffered) {                                                \
      size_t take = (block_size) - (ctx)->buffered;                       \
      if (take > (len)) take = (len);                                     \
      memcpy((ctx)->buffer + (ctx)->buffered, (data), take);              \
      (ctx)->buffered += (uint32_t)take;                                  \
      (data) += take;                                                     \
      (len) -= take;                                                      \
      if ((ctx)->buffered == (block_size)) {                              \
        compress((ctx), (ctx)->buffer);                                   \
        (ctx)->buffered = 0;                                              \
      }                                                                   \
    }                                                                     \
    while ((len) >= (block_size)) {                                       \
      compress((ctx), (data));                                            \
      (data) += (block_size);                                             \
      (len) -= (block_size);                                              \
    }                                                                     \
    if ((len)) {                                                          \
      memcpy((ctx)->buffer, (data), (len));                               \
      (ctx)->buffered = (uint32_t)(len);                                  \
    }                                                                     \
  } while (0)

/* ------------------------------------------------------------------ SHA-1 */

static void sha1_compress(lan_sha1_ctx *ctx, const uint8_t *block) {
  uint32_t w[80];
  for (int i = 0; i < 16; i++) w[i] = load32_be(block + 4 * i);
  for (int i = 16; i < 80; i++) w[i] = rol32(w[i - 3] ^ w[i - 8] ^ w[i - 14] ^ w[i - 16], 1);
  uint32_t a = ctx->h[0], b = ctx->h[1], c = ctx->h[2], d = ctx->h[3], e = ctx->h[4];
  for (int i = 0; i < 80; i++) {
    uint32_t f, k;
    if (i < 20) { f = (b & c) | (~b & d); k = 0x5A827999u; }
    else if (i < 40) { f = b ^ c ^ d; k = 0x6ED9EBA1u; }
    else if (i < 60) { f = (b & c) | (b & d) | (c & d); k = 0x8F1BBCDCu; }
    else { f = b ^ c ^ d; k = 0xCA62C1D6u; }
    uint32_t t = rol32(a, 5) + f + e + k + w[i];
    e = d; d = c; c = rol32(b, 30); b = a; a = t;
  }
  ctx->h[0] += a; ctx->h[1] += b; ctx->h[2] += c; ctx->h[3] += d; ctx->h[4] += e;
}

void lan_sha1_init(lan_sha1_ctx *ctx) {
  memset(ctx, 0, sizeof(*ctx));
  ctx->h[0] = 0x67452301u; ctx->h[1] = 0xEFCDAB89u; ctx->h[2] = 0x98BADCFEu;
  ctx->h[3] = 0x10325476u; ctx->h[4] = 0xC3D2E1F0u;
}

void lan_sha1_update(lan_sha1_ctx *ctx, const uint8_t *data, size_t len) {
  LAN_MD_UPDATE(ctx, data, len, 64, sha1_compress);
}

void lan_sha1_final(lan_sha1_ctx *ctx, uint8_t out[20]) {
  uint64_t bits = ctx->length * 8;
  uint8_t pad[72] = {0x80};
  size_t padlen = (ctx->buffered < 56) ? (56 - ctx->buffered) : (120 - ctx->buffered);
  uint8_t lenbuf[8];
  store64_be(lenbuf, bits);
  lan_sha1_update(ctx, pad, padlen);
  lan_sha1_update(ctx, lenbuf, 8);
  for (int i = 0; i < 5; i++) store32_be(out + 4 * i, ctx->h[i]);
}

/* ---------------------------------------------------------------- SHA-256 */

static const uint32_t SHA256_K[64] = {
  0x428a2f98u, 0x71374491u, 0xb5c0fbcfu, 0xe9b5dba5u, 0x3956c25bu, 0x59f111f1u, 0x923f82a4u, 0xab1c5ed5u,
  0xd807aa98u, 0x12835b01u, 0x243185beu, 0x550c7dc3u, 0x72be5d74u, 0x80deb1feu, 0x9bdc06a7u, 0xc19bf174u,
  0xe49b69c1u, 0xefbe4786u, 0x0fc19dc6u, 0x240ca1ccu, 0x2de92c6fu, 0x4a7484aau, 0x5cb0a9dcu, 0x76f988dau,
  0x983e5152u, 0xa831c66du, 0xb00327c8u, 0xbf597fc7u, 0xc6e00bf3u, 0xd5a79147u, 0x06ca6351u, 0x14292967u,
  0x27b70a85u, 0x2e1b2138u, 0x4d2c6dfcu, 0x53380d13u, 0x650a7354u, 0x766a0abbu, 0x81c2c92eu, 0x92722c85u,
  0xa2bfe8a1u, 0xa81a664bu, 0xc24b8b70u, 0xc76c51a3u, 0xd192e819u, 0xd6990624u, 0xf40e3585u, 0x106aa070u,
  0x19a4c116u, 0x1e376c08u, 0x2748774cu, 0x34b0bcb5u, 0x391c0cb3u, 0x4ed8aa4au, 0x5b9cca4fu, 0x682e6ff3u,
  0x748f82eeu, 0x78a5636fu, 0x84c87814u, 0x8cc70208u, 0x90befffau, 0xa4506cebu, 0xbef9a3f7u, 0xc67178f2u};

static void sha256_compress(lan_sha256_ctx *ctx, const uint8_t *block) {
  uint32_t w[64];
  for (int i = 0; i < 16; i++) w[i] = load32_be(block + 4 * i);
  for (int i = 16; i < 64; i++) {
    uint32_t s0 = ror32(w[i - 15], 7) ^ ror32(w[i - 15], 18) ^ (w[i - 15] >> 3);
    uint32_t s1 = ror32(w[i - 2], 17) ^ ror32(w[i - 2], 19) ^ (w[i - 2] >> 10);
    w[i] = w[i - 16] + s0 + w[i - 7] + s1;
  }
  uint32_t a = ctx->h[0], b = ctx->h[1], c = ctx->h[2], d = ctx->h[3];
  uint32_t e = ctx->h[4], f = ctx->h[5], g = ctx->h[6], h = ctx->h[7];
  for (int i = 0; i < 64; i++) {
    uint32_t S1 = ror32(e, 6) ^ ror32(e, 11) ^ ror32(e, 25);
    uint32_t ch = (e & f) ^ (~e & g);
    uint32_t t1 = h + S1 + ch + SHA256_K[i] + w[i];
    uint32_t S0 = ror32(a, 2) ^ ror32(a, 13) ^ ror32(a, 22);
    uint32_t maj = (a & b) ^ (a & c) ^ (b & c);
    uint32_t t2 = S0 + maj;
    h = g; g = f; f = e; e = d + t1; d = c; c = b; b = a; a = t1 + t2;
  }
  ctx->h[0] += a; ctx->h[1] += b; ctx->h[2] += c; ctx->h[3] += d;
  ctx->h[4] += e; ctx->h[5] += f; ctx->h[6] += g; ctx->h[7] += h;
}

void lan_sha256_init(lan_sha256_ctx *ctx) {
  memset(ctx, 0, sizeof(*ctx));
  ctx->h[0] = 0x6a09e667u; ctx->h[1] = 0xbb67ae85u; ctx->h[2] = 0x3c6ef372u; ctx->h[3] = 0xa54ff53au;
  ctx->h[4] = 0x510e527fu; ctx->h[5] = 0x9b05688cu; ctx->h[6] = 0x1f83d9abu; ctx->h[7] = 0x5be0cd19u;
}

void lan_sha256_update(lan_sha256_ctx *ctx, const uint8_t *data, size_t len) {
  LAN_MD_UPDATE(ctx, data, len, 64, sha256_compress);
}

void lan_sha256_final(lan_sha256_ctx *ctx, uint8_t out[32]) {
  uint64_t bits = ctx->length * 8;
  uint8_t pad[72] = {0x80};
  size_t padlen = (ctx->buffered < 56) ? (56 - ctx->buffered) : (120 - ctx->buffered);
  uint8_t lenbuf[8];
  store64_be(lenbuf, bits);
  lan_sha256_update(ctx, pad, padlen);
  lan_sha256_update(ctx, lenbuf, 8);
  for (int i = 0; i < 8; i++) store32_be(out + 4 * i, ctx->h[i]);
}

/* ---------------------------------------------------------------- SHA-512 */

static const uint64_t SHA512_K[80] = {
  0x428a2f98d728ae22ull, 0x7137449123ef65cdull, 0xb5c0fbcfec4d3b2full, 0xe9b5dba58189dbbcull,
  0x3956c25bf348b538ull, 0x59f111f1b605d019ull, 0x923f82a4af194f9bull, 0xab1c5ed5da6d8118ull,
  0xd807aa98a3030242ull, 0x12835b0145706fbeull, 0x243185be4ee4b28cull, 0x550c7dc3d5ffb4e2ull,
  0x72be5d74f27b896full, 0x80deb1fe3b1696b1ull, 0x9bdc06a725c71235ull, 0xc19bf174cf692694ull,
  0xe49b69c19ef14ad2ull, 0xefbe4786384f25e3ull, 0x0fc19dc68b8cd5b5ull, 0x240ca1cc77ac9c65ull,
  0x2de92c6f592b0275ull, 0x4a7484aa6ea6e483ull, 0x5cb0a9dcbd41fbd4ull, 0x76f988da831153b5ull,
  0x983e5152ee66dfabull, 0xa831c66d2db43210ull, 0xb00327c898fb213full, 0xbf597fc7beef0ee4ull,
  0xc6e00bf33da88fc2ull, 0xd5a79147930aa725ull, 0x06ca6351e003826full, 0x142929670a0e6e70ull,
  0x27b70a8546d22ffcull, 0x2e1b21385c26c926ull, 0x4d2c6dfc5ac42aedull, 0x53380d139d95b3dfull,
  0x650a73548baf63deull, 0x766a0abb3c77b2a8ull, 0x81c2c92e47edaee6ull, 0x92722c851482353bull,
  0xa2bfe8a14cf10364ull, 0xa81a664bbc423001ull, 0xc24b8b70d0f89791ull, 0xc76c51a30654be30ull,
  0xd192e819d6ef5218ull, 0xd69906245565a910ull, 0xf40e35855771202aull, 0x106aa07032bbd1b8ull,
  0x19a4c116b8d2d0c8ull, 0x1e376c085141ab53ull, 0x2748774cdf8eeb99ull, 0x34b0bcb5e19b48a8ull,
  0x391c0cb3c5c95a63ull, 0x4ed8aa4ae3418acbull, 0x5b9cca4f7763e373ull, 0x682e6ff3d6b2b8a3ull,
  0x748f82ee5defb2fcull, 0x78a5636f43172f60ull, 0x84c87814a1f0ab72ull, 0x8cc702081a6439ecull,
  0x90befffa23631e28ull, 0xa4506cebde82bde9ull, 0xbef9a3f7b2c67915ull, 0xc67178f2e372532bull,
  0xca273eceea26619cull, 0xd186b8c721c0c207ull, 0xeada7dd6cde0eb1eull, 0xf57d4f7fee6ed178ull,
  0x06f067aa72176fbaull, 0x0a637dc5a2c898a6ull, 0x113f9804bef90daeull, 0x1b710b35131c471bull,
  0x28db77f523047d84ull, 0x32caab7b40c72493ull, 0x3c9ebe0a15c9bebcull, 0x431d67c49c100d4cull,
  0x4cc5d4becb3e42b6ull, 0x597f299cfc657e2aull, 0x5fcb6fab3ad6faecull, 0x6c44198c4a475817ull};

static void sha512_compress(lan_sha512_ctx *ctx, const uint8_t *block) {
  uint64_t w[80];
  for (int i = 0; i < 16; i++) w[i] = load64_be(block + 8 * i);
  for (int i = 16; i < 80; i++) {
    uint64_t s0 = ror64(w[i - 15], 1) ^ ror64(w[i - 15], 8) ^ (w[i - 15] >> 7);
    uint64_t s1 = ror64(w[i - 2], 19) ^ ror64(w[i - 2], 61) ^ (w[i - 2] >> 6);
    w[i] = w[i - 16] + s0 + w[i - 7] + s1;
  }
  uint64_t a = ctx->h[0], b = ctx->h[1], c = ctx->h[2], d = ctx->h[3];
  uint64_t e = ctx->h[4], f = ctx->h[5], g = ctx->h[6], h = ctx->h[7];
  for (int i = 0; i < 80; i++) {
    uint64_t S1 = ror64(e, 14) ^ ror64(e, 18) ^ ror64(e, 41);
    uint64_t ch = (e & f) ^ (~e & g);
    uint64_t t1 = h + S1 + ch + SHA512_K[i] + w[i];
    uint64_t S0 = ror64(a, 28) ^ ror64(a, 34) ^ ror64(a, 39);
    uint64_t maj = (a & b) ^ (a & c) ^ (b & c);
    uint64_t t2 = S0 + maj;
    h = g; g = f; f = e; e = d + t1; d = c; c = b; b = a; a = t1 + t2;
  }
  ctx->h[0] += a; ctx->h[1] += b; ctx->h[2] += c; ctx->h[3] += d;
  ctx->h[4] += e; ctx->h[5] += f; ctx->h[6] += g; ctx->h[7] += h;
}

void lan_sha512_init(lan_sha512_ctx *ctx) {
  memset(ctx, 0, sizeof(*ctx));
  ctx->h[0] = 0x6a09e667f3bcc908ull; ctx->h[1] = 0xbb67ae8584caa73bull;
  ctx->h[2] = 0x3c6ef372fe94f82bull; ctx->h[3] = 0xa54ff53a5f1d36f1ull;
  ctx->h[4] = 0x510e527fade682d1ull; ctx->h[5] = 0x9b05688c2b3e6c1full;
  ctx->h[6] = 0x1f83d9abfb41bd6bull; ctx->h[7] = 0x5be0cd19137e2179ull;
}

void lan_sha512_update(lan_sha512_ctx *ctx, const uint8_t *data, size_t len) {
  LAN_MD_UPDATE(ctx, data, len, 128, sha512_compress);
}

void lan_sha512_final(lan_sha512_ctx *ctx, uint8_t out[64]) {
  uint64_t bits = ctx->length * 8;
  uint64_t bits_high = ctx->length >> 61;
  uint8_t pad[144] = {0x80};
  size_t padlen = (ctx->buffered < 112) ? (112 - ctx->buffered) : (240 - ctx->buffered);
  uint8_t lenbuf[16];
  store64_be(lenbuf, bits_high);
  store64_be(lenbuf + 8, bits);
  lan_sha512_update(ctx, pad, padlen);
  lan_sha512_update(ctx, lenbuf, 16);
  for (int i = 0; i < 8; i++) store64_be(out + 8 * i, ctx->h[i]);
}

/* ------------------------------------------------------------- RIPEMD-160 */

static const uint8_t RMD_R[80] = {
  0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15,
  7, 4, 13, 1, 10, 6, 15, 3, 12, 0, 9, 5, 2, 14, 11, 8,
  3, 10, 14, 4, 9, 15, 8, 1, 2, 7, 0, 6, 13, 11, 5, 12,
  1, 9, 11, 10, 0, 8, 12, 4, 13, 3, 7, 15, 14, 5, 6, 2,
  4, 0, 5, 9, 7, 12, 2, 10, 14, 1, 3, 8, 11, 6, 15, 13};
static const uint8_t RMD_RP[80] = {
  5, 14, 7, 0, 9, 2, 11, 4, 13, 6, 15, 8, 1, 10, 3, 12,
  6, 11, 3, 7, 0, 13, 5, 10, 14, 15, 8, 12, 4, 9, 1, 2,
  15, 5, 1, 3, 7, 14, 6, 9, 11, 8, 12, 2, 10, 0, 4, 13,
  8, 6, 4, 1, 3, 11, 15, 0, 5, 12, 2, 13, 9, 7, 10, 14,
  12, 15, 10, 4, 1, 5, 8, 7, 6, 2, 13, 14, 0, 3, 9, 11};
static const uint8_t RMD_S[80] = {
  11, 14, 15, 12, 5, 8, 7, 9, 11, 13, 14, 15, 6, 7, 9, 8,
  7, 6, 8, 13, 11, 9, 7, 15, 7, 12, 15, 9, 11, 7, 13, 12,
  11, 13, 6, 7, 14, 9, 13, 15, 14, 8, 13, 6, 5, 12, 7, 5,
  11, 12, 14, 15, 14, 15, 9, 8, 9, 14, 5, 6, 8, 6, 5, 12,
  9, 15, 5, 11, 6, 8, 13, 12, 5, 12, 13, 14, 11, 8, 5, 6};
static const uint8_t RMD_SP[80] = {
  8, 9, 9, 11, 13, 15, 15, 5, 7, 7, 8, 11, 14, 14, 12, 6,
  9, 13, 15, 7, 12, 8, 9, 11, 7, 7, 12, 7, 6, 15, 13, 11,
  9, 7, 15, 11, 8, 6, 6, 14, 12, 13, 5, 14, 13, 13, 7, 5,
  15, 5, 8, 11, 14, 14, 6, 14, 6, 9, 12, 9, 12, 5, 15, 8,
  8, 5, 12, 9, 12, 5, 14, 6, 8, 13, 6, 5, 15, 13, 11, 11};
static const uint32_t RMD_K[5] = {0x00000000u, 0x5A827999u, 0x6ED9EBA1u, 0x8F1BBCDCu, 0xA953FD4Eu};
static const uint32_t RMD_KP[5] = {0x50A28BE6u, 0x5C4DD124u, 0x6D703EF3u, 0x7A6D76E9u, 0x00000000u};

static inline uint32_t rmd_f(int j, uint32_t x, uint32_t y, uint32_t z) {
  switch (j / 16) {
    case 0: return x ^ y ^ z;
    case 1: return (x & y) | (~x & z);
    case 2: return (x | ~y) ^ z;
    case 3: return (x & z) | (y & ~z);
    default: return x ^ (y | ~z);
  }
}

static void ripemd160_compress(lan_ripemd160_ctx *ctx, const uint8_t *block) {
  uint32_t x[16];
  for (int i = 0; i < 16; i++) x[i] = load32_le(block + 4 * i);
  uint32_t al = ctx->h[0], bl = ctx->h[1], cl = ctx->h[2], dl = ctx->h[3], el = ctx->h[4];
  uint32_t ar = al, br = bl, cr = cl, dr = dl, er = el;
  for (int j = 0; j < 80; j++) {
    uint32_t t = rol32(al + rmd_f(j, bl, cl, dl) + x[RMD_R[j]] + RMD_K[j / 16], RMD_S[j]) + el;
    al = el; el = dl; dl = rol32(cl, 10); cl = bl; bl = t;
    t = rol32(ar + rmd_f(79 - j, br, cr, dr) + x[RMD_RP[j]] + RMD_KP[j / 16], RMD_SP[j]) + er;
    ar = er; er = dr; dr = rol32(cr, 10); cr = br; br = t;
  }
  uint32_t t = ctx->h[1] + cl + dr;
  ctx->h[1] = ctx->h[2] + dl + er;
  ctx->h[2] = ctx->h[3] + el + ar;
  ctx->h[3] = ctx->h[4] + al + br;
  ctx->h[4] = ctx->h[0] + bl + cr;
  ctx->h[0] = t;
}

void lan_ripemd160_init(lan_ripemd160_ctx *ctx) {
  memset(ctx, 0, sizeof(*ctx));
  ctx->h[0] = 0x67452301u; ctx->h[1] = 0xEFCDAB89u; ctx->h[2] = 0x98BADCFEu;
  ctx->h[3] = 0x10325476u; ctx->h[4] = 0xC3D2E1F0u;
}

void lan_ripemd160_update(lan_ripemd160_ctx *ctx, const uint8_t *data, size_t len) {
  LAN_MD_UPDATE(ctx, data, len, 64, ripemd160_compress);
}

void lan_ripemd160_final(lan_ripemd160_ctx *ctx, uint8_t out[20]) {
  uint64_t bits = ctx->length * 8;
  uint8_t pad[72] = {0x80};
  size_t padlen = (ctx->buffered < 56) ? (56 - ctx->buffered) : (120 - ctx->buffered);
  uint8_t lenbuf[8];
  store64_le(lenbuf, bits);
  lan_ripemd160_update(ctx, pad, padlen);
  lan_ripemd160_update(ctx, lenbuf, 8);
  for (int i = 0; i < 5; i++) store32_le(out + 4 * i, ctx->h[i]);
}

/* ---------------------------------------------------------------- generic */

size_t lan_hash_digest_length(int algorithm) {
  switch (algorithm) {
    case LAN_HASH_SHA1: return 20;
    case LAN_HASH_SHA256: return 32;
    case LAN_HASH_SHA512: return 64;
    case LAN_HASH_RIPEMD160: return 20;
    default: return 0;
  }
}

size_t lan_hash_state_length(int algorithm) {
  switch (algorithm) {
    case LAN_HASH_SHA1: return sizeof(lan_sha1_ctx);
    case LAN_HASH_SHA256: return sizeof(lan_sha256_ctx);
    case LAN_HASH_SHA512: return sizeof(lan_sha512_ctx);
    case LAN_HASH_RIPEMD160: return sizeof(lan_ripemd160_ctx);
    default: return 0;
  }
}

size_t lan_hash_block_length(int algorithm) {
  switch (algorithm) {
    case LAN_HASH_SHA1:
    case LAN_HASH_SHA256:
    case LAN_HASH_RIPEMD160: return 64;
    case LAN_HASH_SHA512: return 128;
    default: return 0;
  }
}

typedef union {
  lan_sha1_ctx sha1;
  lan_sha256_ctx sha256;
  lan_sha512_ctx sha512;
  lan_ripemd160_ctx ripemd160;
} lan_any_ctx;

static int any_init(int algorithm, lan_any_ctx *ctx) {
  switch (algorithm) {
    case LAN_HASH_SHA1: lan_sha1_init(&ctx->sha1); return 1;
    case LAN_HASH_SHA256: lan_sha256_init(&ctx->sha256); return 1;
    case LAN_HASH_SHA512: lan_sha512_init(&ctx->sha512); return 1;
    case LAN_HASH_RIPEMD160: lan_ripemd160_init(&ctx->ripemd160); return 1;
    default: return 0;
  }
}

static int any_update(int algorithm, lan_any_ctx *ctx, const uint8_t *data, size_t len) {
  switch (algorithm) {
    case LAN_HASH_SHA1: lan_sha1_update(&ctx->sha1, data, len); return 1;
    case LAN_HASH_SHA256: lan_sha256_update(&ctx->sha256, data, len); return 1;
    case LAN_HASH_SHA512: lan_sha512_update(&ctx->sha512, data, len); return 1;
    case LAN_HASH_RIPEMD160: lan_ripemd160_update(&ctx->ripemd160, data, len); return 1;
    default: return 0;
  }
}

static int any_final(int algorithm, lan_any_ctx *ctx, uint8_t *out) {
  switch (algorithm) {
    case LAN_HASH_SHA1: lan_sha1_final(&ctx->sha1, out); return 1;
    case LAN_HASH_SHA256: lan_sha256_final(&ctx->sha256, out); return 1;
    case LAN_HASH_SHA512: lan_sha512_final(&ctx->sha512, out); return 1;
    case LAN_HASH_RIPEMD160: lan_ripemd160_final(&ctx->ripemd160, out); return 1;
    default: return 0;
  }
}

int lan_hash(int algorithm, const uint8_t *data, size_t len, uint8_t *out) {
  lan_any_ctx ctx;
  if (!any_init(algorithm, &ctx)) return 0;
  any_update(algorithm, &ctx, data, len);
  any_final(algorithm, &ctx, out);
  lan_memzero(&ctx, sizeof(ctx));
  return 1;
}

/*
 * The serialized state is the raw context struct. It is opaque to callers and
 * only ever round-trips within the same process/ABI, matching how libauth
 * treats the WebAssembly `rawState` buffers.
 */
int lan_hash_init(int algorithm, uint8_t *state) {
  lan_any_ctx ctx;
  if (!any_init(algorithm, &ctx)) return 0;
  memcpy(state, &ctx, lan_hash_state_length(algorithm));
  return 1;
}

static int validate_state(int algorithm, const lan_any_ctx *ctx) {
  /* Reject states whose buffer counter is out of range so corrupt input cannot overflow. */
  size_t block = lan_hash_block_length(algorithm);
  uint32_t buffered;
  switch (algorithm) {
    case LAN_HASH_SHA1: buffered = ctx->sha1.buffered; break;
    case LAN_HASH_SHA256: buffered = ctx->sha256.buffered; break;
    case LAN_HASH_SHA512: buffered = ctx->sha512.buffered; break;
    case LAN_HASH_RIPEMD160: buffered = ctx->ripemd160.buffered; break;
    default: return 0;
  }
  return buffered < block;
}

int lan_hash_update(int algorithm, uint8_t *state, const uint8_t *data, size_t len) {
  lan_any_ctx ctx;
  size_t state_len = lan_hash_state_length(algorithm);
  if (state_len == 0) return 0;
  memcpy(&ctx, state, state_len);
  if (!validate_state(algorithm, &ctx)) return 0;
  any_update(algorithm, &ctx, data, len);
  memcpy(state, &ctx, state_len);
  lan_memzero(&ctx, sizeof(ctx));
  return 1;
}

int lan_hash_final(int algorithm, const uint8_t *state, uint8_t *out) {
  lan_any_ctx ctx;
  size_t state_len = lan_hash_state_length(algorithm);
  if (state_len == 0) return 0;
  memcpy(&ctx, state, state_len);
  if (!validate_state(algorithm, &ctx)) return 0;
  any_final(algorithm, &ctx, out);
  lan_memzero(&ctx, sizeof(ctx));
  return 1;
}

/* ------------------------------------------------------------ HMAC/PBKDF2 */

typedef struct {
  int algorithm;
  lan_any_ctx inner;
  lan_any_ctx outer;
} lan_hmac_ctx;

static int hmac_setup(lan_hmac_ctx *h, int algorithm, const uint8_t *key, size_t key_len) {
  if (algorithm != LAN_HASH_SHA256 && algorithm != LAN_HASH_SHA512) return 0;
  size_t block = lan_hash_block_length(algorithm);
  uint8_t k[128];
  uint8_t pad[128];
  memset(k, 0, sizeof(k));
  if (key_len > block) {
    lan_hash(algorithm, key, key_len, k);
  } else if (key_len) {
    memcpy(k, key, key_len);
  }
  h->algorithm = algorithm;
  for (size_t i = 0; i < block; i++) pad[i] = k[i] ^ 0x36;
  any_init(algorithm, &h->inner);
  any_update(algorithm, &h->inner, pad, block);
  for (size_t i = 0; i < block; i++) pad[i] = k[i] ^ 0x5c;
  any_init(algorithm, &h->outer);
  any_update(algorithm, &h->outer, pad, block);
  lan_memzero(k, sizeof(k));
  lan_memzero(pad, sizeof(pad));
  return 1;
}

/* Computes HMAC(key, msg) from a prepared (and preserved) keyed context. */
static void hmac_run(const lan_hmac_ctx *h, const uint8_t *msg, size_t msg_len, uint8_t *out) {
  lan_any_ctx ctx = h->inner;
  uint8_t inner_digest[64];
  size_t digest_len = lan_hash_digest_length(h->algorithm);
  any_update(h->algorithm, &ctx, msg, msg_len);
  any_final(h->algorithm, &ctx, inner_digest);
  ctx = h->outer;
  any_update(h->algorithm, &ctx, inner_digest, digest_len);
  any_final(h->algorithm, &ctx, out);
  lan_memzero(&ctx, sizeof(ctx));
  lan_memzero(inner_digest, sizeof(inner_digest));
}

int lan_hmac(int algorithm, const uint8_t *key, size_t key_len, const uint8_t *msg, size_t msg_len, uint8_t *out) {
  lan_hmac_ctx h;
  if (!hmac_setup(&h, algorithm, key, key_len)) return 0;
  hmac_run(&h, msg, msg_len, out);
  lan_memzero(&h, sizeof(h));
  return 1;
}

int lan_pbkdf2(int algorithm, const uint8_t *password, size_t password_len, const uint8_t *salt, size_t salt_len,
               uint32_t iterations, uint8_t *out, size_t out_len) {
  lan_hmac_ctx h;
  if (iterations == 0 || out_len == 0) return 0;
  if (!hmac_setup(&h, algorithm, password, password_len)) return 0;
  size_t hlen = lan_hash_digest_length(algorithm);
  uint8_t u[64], t[64], counter[4];
  uint32_t block_index = 1;
  size_t written = 0;
  while (written < out_len) {
    lan_any_ctx ctx = h.inner;
    uint8_t inner_digest[64];
    store32_be(counter, block_index);
    /* U1 = PRF(P, S || INT(i)) */
    any_update(algorithm, &ctx, salt, salt_len);
    any_update(algorithm, &ctx, counter, 4);
    any_final(algorithm, &ctx, inner_digest);
    ctx = h.outer;
    any_update(algorithm, &ctx, inner_digest, hlen);
    any_final(algorithm, &ctx, u);
    memcpy(t, u, hlen);
    for (uint32_t j = 1; j < iterations; j++) {
      hmac_run(&h, u, hlen, u);
      for (size_t k = 0; k < hlen; k++) t[k] ^= u[k];
    }
    size_t take = out_len - written < hlen ? out_len - written : hlen;
    memcpy(out + written, t, take);
    written += take;
    block_index++;
    lan_memzero(&ctx, sizeof(ctx));
    lan_memzero(inner_digest, sizeof(inner_digest));
  }
  lan_memzero(&h, sizeof(h));
  lan_memzero(u, sizeof(u));
  lan_memzero(t, sizeof(t));
  return 1;
}
