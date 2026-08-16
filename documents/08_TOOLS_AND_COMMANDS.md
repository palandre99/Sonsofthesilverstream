# TOOLS & COMMANDS — every command worth knowing

*Verified by running them on 2026-08-15. Paths are relative to
`C:\Users\palan\Desktop\palworld`. The CEO's machine is Windows 11; the shell
is PowerShell, with Git Bash also available — each takes its own syntax.*

---

## Session start — 60 seconds, do this every time

```bash
# 1. no duplicate/shadow files (RULE 0)
find palworld-breeding -type f \( -name "*Copy*" -o -name "*.bak" -o -name "*.broken*" \) -not -path "*/node_modules/*"
#    output MUST be empty

# 2. clean tree, right branch
cd palworld-breeding && git status --porcelain && git branch --show-current
#    expect: claude/palworld-breeding-guide-i9yyuz

# 3. nothing left running from last session
```
```powershell
Get-CimInstance Win32_Process -Filter "Name='node.exe'" | Where-Object { $_.CommandLine -like "*palworld*" -and $_.CommandLine -like "*expo*" } | Select-Object ProcessId
#    expect: nothing. If not, stop them before doing anything else.
```

```bash
# 4. IS THE CEO'S FULL APP BEHIND? — the last publish vs. the last mobile commit
cd palworld-breeding/mobile && npx eas-cli channel:list --non-interactive | grep -A1 "Branch *preview"
cd ../.. && git log -1 --format='%h %ad %s' --date=short -- palworld-breeding/mobile/src
#    If the newest mobile work is NOT on the CEO's phone, publishing it is your
#    first job. His full app going stale is the failure this check exists to
#    catch — it happened on 2026-08-15 and he noticed before we did.
```

## The quality gates — all green before "done"

```bash
cd palworld-breeding/app    && npx vitest run      # 278 tests, 18 files, ~11s
cd palworld-breeding/app    && npm run build       # tsc -b + vite + service worker
cd palworld-breeding/mobile && npx tsc --noEmit    # native typecheck, must be 0 errors
```

Last verified 2026-08-16: **278/278 passing**, mobile typecheck **clean**.

Tests live in `app/tests/`:

| File | Covers |
|---|---|
| `oracle.test.ts` | the 44,851-row replay — the one that matters |
| `odds.test.ts` | passive/IV probability model |
| `odds-ui.test.tsx`, `paldex-ui.test.tsx`, `plan-ui.test.tsx` | UI behaviour |

There is **no mobile test harness yet** — it is in `AI_TODO.md`. Mobile is
covered only by `tsc` plus eyes-on verification.

## Running the app

```bash
# phone (tunnel) — what the CEO double-clicks as START-APP.cmd
cd palworld-breeding/mobile && node scripts/start-dev.js

# website dev server
cd palworld-breeding/app && npm run dev

# the app rendered in a browser for VISUAL QA (react-native-web)
cd palworld-breeding/mobile && npx expo start --web --port 8085 --clear
```

⚠️ **Stop the 8085 instance when the visual pass ends.** Forgetting this is
the documented cause of the 2026-08-15 outage. `start-dev.js` now clears
stragglers on launch, but don't rely on it.

Prove the phone bundle actually compiles — this is the phone's exact request:

```bash
curl -s -o /dev/null -w "%{http_code}\n" "http://127.0.0.1:8081/index.ts.bundle?platform=ios&dev=true&transform.engine=hermes"
```

## Shipping to the phone

**Publishing is mandatory after every finished item** — see the publish ritual
in `CLAUDE.md`. The full app changes ONLY when someone runs this; reinstalling
it does nothing, because the download is a fixed binary from build time.

Pre-flight, every time:

```bash
git status --porcelain          # MUST be free of work that isn't yours —
                                # eas update bundles whatever is on disk
cd palworld-breeding/app    && npx vitest run     # 278/278
cd ../mobile                && npx tsc --noEmit   # clean
```

```bash
cd palworld-breeding/mobile

# OTA (JavaScript only) — BOTH channels, always
npx eas-cli update --branch development --message "what changed"
npx eas-cli update --branch preview     --message "what changed"

# CONFIRM it landed — both channels must show your message and a fresh time
npx eas-cli channel:list        # channel → branch → runtime → last update
npx eas-cli build:list --limit 5

# full rebuild (native/icon/permission changes) — needs his Apple login
npx eas-cli build --profile development --platform ios
```

`EXPO_TOKEN` is a user-level Windows env var, so the CLI is already
authenticated for everything **except** creating iOS credentials.

If `eas update` reports **"Export failed"**, a second Metro is racing it.
Retry with nothing else running; `npx expo export` proves the code is fine.

## Data pipeline (`palworld-breeding/tools/`, Python 3 stdlib)

Run after a game patch, then run the oracle — it exposes any mechanic change.

| Script | Does |
|---|---|
| `extract_from_kb.py` | pals + breeding combos from a fresh `beliarance/palworld-kb` clone |
| `extract_passives.py` | the 114 passives with tiers/exclusivity |
| `extract_region_spots.py` | spawn regions → `data/regionSpots.g.ts` |
| `extract_alpha_spots.py` | alpha locations → `data/alphaSpots.g.ts` |
| `fetch_paldex_text.py` | in-game Paldex descriptions (wiki.gg) |
| `fetch_paldex_text_missing.py` | re-fetch only the gaps — run weekly (27 pals still missing) |
| `validate_against_palcalc.py` | cross-check the engine against palcalc |

Files ending `.g.ts` are **generated**. Never hand-edit them.

## Deploying the website + install pages

No CI deploys Pages — it updates only when someone pushes to `main`.
**Pushing to `main` needs the CEO's explicit go-ahead** (asked and granted
2026-08-15 for the install pages).

```bash
cd palworld-breeding && git fetch origin main
git worktree add -B deploy <temp-path> origin/main
#   copy the changed files into <temp-path>/palforge/...
#   commit, then:
git push origin deploy:main
git worktree remove --force <temp-path>
```

Then re-fetch the live URL and confirm HTTP 200 before telling him it's done.
Never touch `main`'s root `index.html` — that is his separate live site.

## Environment facts that cost time to rediscover

- **Python 3.12.10 is installed and on PATH** as `python`, `python3` and `py`
  (verified 2026-08-15). The `tools/` scripts run directly; they need only the
  standard library.
- **Heredocs in Bash mangle `\x` and newline escapes on this machine.** Write
  patch scripts with the editor, never inline heredocs for code with escapes.
- **PowerShell 5.1**: no `&&`/`||` chaining, no ternary. Use `;` and `if ($?)`.
- `taskkill /PID <id> /T /F` kills a whole process tree — needed for Metro,
  which spawns a dozen jest-workers plus ngrok.
