const { defineConfig } = require('eslint/config');
const expo = require('eslint-config-expo/flat');
module.exports = defineConfig([
  expo,
  { ignores: ['modules/**', 'tests/**', 'contracts/**', 'src/diagnostics/**', 'ios/**', 'android/**', 'dist/**'] },
]);
