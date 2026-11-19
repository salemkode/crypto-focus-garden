/*
 * Host test harness: reads one command per line on stdin and prints one result
 * line. Driven by compare-with-wasm.mjs, which checks every result against
 * libauth's WebAssembly implementation. Empty byte strings are written as "-".
 */
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#include "../../cpp/lan_hashes.h"
#include "../../cpp/lan_secp256k1.h"

static size_t from_hex(const char *hex, uint8_t *out, size_t cap) {
  if (strcmp(hex, "-") == 0) return 0;
  size_t n = strlen(hex) / 2;
  if (n > cap) { fprintf(stderr, "hex too long\n"); exit(2); }
  for (size_t i = 0; i < n; i++) {
    unsigned v;
    sscanf(hex + 2 * i, "%2x", &v);
    out[i] = (uint8_t)v;
  }
  return n;
}

static void print_hex(const uint8_t *data, size_t len) {
  if (len == 0) { printf("-"); return; }
  for (size_t i = 0; i < len; i++) printf("%02x", data[i]);
}

/* Pads like libauth's cloneAndPad: zero-fills to `size` (caller ensures len <= size). */
static size_t padded(const char *hex, uint8_t *out, size_t size) {
  memset(out, 0, size);
  return from_hex(hex, out, size);
}

static void status_bytes(int status, const uint8_t *out, size_t len) {
  printf("%d ", status);
  if (status == 0) print_hex(out, len); else printf("-");
  printf("\n");
}

int main(void) {
  static char line[1 << 20];
  static uint8_t a[1 << 18], b[1 << 18];
  uint8_t out[256];
  size_t out_len;
  while (fgets(line, sizeof(line), stdin)) {
    char *argv[8];
    int argc = 0;
    for (char *tok = strtok(line, " \n"); tok && argc < 8; tok = strtok(NULL, " \n")) argv[argc++] = tok;
    if (argc == 0) continue;
    const char *op = argv[0];
    if (!strcmp(op, "hash")) {
      int alg = atoi(argv[1]);
      size_t n = from_hex(argv[2], a, sizeof(a));
      lan_hash(alg, a, n, out);
      print_hex(out, lan_hash_digest_length(alg)); printf("\n");
    } else if (!strcmp(op, "hinc")) {
      int alg = atoi(argv[1]);
      uint8_t state[512];
      lan_hash_init(alg, state);
      for (int i = 2; i < argc; i++) {
        size_t n = from_hex(argv[i], a, sizeof(a));
        lan_hash_update(alg, state, a, n);
      }
      lan_hash_final(alg, state, out);
      print_hex(out, lan_hash_digest_length(alg)); printf("\n");
    } else if (!strcmp(op, "hmac")) {
      int alg = atoi(argv[1]);
      size_t kn = from_hex(argv[2], a, sizeof(a));
      size_t mn = from_hex(argv[3], b, sizeof(b));
      lan_hmac(alg, a, kn, b, mn, out);
      print_hex(out, lan_hash_digest_length(alg)); printf("\n");
    } else if (!strcmp(op, "pbkdf2")) {
      int alg = atoi(argv[1]);
      size_t pn = from_hex(argv[2], a, sizeof(a));
      size_t sn = from_hex(argv[3], b, sizeof(b));
      uint32_t iters = (uint32_t)strtoul(argv[4], NULL, 10);
      size_t len = strtoul(argv[5], NULL, 10);
      uint8_t *dk = malloc(len);
      lan_pbkdf2(alg, a, pn, b, sn, iters, dk, len);
      print_hex(dk, len); printf("\n");
      free(dk);
    } else if (!strcmp(op, "vpriv")) {
      uint8_t k[32]; padded(argv[1], k, 32);
      printf("%d\n", lan_secp_validate_private_key(k));
    } else if (!strcmp(op, "vpub")) {
      uint8_t p[65]; size_t n = padded(argv[1], p, 65);
      printf("%d\n", lan_secp_validate_public_key(p, n));
    } else if (!strcmp(op, "derive")) {
      uint8_t k[32]; padded(argv[1], k, 32);
      int st = lan_secp_derive_public_key(k, atoi(argv[2]), out, &out_len);
      status_bytes(st, out, out_len);
    } else if (!strcmp(op, "convpub")) {
      uint8_t p[65]; size_t n = padded(argv[1], p, 65);
      int st = lan_secp_convert_public_key(p, n, atoi(argv[2]), out, &out_len);
      status_bytes(st, out, out_len);
    } else if (!strcmp(op, "sign")) {
      uint8_t k[32], m[32]; padded(argv[1], k, 32); padded(argv[2], m, 32);
      int st = lan_secp_sign_ecdsa(k, m, atoi(argv[3]), out, &out_len);
      status_bytes(st, out, out_len);
    } else if (!strcmp(op, "schnorr")) {
      uint8_t k[32], m[32]; padded(argv[1], k, 32); padded(argv[2], m, 32);
      int st = lan_secp_sign_schnorr(k, m, out);
      status_bytes(st, out, 64);
    } else if (!strcmp(op, "signrec")) {
      uint8_t k[32], m[32]; padded(argv[1], k, 32); padded(argv[2], m, 32);
      int recid = -1;
      int st = lan_secp_sign_recoverable(k, m, out, &recid);
      printf("%d ", st);
      if (st == 0) { print_hex(out, 64); printf(" %d", recid); } else printf("-");
      printf("\n");
    } else if (!strcmp(op, "recover")) {
      uint8_t s[72], m[32]; padded(argv[1], s, 72); padded(argv[3], m, 32);
      int st = lan_secp_recover_public_key(s, atoi(argv[2]), m, atoi(argv[4]), out, &out_len);
      status_bytes(st, out, out_len);
    } else if (!strcmp(op, "convsig")) {
      uint8_t s[72]; size_t n = padded(argv[1], s, 72);
      int st = lan_secp_convert_signature(s, n, atoi(argv[2]), out, &out_len);
      status_bytes(st, out, out_len);
    } else if (!strcmp(op, "modsig")) {
      uint8_t s[72]; size_t n = padded(argv[1], s, 72);
      int st = lan_secp_modify_signature(s, n, atoi(argv[2]), atoi(argv[3]), out, &out_len);
      status_bytes(st, out, out_len);
    } else if (!strcmp(op, "verify")) {
      uint8_t s[72], p[65], m[32];
      size_t sn = padded(argv[1], s, 72);
      size_t pn = padded(argv[4], p, 65);
      padded(argv[5], m, 32);
      printf("%d\n", lan_secp_verify_ecdsa(s, sn, atoi(argv[2]), atoi(argv[3]), p, pn, m));
    } else if (!strcmp(op, "vschnorr")) {
      uint8_t s[64], p[65], m[32];
      padded(argv[1], s, 64);
      size_t pn = padded(argv[2], p, 65);
      padded(argv[3], m, 32);
      printf("%d\n", lan_secp_verify_schnorr(s, p, pn, m));
    } else if (!strcmp(op, "tweakpriv")) {
      uint8_t k[32], t[32]; padded(argv[1], k, 32); padded(argv[2], t, 32);
      int st = lan_secp_tweak_private_key(k, t, atoi(argv[3]), out);
      status_bytes(st, out, 32);
    } else if (!strcmp(op, "tweakpub")) {
      uint8_t p[65], t[32]; size_t pn = padded(argv[1], p, 65); padded(argv[2], t, 32);
      int st = lan_secp_tweak_public_key(p, pn, t, atoi(argv[3]), atoi(argv[4]), out, &out_len);
      status_bytes(st, out, out_len);
    } else {
      printf("unknown\n");
    }
    fflush(stdout);
  }
  return 0;
}
