/**
 * Babel plugin: makes RegExp literals with the `v` (unicode sets) flag parse on Hermes.
 *
 * Hermes rejects the `v` flag at compile time, and some dependencies
 * (e.g. websql-configurable, used by indexeddbshim) use it for plain patterns
 * like `/^\s*UPDATE\b/iv`. For patterns that use no set-only syntax (nested
 * classes, `--`, `&&`, `\q{}`), `v` and `u` mode match identically, so the
 * flag is rewritten to `u`. Patterns that genuinely need `v` semantics fail
 * the build with a clear message instead of failing at runtime.
 *
 *   // babel.config.js
 *   plugins: [require.resolve('libauth-native/babel-plugin')]
 */
const usesSetOnlySyntax = (pattern) => {
  if (/\\q\{/.test(pattern)) return true;
  let depth = 0;
  for (let i = 0; i < pattern.length; i++) {
    const char = pattern[i];
    if (char === '\\') {
      i += 1;
      continue;
    }
    if (char === '[') {
      depth += 1;
      if (depth > 1) return true;
    } else if (char === ']' && depth > 0) {
      depth -= 1;
    } else if (depth > 0 && (pattern.startsWith('--', i) || pattern.startsWith('&&', i))) {
      return true;
    }
  }
  return false;
};

module.exports = function libauthNativeRegexpPlugin() {
  return {
    name: 'libauth-native-regexp-v-flag',
    visitor: {
      RegExpLiteral(path) {
        const { node } = path;
        if (!node.flags.includes('v')) return;
        if (usesSetOnlySyntax(node.pattern)) {
          throw path.buildCodeFrameError(
            `RegExp /${node.pattern}/${node.flags} uses unicode-sets syntax that Hermes cannot run.`
          );
        }
        node.flags = node.flags.replace('v', node.flags.includes('u') ? '' : 'u');
        if (node.extra) {
          node.extra.raw = `/${node.pattern}/${node.flags}`;
          node.extra.rawValue = undefined;
        }
      },
    },
  };
};
