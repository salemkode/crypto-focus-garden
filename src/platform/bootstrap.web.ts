import '@expo/metro-runtime';
import { ready } from '../../web-shims/libauth-default-crypto-instances';

// Metro emits a classic browser script. Finish WASM initialization before routes evaluate.
ready.then(() => {
  // A static require keeps Router in Metro's initial graph while deferring its evaluation until WASM is ready.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require('expo-router/entry');
}).catch((cause) => {
  console.error('Focus Garden could not initialize cryptography.', cause);
  document.body.textContent = 'Focus Garden could not start. Reload the page to retry.';
});
