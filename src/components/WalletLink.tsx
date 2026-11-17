import { useState } from 'react';
import { Text, View } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import * as Haptics from 'expo-haptics';
import QRCode from 'react-native-qrcode-svg';
import { useRewards } from '../features/rewards/RewardProvider';
import { readLinkInfo, useWalletLink } from '../features/wallet-link/useWalletLink';
import { METHOD_NAME, WALLET_APPS, walletConnectAvailable } from '../features/wallet-link/wallets';
import { Button, color, continuous, Field, Group, icons, nativeAware, Notice, Row } from '../ui';

const short = (address: string) => `${address.slice(0, 14)}…${address.slice(-6)}`;

const LOGO = {
  walletconnect: require('../../assets/wallets/walletconnect.png'),
  wizardconnect: require('../../assets/wallets/wizardconnect.png'),
  selene: require('../../assets/wallets/selene.png'),
  paytaca: require('../../assets/wallets/paytaca.png'),
} as const;

/**
 * Links the user's own wallet, where grown trees are sent. WalletConnect and WizardConnect are the
 * two ways in; Selene and Paytaca are shortcuts that open one of them straight in that wallet.
 * Focus Garden's helper wallet only pays the network fee and signs the planting.
 */
export const WalletLink = nativeAware(function WalletLink({ onLinked }: { onLinked?: () => void }) {
  const rewards = useRewards();
  const link = useWalletLink(onLinked);
  const [manual, setManual] = useState(false);
  const [draft, setDraft] = useState('');
  const linked = rewards.recipient;
  const info = linked ? readLinkInfo(linked) : null;
  const ready = rewards.status === 'ready';

  async function saveManual() {
    if (!await rewards.saveRecipient(draft)) return;
    setDraft(''); setManual(false);
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    onLinked?.();
  }

  if (link.state.phase !== 'idle') {
    const { method, app } = link.state;
    const uri = link.state.phase === 'waiting' ? link.state.uri : '';
    return <>
      <Group title={link.state.phase === 'starting' ? 'Preparing…' : METHOD_NAME[method]} footer={`Approve in ${app?.name ?? 'your wallet'}, then come back.`}>
        <Row title={app ? `Open ${app.name}` : 'Open in wallet'} image={LOGO[app?.id ?? method]} disabled={!uri} onPress={() => void link.reopen()} chevron />
        <Row title="Copy link" icon={icons.copy} disabled={!uri} onPress={() => { void Clipboard.setStringAsync(uri); void Haptics.selectionAsync(); }} />
      </Group>
      {uri ? <View className="items-center py-2">
        <View style={continuous} className="rounded-[20px] bg-white p-4"><QRCode value={uri} size={188} color={color.ink} backgroundColor="#FFFFFF" /></View>
      </View> : null}
      {link.error ? <Notice tone="error">{link.error}</Notice> : null}
      <Button variant="secondary" label="Cancel" onPress={link.cancel} />
    </>;
  }

  return <>
    {linked ? <Group title="Linked wallet">
      <Row title={info?.walletName ?? 'Your wallet'} detail={short(linked)} icon={icons.checkCircle} iconTint={color.moss} value={info ? METHOD_NAME[info.method] : undefined} />
    </Group> : null}

    <Group title={linked ? 'Change wallet' : 'Connect'} footer="Focus Garden only reads your address.">
      <Row title="WalletConnect" image={LOGO.walletconnect} disabled={!ready || !walletConnectAvailable} onPress={() => void link.start('walletconnect')} chevron />
      <Row title="WizardConnect" image={LOGO.wizardconnect} disabled={!ready} onPress={() => void link.start('wizardconnect')} chevron />
    </Group>

    <Group title="Shortcuts">
      {WALLET_APPS.map((app) => <Row key={app.id} title={app.name} image={LOGO[app.id]}
        disabled={!ready || (app.method === 'walletconnect' && !walletConnectAvailable)} onPress={() => void link.start(app.method, app)} chevron />)}
    </Group>

    <Group>
      <Row title={manual ? 'Hide address entry' : 'Enter an address'} onPress={() => { link.cancel(); setManual(!manual); }} chevron={!manual} />
    </Group>

    {manual ? <>
      <Field label="Chipnet address" value={draft} onChangeText={setDraft} autoCorrect={false} autoCapitalize="none" placeholder="bchtest:" />
      <Button variant="secondary" label={linked ? 'Change wallet' : 'Link this address'} disabled={!draft.trim() || !ready} onPress={() => void saveManual()} />
    </> : null}

    {link.error ? <Notice tone="error">{link.error}</Notice> : rewards.notice ? <Notice>{rewards.notice}</Notice> : null}
    {!ready ? <Text className="px-4 text-footnote text-ink-2">Waiting for the helper wallet to open.</Text> : null}
  </>;
});
