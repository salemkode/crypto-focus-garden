import { NativeTabs } from 'expo-router/native-tabs';
import colors from '../../theme.json';

/**
 Platform-native bottom navigation: UITabBarController on iOS (SF Symbols) and
 Material bottom navigation on Android (Material Symbols via expo-symbols).
 */
export default function GardenTabs() {
  return <NativeTabs
    tintColor={colors.grass}
    backgroundColor={colors.paper}
    iconColor={{ default: colors.muted, selected: colors.grass }}
    labelStyle={{ default: { color: colors.muted }, selected: { color: colors.ink } }}
    indicatorColor={colors.leaf}
    labelVisibilityMode="labeled"
    minimizeBehavior="onScrollDown"
  >
    <NativeTabs.Trigger name="index">
      <NativeTabs.Trigger.Icon sf={{ default: 'timer', selected: 'timer' }} md={{ default: 'timer', selected: 'timer' }} />
      <NativeTabs.Trigger.Label>Focus</NativeTabs.Trigger.Label>
    </NativeTabs.Trigger>
    <NativeTabs.Trigger name="leaders">
      <NativeTabs.Trigger.Icon sf={{ default: 'trophy', selected: 'trophy.fill' }} md={{ default: 'emoji_events', selected: 'emoji_events' }} />
      <NativeTabs.Trigger.Label>Leaders</NativeTabs.Trigger.Label>
    </NativeTabs.Trigger>
    <NativeTabs.Trigger name="stats">
      <NativeTabs.Trigger.Icon sf={{ default: 'chart.bar', selected: 'chart.bar.fill' }} md={{ default: 'bar_chart', selected: 'bar_chart' }} />
      <NativeTabs.Trigger.Label>Stats</NativeTabs.Trigger.Label>
    </NativeTabs.Trigger>
    <NativeTabs.Trigger name="profile">
      <NativeTabs.Trigger.Icon sf={{ default: 'person.crop.circle', selected: 'person.crop.circle.fill' }} md={{ default: 'account_circle', selected: 'account_circle' }} />
      <NativeTabs.Trigger.Label>Profile</NativeTabs.Trigger.Label>
    </NativeTabs.Trigger>
  </NativeTabs>;
}
