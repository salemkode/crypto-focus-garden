/*
 * Single translation unit that compiles the vendored secp256k1 library with the
 * static configuration in src/libsecp256k1-config.h.
 * Requires `cpp/secp256k1` and `cpp/secp256k1/src` on the include path.
 */
#ifndef HAVE_CONFIG_H
#define HAVE_CONFIG_H 1
#endif
#include "secp256k1/src/secp256k1.c"
