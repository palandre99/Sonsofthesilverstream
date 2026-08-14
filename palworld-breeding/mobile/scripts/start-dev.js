// scripts/start-dev.js — HatchLab dev server launcher.
//
// Runs `npx expo start --dev-client --tunnel --clear`.
//
// **Tunnel only, always. No LAN fallback.** Same doctrine as Stride's
// launcher: the HatchLab DEV client on the phone must reach Metro from ANY
// network — home WiFi, 5G outside, hotel WiFi. Only the ngrok tunnel does
// that; a 192.168.x.x LAN URL dies the moment the phone leaves the house.
//
//   1. Tunnel mode ONLY. Never falls back to LAN.
//   2. If ngrok stutters: kill Expo, wait, restart. Forever.
//   3. When the tunnel URL appears: copy to clipboard, write
//      CURRENT-DEV-URL.{txt,html} at the workspace root, banner it here.

const { spawn } = require('child_process');
const http = require('http');
const fs = require('fs');
const path = require('path');

// mobile/scripts -> mobile -> palworld-breeding -> palworld (workspace root)
const WORKSPACE_ROOT = path.resolve(__dirname, '..', '..', '..');
const URL_FILE_TXT = path.join(WORKSPACE_ROOT, 'CURRENT-DEV-URL.txt');
const URL_FILE_HTML = path.join(WORKSPACE_ROOT, 'CURRENT-DEV-URL.html');

const RETRY_DELAY_MS = 8000;
const POLL_INTERVAL_MS = 2500;
const MAX_POLLS = 240; // ~10 min per attempt before declaring ngrok stalled

let tunnelAttempt = 0;
let urlFound = false;
let pollCount = 0;
let pollTimer = null;
let currentExpo = null;

function tryFetchManifest(port) {
  return new Promise((resolve) => {
    const req = http.request(
      {
        hostname: '127.0.0.1',
        port,
        path: '/',
        method: 'GET',
        headers: {
          'Expo-Platform': 'ios',
          Accept: 'application/expo+json, application/json',
        },
        timeout: 2000,
      },
      (res) => {
        let data = '';
        res.on('data', (chunk) => { data += chunk; });
        res.on('end', () => resolve(data));
      }
    );
    req.on('error', () => resolve(null));
    req.on('timeout', () => { req.destroy(); resolve(null); });
    req.end();
  });
}

function extractDeepLink(rawManifest) {
  if (!rawManifest) return null;
  let manifest;
  try { manifest = JSON.parse(rawManifest); } catch { return null; }
  const hostUri =
    (manifest.extra && manifest.extra.expoClient && manifest.extra.expoClient.hostUri) ||
    (manifest.extra && manifest.extra.hostUri) ||
    manifest.hostUri ||
    null;
  if (!hostUri) return null;
  // TUNNEL MODE ONLY — accept the ngrok host, reject loopback/LAN. Better to
  // keep waiting than publish a URL the phone cannot reach on 5G.
  if (!hostUri.includes('tunnel.expo.dev') && !hostUri.includes('.exp.direct')) {
    return null;
  }
  const httpsHost = hostUri.startsWith('http')
    ? hostUri
    : 'https://' + hostUri.replace(/:\d+$/, '');
  return 'exp+hatchlab://expo-development-client/?url=' + encodeURIComponent(httpsHost);
}

async function pollForUrl() {
  if (urlFound) return;
  pollCount += 1;
  for (const port of [8081, 19000, 19001]) {
    const raw = await tryFetchManifest(port);
    const deepLink = extractDeepLink(raw);
    if (deepLink) {
      urlFound = true;
      writeOutputs(deepLink);
      return;
    }
  }
  if (pollCount < MAX_POLLS) {
    pollTimer = setTimeout(pollForUrl, POLL_INTERVAL_MS);
  } else {
    console.log('\n[start-dev] Tunnel URL did not appear in 10 min — ngrok may be slow/stuck.');
    console.log('[start-dev] Will restart the attempt shortly.\n');
    if (currentExpo && !currentExpo.killed) {
      try { currentExpo.kill('SIGTERM'); } catch { /* ignore */ }
    }
  }
}

function copyToClipboard(text) {
  try {
    const clip = spawn('cmd', ['/c', 'clip'], { stdio: ['pipe', 'ignore', 'ignore'] });
    clip.stdin.end(text);
  } catch { /* best-effort */ }
}

function writeOutputs(url) {
  copyToClipboard(url);
  try { fs.writeFileSync(URL_FILE_TXT, url + '\n', 'utf8'); } catch { /* ignore */ }
  try {
    const html = [
      '<!DOCTYPE html>',
      '<html><head><meta charset="utf-8">',
      '<meta http-equiv="refresh" content="0; url=' + url + '">',
      '<title>Open HatchLab Dev</title>',
      '<style>body{font-family:system-ui,sans-serif;background:#0C1618;color:#E6F0F1;padding:40px;text-align:center}',
      'a{display:inline-block;padding:16px 24px;background:#3FC1C9;color:#08191B;border-radius:12px;font-weight:600;text-decoration:none;word-break:break-all}</style>',
      '</head><body>',
      '<h1>Tap to open HatchLab Dev</h1>',
      '<p><a href="' + url + '">' + url + '</a></p>',
      '</body></html>',
    ].join('\n');
    fs.writeFileSync(URL_FILE_HTML, html, 'utf8');
  } catch { /* ignore */ }
  const line = '='.repeat(72);
  const dash = '-'.repeat(72);
  console.log('\n\n' + line);
  console.log(' [start-dev] TUNNEL URL captured — works on any network (WiFi or 5G)');
  console.log(dash);
  console.log(' ' + url);
  console.log(dash);
  console.log(' Copied to Windows clipboard.');
  console.log(' Saved to:');
  console.log('   ' + URL_FILE_TXT);
  console.log('   ' + URL_FILE_HTML);
  console.log(line + '\n');
}

function launchExpo() {
  if (pollTimer) clearTimeout(pollTimer);
  pollCount = 0;
  urlFound = false;
  tunnelAttempt += 1;

  console.log(`\n[start-dev] Launching Expo dev server in TUNNEL mode — attempt ${tunnelAttempt}.`);
  console.log('[start-dev] Works on any network: home WiFi, 5G, hotel WiFi.');
  console.log('[start-dev] LAN fallback is INTENTIONALLY DISABLED.\n');

  currentExpo = spawn('npx', ['expo', 'start', '--dev-client', '--tunnel', '--clear'], {
    stdio: ['inherit', 'inherit', 'pipe'],
    shell: true,
    env: { ...process.env, FORCE_COLOR: '1' },
  });

  let detectedTunnelCrash = false;
  let crashSnippet = '';

  const TUNNEL_FAIL_PATTERNS = [
    "Cannot read properties of undefined (reading 'body')",
    'Check the Ngrok status page',
    'ETUNNEL',
    'ngrok tunnel took too long to connect',
    'Tunnel connection has been closed',
    'failed to start tunnel',
  ];

  currentExpo.stderr.on('data', (chunk) => {
    const text = chunk.toString();
    process.stderr.write(text);
    if (TUNNEL_FAIL_PATTERNS.some((p) => text.includes(p))) {
      detectedTunnelCrash = true;
      crashSnippet = text.split('\n').slice(-4).join('\n').trim();
    }
  });

  currentExpo.on('close', (code) => {
    if (urlFound && code === 0) {
      process.exit(0);
      return;
    }
    const isCrash = detectedTunnelCrash || (code != null && code !== 0);
    console.log('\n' + '='.repeat(72));
    if (isCrash) {
      console.log(' [start-dev] Tunnel attempt failed. Retrying in ' + (RETRY_DELAY_MS / 1000) + ' sec.');
      if (crashSnippet) console.log(' [start-dev] Last error: ' + crashSnippet.split('\n')[0]);
      console.log(' [start-dev] (If this keeps failing, check https://status.ngrok.com/)');
    } else {
      console.log(' [start-dev] Expo exited unexpectedly. Restarting in ' + (RETRY_DELAY_MS / 1000) + ' sec.');
    }
    console.log('='.repeat(72) + '\n');
    setTimeout(launchExpo, RETRY_DELAY_MS);
  });

  setTimeout(pollForUrl, 5000);
}

const forwardSignal = (sig) => {
  if (currentExpo && !currentExpo.killed) {
    try { currentExpo.kill(sig); } catch { /* ignore */ }
  }
};
process.on('SIGINT', forwardSignal);
process.on('SIGTERM', forwardSignal);

launchExpo();
