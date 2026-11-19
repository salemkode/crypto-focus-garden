/**
 * What a floating card says about anything you tap. Shared by the web prototype and the app,
 * so both use exactly the same words.
 */
import { levelInfo, minimumUnits, uniqueName } from '../ladder';
import type { Season } from '../season';
import type { SpeciesKey } from '../tiers';
import { villagersFor } from '../valley';
import type { Hit, ValleyScene } from './valley-scene';

export const STYLE_NAME: Record<SpeciesKey, string> = { oak: 'Meadow oak', pine: 'Ridge pine', birch: 'Silver birch', cherry: 'Blossom cherry', maple: 'Ember maple', cash: 'Cash tree' };
const SEASON_NAME: Record<Season, string> = { spring: 'Spring', summer: 'Summer', autumn: 'Autumn', winter: 'Winter' };

export interface CardText {
  eyebrow: string;
  name: string;
  facts: string[];
  /** A line that changes while you watch (what a villager is doing). */
  live?: () => string;
  /** Items take a personal note, stored under this key. */
  noteKey?: string;
}

export function describe(hit: Hit, scene: ValleyScene, details: { plantedDaysAgo?: (id: string) => number | null } = {}): CardText {
  if (hit.kind === 'item') {
    const e = hit.placed.entity, info = levelInfo(e.level);
    const hours = (minimumUnits(e.level) * 512) / 3600;
    const growing = scene.growing?.entity.id === e.id;
    const days = details.plantedDaysAgo?.(e.id);
    return {
      eyebrow: `Level ${e.level} · ${info.kind === 'tree' ? 'Tree' : info.kind === 'legend' ? 'Legend' : 'Building'}`,
      name: uniqueName(e.level, e.style, e.seed),
      facts: [
        `${STYLE_NAME[e.style]} · ${hours < 1 ? Math.round(hours * 60) + ' min' : hours.toFixed(1) + ' h'} of focus${villagersFor(e.level) ? ` · ${villagersFor(e.level)} villagers` : ''}`,
        growing ? 'Growing now' : days === null || days === undefined ? 'In your valley' : `Planted ${days === 0 ? 'today' : days === 1 ? 'yesterday' : `${days} days ago`}`,
      ],
      noteKey: `valley.note.${e.id}`,
    };
  }
  if (hit.kind === 'villager') {
    const v = hit.villager;
    const doing = () => (v.task === 'chop' ? 'gathering wood' : v.task === 'walk' ? (v.carrying ? 'carrying logs home' : 'out for a walk') : 'resting at home');
    return { eyebrow: 'Villager', name: v.name, facts: [`Lives in the ${uniqueName(v.home.entity.level, v.home.entity.style, v.home.entity.seed)}`], live: doing };
  }
  if (hit.kind === 'hen') return { eyebrow: 'Hen', name: 'Pecking around', facts: [`Lives by the ${uniqueName(hit.hen.home.entity.level, hit.hen.home.entity.style, hit.hen.home.entity.seed)}`] };
  if (hit.kind === 'waterfall') return hit.river
    ? { eyebrow: 'Waterfall', name: 'Where the river falls', facts: ['Your river runs off the edge of the island here.'] }
    : { eyebrow: 'Waterfall', name: 'A cliff spring', facts: ['More springs appear as your valley grows.'] };
  if (hit.kind === 'islet') return { eyebrow: 'Floating islet', name: 'A little neighbour', facts: ['Islets gather around your valley as it grows.'] };
  if (hit.kind === 'balloon') return { eyebrow: 'Hot-air balloon', name: 'Drifting by', facts: ['Visitors floating over your valley.'] };
  if (hit.kind === 'cloud') return { eyebrow: 'Cloud', name: 'Passing over', facts: [`${SEASON_NAME[scene.season]} weather.`] };
  const where = { river: 'The river', riverbank: 'Riverbank', hills: 'Hills', 'valley floor': 'Valley floor' }[hit.where];
  return { eyebrow: 'Land', name: where, facts: [`${SEASON_NAME[scene.season]} · ${Math.round(scene.radius * 2)} blocks across · ${scene.placed.length} items`] };
}
