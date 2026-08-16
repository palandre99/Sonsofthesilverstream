/**
 * Visual QA driver: open a screen in headless Chrome, act on it, screenshot it.
 *
 * The workspace rule is that no UI change counts until someone has LOOKED at
 * it, and the RN-web QA build has no way to reach a screen or press a button
 * from outside. This drives it over the Chrome DevTools Protocol instead:
 * navigate to a route, run a few scripted taps, capture PNGs.
 *
 *   node scripts/qa-shot.js <outDir> <route> [step ...]
 *
 * A step is one of:
 *   tap:<text>       press the first element whose text contains <text>
 *   wait:<ms>        let animations and tile loads settle
 *   shot:<name>      capture <outDir>/<name>.png
 *   click:<x>,<y>    press at exact viewport coordinates
 *   go:<hash>        jump to a route, keeping page state
 *   pinch:<factor>   zoom about the screen centre by <factor>
 *   drag:<dx>,<dy>   pan by that many pixels
 *
 * Chrome must already be listening (this script launches and closes its own).
 */
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const WebSocket = require('ws');

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 9333;
const W = 375;
const H = 812;

const [, , outDir, route, ...steps] = process.argv;
if (!outDir || !route) {
  console.error('usage: node scripts/qa-shot.js <outDir> <route> [step ...]');
  process.exit(2);
}
fs.mkdirSync(outDir, { recursive: true });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function getJson(url) {
  return new Promise((resolve, reject) => {
    http.get(url, (res) => {
      let body = '';
      res.on('data', (c) => (body += c));
      res.on('end', () => {
        try {
          resolve(JSON.parse(body));
        } catch (err) {
          reject(err);
        }
      });
    }).on('error', reject);
  });
}

async function main() {
  const profile = path.join(outDir, '.chrome-profile');
  const chrome = spawn(CHROME, [
    '--headless=new',
    '--disable-gpu',
    '--hide-scrollbars',
    // Without this the page lays out at 4x the requested size (innerWidth
    // 1500 for a 375 window) while screenshots come back phone-shaped, so
    // every viewport-dependent check reads a rect that does not match what
    // the picture shows. Pin the scale and trust the window size.
    '--force-device-scale-factor=1',
    `--remote-debugging-port=${PORT}`,
    `--user-data-dir=${profile}`,
    `--window-size=${W},${H}`,
    'about:blank',
  ], { stdio: 'ignore' });

  let targets = null;
  for (let i = 0; i < 60 && !targets; i++) {
    await sleep(250);
    try {
      targets = await getJson(`http://127.0.0.1:${PORT}/json/list`);
    } catch { /* not up yet */ }
  }
  if (!targets) throw new Error('Chrome did not expose a debugging port');

  const page = targets.find((t) => t.type === 'page');
  const ws = new WebSocket(page.webSocketDebuggerUrl, { perMessageDeflate: false });
  await new Promise((r) => ws.once('open', r));

  let nextId = 1;
  const pending = new Map();
  ws.on('message', (raw) => {
    const msg = JSON.parse(raw);
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id);
      pending.delete(msg.id);
      msg.error ? reject(new Error(msg.error.message)) : resolve(msg.result);
    }
  });
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const id = nextId++;
    pending.set(id, { resolve, reject });
    ws.send(JSON.stringify({ id, method, params }));
  });

  const evaluate = async (expression) => {
    const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    return r.result?.value;
  };

  await send('Page.enable');
  await send('Runtime.enable');
  await send('Page.navigate', { url: `http://localhost:8085/${route}` });
  await sleep(12000);   // Metro's first bundle is slow; tiles then decode

  // Applied AFTER the load, and verified. Set before navigating it is simply
  // dropped, which left the page laying out at the real window size while
  // screenshots came back phone-shaped — so every viewport-dependent check
  // (marker culling, label edge-insets) was reading a rect that did not match
  // the picture. A silent mismatch like that makes visual QA worse than none.
  await send('Emulation.setDeviceMetricsOverride', {
    width: W, height: H, deviceScaleFactor: 2, mobile: true,
  });
  await sleep(1200);
  const vp = await evaluate('({w:window.innerWidth,h:window.innerHeight})');
  if (vp.w !== W) {
    console.log(`  ! viewport is ${vp.w}x${vp.h}, expected ${W}x${H} — `
      + 'screenshots will not match a phone');
  } else {
    console.log(`  viewport ${vp.w}x${vp.h}`);
  }

  const errors = [];
  ws.on('message', (raw) => {
    const m = JSON.parse(raw);
    if (m.method === 'Runtime.exceptionThrown') {
      errors.push(m.params.exceptionDetails?.exception?.description ?? 'exception');
    }
  });

  const tap = async (text) => {
    const box = await evaluate(`(() => {
      const want = ${JSON.stringify(text)}.toLowerCase();
      const onScreen = [...document.querySelectorAll('div,span,button,input')].filter((el) => {
        const r = el.getBoundingClientRect();
        return r.width > 8 && r.height > 8 && r.top >= 0 && r.top < ${H};
      });
      const label = (el) => (el.innerText || el.getAttribute('aria-label') || '')
        .trim().toLowerCase();
      // Exact text wins over "contains", so tapping "Foxparks" can never land
      // on "Foxparks Cryst"; among equals take the innermost (shortest) node.
      const exact = onScreen.filter((el) => label(el) === want);
      const loose = onScreen.filter((el) => label(el).includes(want));
      const pool = exact.length ? exact : loose;
      if (!pool.length) return null;
      pool.sort((a, b) => label(a).length - label(b).length);
      const r = pool[0].getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    })()`);
    if (!box) {
      console.log(`  ! tap "${text}": not found`);
      return;
    }
    for (const type of ['mousePressed', 'mouseReleased']) {
      await send('Input.dispatchMouseEvent', {
        type, x: box.x, y: box.y, button: 'left', clickCount: 1,
      });
    }
    console.log(`  tap "${text}" at ${Math.round(box.x)},${Math.round(box.y)}`);
    await sleep(700);
  };

  const type = async (text) => {
    const ok = await evaluate(`(() => {
      const el = document.querySelector('input');
      if (!el) return false;
      el.focus();
      return true;
    })()`);
    if (!ok) {
      console.log(`  ! type "${text}": no input on screen`);
      return;
    }
    for (const ch of text) {
      await send('Input.dispatchKeyEvent', { type: 'keyDown', text: ch });
      await send('Input.dispatchKeyEvent', { type: 'keyUp', text: ch });
    }
    console.log(`  type "${text}"`);
    await sleep(600);
  };

  const shot = async (name) => {
    const r = await send('Page.captureScreenshot', { format: 'png' });
    const file = path.join(outDir, `${name}.png`);
    fs.writeFileSync(file, Buffer.from(r.data, 'base64'));
    console.log(`  shot -> ${path.basename(file)}`);
  };

  const drag = async (dx, dy) => {
    const cx = W / 2;
    const cy = H / 2;
    await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: cx, y: cy, button: 'left', clickCount: 1 });
    for (let i = 1; i <= 8; i++) {
      await send('Input.dispatchMouseEvent', {
        type: 'mouseMoved', x: cx + (dx * i) / 8, y: cy + (dy * i) / 8, button: 'left',
      });
      await sleep(16);
    }
    await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: cx + dx, y: cy + dy, button: 'left' });
    await sleep(600);
  };

  const pinch = async (factor) => {
    // react-native-web maps wheel+ctrl to pinch on the Pinch gesture handler;
    // a plain wheel is what the canvas sees in a browser.
    await send('Input.dispatchMouseEvent', {
      type: 'mouseWheel', x: W / 2, y: H / 2, deltaX: 0,
      deltaY: factor > 1 ? -240 : 240, modifiers: 2,
    });
    await sleep(700);
  };

  for (const step of steps) {
    const [kind, arg] = [step.slice(0, step.indexOf(':')), step.slice(step.indexOf(':') + 1)];
    if (kind === 'tap') await tap(arg);
    else if (kind === 'type') await type(arg);
    else if (kind === 'click') {
      const [cx, cy] = arg.split(',').map(Number);
      for (const type of ['mousePressed', 'mouseReleased']) {
        await send('Input.dispatchMouseEvent', {
          type, x: cx, y: cy, button: 'left', clickCount: 1,
        });
      }
      console.log(`  click ${cx},${cy}`);
      await sleep(700);
    }
    else if (kind === 'go') {
      // hash routes are how the QA build reaches a screen; state persists in
      // the page, so this can walk a real journey across domains
      await evaluate(`location.hash = ${JSON.stringify(arg)}`);
      console.log(`  go ${arg}`);
      await sleep(1400);
    }
    else if (kind === 'probe') {
      const out = await evaluate(arg);
      console.log('  probe:', JSON.stringify(out));
    }
    else if (kind === 'scroll') {
      // one wheel event per 240px keeps RN-web's scroll view following along
      const total = Number(arg);
      for (let done = 0; done < Math.abs(total); done += 240) {
        await send('Input.dispatchMouseEvent', {
          type: 'mouseWheel', x: W / 2, y: H / 2, deltaX: 0,
          deltaY: Math.sign(total) * 240,
        });
        await sleep(90);
      }
      await sleep(500);
    }
    else if (kind === 'shot') await shot(arg);
    else if (kind === 'wait') await sleep(Number(arg));
    else if (kind === 'pinch') await pinch(Number(arg));
    else if (kind === 'drag') await drag(...arg.split(',').map(Number));
    else console.log(`  ? unknown step ${step}`);
  }

  const counts = await evaluate(`(() => {
    const imgs = [...document.querySelectorAll('img')];
    return {
      tiles: imgs.filter((i) => (i.src || '').includes('/map/')).length,
      images: imgs.length,
      bodyText: document.body.innerText.slice(0, 300),
    };
  })()`);
  console.log('  page:', JSON.stringify(counts));
  if (errors.length) console.log('  JS ERRORS:', errors.slice(0, 5));

  ws.close();
  chrome.kill();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
