const px = (size, line, weight) => [`${size}px`, { lineHeight: `${line}px`, ...(weight ? { fontWeight: weight } : {}) }];

/** Touch-target sizes: 9 = 36 pt (plus a 4 pt hit slop above and below), 11 = 44 pt (Apple's minimum), 12 = 48 pt (Material's), 14 = 56 pt. */
const targets = { 9: '36px', 11: '44px', 12: '48px', 14: '56px' };

/** Design system: docs/design-system.md. Colors live in src/ui/palette.json. */
module.exports = {
  content: ["./src/**/*.{ts,tsx}"],
  darkMode: "class",
  presets: [require("nativewind/preset")],
  theme: {
    extend: {
      colors: require('./src/ui/palette.json'),
      // Touch targets in exact points. NativeWind's rem is 14 px on native, so h-11 was 38.5 pt, short
      // of the 44 pt (iOS) and 48 dp (Android) minimum it was meant to meet. Padding keeps the rem scale.
      height: targets,
      minHeight: targets,
      width: targets,
      fontSize: {
        display: px(64, 68, '300'),
        'large-title': px(34, 41, '700'),
        'title-1': px(28, 34, '700'),
        'title-2': px(22, 28, '700'),
        'title-3': px(20, 25, '600'),
        headline: px(17, 22, '600'),
        body: px(17, 22),
        callout: px(16, 21),
        subhead: px(15, 20),
        footnote: px(13, 18),
        caption: px(12, 16),
      },
    },
  },
  plugins: []
};
