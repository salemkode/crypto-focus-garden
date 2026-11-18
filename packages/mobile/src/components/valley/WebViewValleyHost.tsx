import { useCallback, useEffect, useImperativeHandle, useMemo, useRef, type ComponentType, type Ref } from 'react';
import { PanResponder, StyleSheet, View, type GestureResponderEvent } from 'react-native';
import { WebView as RNWebView } from 'react-native-webview';
import type { AndroidWebViewProps, IOSWebViewProps, WebViewMessageEvent } from 'react-native-webview/lib/WebViewTypes';
import { VALLEY_HTML } from './embed/html.generated';
import type { FromValley, ToValley, ValleyHostHandle } from './protocol';

// react-native-webview 14 types its export so that, with this app's React 19 types, every prop
// resolves to `never`. The iOS and Android prop types themselves are fine, so name them directly.
type WebViewHandle = { injectJavaScript: (script: string) => void; reload: () => void };
const WebView = RNWebView as unknown as ComponentType<IOSWebViewProps & AndroidWebViewProps & { ref?: Ref<WebViewHandle> }>;

/**
 * The valley on iOS and Android: the engine runs in a WebView (JavaScript with a JIT, WebGL on the
 * GPU), dressed to feel like part of the app: transparent, no scrolling, bouncing, zooming, text
 * selection, link previews or callouts. Every control around it is React Native.
 */
export function WebViewValleyHost({ ref, onMessage }: { ref: Ref<ValleyHostHandle>; onMessage: (message: FromValley) => void }) {
  const web = useRef<WebViewHandle>(null);
  const ready = useRef(false);

  // Debug builds: run JavaScript in the valley page from the JS debugger.
  useEffect(() => {
    if (__DEV__) exposePage((js) => web.current?.injectJavaScript(`${js};true;`));
  }, []);

  const deliver = useCallback((message: ToValley) => {
    web.current?.injectJavaScript(`window.__valley&&window.__valley.receive(${JSON.stringify(message)});true;`);
  }, []);
  useImperativeHandle(ref, () => ({
    // Before the page is ready nothing is delivered: on 'ready' the app sends its whole state.
    post: (message) => { if (ready.current) deliver(message); },
  }), [deliver]);

  const receive = useCallback((event: WebViewMessageEvent) => {
    let message: FromValley;
    try { message = JSON.parse(event.nativeEvent.data) as FromValley; } catch { return; }
    if (message.type === 'ready') {
      ready.current = true;
    }
    onMessage(message);
  }, [onMessage]);

  // Touch is handled here, not in the page: iOS hands two-finger gestures on a web view to its own
  // zoom handling, so the page never sees a pinch. The page only draws and picks.
  // Before the page is ready, injected messages find no valley and are ignored by the page.
  // `deliver` reads the WebView ref only when a touch happens, never during render; the compiler
  // cannot see that through PanResponder, so this one line opts out of the refs rule.
  // eslint-disable-next-line react-hooks/refs
  const touch = useMemo(() => valleyResponder(deliver), [deliver]);

  // If the system kills the web content process (memory pressure), start it again.
  const restart = useCallback(() => { ready.current = false; web.current?.reload(); }, []);

  // A plain absolute View: wrapping the WebView in an animated view laid it out at zero height.
  // The page is transparent over the app's sky, so it needs no fade-in.
  return <View style={styles.fill}>
    <WebView
      ref={web}
      source={{ html: VALLEY_HTML, baseUrl: 'https://valley.focusgarden.local/' }}
      originWhitelist={['https://valley.focusgarden.local']}
      onMessage={receive}
      style={styles.web}
      containerStyle={styles.web}
      // Not a browser: nothing scrolls, bounces, zooms, selects or previews.
      scrollEnabled={false}
      bounces={false}
      overScrollMode="never"
      showsHorizontalScrollIndicator={false}
      showsVerticalScrollIndicator={false}
      setBuiltInZoomControls={false}
      setDisplayZoomControls={false}
      allowsLinkPreview={false}
      textInteractionEnabled={false}
      dataDetectorTypes="none"
      allowsBackForwardNavigationGestures={false}
      contentInsetAdjustmentBehavior="never"
      automaticallyAdjustContentInsets={false}
      hideKeyboardAccessoryView
      keyboardDisplayRequiresUserAction
      allowsInlineMediaPlayback={false}
      mediaPlaybackRequiresUserAction
      androidLayerType="hardware"
      cacheEnabled
      javaScriptEnabled
      domStorageEnabled={false}
      webviewDebuggingEnabled={__DEV__}
      // Nothing inside may navigate anywhere.
      onShouldStartLoadWithRequest={(request: { url: string }) => request.url.startsWith('https://valley.focusgarden.local') || request.url === 'about:blank'}
      onContentProcessDidTerminate={restart}
      onRenderProcessGone={restart}
    />
    <View style={styles.fill} {...touch.panHandlers} accessible accessibilityLabel="Your valley. Drag to travel, pinch to zoom, two fingers to turn." />
  </View>;
}

/** An angle change wrapped into ±π, so crossing the ±180° seam is a small turn, not a full one. */
const turn = (delta: number) => Math.atan2(Math.sin(delta), Math.cos(delta));

function exposePage(run: (js: string) => void) {
  (globalThis as { __valleyPage?: (js: string) => void }).__valleyPage = run;
}

/**
 * One finger travels, two fingers pinch, turn and tilt; a short touch taps and two quick taps fly
 * there. Positions are in view points (the valley fills the screen).
 */
export function valleyResponder(send: (message: ToValley) => void) {
  type Reading = { x: number; y: number; distance: number; angle: number; midY: number; fingers: number };
  let last: Reading | null = null;
  let start: { x: number; y: number; t: number } | null = null;
  let lastTap = 0;
  const read = (e: GestureResponderEvent): Reading => {
    const t = e.nativeEvent.touches;
    if (t.length >= 2) return { x: (t[0].pageX + t[1].pageX) / 2, y: (t[0].pageY + t[1].pageY) / 2, distance: Math.hypot(t[0].pageX - t[1].pageX, t[0].pageY - t[1].pageY), angle: Math.atan2(t[1].pageY - t[0].pageY, t[1].pageX - t[0].pageX), midY: (t[0].pageY + t[1].pageY) / 2, fingers: 2 };
    return { x: e.nativeEvent.pageX, y: e.nativeEvent.pageY, distance: 0, angle: 0, midY: 0, fingers: 1 };
  };
  return PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => true,
    onPanResponderTerminationRequest: () => false,
    onPanResponderGrant: (e) => {
      last = read(e);
      start = { x: e.nativeEvent.locationX, y: e.nativeEvent.locationY, t: Date.now() };
      send({ type: 'camera', begin: true });
    },
    onPanResponderMove: (e) => {
      const now = read(e);
      if (last && now.fingers === last.fingers) {
        if (now.fingers === 2) {
          send({ type: 'camera', zoom: now.distance / Math.max(1, last.distance), rotate: turn(now.angle - last.angle), tilt: (now.midY - last.midY) * 0.004 });
          start = null;
        } else if (now.x !== last.x || now.y !== last.y) {
          send({ type: 'camera', pan: [now.x - last.x, now.y - last.y] });
          if (start && Math.hypot(e.nativeEvent.locationX - start.x, e.nativeEvent.locationY - start.y) > 8) start = null;
        }
      }
      last = now;
    },
    onPanResponderRelease: (e) => {
      send({ type: 'camera', release: true });
      const end = { x: e.nativeEvent.locationX, y: e.nativeEvent.locationY };
      if (start && Math.hypot(end.x - start.x, end.y - start.y) < 8 && Date.now() - start.t < 350) {
        const double = Date.now() - lastTap < 300;
        send({ type: 'tap', x: end.x, y: end.y, double });
        lastTap = double ? 0 : Date.now();
      }
      last = null; start = null;
    },
    onPanResponderTerminate: () => { send({ type: 'camera', release: true }); last = null; start = null; },
  });
}

const styles = StyleSheet.create({
  // Absolute fill (not flex): the WebView must have its full size from its very first layout.
  fill: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  web: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'transparent' },
});
