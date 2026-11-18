# Focus Garden design system

16 November 2026. Replaces the first UI pass (cream cards, caps labels, paragraph-heavy screens),
which the user rejected as generic. The native bottom tab bar is the one part the user likes; it is
kept as it is (`src/app/(tabs)/_layout.tsx` and its colors in `src/theme.json` are frozen). The Forest tab was removed at the user's request (16 November 2026); its last version is kept in `artifacts/ui-redesign-2026-11-16/forest-tab-removed.tgz`.

## Design read

Native phone app for people who focus daily. The world you grow is the content; everything else is
quiet native chrome around it. Calm, tactile, honest. Built on Apple's Human Interface Guidelines
(and Material conventions on Android), not on a web aesthetic.

Why this direction: the tab bar the user likes is the only fully native part of the app. The rest
should feel like it belongs next to it. Apple's guidance is the same: glass and chrome belong to the
control layer floating above content; content (the valley, trees, stats) stays clear and vivid.

Rejected directions:
- Chunky "toy block" game UI (thick 3D buttons, block cards). Fights the native glass tab bar and
  ages badly for a daily tool.
- Dark "timepiece" (near-black with one glowing accent). One of the three looks AI-made design
  clusters around, and it hides the colorful valley.

## Principles

1. **The world is the content.** Trees, houses and the valley carry the color. UI surfaces stay
   neutral so the 3D art pops.
2. **One job per screen, one primary button per screen.** Everything else is a row, a chip or text.
3. **Say it once, in few words.** No eyebrow labels, no explanatory paragraphs above controls. At
   most one short footnote under a group. Technical detail (transactions, commitments) lives behind
   a "Details" row.
4. **Native first.** System font, native headers and sheets, grouped lists, system switches,
   SF Symbols / Material Symbols. Never hand-drawn glyphs or text characters as icons.
5. **Color has meaning.** Moss = act. Sun = earned. Ember = loss or danger. Nothing is colored for
   decoration.

## Signature: the growth arc

The glowing arc around the tree in the app icon is the single progress element across the app:
the growing session on Focus, a reward on its way to your wallet, a matured lock. A leaf-to-water
gradient stroke (both colors come from the 3D world) with a soft glow under it. Nothing else glows.
Component: `ui/Arc.tsx`.

## Color

Defined once in `src/ui/palette.json` (Tailwind classes) and `src/ui/tokens.ts` (JS). Light theme
only for this pass; every value is a token so a dark set can be added without touching screens.

| Token | Hex | Use |
|---|---|---|
| `canvas` | #EEF3F0 | Screen background (cool morning mist, not cream) |
| `surface` | #FBFCFB | Grouped rows, sheets, floating panels |
| `sunk` | #E3EAE5 | Input fills, segmented track, empty slots |
| `divider` | #D5DED8 | Separators (not `hairline`: NativeWind reserves `border-hairline` for width) |
| `ink` | #15241B | Primary text (14.4:1 on canvas) |
| `ink-2` | #4F5E55 | Secondary text (6.1:1 on canvas) |
| `ink-3` | #5C6B62 | Placeholder and tertiary (4.6:1 on sunk) |
| `moss` | #2A6E27 | Primary action, selected state (white text 6.1:1) |
| `moss-soft` | #DCEBD3 | Selected tint (moss text 5.0:1) |
| `sun` | #F2B53C | Earned things: rewards, merges, ranks (ink text 8.8:1) |
| `sun-ink` | #8A5A12 | Sun-colored text on light surfaces (5.2:1) |
| `sun-soft` | #FCEFD2 | Earned tint |
| `ember` | #A63A29 | Wither, give up, errors (5.7:1 on canvas) |
| `ember-soft` | #F6E1DC | Error tint |
| `sky-top` / `sky-bottom` | #CFE8EE / #FFE2C2 | The valley's sky; backdrop for every 3D item |
| `leaf` / `water` | #8FD65E / #4FB0DB | Arc gradient only (from the world palette) |
| `bch` | #0AC18E | The Bitcoin Cash mark only |

## Type

System font (SF Pro on iOS, Roboto on Android) to match the native bars. Big numbers (timer,
stats, ranks) use SF Pro Rounded with tabular figures (`numerals` style in `tokens.ts`), echoing the
soft voxel edges. Android falls back to the system face with tabular figures.

Scale (iOS text styles), as Tailwind classes:

| Class | Size / line | Weight |
|---|---|---|
| `text-display` | 64 / 68 | Light, rounded, timer only |
| `text-large-title` | 34 / 41 | Bold |
| `text-title-1` | 28 / 34 | Bold |
| `text-title-2` | 22 / 28 | Bold |
| `text-title-3` | 20 / 25 | Semibold |
| `text-headline` | 17 / 22 | Semibold |
| `text-body` | 17 / 22 | Regular |
| `text-callout` | 16 / 21 | Regular |
| `text-subhead` | 15 / 20 | Regular |
| `text-footnote` | 13 / 18 | Regular |
| `text-caption` | 12 / 16 | Regular |

Copy: sentence case, plain verbs, no em dashes, no all-caps labels. A button names exactly what
happens ("Plant", "Restore wallet", "Send tip"), and the result uses the same word.

## Shape and space

- Radii: capsule for every button, chip and segmented control (matches the glass tab bar);
  20 for surfaces (grouped sections, stages, floating panels); 12 for inputs and small tiles.
  iOS uses the continuous corner curve.
- Spacing: 4-point grid. Screen gutter 16. Space between groups 28. Row height at least 48;
  touch targets at least 44.
- Elevation: only floating controls over the valley get a shadow (ink-tinted, never black).
  Grouped content is flat.

## Components (`src/ui`)

| Component | Purpose |
|---|---|
| `Button` | Capsule. `primary` (moss), `sun` (earned actions such as merging; ink label), `secondary` (sunk), `plain` (text), `destructive` (ember text) |
| `Group`, `Row`, `SwitchRow` | iOS inset grouped list: optional header and one footnote; rows with title, detail, value, chevron or switch |
| `Segmented` | Capsule segmented control |
| `Chip` | Selectable capsule (tags, styles, amounts); selected is moss with a white label |
| `Field` | Label above input, helper or error below |
| `Notice` | Inline message: info, warning, error |
| `Stats` | A line of facts (number, then label), left-aligned; no boxes, dividers or centered hero numbers |
| `Stage` | Sky-gradient tile that every 3D item sits on |
| `Arc` | The growth arc (signature) |
| `Icon` | SF Symbol on iOS, Material Symbol on Android and web |
| `Floating` | The only elevated surface: panels and buttons floating over the valley |
| `Screen` | Scrolling page. Tab roots pass `title`: a large title in the top bar row, with no empty bar row above it; scrolled content never meets the status bar |

## Anti-slop rules (second pass, 16 November 2026)

- No empty navigation bar above titles. On iOS, tab pages show their large title inside the native navigation bar row (SwiftUI `inlineLarge`), so the title sits right under the status bar and scrolled content passes under the bar with the system scroll-edge effect. On Android, tab pages draw the title under the status bar over a canvas scrim.
- No centered hero blocks (big avatar, big number, illustration). Headers are left-aligned rows.
- No repeated three-number stat rows with dividers. Numbers read as a sentence of facts.
- Empty states are a single row that says what to do and links there, not an illustration with a paragraph and a button.
- Empty collections collapse into one list instead of one grey box each.
- At most one green primary button on a screen; secondary actions use the neutral capsule.

## iOS renders Apple's own controls (16 November 2026)

The user rejected a React Native imitation of iOS next to the real Liquid Glass tab bar. On iOS the
design-system components now render SwiftUI through `@expo/ui` (and `expo-glass-effect`); Android
and web keep the React Native versions. Screens are written once.

| Component | iOS (SwiftUI) | Android / web |
|---|---|---|
| `Screen` | `Form`; tab roots wrap it in `NavigationStack` with `navigationTitle` and the `inlineLarge` title mode | ScrollView with an in-content title and a status-bar scrim |
| `Group` | `Section` (title, footer) | Inset surface with hairlines |
| `Row`, `SwitchRow`, `ChoiceRow` | Button row with chevron, `Toggle`, checkmark row; text in ink, not tint | Pressable rows |
| `Segmented` | `Picker` with `.segmented` | Capsule control |
| `MenuPicker` | `Picker` with `.menu` | Wrapping capsules |
| `StepperRow` | `Stepper` | Minus and plus buttons |
| `Field` | `TextField` / `SecureField` in its own section (label as header, helper as footer) | Label, input, helper |
| `Button` | `.glassProminent` (primary, sun), `.glass` (secondary, destructive), borderless (plain); labels white, ink, ink, ember, moss as on Android | Capsules |
| `IconButton` | Circular `.glass` button with an SF Symbol | Round surface button |
| `Floating` | `GlassView` (Liquid Glass) | Near-opaque surface with shadow |
| `Notice` | One-row section; the symbol carries the tone, text is ink (ember for errors) | Tinted inline box |

Rules:
- Anything that is not a design-system component (3D models, charts, custom rows) is hosted inside the
  form automatically (`ui/native/scope.tsx`).
- A component that returns several design-system pieces must be wrapped in `nativeAware()` so its
  pieces become form parts on iOS (examples: `PendingOperation`, `WalletLink`, `OnChainSession`).
- iOS screens use the system grouped background and the system navigation bar; Android keeps the
  canvas color and custom header color.
- iOS pushed screens and sheets keep the router's native header. Their content extends under it
  (`unstable_safeAreaEdges: { top: false }` in `headerOptions`), so the form insets itself once and
  the first section starts right under the title.
- Sheets use fixed detents sized to their content and can grow to full height. `fitToContents`
  cannot measure a SwiftUI form. A sheet whose content starts with its own heading has no header.
- Native modules: `@expo/ui` ~58.0.28 and `expo-glass-effect` ~58.0.5. Any change to them needs a new
  native build.

## Third pass (18 November 2026)

Shared changes in `src/ui` and the root layout:
- iOS tab roots (Leaders, Stats, Profile): the large title moved from the first form row into a
  SwiftUI `NavigationStack` bar with the `inlineLarge` title mode. Same position under the status
  bar, but it stays pinned and content scrolls under it instead of under the clock.
- iOS sheets and modals: removed the extra space between the header title and the first section
  (react-native-screens padded the content below the bar and the form added its own inset).
- Sheet heights: Your wallet 0.6 (was 0.8), member card 0.6 (was 0.85) and without its empty
  header. Next session is unchanged.
- `Button` on iOS: labels use the same colors as Android (ink on sun and on secondary glass,
  ember for destructive instead of the system red). Disabled buttons keep the system dimming.
- `Notice` on iOS: tone on the symbol, body text in ink (ember for errors), as on Android.
- `Chip` and the Android `MenuPicker`: selected state is moss, matching the color rules.

## Motion

Motivated only: spring on sheet and card entry, a short fade for state changes, haptics on
plant/grow/wither. No looping decoration apart from the existing floating card bob in the valley.
Everything respects Reduce Motion.

## Non-goals for this pass

- The bottom tab bar (frozen).
- The 3D valley renderer and models.
- Dark mode (tokens are ready for it).
- New features or flows; behavior is unchanged except fixing the broken return route after
  restoring a wallet.
