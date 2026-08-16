#!/usr/bin/env node
/**
 * Publish an OTA update to both channels, safely, in a shared repo.
 *
 *   node scripts/publish.js "what changed, in the CEO's language"
 *
 * publish-guard.js checks the tree before the bundle is built. That closed the
 * case where I published over another session's uncommitted work knowingly —
 * but not the race: the guard passes, `eas update` spends thirty seconds
 * bundling, and the other session saves a file in the middle of it. That
 * happened on 2026-08-16 (their store.ts and a new logic/ticks.ts landed in my
 * bundle; it type-checked and every test passed, so it was luck, not process).
 *
 * So this checks, publishes, and checks AGAIN — and if the tree moved while
 * the bundle was building it says so loudly, because the fix is to republish
 * from a settled tree rather than hope.
 */
const { execSync } = require('node:child_process');

const message = process.argv.slice(2).join(' ').trim();
if (!message) {
  console.error('usage: node scripts/publish.js "<what changed>"');
  process.exit(1);
}

const sh = (cmd) => execSync(cmd, { encoding: 'utf8' });

/**
 * Only files inside the Expo project can enter the bundle — the website,
 * documents and tools cannot reach the phone, so a dirty file there must not
 * hold up his update. See publish-guard.js for the full reasoning.
 */
const BUNDLED = 'palworld-breeding/mobile/';
const target = (line) => line.slice(2).trim().split(' -> ').pop();
const bundledDirt = () => sh('git status --porcelain')
  .split(/\r?\n/)
  .map((l) => l.trim())
  .filter(Boolean)
  .filter((l) => target(l).includes(BUNDLED))
  .join('\n');

const before = bundledDirt();
if (before) {
  console.error('publish: REFUSING — files that would be bundled are uncommitted:\n');
  console.error(before);
  console.error('\nWait for the other session to commit rather than shipping'
    + '\ntheir unfinished feature to the CEO.');
  process.exit(1);
}

const head = sh('git rev-parse --short HEAD').trim();
console.log(`publish: bundle is clean at ${head}\n`);

for (const branch of ['development', 'preview']) {
  console.log(`--- ${branch} ---`);
  execSync(
    `npx eas-cli update --branch ${branch} --message ${JSON.stringify(message)}`
    + ' --non-interactive',
    { stdio: 'inherit' },
  );
}

const after = bundledDirt();
if (after !== before) {
  console.error('\npublish: WARNING — a bundled file changed WHILE the update was'
    + '\nbeing built, so it may contain work another session was mid-edit on:\n');
  console.error(after);
  console.error('\nVerify the gates, and republish once the tree settles.');
  process.exit(2);
}

console.log(`\npublish: done, both channels on ${head}, bundle still clean`);
