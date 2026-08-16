#!/usr/bin/env node
/**
 * Publish an OTA update to both channels, safely, in a shared repo.
 *
 *   node scripts/publish.js "what changed, in the CEO's language"
 *
 * publish-guard.js checks the tree is clean BEFORE the bundle is built. That
 * closed the case where I published over another session's uncommitted work
 * knowingly — but not the race: the guard passes, `eas update` spends thirty
 * seconds bundling, and the other session writes a file in the middle of it.
 * That happened on 2026-08-16 (their store.ts and a new logic/ticks.ts landed
 * in my bundle; it type-checked and 193 tests passed, so it was luck rather
 * than process).
 *
 * So this checks clean, publishes, and checks AGAIN — and if the tree moved
 * while the bundle was being built it says so loudly, because the fix is to
 * republish from a settled tree, not to hope.
 */
const { execSync } = require('node:child_process');

const message = process.argv.slice(2).join(' ').trim();
if (!message) {
  console.error('usage: node scripts/publish.js "<what changed>"');
  process.exit(1);
}

const sh = (cmd) => execSync(cmd, { encoding: 'utf8' });
const treeState = () => sh('git status --porcelain').trim();

const before = treeState();
if (before) {
  console.error('publish: REFUSING — the working tree is dirty.\n');
  console.error(before);
  console.error('\neas update bundles what is on disk. Wait for the other'
    + '\nsession to commit rather than shipping their unfinished feature.');
  process.exit(1);
}

const head = sh('git rev-parse --short HEAD').trim();
console.log(`publish: tree clean at ${head}\n`);

for (const branch of ['development', 'preview']) {
  console.log(`--- ${branch} ---`);
  execSync(
    `npx eas-cli update --branch ${branch} --message ${JSON.stringify(message)}`
    + ' --non-interactive',
    { stdio: 'inherit' },
  );
}

const after = treeState();
if (after !== before) {
  console.error('\npublish: WARNING — the tree changed WHILE the bundle was'
    + '\nbeing built, so the update may contain files another session was'
    + '\nmid-edit on:\n');
  console.error(after);
  console.error('\nVerify the gates, and republish once the tree settles.');
  process.exit(2);
}

console.log(`\npublish: done, both channels on ${head}, tree still clean`);
