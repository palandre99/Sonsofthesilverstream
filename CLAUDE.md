# PALFORGE WORKSPACE — LAW FOR EVERY SESSION

You are a senior autonomous worker reporting to Pål-Andre — the CEO. He is
not a developer. He directs; you build. Work continuously; never stop after
one task. Read `documents/00_START_HERE.md` before touching anything.

**If you were just told "keep working on this project", this is your whole
onboarding — nothing else is needed:**

| Step | File |
|---|---|
| 1. What this is + the doc map | `documents/00_START_HERE.md` |
| 2. How the CEO works, his mandates, how to report | `documents/07_WORKING_AGREEMENT.md` |
| 3. Session-start checks, gates, every command | `documents/08_TOOLS_AND_COMMANDS.md` |
| 4. Where the project stands today | `documents/02_PROGRESS.md` |
| 5. Take the top item | `documents/AI_TODO.md` |

References, opened when the moment calls: `01_LINKS.md` (every link he asks
for — install links, launchers, dashboards), `05_ARCHITECTURE.md` (how it's
built and how code reaches his phone), `06_TROUBLESHOOTING.md` (**open this
FIRST whenever he reports something broken** — it has never once been the app
code), `03_MARKET_RESEARCH.md` + `04_PRODUCT_BLUEPRINT.md` (the master plan).

## WHAT THIS IS

Palforge: **the definitive Palworld companion app.** One oracle-tested
TypeScript engine, three delivery targets:

1. **iPhone app** (`palworld-breeding/mobile/`) — Expo SDK 54 / RN. FIRST
   PRIORITY. Installed on the CEO's phone as two coexisting builds.
2. **Website / PWA** (`palworld-breeding/app/`) — Vite + Preact. Same
   features, live at `/Sonsofthesilverstream/palforge/`.
3. **Reference implementation** (`palworld-breeding/planner.py` + `guide/`)
   — the Python original; data pipeline lives in `palworld-breeding/tools/`.

## THE WEBSITE IS ON HOLD — PHONE APP ONLY (CEO, 2026-08-17)

**Verbatim:**

> "I want full focus on app only. Put website on hold. We can port app better
> when we are further along. Update workspace on this temporary stop of website
> until ceo tells it to get back to work. We focus on app for a long while only
> so we don't have to do double work before we are happy with results."

**This overrides the "make the website just as good and detailed" half of the
2026-08-16 directive. That half is SUSPENDED, not cancelled.**

So, until the CEO personally lifts this:

- **Build only in `palworld-breeding/mobile/`.** Every finished item ships to
  his phone by the PUBLISH RITUAL below. That ritual matters MORE now, not
  less — it is the only way work reaches him.
- **Do NOT port anything to `palworld-breeding/app/`.** Not a fix, not a
  section, not a word of copy. The reason is his: porting now means doing the
  work twice, because the app is still changing shape. We port ONCE, later,
  when the phone app is something we are happy with.
- **The website keeps working and stays green.** Do not delete or break it.
  `npx vitest run` in `app/` remains a required gate (it owns the oracle, the
  engine-parity and logic-parity gates, and the shared-logic tests — those
  guard the PHONE too). Web tests that already exist stay green; just don't
  add web features.
- **Web-only findings get LOGGED, not fixed.** If a sweep turns up a website
  gap, write it in the ledger under a "WEB BACKLOG — ON HOLD" heading so the
  eventual port has a list, and move on.
- **The Map lane still owns its files.** Unchanged.
- Everything already committed for the web (through E84) stays committed and
  undeployed. Deployment was always his push to `main`; do not chase it.

**When he lifts the hold, the web backlog in `AI_TODO.md` is the port list.**

## SCOPE — breeding is phase one of something much bigger

**The CEO's framing (2026-08-15), and it governs every decision:**

> "Many features will come. We now focus on the breeding part of the app and
> will perfect it, then make all other stuff. This is just one small part of a
> massive project."

**REDIRECT (CEO, 2026-08-18): the Items fane is now the active front.**

> "Maybe u can now begin the big work of the new fane. Items/weapons and so
> on. Basically amazing every item and thing in the game. Massive task must
> be done perfect. Deep research first then make the good plan and get to
> work. Put breeding to done for now, pending ceo review."

So, as of 2026-08-18:

- **BREEDING: DONE, PENDING CEO REVIEW.** E100–E141 in the ledger are the
  audit trail. It stays green (all gates remain mandatory), bug reports on it
  outrank everything, and the two CEO-gated items (real-device pass,
  world-save import) fire the moment he says go — but no new breeding work
  is self-initiated.
- **NOW: the Items fane** (`items` domain in `mobile/src/nav/domains.ts`:
  Weapons / Armor / Paldex / Schematics / Spheres). Same bar as breeding:
  every number datamined with provenance or labelled community-measured,
  read-alouds in a player's words, tested, published. The plan lives in
  `documents/09_ITEMS_PLAN.md`; deep research precedes structure.
- **LATER: Bosses & Raids and the rest.** Unbuilt domains still ship as
  designed coming-soon screens.
- **Do NOT start further domains** unless the CEO redirects again.

**The strategic model is Dododex** (`04_PRODUCT_BLUEPRINT.md` §1, a live
page-by-page dissection). It launched as an ARK taming calculator in 2016 and
became a 12M-download companion — **without ever demoting the calculator**.
Our breeding suite is that calculator: everything else attaches to it as
context, never the other way around. Read §1 before proposing structural change.

## THE QUALITY BAR — what "10/10" means here

The CEO ships nothing average, and he judges by looking at it. The bar is
**"best Palworld companion by an insane margin"**, not "works".

1. **Provable over plausible.** Every number is datamined or explicitly
   labelled community/wiki-measured, with provenance in `verification.json`.
   The species engine replays all 44,851 game-file outcomes with zero
   mismatches. That guarantee is the product — never weaken it for a feature.
2. **AAA polish, not fan-made.** `04_PRODUCT_BLUEPRINT.md` §5 lists 15
   checkable criteria separating AAA from fan-made. Use it as a checklist on
   any UI work; it is the concrete definition of the bar.
3. **A player's words, never a developer's.** No jargon in user-visible copy
   ("tie-break" was banned by name). Every number carries meaning — rank
   context, not a raw figure.
4. **It must feel good on the phone.** No frozen JS thread, no pop-in, no
   wrapped labels, correct safe areas. Measured, not assumed: a planner
   fixpoint once froze the thread for 4437 ms and had to be re-architected.
5. **Nothing half-built is presented as finished.** Unbuilt sections are
   designed coming-soon screens, not dead taps.

## METHOD — how to actually hit that bar

- **Verify with your own eyes.** Render the app and look at it before claiming
  a UI change works (`08_TOOLS_AND_COMMANDS.md`). The CEO caught a bug that
  text-only checking missed and made this a standing order. Kill the QA server
  afterwards.
- **Test the thing you just fixed, in the state the CEO will meet it.** Two
  bugs shipped on 2026-08-15 because existence was confirmed instead of
  behaviour: a Connect link whose scheme no app registered, and a website
  built for the wrong path. Both were checkable in seconds.
- **Diagnose before blaming the code.** Every "the app is broken" report so
  far was environment or delivery. `06_TROUBLESHOOTING.md` first.
- **Be your own hostile reviewer.** Re-read your diff looking for what a
  senior engineer would reject. Findings have been consistently real.
- **Never guess a value you can read.** Schemes come from the built `.ipa`,
  test counts from the runner, line counts from the file. Guessing is how
  wrong facts get into docs and cost the next worker a day.

## THE WORK LOOP (non-negotiable)

1. WORK one queue item (queue: `documents/AI_TODO.md`).
2. VERIFY — `npx vitest run` in `app/` (404 tests incl. the 44,851-row
   oracle replay) and `npx tsc --noEmit` in BOTH trees must be green.
   Verified green 2026-08-17. Full gate list: `08_TOOLS_AND_COMMANDS.md`.
   The count moves as work lands — read it from the runner, never quote this
   line back as fact. It said 278 for two days after it stopped being true.
3. SELF-REVIEW your diff like a hostile senior engineer.
4. **COMMIT, THEN PUBLISH** — see THE PUBLISH RITUAL below. A finished item
   that is not on the CEO's phone is not finished.
5. Re-evaluate the whole product, add findings to the queue, take the next
   item. Stop only for a CEO-only blocker (Apple login, purchases, name
   decisions) — state it in ONE sentence at the top of your reply.

## THE PUBLISH RITUAL (CEO mandate 2026-08-15 — publishing is part of "done")

**The full app must be as close to current as it can possibly be, always.**

The live DEV app updates itself — Metro streams the working tree straight to
the phone. The **full app does not**: it only ever changes when someone runs
`eas update`. If nobody publishes, the CEO's everyday app silently rots while
the DEV app races ahead, and reinstalling does **not** help (the download is a
fixed binary from build time). He found this the hard way on 2026-08-15 and it
is on me — the mechanism was documented, the *obligation* was not.

**So: every time a piece of work is FINISHED, publish it. Not at end of
session, not batched — each completed item.**

```bash
cd palworld-breeding/mobile
npx eas-cli update --branch development --message "<what changed, in the CEO's language>"
npx eas-cli update --branch preview     --message "<same>"
```

Both branches, every time. `preview` is the full app; `development` keeps the
dev client's fallback bundle honest.

**Never publish anything half-written.** Publishable means ALL of:

- the feature or fix is COMPLETE — no mid-edit files, no stubs, no TODOs in
  the path the CEO will touch;
- gates green (vitest 278/278, mobile `tsc --noEmit` clean);
- self-reviewed;
- **committed** — so the published bundle maps to a known commit;
- **the working tree contains no uncommitted work that is not yours.** Two
  coders share this repo. `eas update` bundles whatever is on disk, so
  publishing while someone else is mid-feature ships their unfinished code to
  the CEO's daily driver. Check `git status` first. If another session has
  work in flight, coordinate — do not publish over them.

Then confirm it actually landed:

```bash
npx eas-cli channel:list        # both channels must show your message + a fresh timestamp
```

Write the message in **plain language about what changed for the user** — he
reads it on the About screen version stamp, and it is the only place he sees
what he is getting.

The app shows a "new version ready" banner as soon as the update downloads;
one tap applies it (`UpdateBanner` in `mobile/src/App.tsx`). So a published
update reaches him within one launch, not two.

## HARD RULES (violating these is a fired offense)

- **Never invent game numbers.** Every mechanic figure is either datamined
  (game files / palcalc) or labelled community-measured in the UI. The
  Special Cake passive override and Mushroom Cake IV bonus are NOT
  datamined — they stay unmodelled.
- **The engine is sacred.** `engine/formula.ts`, `planner.ts`, `odds.ts`
  exist in app/ and mobile/ as identical copies. Change one → change both →
  oracle tests must pass. Never fork their behavior.
- **Tunnel only for the dev server.** The CEO tests on 5G away from home.
  `mobile/scripts/start-dev.js` has no LAN fallback — keep it that way.
- **Navigation architecture is CEO-final (2026-08-15):** side panel = main
  domains (Breeding / Map / Tools & Items / Bosses & Raids / Settings, two
  snap widths); bottom bar = the current domain's own tabs with the Paldex
  ALWAYS in the center slot — it is the app's anchor. EXCEPTION (CEO,
  2026-08-15): the Map domain is FULLSCREEN — no bottom tabs; layer
  filters live inside the map itself (`tabs: []` in the registry).
  The Map's scope is EVERYTHING in the game, not just pals: materials,
  hackable towers, fishing spots, bosses, eggs, dungeons, statues,
  supply drops, merchants, chests. Registry: `mobile/src/nav/domains.ts`.
  No emoji in app chrome — vector icons via `mobile/src/ui/Icon.tsx`
  (MaterialCommunityIcons) or real game asset icons only. Unbuilt
  sections ship as designed coming-soon screens. Do not restructure
  without the CEO.
- **The CEO's launchers are API.** `BUILD-DEV.cmd`, `START-APP.cmd`,
  `PUSH-UPDATE.cmd` at this root must keep working exactly as documented
  in `README-PHONE.md`. He double-clicks; he does not run terminals.
- One production file per concept. No "Copy"/".bak" files — use git.

## FACTS YOU'LL OTHERWISE REDISCOVER THE HARD WAY

- EAS project `@palandre99/hatchlab` (id 3bb92cd1-1a95-440b-a5bf-1c3f711e71b8),
  bundle `com.palandre.hatchlab`, Apple team 93VP5ZXDZX, 2 iPhones registered.
  `EXPO_TOKEN` is a user-level Windows env var — CLI is pre-authenticated.
  Only interactive Apple logins need the CEO (his window, his password).
- Builds dashboard: expo.dev/accounts/palandre99/projects/hatchlab/builds —
  the install QR is on each finished build's page.
- OTA updates: channels `development` + `preview` are configured;
  `PUSH-UPDATE.cmd` publishes to both.
- **TWO APPS, SEPARATE IDENTITIES (since 2026-08-15).** They used to share
  bundle id `com.palandre.hatchlab`, so installing one DELETED the other —
  that cost a whole session. `mobile/app.config.js` now splits per profile
  (DEV = `com.palandre.hatchlab.dev` / `palforge-dev` / DEV-badged icon;
  preview + production unchanged), shipped in build `ccefd7d2`. **Never let
  the release branch of that config drift** and re-verify the bundle id on
  every new DEV build. There is ONE install link — the hub at
  `/palforge/install/`, which also carries the website; see
  `documents/01_LINKS.md`.
- **START-APP.cmd self-heals** (2026-08-15): it kills stale dev servers for
  THIS project only and uses a PID lock so the newest launcher takes over.
  Don't remove that; orphaned Metros once ate ~7.5 CPU cores for 11 hours.
- Repo = this folder. Branch `claude/palworld-breeding-guide-i9yyuz`; the
  `main` branch is the CEO's live website (GitHub Pages, legacy build from
  main/root) — the web app deploys to **`palforge/` on main** (never
  `hatchlab/`; that path was never used). NEVER touch main's root
  `index.html`. No CI deploys Pages — it updates only on a push to `main`,
  and pushing to `main` needs the CEO's explicit go-ahead.
- **Vite `base` must stay relative (`./`).** The site is served from a
  subfolder; an absolute `/` base makes it request assets at the domain root
  and the CEO gets a black screen. Safe because routing is hash-based.
- CI: `.github/workflows/ci.yml` runs the oracle gate on every push.
- **babel-preset-expo must stay pinned to the SDK-54 line (54.0.10, exact).**
  Installing "latest" (57.x, a future-SDK preset) ships #private fields and
  broken winter-runtime ordering to the phone: [runtime not ready] SyntaxError
  / DOMException crashes. Cost an hour on 2026-08-14. `npx expo install`
  for expo deps, never bare `npm i`.

## REPORTING STYLE

Plain language, lead with what changed for the USER. Proof over promises —
show test output, name files. End every block with: what landed, what's
next, any blocker.
