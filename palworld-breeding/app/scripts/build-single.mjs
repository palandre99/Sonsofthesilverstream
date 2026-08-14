#!/usr/bin/env node
/** Builds dist/HatchLab-app.html — the whole app as one self-contained file:
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

// inline fonts referenced as /fonts/*.woff2
css = css.replace(/url\(\/fonts\/([\w.-]+\.woff2)\)/g, (_, f) => {
  const b64 = readFileSync(join(root, 'public/fonts', f)).toString('base64');
  return `url(data:font/woff2;base64,${b64})`;
});

const readJson = (p) => JSON.parse(readFileSync(join(root, 'public/data', p), 'utf8'));
const breeding = readJson('breeding_1_0.json');
const palsJson = readJson('pals_1_0.json');
const iconMap = readJson('icon_map.json');
const verification = readJson('verification.json');

const icons = {};
for (const [name, file] of Object.entries(iconMap.files)) {
  const b64 = readFileSync(join(root, 'public/icons', file)).toString('base64');
  icons[name] = `data:image/png;base64,${b64}`;
}

const embed = JSON.stringify({ breeding, pals: palsJson, icons, verification })
  .replace(/</g, '\\u003c');

const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<meta name="color-scheme" content="dark light" />
<title>HatchLab — Palworld breeding, solved</title>
<style>${css}</style>
</head>
<body>
<div id="app"></div>
<script>window.__HATCHLAB_EMBED=${embed}</script>
<script type="module">${js}</script>
</body>
</html>`;

const out = join(dist, 'HatchLab-app.html');
writeFileSync(out, html);
console.log(`wrote ${out} (${(html.length / 1024 / 1024).toFixed(1)} MB)`);
