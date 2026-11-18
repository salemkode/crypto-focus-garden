const fs = require('fs');
const path = require('path');
const { withDangerousMod } = require('expo/config-plugins');

const BEGIN = '# BEGIN focus-garden: expo view constructors';
const END = '# END focus-garden: expo view constructors';

/**
 * Expo creates native views by reflection through their (Context, AppContext) constructor.
 * expo-modules-core keeps that constructor only for ExpoView subclasses, but expo-gl's GLView
 * extends TextureView. With release minification on, R8 removed it and the release app crashed
 * at launch: "Didn't find a correct constructor for class <GLView>" (16 November 2026).
 */
const RULES = `${BEGIN}
-keepclassmembers class * extends android.view.View {
  public <init>(android.content.Context, expo.modules.kotlin.AppContext);
}
# EXGLJniApi.cpp looks this callback up by its literal name via GetMethodID.
-keepclassmembers class expo.modules.gl.GLContext {
  public void flush();
}
${END}`;

function withKeepRules(contents) {
  const start = contents.indexOf(BEGIN);
  if (start === -1) return `${contents.trimEnd()}\n\n${RULES}\n`;
  const end = contents.indexOf(END, start);
  return contents.slice(0, start) + RULES + contents.slice(end + END.length);
}

const withExpoViewKeepRules = (config) => withDangerousMod(config, ['android', async (config) => {
  const file = path.join(config.modRequest.platformProjectRoot, 'app', 'proguard-rules.pro');
  fs.writeFileSync(file, withKeepRules(fs.readFileSync(file, 'utf8')));
  return config;
}]);

module.exports = withExpoViewKeepRules;
module.exports.withKeepRules = withKeepRules;
module.exports.RULES = RULES;
