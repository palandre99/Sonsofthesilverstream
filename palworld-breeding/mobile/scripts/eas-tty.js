/** Run eas-cli through pipes while it believes it has a real terminal.
 *
 * eas-cli refuses interactive credential setup without a TTY; this fakes the
 * TTY checks so its prompts run over stdio, where a driver process can answer
 * them. Used ONLY for the one-time iOS credential bootstrap — never to enter
 * secrets (a password prompt is the driver's signal to stop and hand over to
 * a human).
 *
 * Usage: node scripts/eas-tty.js build --platform ios --profile development
 */
'use strict';

for (const stream of [process.stdout, process.stderr]) {
  Object.defineProperty(stream, 'isTTY', { value: true, configurable: true });
  stream.columns = 110;
  stream.rows = 40;
  stream.getWindowSize = () => [110, 40];
  stream.clearLine = stream.clearLine || (() => true);
  stream.cursorTo = stream.cursorTo || (() => true);
  stream.moveCursor = stream.moveCursor || (() => true);
}
Object.defineProperty(process.stdin, 'isTTY', { value: true, configurable: true });
process.stdin.setRawMode = process.stdin.setRawMode || (() => process.stdin);

// oclif reads argv after the node binary + script path
process.argv = [process.argv[0], require.resolve('eas-cli/bin/run'), ...process.argv.slice(2)];
require('eas-cli/bin/run');
