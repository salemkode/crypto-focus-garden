// Bundles the prototype into one self-contained HTML file.
const out = await Bun.build({ entrypoints: [import.meta.dir + '/valley.ts'], target: 'browser', minify: true });
if (!out.success) { console.error(out.logs); process.exit(1); }
const js = await out.outputs[0].text();
const shell = await Bun.file(import.meta.dir + '/shell.html').text();
const page = (height: string) => shell.replace('/*APPHEIGHT*/', height).replace('/*BUNDLE*/', () => js.replaceAll('</script', '<\\/script'));
// Standalone: fills the window. Embed: a fixed phone-sized frame for inline previews.
await Bun.write(import.meta.dir + '/valley.html', page('100dvh'));
await Bun.write(import.meta.dir + '/valley-embed.html', page('820px'));
// Preview states for reviewing seasons and a grown valley without clicking.
for (const [name, init] of [['winter-year', { season: 'winter', age: 120 }], ['spring-years', { season: 'spring', age: 300 }], ['planner', { season: 'summer', age: 120, planner: true }], ['card', { season: 'autumn', age: 10, card: true }]] as const) {
  await Bun.write(import.meta.dir + `/valley-${name}.html`, page('820px').replace('<script>', `<script>window.__INIT=${JSON.stringify(init)};</script><script>`));
}
console.log('wrote prototype/valley.html', (js.length / 1024).toFixed(0), 'KB');
