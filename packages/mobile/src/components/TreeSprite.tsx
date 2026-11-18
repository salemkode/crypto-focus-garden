import { memo, useMemo } from 'react';
import Svg, { Rect } from 'react-native-svg';
import type { SpeciesId } from '../features/focus/catalog';
import { ART_HEIGHT, ART_WIDTH, speciesStyle, styledTreeArt, type TreeStyle } from '../features/focus/tree-art';

/** Draws a pixel tree from a species (local focus trees) or a full style (NFT trees). */
export const TreeSprite = memo(function TreeSprite({ species, style, stage = 4, withered = false, seed = 1, size = 64 }: {
  species?: SpeciesId; style?: TreeStyle; stage?: number; withered?: boolean; seed?: number; size?: number;
}) {
  const runs = useMemo(() => styledTreeArt(style ?? speciesStyle(species ?? 'oak'), stage, withered, seed), [species, style, stage, withered, seed]);
  return <Svg width={size} height={(size * ART_HEIGHT) / ART_WIDTH} viewBox={`0 0 ${ART_WIDTH} ${ART_HEIGHT}`}>
    {runs.map((run) => <Rect key={`${run.x}-${run.y}`} x={run.x} y={run.y} width={run.w} height={1.02} fill={run.color} />)}
  </Svg>;
});
