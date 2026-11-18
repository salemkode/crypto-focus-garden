/**
 * The page inside the iOS/Android WebView. It starts the same controller the web build uses and
 * relays messages through the React Native WebView bridge.
 */
import { startValley } from '../controller';
import type { FromValley, ToValley } from '../protocol';

declare global {
  interface Window {
    ReactNativeWebView?: { postMessage: (data: string) => void };
    __valley?: { receive: (message: ToValley) => void; debug: () => unknown };
  }
}

const send = (message: FromValley) => window.ReactNativeWebView?.postMessage(JSON.stringify(message));
window.addEventListener('error', (event) => send({ type: 'error', message: `${event.message} @ ${event.filename}:${event.lineno}` }));
// iOS: block the page's own pinch zoom; the valley handles pinches itself.
for (const name of ['gesturestart', 'gesturechange', 'gestureend']) document.addEventListener(name, (e) => e.preventDefault(), { passive: false });

const canvas = document.getElementById('valley') as HTMLCanvasElement;
window.__valley = startValley(canvas, send);
send({ type: 'ready' });
