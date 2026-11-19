# Your Valley: design plan (16 November 2026)

The Forest tab becomes **Your Valley**: a voxel world you build by focusing. It should be clear to read at a glance, easy to touch, and visibly reward every session. It must hold up if someone uses the app every day for years.

The style is blocky voxels with our own palette, lighting and models. It is not a copy of any game's art.

## 1. The core loop

**Every focus session places something real in your valley.**

- A verified session grows a tree NFT, which is sent to your wallet and planted in the valley.
- The valley **expands** with your total verified focus time. It never shrinks.
- Giving up does not delete anything. A withered stump appears for a day and then turns into fallen leaves, an honest but gentle signal.

## 2. Growth across a lifetime

| Total verified focus | Land | What appears |
|---|---|---|
| 0–2 h | **Seed plot** (6×6 blocks) | First trees, a path, a stone |
| 2–10 h | **Grove** (10×10) | A pond, flowers spreading near trees |
| 10–50 h | **Meadow** (16×16) | A stream crossing the land, a bridge, birds |
| 50–200 h | **Valley** (24×24) | Hills, a second biome matching your favourite style (cherry blossom, autumn ridge, pine highland), deer |
| 200–1,000 h | **Highlands** (32×32) | A snowy peak, a waterfall, a windmill |
| 1,000–5,000 h | **Realm** | Neighbouring valleys appear on a world map. Each year becomes its own valley (*chapter*). |
| 5,000 h+ | **Legend** | Landmarks such as a lighthouse, an observatory or a temple, earned once and named after the year you reached them |

**Houses become a village.** Each House NFT is a house in the valley. Two or more houses form a village square, five add a market, and ten add a town hall. Villagers walk between houses.

**Streaks bring life:**
- a 3-day streak brings birds;
- 7 days, butterflies;
- 30 days, deer;
- 100 days, a fox family.

A broken streak only sends the animals away; the land stays. This gives a soft reason to come back, without punishment.

**Tags become districts.** Study, Work, Reading and Create each tint their own corner of the valley, so you can see where your life went.

**Time feels real:**
- local day and night;
- real-world seasons: snow in winter, blossoms in spring;
- rain on rainy days, if the user allows weather.

**Memory:**
- *Valley time-lapse* replays your year of growth in about 20 seconds, as a shareable image or video.
- Tapping any tree shows the day, minutes and tag it came from, and that it is an NFT in your wallet.

## 3. Clear to view, easy to touch

- **Isometric camera** with a fixed, readable angle. Swipe to rotate in 90° steps (snapping, never disorienting), pinch for three zoom levels (plot, valley, world), and tap a block to inspect it.
- **Growing now:** the plot where your current session will land glows softly, and a sapling grows there live during focus.
- **Arrange:** long-press a tree and drag it to another tile. The layout is saved on the phone; ownership stays on chain.
- **No clutter:** the counter and title sit over the valley, and the shelves (houses, big trees, trees, sprouts) stay below as the collection view.

### Rendering approach (works around the iOS on-screen GL issue)

- The valley is rendered **offscreen** into images, the same proven path as the 3D icons and turntables: 4 rotation angles × 3 zoom levels, refreshed only when the valley changes.
- Tap targets are computed by projecting each block to the screen for the current angle and zoom, so a tap maps to exactly one tree.
- Live 3D runs only where needed, such as the growing sapling during focus.
- This keeps scrolling smooth and battery use low, even with thousands of blocks. It needs one merged mesh per valley state, built in the garden package.

## 4. Focus sounds

Optional background sound during a session, picked in the session sheet:
- Rain
- Forest birds
- Stream
- Campfire
- Wind
- Quiet café

The rules:
- **Real recordings** under licences that allow commercial use in an app (CC0 or equivalent), with each source and licence recorded. No generated audio (user decision, 16 November 2026).
- Seamless loops with a short fade in and out, plus a volume control.
- Sound keeps playing while the screen is locked only if the user's focus rule allows leaving the app.
- Needs `expo-audio` (native), so it ships with the next build.

## 5. Delivery phases

1. **Next build:**
   - WalletConnect;
   - focus sounds;
   - the Android R8 fix;
   - a signed simulator build (keychain);
   - dependency updates.
2. **Valley v1:** seed plot to meadow, real NFT tiers on tiles, isometric snapping camera, tap to inspect, the growing plot, streak animals, day and night.
3. **Valley v2:** the 50–1,000 h tiers (biomes, village, landmarks), arranging trees, seasons, time-lapse.
4. **Realm:** the world map, yearly chapters and legend landmarks.

The voxel models for the valley tiles, biomes, village and animals extend `packages/garden`, building on the existing tier models.

## 6. The ladder: 10 levels, merging, unique NFTs (user direction, 16 November 2026)

- **Sessions are capped at one hour** (7 lock units × 512 s = 59.7 min). A single session grows only levels 1–3. Everything bigger is merged.
- **Levels:**
  1. Seedling
  2. Sapling
  3. Grand tree
  4. Grove
  5. Cabin (the trees become timber)
  6. Cottage
  7. Mill
  8. Manor
  9. Castle
  10. Elder Tree (legendary, a village in a giant tree)
- **Merge counts:** 3 of a level make the next for levels 1→2, 2→3 and 3→4. From level 4 up, 2 make the next. A level 10 holds at least about 137 hours of focus.
- **Unique NFTs:** a merged NFT's seed is the hash of its ingredients (its lineage). That seed sets its colour accents, details (flags, gardens, lanterns, sail angle, towers) and a generated name such as "Ember Mill of Dawnhollow". The style (species) carries over from the ingredients.
- **Score:** each NFT keeps the sum of its ingredients' focus units, so merging never changes a leaderboard score.
- **Code:** `packages/garden/src/ladder.ts` (models, rules, names), tested in `packages/garden/test/ladder.test.ts`.
- **Prototypes:** `packages/garden/prototype/ladder.html` and `packages/garden/prototype/valley.html` (generated, not committed: run `bun packages/garden/prototype/build.ts` and `bun packages/garden/prototype/build-ladder.ts`).
- **Contract impact (next):** a v6 commitment with level 1–10, style, unit sum and lineage stamp. Plant caps at 7 units and levels 1–3. Merge burns N items of one level into one of the next. Because NFTs now live in the user's wallet, the user's wallet signs merges (WalletConnect) and the app's helper wallet pays the fee.

## 7. A real valley, computed from numbers, with life (user direction, 16 November 2026)

- **Deterministic world:** `packages/garden/src/valley.ts`.
  - **Valley seed:** comes from the owner, for example a hash of the wallet address.
  - **Input:** the items in chain order.
  - **Same input, same valley:** for anyone, every time.
  - **Stable placement:** item *i* depends only on the seed and items 0..*i*−1, so a new NFT never moves an old one.
- **Terrain:** a wobbly round floating island that grows with the square root of the item count. It has a gentle valley floor, hills toward the rim, a seeded meandering river with sandy banks that ends in a **waterfall off the rim**, and rock strata tapering beneath.
- **Placement:** each item draws candidates from its own seeded sequence. It never overlaps another item and never sits in the river, and it needs flat enough ground. Buildings prefer low ground near the water; trees take the hills. Pads are levelled under every item.
- **Villagers** move in with buildings: Cabin 1, Cottage 2, Mill 2, Manor 3, Castle 4, Elder Tree 5. They walk, chop at nearby trees and carry logs home, fish at the river, and rest.
- **Ambient life:** chickens peck around cottages, mills and manors. A spider rides its thread under the biggest tree. Birds circle and butterflies dance.
- The life layer is personal and local. It is not on chain, not encrypted and not identical between viewers; it exists only to make your valley feel alive.
- **Camera:** the island turns slowly when idle, can be rotated and zoomed freely, and follows the growing item during a session.
- **Tests:** `packages/garden/test/valley.test.ts` covers determinism, stability, no overlap or river, the waterfall at the rim, and villager counts.

## 8. Seasons, a legend that changes the sky, and the merge ceremony (16 November 2026)

- **Seasons** (`packages/garden/src/season.ts`, tested):
  - the season follows the real calendar, opposite in the southern hemisphere;
  - every model and the terrain are recoloured with no new art: winter snow on upward faces and a frozen river, spring blossoms and fresher greens, autumn amber and red canopies with straw grass (evergreens stay green);
  - seasonal weather falls through the air: snow, leaves, petals, or summer pollen.
- **Level 10 is the Sky Citadel, not a tree:** a white-stone citadel with gold spires floating on its own rock above a rune plaza, joined by a beam of light. It feels bigger by changing the world: a rainbow, a ring of orbiting islets with trees, and a lavender sky.
- **Levels that change the island:** a Manor lays stone roads between your buildings, and a Castle builds bridges where they cross the river.
- **Merge ceremony** (about 3.4 s): the ingredients rise and spin, spiral together, then a flash, a slight camera shake and a burst of blocks in the style's colours. The new item drops in with a bounce on its first ingredient's spot, and a card reveals its level, unique name and the villagers who move in. Merging is also how a busy valley gets calmer: three trees become one grove and the freed land opens up.
- **History replay** (`replayValley`): the valley is computed from plant and merge events in chain order. A merge never moves another item; it is tested.

## 9. Performance, free movement and item cards (16 November 2026)

- **Measured problem:** the terrain was rebuilt as every single block on every change. At 120 items that took 230 ms on an M4 Pro and produced 545,000 vertices; on a low-end phone it would be several seconds.
- **Fixes:**
  - `valleyTerrain` meshes height columns directly: greedy-merged tops and bottoms, cliff sides only where exposed (split into strata bands), a 2×2-block underside, and faces wound automatically. At 120 items it builds in 44 ms with 224,000 vertices (5× faster, 2.4× fewer vertices).
  - The terrain rebuilds only when the land changes, never on growth steps. A merge rebuilds it under the flash.
  - Items are instanced per model variant, and villagers and chickens per body part (about 9 draw calls for the whole crowd).
  - Shadows update only when the scene changes.
  - Low-power devices get a pixel ratio of 1.5, a 1024 shadow map, about 45 % of the weather particles, half the waterfall drops and no antialiasing.
  - An on-screen counter shows fps and the worst frame time.
- **Look, after the user's reference:** banded cliffs (grass, soil, orange clay, tan, stone) with vines hanging over the rim, several waterfalls (the river plus seeded cliff springs), floating islets that multiply as the valley grows, and drifting hot-air balloons and clouds.
- **Free movement:** map-style controls. Drag to travel anywhere, pinch or scroll to zoom toward a point down to ground level, two fingers to turn and tilt, double-tap to fly to a spot. The island auto-turns only after 9 s idle.
- **Tap anything:** an item opens a card with its level, unique name, style, focus time, villagers, when it was planted, that it is in your wallet, and your own note (saved on the device). A villager card shows their name, home and what they are doing.

## 10. The merge planner: many merges, one renewal (user idea, 16 November 2026)

- **When:** if more than one merge is possible, the Merge button opens a planner instead of starting a ceremony.
- **The planner:** it lists each level's merge ("3 seedlings → sapling · 9 possible") with − / +, an "Everything" shortcut, and "Keep merging upward" (cascade: new results feed the next level). It previews what you end up with.
- **One renewal instead of many ceremonies:**
  - every chosen ingredient dissolves into sparkles at once;
  - a ring of light sweeps across the island;
  - the valley is regenerated exactly once, under the wave;
  - each new item pops up (with a little overshoot) as the wave reaches it;
  - a summary card says what you made and how many villagers moved in.

  However many merges, it costs one rebuild.
- **A single merge** keeps the full ceremony (the "wow" moment).
- **Planning:** `packages/garden/src/merge-plan.ts`, tested. Ingredients are the nearest same-level neighbours, each is used once, nothing else moves, and cascade works (9 seedlings → 3 saplings → 1 grand tree).

## 11. Floating cards for everything (16 November 2026)

- **Tap anything** and a card floats above it: items, villagers, hens, waterfalls, islets, balloons, clouds and the land itself (river, riverbank, hills, valley floor). The nearest thing under the finger wins.
- **The card is attached to its object in 3D** and re-projected every frame: it follows a walking villager or a drifting balloon, flips below the object near the top of the screen, and hides when the object is behind the camera.
- **Animation:** it springs out of the object (scale from 35 % with overshoot, a pointer stem popping in after), then bobs gently while open, and shrinks back on close. With reduced motion it simply fades.
- **Content:**
  - Items: level, kind, unique name, style, focus time, villagers, when planted, "in your wallet", and your own note.
  - Villagers: name, home and what they are doing now.
  - Waterfalls, islets, balloons, clouds and land: what each is and how it relates to your valley's growth.
