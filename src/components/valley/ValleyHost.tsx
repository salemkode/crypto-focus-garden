/**
 * Type and fallback entry for the valley host. Platforms pick their own file:
 * - ValleyHost.web.tsx: three.js in the page;
 * - ValleyHost.native.tsx: Filament on iOS and Android, with the WebView host as fallback.
 */
export { WebViewValleyHost as ValleyHost } from './WebViewValleyHost';
