#!/usr/bin/env node
/**
 * The web build simulates the phone app; it is not a desktop site. After `expo export --platform web`,
 * this adds a small script to the top of dist-web/index.html: on a wide screen (desktop), the page
 * stops loading the app and instead shows it inside a phone-sized frame of the same URL. Inside that
 * frame the app sees a phone-sized window, so layout, sheets and pagers behave exactly like on a
 * phone. On phones and narrow windows the app runs full-screen as before.
 *
 * Usage: node scripts/web-phone-frame.mjs [dist-web]
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const dir = process.argv[2] ?? "dist-web";
const file = join(dir, "index.html");
const html = readFileSync(file, "utf8");
const MARK = "<!-- focus-garden-phone-frame -->";
if (html.includes(MARK)) {
	console.log("Phone frame already present.");
	process.exit(0);
}

// Kept dependency-free and small: it runs before anything else on the page.
const frame = `${MARK}
<script>
(function () {
  if (window.self !== window.top) return;            // already inside the phone frame
  if (Math.min(window.innerWidth, screen.width) < 700) return; // phones and narrow windows: full app
  window.stop();                                      // don't load the app twice
  var src = location.pathname + location.search + location.hash;
  document.documentElement.innerHTML =
    '<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">' +
    '<title>Focus Garden</title>' +
    '<style>' +
    'html,body{margin:0;height:100%}' +
    'body{display:grid;place-items:center;gap:16px;min-height:100vh;background:radial-gradient(900px 500px at 80% 0%,#ffe2c2,transparent 70%),radial-gradient(800px 500px at 0% 20%,#cfe8ee,transparent 70%),#eef3f0;font:500 14px/1.4 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;color:#4f5e55}' +
    '.phone{--h:min(932px,calc(100vh - 96px));height:var(--h);aspect-ratio:430/932;padding:12px;border-radius:64px;background:#15241b;box-shadow:0 2px 6px rgba(21,36,27,.25),0 40px 90px -30px rgba(21,36,27,.55)}' +
    '.phone iframe{display:block;width:100%;height:100%;border:0;border-radius:52px;background:#eef3f0}' +
    'a{color:#2a6e27;font-weight:700;text-decoration:none}a:hover{text-decoration:underline}' +
    '@media (prefers-color-scheme:dark){body{background:#0e1611;color:#a9b8ae}a{color:#9ad86f}.phone{background:#2c3d33;box-shadow:0 0 0 1px #3a4d41,0 40px 90px -30px rgba(0,0,0,.8)}}' +
    '</style></head>' +
    '<body><div class="phone"><iframe title="Focus Garden" allow="clipboard-write" src="' + src.replace(/"/g, '&quot;') + '"></iframe></div>' +
    '<p>Focus Garden on the web, shown as on a phone. <a href="https://focus.salemkode.com/#download">Get the iPhone or Android app</a></p></body>';
})();
</script>`;

writeFileSync(file, html.replace(/<head>/i, `<head>\n${frame}`));
console.log(`Phone frame added to ${file}`);
