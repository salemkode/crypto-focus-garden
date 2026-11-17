import { useEffect, useMemo, useState } from 'react';
import { router } from 'expo-router';
import { ActivityIndicator, FlatList, Image, Platform, Pressable, Switch, Text, TextInput, View } from 'react-native';
import { FocusShield, SHIELD_ROW_HEIGHT, ShieldSelectionList, type LaunchableApp } from 'focus-shield';
import { useFocusGarden } from '../features/focus/FocusProvider';
import { useShield } from '../features/shield/useShield';
import { Button, color, continuous, Group, Icon, icons, Notice, Row, Screen, SwitchRow } from '../ui';

export default function BlockedAppsScreen() {
  return Platform.OS === 'ios' ? <ScreenTimeBlocking /> : <AndroidBlockList />;
}

/**
 * iOS: everything about blocking in one place. Apple's Screen Time picks and shields the apps;
 * the chosen apps are drawn by iOS from opaque tokens, so Focus Garden never learns what they are.
 */
function ScreenTimeBlocking() {
  const { garden, configure } = useFocusGarden();
  const growing = garden.timer.status === 'growing';
  const shield = useShield();
  const status = shield.status;
  if (!status) return <View className="flex-1 items-center justify-center bg-canvas"><ActivityIndicator color={color.moss} /></View>;
  const count = status.selectionCount;
  return <Screen contentClassName="pt-4">
    {!status.supported ? <Notice tone="warning">{status.pendingApproval
      ? 'This copy of Focus Garden was built without Screen Time. Install a build with app blocking to use it.'
      : 'App blocking needs an iPhone with iOS 16.4 or later.'}</Notice> : null}
    {shield.error ? <Notice tone="error">{shield.error}</Notice> : null}
    {growing ? <Notice>You can change blocking after the current tree finishes.</Notice> : null}

    <Group footer="While a tree grows, the apps you choose open to Apple's Screen Time shield instead. Blocking ends on its own when the tree finishes, even if Focus Garden is closed.">
      <SwitchRow title="Block apps while a tree grows" icon={icons.shield} iconTint={color.ember}
        value={garden.blockApps} disabled={growing || !status.supported}
        onValueChange={async (next) => { if (next && !shield.ready) await shield.continueSetup(); configure({ blockApps: next }); }} />
    </Group>

    {status.supported && !status.authorized ? <Group title="Screen Time" footer="Apple asks once. Focus Garden can't see which apps you use or which ones you choose.">
      <Row title="Allow Screen Time access" detail="Needed to block apps" icon={icons.hourglass} iconTint={color.moss} onPress={shield.continueSetup} chevron />
    </Group> : null}

    {status.supported && status.authorized ? <Group title={count ? `Blocked during focus · ${count}` : 'Blocked during focus'}
      footer={count ? 'Pick whole categories (like Social) to cover new apps too.' : 'Choose the apps, categories or websites that pull you away.'}>
      {count && ShieldSelectionList ? <View style={{ height: count * SHIELD_ROW_HEIGHT }}>
        <ShieldSelectionList revision={shield.revision} style={{ flex: 1 }} />
      </View> : null}
      <Row title={count ? 'Edit blocked apps' : 'Choose apps to block'} icon={icons.apps} iconTint={color.ember} disabled={growing} onPress={shield.chooseApps} chevron />
    </Group> : null}
  </Screen>;
}

/** Android block list. iOS uses Apple's private picker instead and never lists apps. */
function AndroidBlockList() {
  const [apps, setApps] = useState<LaunchableApp[] | null>(null);
  const [chosen, setChosen] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState('');
  useEffect(() => {
    Promise.all([FocusShield.listApps(), FocusShield.getBlockedPackages()])
      .then(([list, blocked]) => { setApps(list); setChosen(new Set(blocked)); })
      .catch(() => setApps([]));
  }, []);
  const visible = useMemo(() => (apps ?? []).filter((app) => app.label.toLowerCase().includes(query.trim().toLowerCase())), [apps, query]);
  function toggle(packageName: string) {
    setChosen((current) => {
      const next = new Set(current);
      if (next.has(packageName)) next.delete(packageName); else next.add(packageName);
      return next;
    });
  }
  async function save() {
    await FocusShield.setBlockedPackages([...chosen]);
    router.back();
  }
  if (!apps) return <View className="flex-1 items-center justify-center bg-canvas"><ActivityIndicator color={color.moss} /></View>;
  return <View className="flex-1 bg-canvas">
    <View className="px-4 pb-2 pt-4">
      <View style={continuous} className="min-h-11 flex-row items-center gap-2 rounded-xl bg-sunk px-3">
        <Icon name={icons.search} size={16} tint={color.ink3} />
        <TextInput accessibilityLabel="Search apps" value={query} onChangeText={setQuery} placeholder="Search apps" placeholderTextColor={color.ink3} className="min-h-11 flex-1 text-body text-ink" />
      </View>
    </View>
    <FlatList
      data={visible}
      keyExtractor={(app) => app.packageName}
      contentContainerClassName="mx-4 my-2 overflow-hidden rounded-[20px] bg-surface"
      ItemSeparatorComponent={() => <View className="ml-[60px] h-px bg-divider" />}
      renderItem={({ item }) => <Pressable accessibilityRole="switch" accessibilityState={{ checked: chosen.has(item.packageName) }} onPress={() => toggle(item.packageName)} className="min-h-14 flex-row items-center gap-3 px-4 py-2 active:bg-sunk">
        {item.icon ? <Image source={{ uri: item.icon }} style={{ width: 32, height: 32, borderRadius: 8 }} /> : <View className="h-8 w-8 rounded-lg bg-sunk" />}
        <Text numberOfLines={1} className="flex-1 text-body text-ink">{item.label}</Text>
        <Switch value={chosen.has(item.packageName)} onValueChange={() => toggle(item.packageName)} trackColor={{ true: color.moss, false: color.divider }} />
      </Pressable>}
      ListEmptyComponent={<Text className="py-10 text-center text-body text-ink-2">No apps match.</Text>}
    />
    <View className="bg-canvas px-4 pb-6 pt-3">
      <Button label={`Block ${chosen.size} ${chosen.size === 1 ? 'app' : 'apps'}`} onPress={save} />
    </View>
  </View>;
}
