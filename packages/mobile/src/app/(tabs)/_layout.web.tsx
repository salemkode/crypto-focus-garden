import { Pressable, Text, View } from 'react-native';
import { TabList, Tabs, TabSlot, TabTrigger, type TabTriggerSlotProps } from 'expo-router/ui';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Icon, type IconName } from '../../ui';
import colors from '../../theme.json';

/**
 * Web: NativeTabs has no bottom bar on the web (it floats a bar over the top of every screen, on
 * the screen titles). The web gets the same bottom navigation as Android instead: icon over label,
 * with a pill behind the selected icon, built on Expo Router's headless tabs.
 */
const TABS: { name: string; href: '/' | '/leaders' | '/stats' | '/profile'; label: string; icon: IconName }[] = [
  { name: 'index', href: '/', label: 'Focus', icon: { ios: 'timer', md: 'timer' } },
  { name: 'leaders', href: '/leaders', label: 'Leaders', icon: { ios: 'trophy', md: 'emoji_events' } },
  { name: 'stats', href: '/stats', label: 'Stats', icon: { ios: 'chart.bar', md: 'bar_chart' } },
  { name: 'profile', href: '/profile', label: 'Profile', icon: { ios: 'person.crop.circle', md: 'account_circle' } },
];

function TabButton({ isFocused, label, icon, ref, ...props }: TabTriggerSlotProps & { label: string; icon: IconName }) {
  // The trigger's ref is typed for Expo Router's own View; it is the same host view at runtime.
  return <Pressable ref={ref as never} {...props} accessibilityRole="tab" accessibilityState={{ selected: Boolean(isFocused) }}
    className="min-h-14 flex-1 py-2">
    {/* The trigger's own style lays its children in a row; the column lives in this inner view. */}
    <View className="flex-1 flex-col items-center justify-center gap-1">
      <View style={{ backgroundColor: isFocused ? colors.leaf : 'transparent' }} className="h-8 w-14 items-center justify-center rounded-full">
        <Icon name={icon} size={22} tint={isFocused ? colors.grass : colors.muted} />
      </View>
      <Text style={{ color: isFocused ? colors.ink : colors.muted }} className={`text-caption ${isFocused ? 'font-semibold' : ''}`}>{label}</Text>
    </View>
  </Pressable>;
}

export default function GardenTabs() {
  const insets = useSafeAreaInsets();
  return <Tabs className="flex-1">
    <TabSlot />
    <TabList accessibilityRole="tablist" style={{ backgroundColor: colors.paper, paddingBottom: insets.bottom }} className="flex-row">
      {TABS.map((tab) => <TabTrigger key={tab.name} name={tab.name} href={tab.href} asChild>
        <TabButton label={tab.label} icon={tab.icon} />
      </TabTrigger>)}
    </TabList>
  </Tabs>;
}
