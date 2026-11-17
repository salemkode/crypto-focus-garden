/*
 * Static configuration for the vendored libauth secp256k1 fork
 * (https://github.com/bitauth/libauth-secp256k1 @ 2b8e4e6a95a7da9fde0d15fb5351b22bcc1863c5).
 *
 * Mirrors the autotools configuration libauth uses for its WebAssembly build
 * (`./configure --enable-module-recovery`, schnorr enabled by default), but
 * picks the fastest portable field/scalar implementation for the target ABI.
 * Results are bit-for-bit identical regardless of the field/scalar choice.
 */
#ifndef LIBAUTH_NATIVE_SECP256K1_CONFIG_H
#define LIBAUTH_NATIVE_SECP256K1_CONFIG_H

#define USE_NUM_NONE 1
#define USE_FIELD_INV_BUILTIN 1
#define USE_SCALAR_INV_BUILTIN 1

#if defined(__SIZEOF_INT128__)
#define HAVE___INT128 1
#define USE_FIELD_5X52 1
#define USE_SCALAR_4X64 1
#else
#define USE_FIELD_10X26 1
#define USE_SCALAR_8X32 1
#endif

#define ECMULT_WINDOW_SIZE 15

#define ENABLE_MODULE_RECOVERY 1
#define ENABLE_MODULE_SCHNORR 1

#if defined(__GNUC__) || defined(__clang__)
#define HAVE_BUILTIN_EXPECT 1
#endif

#endif /* LIBAUTH_NATIVE_SECP256K1_CONFIG_H */
