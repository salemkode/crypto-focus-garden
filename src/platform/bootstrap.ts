// Platform resolution keeps the browser away from native crypto initialization.
import 'libauth-native/polyfills';
import '@expo/metro-runtime';
// Register the native root synchronously, after installing the JSI crypto bindings.
// eslint-disable-next-line @typescript-eslint/no-require-imports
require('expo-router/entry');
