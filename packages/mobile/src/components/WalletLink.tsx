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
 * Links the user's own wallet, where grown trees are sent. Selene and Paytaca open WizardConnect or
 * WalletConnect straight in that wallet; the two protocol rows serve any other wallet by link or QR
 * code. The Focus Garden wallet only pays the network fee and signs the planting.
 */
export const WalletLink = nativeAware(function WalletLink({ onLinked }: { onLinked?: () => void }) {
  const rewards = useRewards();
  const link = useWalletLink(onLinked);
  const [manual, setManual] = useState(false);
  const [draft, setDraft] = useState('');
  const linked = rewards.recipient;
  const info = linked ? readLinkInfo(linked) : null;
  const ready = rewards.status === 'ready';
  // Change mode belongs to the address it started from, so it ends by itself once a new wallet is linked.
  const [changeFrom, setChangeFrom] = useState('');
  const changing = Boolean(linked) && changeFrom === linked;
  const choosing = !linked || changing;

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
    {linked ? <Group footer="Your trees are sent to this wallet.">
      <Row title={info?.walletName ?? 'Your wallet'} detail={short(linked)} icon={icons.checkCircle} iconTint={color.moss} value={info ? METHOD_NAME[info.method] : undefined}
        trailingIcon={icons.copy} accessibilityLabel={`${info?.walletName ?? 'Your wallet'}, linked. Copy address`}
        onPress={() => { void Clipboard.setStringAsync(linked); void Haptics.selectionAsync(); }} />
      <Row title={changing ? 'Keep this wallet' : 'Change wallet'} disabled={!ready} onPress={() => { setChangeFrom(changing ? '' : linked); setManual(false); }} chevron={!changing} />
    </Group> : null}

    {choosing ? <>
      <Group title="Choose your wallet" footer="Focus Garden only reads your address.">
        {WALLET_APPS.map((app) => <Row key={app.id} title={app.name} detail={app.id === 'selene' ? 'Recommended' : undefined} image={LOGO[app.id]}
          disabled={!ready || (app.method === 'walletconnect' && !walletConnectAvailable)} onPress={() => void link.start(app.method, app)} chevron />)}
        <Row title="WalletConnect" detail="Other wallets" image={LOGO.walletconnect} disabled={!ready || !walletConnectAvailable} onPress={() => void link.start('walletconnect')} chevron />
        <Row title="WizardConnect" detail="Other wallets" image={LOGO.wizardconnect} disabled={!ready} onPress={() => void link.start('wizardconnect')} chevron />
      </Group>

      <Group>
        <Row title={manual ? 'Hide address entry' : 'Enter an address instead'} icon={icons.note} iconTint={color.ink2} onPress={() => setManual(!manual)} chevron={!manual} />
      </Group>

      {manual ? <>
        <Field label="Chipnet address" value={draft} onChangeText={setDraft} autoCorrect={false} autoCapitalize="none" placeholder="bchtest:" />
        <Button variant="secondary" label="Link this address" disabled={!draft.trim() || !ready} onPress={() => void saveManual()} />
      </> : null}
    </> : null}

    {link.error ? <Notice tone="error">{link.error}</Notice> : rewards.notice ? <Notice>{rewards.notice}</Notice> : null}
    {!ready ? <Text className="px-4 text-footnote text-ink-2">Opening your wallets…</Text> : null}
  </>;
});
