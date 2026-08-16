/**
 * The About screen makes a promise: "No ads, no accounts, no tracking. Your
 * collection and plans live on this device only."
 *
 * That is the kind of claim that rots silently. Nobody sets out to break it —
 * somebody adds a crash reporter, or a screen starts posting somewhere, and
 * the sentence quietly becomes false while every other test stays green. So
 * it gets a guard.
 *
 * Checked at the time of writing: 30 dependencies, none of them analytics,
 * ads, or crash reporting; zero network calls anywhere in mobile/src; storage
 * is AsyncStorage and expo-file-system, both device-local.
 *
 * `expo-updates` DOES contact Expo's servers — that is the over-the-air
 * update mechanism, it carries no collection or plan data, and the same About
 * screen displays the update id and channel right above the promise. It is
 * disclosed, not hidden, so it is allowed here by name.
 */
import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const MOBILE = join(__dirname, '../../mobile');

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...sourceFiles(full));
    else if (/\.tsx?$/.test(entry)) out.push(full);
  }
  return out;
}

/** strip comments so a mention in prose never trips the scan */
function code(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
}

const FILES = sourceFiles(join(MOBILE, 'src'));

describe('the About screen\'s privacy promise', () => {
  it('finds source files to scan at all', () => {
    expect(FILES.length).toBeGreaterThan(20);
  });

  it('makes no network calls anywhere in the phone app', () => {
    const offenders: string[] = [];
    for (const f of FILES) {
      const src = code(readFileSync(f, 'utf8'));
      for (const [label, re] of [
        ['fetch(', /\bfetch\s*\(/],
        ['XMLHttpRequest', /\bXMLHttpRequest\b/],
        ['WebSocket', /\bnew\s+WebSocket\b/],
        ['sendBeacon', /\bsendBeacon\s*\(/],
      ] as const) {
        if (re.test(src)) offenders.push(`${f.replace(MOBILE, 'mobile')} → ${label}`);
      }
    }
    expect(offenders, `the app promises no tracking, but these reach the network:\n${offenders.join('\n')}`)
      .toEqual([]);
  });

  it('depends on nothing that reports back', () => {
    const pkg = JSON.parse(readFileSync(join(MOBILE, 'package.json'), 'utf8')) as
      { dependencies?: Record<string, string> };
    const deps = Object.keys(pkg.dependencies ?? {});
    expect(deps.length).toBeGreaterThan(10);

    const BANNED = ['analytic', 'telemetry', 'tracking', 'sentry', 'bugsnag',
      'crashlytics', 'mixpanel', 'amplitude', 'segment', 'posthog', 'firebase',
      'admob', 'appsflyer', 'branch-sdk', 'onesignal'];
    const found = deps.filter((d) => BANNED.some((b) => d.toLowerCase().includes(b)));
    expect(found, `these phone home, which breaks the About screen's promise: ${found.join(', ')}`)
      .toEqual([]);
  });

  it('still shows the promise it is guarding', () => {
    const about = readFileSync(join(MOBILE, 'src/screens/SettingsScreens.tsx'), 'utf8');
    // if the wording changes, this test should be re-read rather than deleted
    expect(about).toContain('No ads, no accounts, no tracking');
    expect(about).toContain('this device only');
  });
});
