/** The ways to link a wallet. Both protocols are supported by Selene and Paytaca. */
export type LinkMethod = 'walletconnect' | 'wizardconnect';

export interface WalletApp {
  id: 'selene' | 'paytaca';
  name: string;
  /**
   * The protocol whose link opens this wallet directly. Selene is the only wallet that registers
   * `wiz://`; Paytaca registers `wc:` (and has no `wiz://` link handler).
   */
  method: LinkMethod;
  /** A URL scheme the wallet registers, used to tell whether it is installed. */
  probe: string;
  appStore: string;
  playStore: string;
}

export const WALLET_APPS: readonly WalletApp[] = [
  { id: 'selene', name: 'Selene', method: 'wizardconnect', probe: 'wiz://', appStore: 'https://apps.apple.com/app/id6449441422', playStore: 'https://play.google.com/store/apps/details?id=cash.selene.app' },
  { id: 'paytaca', name: 'Paytaca', method: 'walletconnect', probe: 'paytaca://', appStore: 'https://apps.apple.com/app/id1451795432', playStore: 'https://play.google.com/store/apps/details?id=com.paytaca.app' },
];

export const METHOD_NAME: Record<LinkMethod, string> = { walletconnect: 'WalletConnect', wizardconnect: 'WizardConnect' };

/** What a finished pairing yields: where trees go, and which wallet agreed to it. */
export interface LinkedWallet { address: string; walletName: string; method: LinkMethod }

/** A pairing in progress: the link to open or show, the eventual result, and a way to stop. */
export interface Pairing { uri: string; result: Promise<LinkedWallet>; cancel: () => void }

/** WalletConnect needs a Reown project ID (EXPO_PUBLIC_WALLETCONNECT_PROJECT_ID in .env.local). */
export const walletConnectProjectId = process.env.EXPO_PUBLIC_WALLETCONNECT_PROJECT_ID ?? '';
export const walletConnectAvailable = /^[0-9a-f]{32}$/i.test(walletConnectProjectId);
