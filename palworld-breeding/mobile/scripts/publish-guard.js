#!/usr/bin/env node
/**
 * Refuse to publish an OTA update when the bundle would contain someone
 * else's unfinished work.
 *
 * `eas update` bundles whatever is ON DISK, not what is committed. Two coders
 * share this repo, so publishing while the other session is mid-feature ships
 * their half-written code straight to the CEO's daily driver.
 *
 * This has happened twice. The first time was `git add -A` sweeping their
 * files into my commit. The second time the rule was followed to the letter —
 * `git status` was run, the foreign files were RIGHT THERE in the output —
 * and the publish went ahead anyway, because a printout is not a gate.
 *
 *   node scripts/publish-guard.js && npx eas-cli update --branch ...
 *
 * Exit 0 = safe to publish. Exit 1 = something that would be bundled is
 * uncommitted.
 */
const { execSync } = require('node:child_process');

let out;
try {
  out = execSync('git status --porcelain', { encoding: 'utf8' });
} catch (err) {
  console.error('publish-guard: could not read git status —', err.message);
  process.exit(1);
}

/**
 * Only changes that can actually ENTER the bundle matter.
 *
 * `eas update` bundles the Expo project rooted at palworld-breeding/mobile.
 * A dirty file under app/ (the website), documents/ or tools/ cannot reach the
 * CEO's phone, so blocking on one just delays his update for no safety gain —
 * and this guard was doing exactly that, holding two finished map fixes back
 * because the other session was editing a stylesheet and the shared ledger.
 *
 * Everything under mobile/ still blocks, app.config.js and scripts included:
 * being conservative about our OWN project is the entire point.
 */
const BUNDLED = 'palworld-breeding/mobile/';

const all = out.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
/** git prints renames as "old -> new"; the destination is what lands on disk */
const target = (line) => line.slice(2).trim().split(' -> ').pop();
const dirty = all.filter((l) => target(l).includes(BUNDLED));

if (dirty.length === 0) {
  const extra = all.length ? ` (${all.length} changed outside the app bundle)` : '';
  console.log(`publish-guard: nothing dirty can reach the bundle, safe to publish${extra}`);
  process.exit(0);
}

console.error('publish-guard: REFUSING TO PUBLISH — files that WOULD be bundled');
console.error('are uncommitted:\n');
for (const line of dirty) console.error('  ' + line);
console.error(
  '\neas update bundles what is on disk. Commit your own work, and if any of'
  + '\nthe above belongs to another session, wait for them to commit it rather'
  + '\nthan shipping their half-finished feature to the CEO.',
);
process.exit(1);
