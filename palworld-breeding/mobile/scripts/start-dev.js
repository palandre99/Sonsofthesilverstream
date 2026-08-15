// scripts/start-dev.js — Palforge dev server launcher.
//
// Runs `npx expo start --dev-client --tunnel --clear`.
//
// **Tunnel only, always. No LAN fallback.** Same doctrine as Stride's
// launcher: the Palforge DEV client on the phone must reach Metro from ANY
// network — home WiFi, 5G outside, hotel WiFi. Only the ngrok tunnel does
// that; a 192.168.x.x LAN URL dies the moment the phone leaves the house.
//
//   1. Tunnel mode ONLY. Never falls back to LAN.
//   2. If ngrok stutters: kill Expo, wait, restart. Forever.
//   3. When the tunnel URL appears: copy to clipboard, write
//      CURRENT-DEV-URL.{txt,html} at the workspace root, banner it here.

const { spawn, spawnSync } = require('child_process');
const http = require('http');
const fs = require('fs');
const path = require('path');

// mobile/scripts -> mobile -> palworld-breeding -> palworld (workspace root)
const WORKSPACE_ROOT = path.resolve(__dirname, '..', '..', '..');
const MOBILE_DIR = path.resolve(__dirname, '..');
const URL_FILE_TXT = path.join(WORKSPACE_ROOT, 'CURRENT-DEV-URL.txt');
const URL_FILE_HTML = path.join(WORKSPACE_ROOT, 'CURRENT-DEV-URL.html');

// Identity check. The SCHEME is no longer read from app.json — since
// app.config.js gives the DEV build its own scheme (palforge-dev), app.json
// holds the FAST scheme and reading it would produce a link that opens
// nothing. The live scheme is taken from the running server's own manifest
// instead. The SLUG is stable across both profiles, so it is what proves a
// Metro belongs to this project.
const APP_SLUG = (() => {
  try {
    const cfg = JSON.parse(fs.readFileSync(path.join(MOBILE_DIR, 'app.json'), 'utf8'));
    return (cfg.expo && cfg.expo.slug) || 'hatchlab';
  } catch {
    return 'hatchlab';
  }
})();

// Ownership lock. Exactly one launcher may own this project's dev server.
// Without it two launchers preflight-kill each other's Metro forever (found
// 2026-08-15 by launching START-APP.cmd twice). The newest launcher wins;
// the older one is stopped outright rather than left to fight.
const LOCK_FILE = path.join(MOBILE_DIR, '.dev-server.pid');

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
  const expoClient = (manifest.extra && manifest.extra.expoClient) || {};
  // Make sure this Metro is OURS. Stride and Fjelltur run Expo servers too;
  // if one of them owns the port we must not hand the CEO a link that opens
  // the wrong app. Slug is identical across our build profiles, so it is the
  // reliable marker.
  if (expoClient.slug && expoClient.slug !== APP_SLUG) return null;
  const hostUri =
    expoClient.hostUri ||
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
  // Scheme comes from the running server's resolved config, so the link always
  // matches whichever dev client this server is actually serving.
  const scheme = expoClient.scheme || 'palforge-dev';
  return 'exp+' + scheme + '://expo-development-client/?url=' + encodeURIComponent(httpsHost);
}

async function pollForUrl() {
  if (urlFound) return;
  pollCount += 1;
  // 8082/8083: if anything still holds 8081, Expo quietly moves up a port.
  // Without these the launcher would poll forever and never show a URL.
  for (const port of [8081, 8082, 8083, 19000, 19001]) {
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
      '<title>Open Palforge Dev</title>',
      '<style>body{font-family:system-ui,sans-serif;background:#0C1618;color:#E6F0F1;padding:40px;text-align:center}',
      'a{display:inline-block;padding:16px 24px;background:#3FC1C9;color:#08191B;border-radius:12px;font-weight:600;text-decoration:none;word-break:break-all}</style>',
      '</head><body>',
      '<h1>Tap to open Palforge Dev</h1>',
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

// Take over from any older launcher for THIS project.
//
// The PID is verified to still be a start-dev.js process before anything is
// killed — a recycled PID must never take an unrelated program down with it.
function takeOwnership() {
  let prev = 0;
  try {
    if (fs.existsSync(LOCK_FILE)) {
      prev = parseInt(String(fs.readFileSync(LOCK_FILE, 'utf8')).trim(), 10) || 0;
    }
  } catch { /* ignore */ }

  if (prev && prev !== process.pid && process.platform === 'win32') {
    const ps = [
      '$prev = ' + prev + ';',
      '$p = Get-CimInstance Win32_Process -Filter "ProcessId=$prev";',
      "if ($p -and $p.CommandLine -like '*start-dev.js*') {",
      '  Write-Output "OWNED";',
      '  taskkill /PID $prev /T /F 2>&1 | Out-Null',
      '}',
    ].join(' ');
    const res = spawnSync('powershell', ['-NoProfile', '-NonInteractive', '-Command', ps], {
      encoding: 'utf8',
      timeout: 20000,
    });
    if (String((res && res.stdout) || '').includes('OWNED')) {
      console.log('[start-dev] An older Palforge launcher (PID ' + prev + ') was still running — took over from it.');
    }
  }

  try { fs.writeFileSync(LOCK_FILE, String(process.pid), 'utf8'); } catch { /* ignore */ }
}

// True while this process is still the registered owner. A launcher that has
// been superseded must bow out instead of restarting Metro — otherwise the two
// supervisors kill each other's server on every retry, forever, and the phone
// never gets a stable dev server.
function stillOwner() {
  try {
    if (!fs.existsSync(LOCK_FILE)) return true;
    const cur = parseInt(String(fs.readFileSync(LOCK_FILE, 'utf8')).trim(), 10) || 0;
    return cur === 0 || cur === process.pid;
  } catch {
    return true;
  }
}

function releaseOwnership() {
  try {
    if (!fs.existsSync(LOCK_FILE)) return;
    const cur = parseInt(String(fs.readFileSync(LOCK_FILE, 'utf8')).trim(), 10) || 0;
    if (cur === process.pid) fs.unlinkSync(LOCK_FILE);
  } catch { /* ignore */ }
}

// PREFLIGHT — kill dev servers this project left behind.
//
// 2026-08-15: three orphaned Expo servers (two tunnels + one --web) had been
// running since the night before, each pinned at ~2.5 CPU cores — together
// they saturated ~7.5 cores, thrashed Metro, and made the phone's dev client
// unusable. A second START-APP.cmd could not take port 8081, so this script
// captured the STALE server's tunnel URL and handed the CEO a dead link.
//
// The match is scoped to THIS project's directory on purpose: the CEO also
// runs Expo servers for Stride and Fjelltur, and those must survive.
function killStaleServers() {
  if (process.platform !== 'win32') return;
  const ps = [
    "$dir = '" + MOBILE_DIR.replace(/'/g, "''") + "';",
    "$me = " + process.pid + ';',
    "Get-CimInstance Win32_Process -Filter \"Name='node.exe'\" |",
    '  Where-Object { $_.ProcessId -ne $me -and $_.CommandLine -and',
    '                 $_.CommandLine -like "*$dir*" -and',
    '                 $_.CommandLine -like "*expo*" -and',
    '                 $_.CommandLine -notlike "*start-dev.js*" } |',
    '  ForEach-Object {',
    '    Write-Output $_.ProcessId;',
    '    taskkill /PID $($_.ProcessId) /T /F 2>&1 | Out-Null',
    '  }',
  ].join(' ');

  console.log('[start-dev] Preflight: clearing any dev server left running from before...');
  const res = spawnSync(
    'powershell',
    ['-NoProfile', '-NonInteractive', '-Command', ps],
    { encoding: 'utf8', timeout: 30000 }
  );
  const killed = String((res && res.stdout) || '').trim().split(/\s+/).filter(Boolean);
  if (killed.length) {
    console.log('[start-dev] Stopped ' + killed.length + ' stale dev-server process(es): ' + killed.join(', '));
    console.log('[start-dev] (That pileup is what made the phone app feel broken and the PC run hot.)');
  } else {
    console.log('[start-dev] Nothing stale running. Clean start.');
  }
}

function launchExpo() {
  if (pollTimer) clearTimeout(pollTimer);
  if (!stillOwner()) {
    console.log('\n[start-dev] A newer Palforge launcher has taken over. Closing this one.');
    console.log('[start-dev] (Use the newest window — its URL is the live one.)\n');
    process.exit(0);
    return;
  }
  // Runs on retries too: a crashed Expo can leave ngrok/Metro holding 8081.
  killStaleServers();
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
  releaseOwnership();
  if (currentExpo && !currentExpo.killed) {
    try { currentExpo.kill(sig); } catch { /* ignore */ }
  }
};
process.on('SIGINT', forwardSignal);
process.on('SIGTERM', forwardSignal);
// Closing the window must not leave a lock behind that fakes a live server.
process.on('exit', releaseOwnership);

takeOwnership();
launchExpo();
