import { Component, useCallback, useState, type ReactNode, type Ref } from 'react';
import type { FromValley, ValleyHostHandle } from './protocol';
import { WebViewValleyHost } from './WebViewValleyHost';
import { FilamentValleyHost } from './filament/FilamentValleyHost';

type Props = { ref: Ref<ValleyHostHandle>; onMessage: (message: FromValley) => void };

/** Build-time choice: `EXPO_PUBLIC_VALLEY_RENDERER=webview` keeps the three.js WebView valley on iOS and Android. */
const RENDERER = process.env.EXPO_PUBLIC_VALLEY_RENDERER === 'webview' ? 'webview' : 'filament';

/**
 * The valley on iOS and Android: Filament (native, up to 120 Hz). If Filament cannot start or
 * fails while running, the WebView host takes over; on 'ready' the app sends its whole state
 * again, so nothing is lost. The web always uses the three.js host (ValleyHost.web.tsx).
 */
export function ValleyHost({ ref, onMessage }: Props) {
  const [failed, setFailed] = useState<string | null>(null);
  const fail = useCallback((error: unknown) => {
    const message = String((error as Error)?.stack ?? error);
    if (__DEV__) console.warn(`[valley] Filament failed, using the WebView valley: ${message.split('\n').slice(0, 4).join(' | ')}`);
    setFailed((current) => current ?? message);
  }, []);
  if (RENDERER === 'webview' || failed) return <WebViewValleyHost ref={ref} onMessage={onMessage} />;
  return <Boundary onError={fail}><FilamentValleyHost ref={ref} onMessage={onMessage} onFailure={fail} /></Boundary>;
}

class Boundary extends Component<{ onError: (error: unknown) => void; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(error: unknown) { this.props.onError(error); }
  render() { return this.state.failed ? null : this.props.children; }
}
