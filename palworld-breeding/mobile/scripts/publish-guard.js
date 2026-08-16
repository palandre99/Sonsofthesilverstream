#!/usr/bin/env node
/**
 * Refuse to publish an OTA update from a dirty working tree.
 *
 * `eas update` bundles whatever is ON DISK, not what is committed. Two coders
 * share this repo, so publishing while the other session is mid-feature ships
 * their unfinished code straight to the CEO's daily driver.
 *
 * This has now happened twice. The first time was `git add -A` sweeping their
 * files into my commit. The second time the rule was followed to the letter —
 * `git status` was run, the two foreign files were RIGHT THERE in the output —
 * and the publish went ahead anyway, because a printout is not a gate. So it
 * is a gate now.
 *
 *   node scripts/publish-guard.js && npx eas-cli update --branch ...
 *
 * Exit 0 = clean tree, safe to publish. Exit 1 = something is uncommitted.
 */
const { execSync } = require('node:child_process');

let out;
try {
  out = execSync('git status --porcelain', { encoding: 'utf8' });
} catch (err) {
  console.error('publish-guard: could not read git status —', err.message);
  process.exit(1);
}

const dirty = out.split('\n').map((l) => l.trim()).filter(Boolean);
if (dirty.length === 0) {
  console.log('publish-guard: tree is clean, safe to publish');
  process.exit(0);
}

console.error('publish-guard: REFUSING TO PUBLISH — the working tree is dirty.\n');
for (const line of dirty) console.error('  ' + line);
console.error(
  '\neas update bundles what is on disk. Commit your own work, and if any of'
  + '\nthe above belongs to another session, wait for them to commit it rather'
  + '\nthan shipping their half-finished feature to the CEO.',
);
process.exit(1);
