/**
 * Two worklet runtimes live in this app:
 * - react-native-worklets (Reanimated 4), added automatically by babel-preset-expo;
 * - react-native-worklets-core, which react-native-filament runs its render callbacks on.
 * Both claim the 'worklet' directive, and a function compiled by one cannot run on the other. So
 * filament, worklets-core and the native valley renderer are compiled with the worklets-core
 * plugin only; everything else keeps Reanimated's plugin. The two overrides are mutually
 * exclusive (Babel does not replace a preset's options inside an override, it runs both).
 * Filament files skip nativewind/babel too: it adds react-native-reanimated/plugin itself. They
 * use plain React JSX, so `className` does nothing there.
 */
const FILAMENT_WORKLETS = /[\\/](react-native-filament|react-native-worklets-core)[\\/]|[\\/]src[\\/]components[\\/]valley[\\/]filament[\\/]/;
const isFilament = (file) => Boolean(file && FILAMENT_WORKLETS.test(file));

const expo = (options) => ['babel-preset-expo', { jsxImportSource: 'nativewind', ...options }];

module.exports = function (api) {
  api.cache(true);
  return {
    plugins: [require.resolve('libauth-native/babel-plugin')],
    overrides: [
      { test: (file) => !isFilament(file), presets: [expo(), 'nativewind/babel'] },
      { test: isFilament, presets: [expo({ jsxImportSource: 'react', worklets: false, reanimated: false })], plugins: ['react-native-worklets-core/plugin'] },
    ],
  };
};
