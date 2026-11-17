// Must load before the WalletConnect client: crypto, text encoding and storage for React Native.
import '@walletconnect/react-native-compat';
import NetInfo from '@react-native-community/netinfo';
import { SignClient } from '@walletconnect/sign-client';
import { addressFromAccount, chipnetAddress } from './address';
import type { Pairing } from './wallets';

import { walletConnectProjectId as projectId } from './wallets';

// The 3D models need Expo's browser polyfill, which defines a global `document`. WalletConnect then takes
// the app for a web page: it reads <meta> tags through `document.getElementsByTagName` and asks
// `navigator.onLine` whether the phone is online. Give it what a page would have, backed by the
// phone's real network state; our explicit metadata below is used instead of any tags.
const page = globalThis as { document?: { getElementsByTagName?: unknown }; navigator?: { onLine?: boolean } };
if (page.document && typeof page.document.getElementsByTagName !== 'function') page.document.getElementsByTagName = () => [];
if (page.navigator && page.navigator.onLine === undefined) {
  let online = true;
  NetInfo.addEventListener((state) => { online = state.isConnected !== false; });
  Object.defineProperty(page.navigator, 'onLine', { configurable: true, get: () => online });
}

let client: Promise<InstanceType<typeof SignClient>> | null = null;
function signClient() {
  client ??= SignClient.init({
    projectId,
    metadata: {
      name: 'Focus Garden',
      description: 'Grow a tree while you focus. Trees are sent to your wallet.',
      url: 'https://focus.salemkode.com',
      icons: ['https://focus.salemkode.com/icon.png'],
      redirect: { native: 'focusgardennext://' },
    },
  }).catch((cause) => { client = null; throw cause; });
  return client;
}

/**
 * WalletConnect v2 with the Bitcoin Cash namespace (wc2-bch-bcr). Chipnet is preferred; a wallet
 * that only offers mainnet still identifies the same key, whose Chipnet address receives trees.
 * Focus Garden only needs the address, so the session is closed once it is known.
 */
export async function startWalletConnect(): Promise<Pairing> {
  const sign = await signClient();
  const { uri, approval } = await sign.connect({
    optionalNamespaces: {
      bch: { chains: ['bch:bchtest', 'bch:bitcoincash'], methods: ['bch_getAddresses', 'bch_signTransaction', 'bch_signMessage'], events: ['addressesChanged'] },
    },
  });
  if (!uri) throw new Error('WalletConnect did not return a pairing link.');
  let cancelled = false;
  const result = approval().then(async (session) => {
    const namespace = session.namespaces.bch;
    let address = (namespace?.accounts ?? []).map(addressFromAccount).find((value): value is string => Boolean(value));
    if (!address) {
      const chainId = namespace?.chains?.[0] ?? namespace?.accounts?.[0]?.split(':').slice(0, 2).join(':') ?? 'bch:bchtest';
      const reported = await sign.request<string[]>({ topic: session.topic, chainId, request: { method: 'bch_getAddresses', params: {} } });
      if (!reported?.[0]) throw new Error('The wallet did not share an address.');
      address = chipnetAddress(reported[0]);
    }
    void sign.disconnect({ topic: session.topic, reason: { code: 6000, message: 'Linked to Focus Garden.' } }).catch(() => undefined);
    if (cancelled) throw new Error('Cancelled.');
    return { address, walletName: session.peer.metadata.name || 'your wallet', method: 'walletconnect' as const };
  });
  return { uri, result, cancel: () => { cancelled = true; } };
}
