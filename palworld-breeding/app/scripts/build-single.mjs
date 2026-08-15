#!/usr/bin/env node
/** Builds dist/Palforge-app.html — the whole app as one self-contained file:
 * inlined JS/CSS, embedded data, all 298 icons and both fonts as data URIs.
 * Run AFTER `npm run build`. */
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dist = join(root, 'dist');

const assets = readdirSync(join(dist, 'assets'));
const jsFile = assets.find((f) => f.endsWith('.js'));
const cssFile = assets.find((f) => f.endsWith('.css'));
const js = readFileSync(join(dist, 'assets', jsFile), 'utf8');
let css = readFileSync(join(dist, 'assets', cssFile), 'utf8');

// inline every woff2 reference (Vite emits them as hashed assets)
css = css.replace(/url\(([^)]*?[\w-]+\.woff2)\)/g, (_, ref) => {
  const base = ref.split('/').pop();
  const hit = assets.find((f) => f === base)
    ?? assets.find((f) => f.startsWith(base.replace(/\.woff2$/, '').split('-').slice(0, 2).join('-')) && f.endsWith('.woff2'));
  const b64 = readFileSync(join(dist, 'assets', hit)).toString('base64');
  return `url(data:font/woff2;base64,${b64})`;
});

const readJson = (p) => JSON.parse(readFileSync(join(root, 'public/data', p), 'utf8'));
const breeding = readJson('breeding_1_0.json');
const palsJson = readJson('pals_1_0.json');
const iconMap = readJson('icon_map.json');
const verification = readJson('verification.json');
const passives = readJson('passives_1_0.json');
const about = readJson('about_1_0.json');

const icons = {};
for (const [name, file] of Object.entries(iconMap.files)) {
  const b64 = readFileSync(join(root, 'public/icons', file)).toString('base64');
  icons[name] = `data:image/png;base64,${b64}`;
}

const embed = JSON.stringify({ breeding, pals: palsJson, icons, verification, passives, about })
  .replace(/</g, '\\u003c');

const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<meta name="color-scheme" content="dark light" />
<title>Palforge — the Palworld companion</title>
<style>${css}</style>
</head>
<body>
<div id="app"></div>
<script>window.__HATCHLAB_EMBED=${embed}</script>
<script type="module">${js}</script>
</body>
</html>`;

const out = join(dist, 'Palforge-app.html');
writeFileSync(out, html);
console.log(`wrote ${out} (${(html.length / 1024 / 1024).toFixed(1)} MB)`);
