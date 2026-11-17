import { router } from 'expo-router';
import { Pressable, ScrollView, Text, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { ItemView } from '../components/ItemView';
import { SPECIES } from '../features/focus/catalog';
import { useFocusGarden } from '../features/focus/FocusProvider';
import { color, Icon, icons, Notice, Stage } from '../ui';

/** Every tree style is free. Pick one here, or swipe the tree on the Focus screen. */
export default function SpeciesScreen() {
  const { garden, configure } = useFocusGarden();
  const locked = garden.timer.status === 'growing';
  return <ScrollView className="flex-1 bg-canvas" contentInsetAdjustmentBehavior="automatic" contentContainerClassName="gap-4 px-4 pb-12 pt-4">
    {locked ? <Notice tone="warning">You can change the style after the current tree finishes.</Notice> : null}
    <View className="flex-row flex-wrap justify-between gap-y-5">{SPECIES.map((species) => {
      const chosen = garden.species === species.id;
      return <Pressable key={species.id} accessibilityRole="radio" accessibilityLabel={`${species.name}. ${species.blurb}`} accessibilityState={{ checked: chosen, disabled: locked }} disabled={locked}
        onPress={() => { configure({ species: species.id }); void Haptics.selectionAsync(); router.back(); }}
        className="w-[48%] gap-2 active:opacity-70 disabled:opacity-50">
        <Stage style={{ height: 168, borderWidth: chosen ? 3 : 0, borderColor: color.moss }}><ItemView tier="tree" species={species.id} seed={2} size={108} /></Stage>
        <View className="gap-0.5 px-1">
          <View className="flex-row items-center gap-1.5">
            <Text className="flex-1 text-headline text-ink">{species.name}</Text>
            {chosen ? <Icon name={icons.checkCircle} size={18} tint={color.moss} /> : null}
          </View>
          <Text numberOfLines={2} className="text-footnote text-ink-2">{species.blurb}</Text>
        </View>
      </Pressable>;
    })}</View>
  </ScrollView>;
}
