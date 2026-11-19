import { z } from 'zod';
import type { GardenNetwork } from '@focus-garden/protocol';

export const clientNetwork = z.enum(['chipnet', 'mainnet']).parse(process.env.EXPO_PUBLIC_GARDEN_NETWORK ?? 'chipnet');
export const isMainnet = clientNetwork === 'mainnet';
export const clientNetworkLabel = isMainnet ? 'Mainnet' : 'Chipnet';
export const addressPrefix = (network: GardenNetwork) => network === 'mainnet' ? 'bitcoincash' : 'bchtest';
export const clientPrefix = addressPrefix(clientNetwork);
export function networkStorageKey(chipnetKey: string, network: GardenNetwork = clientNetwork) {
  return network === 'mainnet' ? `${chipnetKey}.mainnet` : chipnetKey;
}
export const internalWalletKey = networkStorageKey('focusgarden.chipnet.internal.v1');
export const activeWalletKey = networkStorageKey('focusgarden.active.wallet.v1');
export const currencyDisclosure = isMainnet ? 'in real BCH on Mainnet' : 'in test coins with no cash value';
