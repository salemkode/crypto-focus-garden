const out = await Bun.build({ entrypoints: [import.meta.dir + '/ladder.ts'], target: 'browser', minify: true });
if (!out.success) { console.error(out.logs); process.exit(1); }
const js = (await out.outputs[0].text()).replaceAll('</script', '<\\/script');
const shell = await Bun.file(import.meta.dir + '/ladder-shell.html').text();
await Bun.write(import.meta.dir + '/ladder.html', shell.replace('/*APPHEIGHT*/', '100dvh').replace('/*BUNDLE*/', () => js));
await Bun.write(import.meta.dir + '/ladder-embed.html', shell.replace('/*APPHEIGHT*/', '640px').replace('/*BUNDLE*/', () => js));
console.log('wrote ladder.html and ladder-embed.html');
