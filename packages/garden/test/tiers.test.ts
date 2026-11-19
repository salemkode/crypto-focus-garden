import { describe, expect, test } from "bun:test";
import { buildTierModel, buildGrowthModel, buildWitheredModel, buildPedestal, TIER_HEIGHT } from "../src/tiers";
import type { VoxelModel } from "../src/voxel";
const species = ["oak","cherry","pine","maple","birch","cash"] as const;
const tiers = ["sprout","tree","bigTree","house"] as const;
const budgets = {sprout:150,tree:900,bigTree:3500,house:6000};
const seeds = [0,1,42,1337,-17,0x7fffffff];
function signature(m: VoxelModel) {
 const g=m.toGeometry(0);
 const result=JSON.stringify([g.getAttribute("position").array,g.getAttribute("color").array,g.getIndex()!.array]);
 g.dispose(); return result;
}
function bounds(m: VoxelModel) {
 const g=m.toGeometry(0); g.computeBoundingBox(); const box=g.boundingBox!.clone(); g.dispose(); return box;
}
describe("reward library",()=>{
 for (const tier of tiers) for (const s of species) {
  test(`${tier}/${s}: deterministic, grounded, centred, within budget`,()=>{
   for (const seed of seeds) {
    const m=buildTierModel(tier,s,seed);
    expect(m.size).toBeGreaterThan(0); expect(m.size).toBeLessThan(budgets[tier]);
    expect(signature(m)).toBe(signature(buildTierModel(tier,s,seed)));
    const b=bounds(m);
    expect(b.min.y).toBe(-.5);
    expect(Math.abs(b.min.x+b.max.x)).toBeLessThanOrEqual(3);
    expect(Math.abs(b.min.z+b.max.z)).toBeLessThanOrEqual(3);
    expect(b.max.y).toBeLessThanOrEqual(TIER_HEIGHT[tier]+1);
   }
  });
  test(`${tier}/${s}: growth is monotone, distinct, deterministic and exact at completion`,()=>{
   for (const seed of [0,42,-17]) {
    const sizes=Array.from({length:101},(_,i)=>buildGrowthModel(s,i/100,seed,tier).size);
    sizes.forEach((n,i)=>expect(n).toBeGreaterThanOrEqual(i ? sizes[i-1] : 0));
    expect(new Set(sizes).size).toBeGreaterThanOrEqual(6);
    expect(signature(buildGrowthModel(s,.5,seed,tier))).toBe(signature(buildGrowthModel(s,.5,seed,tier)));
    expect(signature(buildGrowthModel(s,1,seed,tier))).toBe(signature(buildTierModel(tier,s,seed)));
    expect(signature(buildGrowthModel(s,2,seed,tier))).toBe(signature(buildTierModel(tier,s,seed)));
    expect(signature(buildGrowthModel(s,-1,seed,tier))).toBe(signature(buildGrowthModel(s,NaN,seed,tier)));
   }
  });
 }
 test("seeds provide visible variation",()=>{
  for (const tier of tiers) for (const s of species) {
   expect(new Set(seeds.map(seed=>signature(buildTierModel(tier,s,seed)))).size).toBeGreaterThan(1);
  }
 });
 test("withered trees remain small and grounded",()=>{
  for (const s of species) {
   const m=buildWitheredModel(s,42); expect(m.size).toBeLessThan(150); expect(bounds(m).min.y).toBe(-.5);
   expect(signature(m)).toBe(signature(buildWitheredModel(s,42)));
  }
 });
 test("podium ranks descend and have distinct appearances",()=>{
  const models=([1,2,3] as const).map(buildPedestal);
  expect(models[0].size).toBeGreaterThan(models[1].size);
  expect(models[1].size).toBeGreaterThan(models[2].size);
  models.forEach(m=>expect(bounds(m).min.y).toBe(-.5));
  expect(new Set(models.map(signature)).size).toBe(3);
 });
});
