import { initiateDappRelay, type RelayUpdatePayload as RelayUpdate } from '@wizardconnect/core';
import { DappConnectionManager } from '@wizardconnect/dapp';
import { addressFromPublicKey } from '../../wallet/address';
import type { Pairing } from './wallets';

/** BCH convention for the receive branch of the wallet's key tree. */
const RECEIVE = 0;
/** How long @wizardconnect/dapp waits for the key exchange before giving up on dapp_ready (0.2.7). */
const KEY_EXCHANGE_WINDOW = 29_000;

/**
 * WizardConnect (RiftenLabs): end-to-end encrypted pairing over public Nostr relays, supported by
 * Selene and Paytaca. The wallet shares its receive key branch; its first receive address is where
 * trees go. Focus Garden only needs that address, so the session ends once it is known.
 */
export function startWizardConnect(): Pairing {
  const manager = new DappConnectionManager('Focus Garden', 'https://focus.salemkode.com/icon.png', { session: false });
  // The library sends dapp_ready only if the wallet finishes the key exchange within 30 seconds of
  // connecting. People switch apps, scan or paste more slowly than that, so when the exchange
  // completes later, replay the last "connected" status to send dapp_ready then.
  let connected: { client: RelayUpdate['client']; status: RelayUpdate['status']; at: number } | null = null;
  const relay = initiateDappRelay(({ client, status }) => {
    if (status.status === 'connected') connected = { client, status, at: Date.now() };
    manager.updateConnection(client, status);
  });
  relay.events.on('keyexchangecomplete', () => {
    if (connected && Date.now() - connected.at >= KEY_EXCHANGE_WINDOW) manager.updateConnection(connected.client, connected.status);
  });
  manager.attachRelay(relay);
  let closed = false;
  const close = (message?: string) => {
    if (closed) return;
    closed = true;
    void (message ? manager.sendDisconnect(message).catch(() => undefined) : Promise.resolve())
      .then(() => manager.destroy())
      .catch(() => undefined)
      .finally(() => relay.cleanup());
  };
  const result = new Promise<{ address: string; walletName: string; method: 'wizardconnect' }>((resolve, reject) => {
    manager.once('walletready', () => {
      const publicKey = manager.getPubkey(RECEIVE, 0n);
      if (!publicKey) { reject(new Error('The wallet did not share a receive address.')); close('No receive address.'); return; }
      resolve({ address: addressFromPublicKey(publicKey, 'bchtest'), walletName: manager.walletName || 'your wallet', method: 'wizardconnect' });
      close('Linked to Focus Garden.');
    });
    manager.once('disconnect', (_reason, message) => { reject(new Error(message || 'The wallet closed the connection.')); close(); });
  });
  return { uri: relay.uri, result, cancel: () => close('Cancelled.') };
}
