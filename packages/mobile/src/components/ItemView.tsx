import { memo } from 'react';
import { Image, View } from 'react-native';
import type { SpeciesId } from '../features/focus/catalog';
import { useItemImage } from './ModelSnapshots';
import { TreeSprite } from './TreeSprite';

export type TierKey = 'sprout' | 'tree' | 'bigTree' | 'house';

/** Per-NFT variety for icons: up to 12 variants per item kind keeps renders fast and cached. */
const ICON_VARIANTS = 12;

/**
 * One place that draws every reward item (sprout, tree, big tree, house) as a 3D render.
 * A flat sprite holds the space for the first moment while the 3D render is prepared.
 */
export const ItemView = memo(function ItemView({ tier, species, seed = 1, size = 64, withered = false, progress }: {
  tier: TierKey; species: SpeciesId; seed?: number; size?: number; withered?: boolean; progress?: number;
}) {
  const uri = useItemImage({ tier, species, seed: (seed % ICON_VARIANTS) + 1, withered, progress });
  const height = size * 1.25;
  if (uri) return <Image source={{ uri }} style={{ width: size, height }} resizeMode="contain" accessibilityIgnoresInvertColors />;
  const stage = progress !== undefined ? Math.min(4, Math.floor(progress * 5)) : tier === 'sprout' ? 1 : tier === 'tree' ? 3 : 4;
  return <View style={{ width: size, height, alignItems: 'center', justifyContent: 'flex-end', opacity: 0.35 }}>
    <TreeSprite species={species} stage={stage} withered={withered} seed={seed} size={tier === 'sprout' ? size * 0.7 : size * 0.85} />
  </View>;
});
