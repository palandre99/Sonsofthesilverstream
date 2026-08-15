# TROUBLESHOOTING — symptom → cause → fix

*The CEO is not a developer. When something breaks he describes what he SEES.
This page translates his words into causes so he never has to explain the same
failure twice. Every entry below actually happened — none are hypothetical.*

**Rule for workers: diagnose before you touch anything.** Every incident on
this page was initially misread as "the app is broken" when the app code was
completely fine.

---

## "It just snap opens like a normal app — no shake, no bundling"

**Cause:** the FAST (preview) build is installed. It is a Release build: no
Metro, no dev menu, no shake-to-refresh, by design. Almost always this means a
FAST install link was opened while the DEV app was in use — **installing one
deletes the other** (same bundle id, identical fingerprints, one iOS app slot).

**Fix:** reinstall the DEV app from the install-dev link in `01_LINKS.md`,
with `START-APP.cmd` already running. Then tap **Connect to PC**.

**Prevention:** never send an install link without stating which app it
replaces. This exact mistake cost a full session on 2026-08-15.

---

## "The app doesn't get your updates anymore"

Work through these in order:

1. **Wrong app for the mechanism.** The DEV app updates from Metro (live), the
   FAST app updates from OTA (on reopen). Live changes never appear in FAST
   without an `eas update`; OTA never appears in DEV.
2. **Runtime version drift.** `runtimeVersion` follows `appVersion`. If
   `version` in `app.json` was bumped since the installed build, **OTA updates
   silently stop reaching that build forever**. Check:
   `npx eas-cli build:list` (installed runtime) vs `npx eas-cli channel:list`
   (published runtime). They must match — both are `1.0.0` today.
3. **Only one channel published.** `PUSH-UPDATE.cmd` must publish to
   **both** `development` and `preview`.
4. **He didn't fully reopen.** iOS keeps apps suspended; the update lands on a
   real cold start. Force-quit, reopen.

---

## "The PC is hot / fans screaming / everything is slow"

**Cause:** orphaned Expo dev servers. Metro keeps a file watcher and does not
exit when its window closes, so servers accumulate across sessions.

**Check:**

```powershell
Get-CimInstance Win32_Process -Filter "Name='node.exe'" | Where-Object { $_.CommandLine -like "*palworld*" -and $_.CommandLine -like "*expo*" } | Select-Object ProcessId,@{n='CPU_s';e={[math]::Round($_.KernelModeTime/1e7 + $_.UserModeTime/1e7,0)}}
```

**Fix:** `START-APP.cmd` now clears these automatically on start. To do it by
hand, stop every matching process, then relaunch.

**Prevention:** kill the port-8085 RN-web QA instance when a visual pass ends.
That instance is the usual culprit — it is started for screenshots and then
forgotten.

---

## "START-APP shows a link but the phone won't connect"

- **A stale server owns port 8081.** A second launcher cannot bind it, so the
  URL captured belongs to the OLD server — which may be dead or thrashing.
  Fixed 2026-08-15 by the preflight, but check for duplicates first.
- **Tunnel not up yet.** The banner only prints once the tunnel answers; if
  ngrok stutters the script retries on its own. Watch for `Tunnel ready`.
- **ngrok is down.** https://status.ngrok.com/
- **Verify from the PC** — this is the phone's exact request:

```bash
curl -s -o /dev/null -w "%{http_code}\n" -H "Expo-Platform: ios" https://opqgrdy-palandre99-8081.exp.direct/
```

200 means the tunnel is healthy and the problem is on the phone side.

---

## "`eas update` says Export failed"

Concurrent Metro instances race the export. Retry with no other dev server
running. A direct `npx expo export` always proves whether the code itself is
fine.

---

## "[runtime not ready] SyntaxError" / DOMException on launch

`babel-preset-expo` drifted off the SDK-54 line. It must be **exactly
`54.0.10`**. Reinstall it pinned and rebuild. Use `npx expo install` for Expo
packages, never bare `npm i`.

---

## Post-mortem: 2026-08-15, "the app is broken, no metro stuff"

The most expensive failure so far. Worth reading in full — the pattern will
repeat if the lesson isn't kept.

**What the CEO saw:** the app no longer updated live, there was "no metro
stuff", and he doubted `START-APP.cmd` even ran. He took the project off the
previous worker over it.

**What was actually wrong — two separate faults:**

**Fault 1 — orphaned dev servers.** Three Expo servers were still running from
the night before: the 8081 dev-client tunnel, an 8090 `--go` tunnel, and the
8085 `--web` QA instance. Each was consuming ~2.5 CPU cores — **~7.5 cores
saturated for 11+ hours**, over 100,000 CPU-seconds each. They thrashed Metro
and held port 8081, so a fresh `START-APP.cmd` could not bind it. The launcher
then read the *stale* server's manifest and handed him a URL pointing at a
dying server.

**Fault 2 — the app slot collision.** While diagnosing, the FAST install link
was sent to him. It overwrote his DEV client, removing Metro and shake
entirely. The first fault was real; the second was self-inflicted and made the
symptom worse.

**Fixes shipped (`mobile/scripts/start-dev.js`):**

- `killStaleServers()` preflight — kills leftover Expo servers **scoped to this
  project's directory**, so Stride and Fjelltur dev servers survive.
- A PID lock file (`.dev-server.pid`) so the newest launcher **takes over**
  cleanly. The first attempt at this had a real bug: two launchers
  preflight-killed each other's Metro forever. `stillOwner()` fixes it — a
  superseded launcher exits instead of fighting.
- Manifest scheme validation, so a link for the wrong project can never be
  handed over.
- Ports 8082/8083 added to the poll list.
- A second install page, `/palforge/install-dev/`, so the DEV client can be
  reinstalled login-free, with a one-tap Connect button.

**Verified after the fix:** tunnel manifest 200, iOS bundle 6.5 MB served
through the public tunnel in ~7 s, and a double-launch leaving exactly one
supervisor, one server, one ngrok. CPU back to 6%. The CEO confirmed the DEV
build working the same day.

**Lessons, in priority order:**

1. **Check the machine before blaming the code.** Process list and CPU first.
   The app code was never at fault.
2. **Never hand over an install link without saying what it replaces.**
3. **Servers must clean up after themselves.** "Remember to close the window"
   is not a fix; the launcher enforces it now.
4. **Test the failure mode you just fixed.** Launching twice is what exposed
   the ping-pong bug — reasoning about it alone would have shipped it broken.
