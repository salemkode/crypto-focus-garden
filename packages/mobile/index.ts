// Native crypto must initialize before any wallet or router imports.
import 'libauth-native/polyfills';
import { LogBox } from 'react-native';

// NativeWind 4's registry reads RN's deprecated ImageBackground export. Set this
// narrow filter before loading the router; other startup warnings remain visible.
LogBox.ignoreLogs(['ImageBackground is deprecated and will be removed']);

// require is intentional: the router must execute after the setup above.
require('expo-router/entry');
