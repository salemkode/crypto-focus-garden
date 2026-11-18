const px = (size, line, weight) => [`${size}px`, { lineHeight: `${line}px`, ...(weight ? { fontWeight: weight } : {}) }];

/** Design system: docs/design-system.md. Colors live in src/ui/palette.json. */
module.exports = {
  content: ["./src/**/*.{ts,tsx}"],
  darkMode: "class",
  presets: [require("nativewind/preset")],
  theme: {
    extend: {
      colors: require('./src/ui/palette.json'),
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
