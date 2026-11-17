import Storage from 'expo-sqlite/kv-store';

/** The name shown before (or without) a public on-chain profile card. */
export const DISPLAY_NAME_KEY = 'focusgarden.displayName.v1';
export const ONBOARDED_KEY = 'focusgarden.onboarded.v1';

export const readDisplayName = () => Storage.getItemSync(DISPLAY_NAME_KEY) ?? '';
export const saveDisplayName = (name: string) => Storage.setItemSync(DISPLAY_NAME_KEY, name.trim());
export const isOnboarded = () => Storage.getItemSync(ONBOARDED_KEY) === '1';
export const markOnboarded = () => Storage.setItemSync(ONBOARDED_KEY, '1');
