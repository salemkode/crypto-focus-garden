import { memo, useMemo } from 'react';
import Svg, { Path } from 'react-native-svg';
import type { SpeciesId } from '../features/focus/catalog';
import { ART_HEIGHT, ART_WIDTH, speciesStyle, styledTreeArt, type TreeStyle } from '../features/focus/tree-art';

/** Draws a pixel tree from a species (local focus trees) or a full style (NFT trees). */
export const TreeSprite = memo(function TreeSprite({ species, style, stage = 4, withered = false, seed = 1, size = 64 }: {
  species?: SpeciesId; style?: TreeStyle; stage?: number; withered?: boolean; seed?: number; size?: number;
}) {
  // One path per colour (about 10 native shapes per tree) instead of one rect per run (about 50).
  const paths = useMemo(() => {
    const byColor = new Map<string, string>();
    for (const run of styledTreeArt(style ?? speciesStyle(species ?? 'oak'), stage, withered, seed)) {
      byColor.set(run.color, `${byColor.get(run.color) ?? ''}M${run.x} ${run.y}h${run.w}v1.02h${-run.w}z`);
    }
    return [...byColor];
  }, [species, style, stage, withered, seed]);
  return <Svg width={size} height={(size * ART_HEIGHT) / ART_WIDTH} viewBox={`0 0 ${ART_WIDTH} ${ART_HEIGHT}`}>
    {paths.map(([color, d]) => <Path key={color} d={d} fill={color} />)}
  </Svg>;
});
