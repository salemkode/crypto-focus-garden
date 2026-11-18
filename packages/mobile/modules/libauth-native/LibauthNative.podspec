require 'json'

package = JSON.parse(File.read(File.join(__dir__, 'package.json')))

Pod::Spec.new do |s|
  s.name           = 'LibauthNative'
  s.version        = package['version']
  s.summary        = package['description']
  s.description    = package['description']
  s.license        = package['license']
  s.author         = package['author']
  s.homepage       = 'https://github.com/bitauth/libauth'
  s.platforms      = {
    :ios => '16.4',
    :tvos => '16.4'
  }
  s.source         = { git: '' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'

  # The C core (cpp/) is shared with Android, so this podspec lives at the module
  # root (see `apple.podspecPath` in expo-module.config.json).
  s.source_files = 'ios/**/*.{h,m,swift}', 'cpp/*.{h,c}'
  s.public_header_files = 'cpp/lan_hashes.h', 'cpp/lan_secp256k1.h'
  # secp256k1 is compiled as a single translation unit via cpp/lan_secp256k1_impl.c.
  s.preserve_paths = 'cpp/secp256k1/**/*'

  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
    # secp256k1 uses generic header names (hash.h, util.h, field.h, ...). Xcode header
    # maps resolve those case-insensitively to other pods' headers (e.g. folly's Hash.h),
    # so disable header maps and rely on the explicit search paths below.
    'USE_HEADERMAP' => 'NO',
    'ALWAYS_SEARCH_USER_PATHS' => 'NO',
    'HEADER_SEARCH_PATHS' => '$(inherited) "$(PODS_TARGET_SRCROOT)/cpp/secp256k1" "$(PODS_TARGET_SRCROOT)/cpp/secp256k1/src"',
    'GCC_OPTIMIZATION_LEVEL' => '3',
    'GCC_C_LANGUAGE_STANDARD' => 'gnu99',
    'GCC_WARN_INHIBIT_ALL_WARNINGS' => 'YES',
  }
end
