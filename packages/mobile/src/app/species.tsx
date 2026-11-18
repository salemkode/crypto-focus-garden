import { router } from 'expo-router';
import { Pressable, ScrollView, Text, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { ItemView } from '../components/ItemView';
import { SPECIES } from '../features/focus/catalog';
import { useFocusGarden } from '../features/focus/FocusProvider';
import { color, Icon, icons, Notice, Stage } from '../ui';

/** Every tree style is free. Tapping one makes it the style your next tree grows in. */
export default function SpeciesScreen() {
  const { garden, configure } = useFocusGarden();
  const locked = garden.timer.status === 'growing';
  return <ScrollView className="flex-1 bg-canvas" contentInsetAdjustmentBehavior="automatic" contentContainerClassName="gap-4 px-4 pb-12 pt-4">
    {locked ? <Notice tone="warning">You can change the style after this tree finishes.</Notice> : null}
    <Text className="px-1 text-subhead text-ink-2">Pick the style your next tree grows in. All are free.</Text>
    <View accessibilityRole="radiogroup" className="flex-row flex-wrap justify-between gap-y-5">{SPECIES.map((species) => {
      const chosen = garden.species === species.id;
      return <Pressable key={species.id} accessibilityRole="radio" accessibilityLabel={`${species.name}. ${species.blurb}`} accessibilityState={{ checked: chosen, disabled: locked }} disabled={locked}
        onPress={() => { configure({ species: species.id }); void Haptics.selectionAsync(); router.back(); }}
        className={`w-[48%] gap-2 rounded-[24px] p-1.5 active:opacity-70 disabled:opacity-50 ${chosen ? 'bg-moss-soft' : ''}`}>
        <Stage style={{ height: 160, borderWidth: chosen ? 3 : 0, borderColor: color.moss }}>
          <ItemView tier="tree" species={species.id} seed={2} size={104} />
          {chosen ? <View className="absolute left-2 top-2 flex-row items-center gap-1 rounded-full bg-moss py-1 pl-1.5 pr-2.5">
            <Icon name={icons.check} size={12} tint={color.surface} weight="bold" />
            <Text className="text-footnote font-semibold text-surface">Selected</Text>
          </View> : null}
        </Stage>
        <View className="gap-0.5 px-1 pb-1">
          <Text className={chosen ? 'text-headline text-moss' : 'text-headline text-ink'}>{species.name}</Text>
          <Text numberOfLines={2} className="text-footnote text-ink-2">{species.blurb}</Text>
        </View>
      </Pressable>;
    })}</View>
  </ScrollView>;
}
