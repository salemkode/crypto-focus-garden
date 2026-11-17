cmake_minimum_required(VERSION 3.13)

project(libauth-native C)

set(CMAKE_C_STANDARD 99)
set(CORE_DIR "${CMAKE_SOURCE_DIR}/../cpp")

add_library(
  libauth-native
  SHARED
  "${CORE_DIR}/lan_hashes.c"
  "${CORE_DIR}/lan_secp256k1.c"
  "${CORE_DIR}/lan_secp256k1_impl.c"
  "${CMAKE_SOURCE_DIR}/src/main/cpp/libauth_native_jni.c"
)

target_include_directories(
  libauth-native
  PRIVATE
  "${CORE_DIR}"
  "${CORE_DIR}/secp256k1"
  "${CORE_DIR}/secp256k1/src"
)

target_compile_options(libauth-native PRIVATE -O3 -fvisibility=hidden -Wno-unused-function)

# Strip unused code and keep only the JNI entry points exported.
target_link_options(libauth-native PRIVATE -Wl,--gc-sections)
