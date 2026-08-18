# RENAME → PALDEXIA — what is done, what waits for a build

*CEO decision 2026-08-18: the product is **Paldexia** (the domain is available).
"Palforge" is the previous name. This page is the whole rename: what already
shipped, what is deliberately parked until the next build, and the exact steps
to finish it. Nothing here is speculative — every item was checked in the repo
on 2026-08-18.*

---

## Rule of thumb: text inside the app is free, the app's identity is not

| Layer | Changes how? | Status |
|---|---|---|
| Words **inside** the app | JavaScript → ships by OTA | ✅ **DONE** |
| The **label under the icon** on the home screen | native, baked into the build | ⏸ needs a rebuild |
| URL scheme, bundle id | native, baked into the build | ⏸ / never (see below) |
| App icon artwork | native — but our mark carries **no text**, so nothing to change | ✅ nothing to do |
| Website + domain | a deploy | ⏸ website is ON HOLD (CEO 2026-08-17) |

## ✅ Already done (no build needed, reaches him on the next publish)

Every user-visible "Palforge" string in the phone app is now "Paldexia":

- `ui/DomainPanel.tsx` — the side-panel header, the most visible one
- `screens/SettingsScreens.tsx` — the About heading
- `screens/ReferenceScreen.tsx` — "Paldexia is a fan project…"
- `screens/CalculatorScreen.tsx` + `screens/PlannerScreen.tsx` — the footer
  stamped onto exported/copied plans

Mobile `tsc --noEmit` clean after the change.

One occurrence was left alone on purpose: the header **comment** at the top of
`mobile/src/App.tsx`. That file was mid-edit by the Items/Bosses lane at the
time; it is a code comment, invisible to users. Rename it whenever that file is
next touched.

## ⏸ Waits for the next build — the home-screen label

The icon label still reads **Palforge** / **Palforge DEV** because it comes from
`name` in `mobile/app.json` (full) and `mobile/app.config.js` (DEV). Those are
compiled into the binary; no OTA can touch them. Do it as part of the next build
that is happening anyway — do **not** burn a 15-minute build on the label alone
unless the CEO asks.

When that build comes, change exactly these two lines:

```
mobile/app.json        "name": "Palforge"      →  "name": "Paldexia"
mobile/app.config.js   name: 'Palforge DEV'    →  name: 'Paldexia DEV'
```

Then follow the normal build ritual, and afterwards update both install
manifests, the hub footer build ids, and `01_LINKS.md` in the same commit.

## ⛔ Do NOT rename these — they are identifiers, not names

Changing any of these costs far more than it buys:

- **Bundle ids** `com.palandre.hatchlab` and `com.palandre.hatchlab.dev`.
  A new bundle id is, to iOS, **a different app**: the CEO would lose his saved
  box, plans and profiles (storage is per-app), both old apps would sit orphaned
  on his home screen, and it needs fresh Apple credentials via his interactive
  login. The display name can change freely while the bundle id stays — that is
  the whole point of doing it this way.
- **EAS slug** `hatchlab` / project `@palandre99/hatchlab`. Dashboard-only, and
  renaming risks breaking update delivery for installed apps.
- **URL schemes** `palforge` / `palforge-dev`. They work, and the installed apps
  answer to them. If they are ever changed, the install hub's Connect button and
  `scripts/start-dev.js` must change in the **same commit**, or Connect silently
  breaks — that exact failure cost a session on 2026-08-15.
- **The Pages path** `/palforge/`. Changing it breaks the install links the CEO
  has saved and every link handed to him in chat.

Precedent: "HatchLab" was renamed to "Palforge" the same way — the old name
still lives in these identifiers, and that is fine. **A product name and an
identifier are different things; only the first is user-facing.**

## ⏸ Website and the domain

`paldexia.com` is the reason for the rename, but the **website is on hold**
(CEO, 2026-08-17 — phone app only until he lifts it). When he does:

- retitle the PWA (`app/index.html` `<title>`, `manifest.webmanifest` name)
- decide whether the domain points at the existing Pages path or a fresh deploy
- the install hub and `01_LINKS.md` links change with it

Log it, don't build it — that is the standing rule while the hold is on.

## Checklist when the CEO green-lights the build

1. `app.json` + `app.config.js` name lines (above) — nothing else in them
2. `mobile/src/App.tsx` header comment, if still unrenamed
3. `BUILD-DEV.cmd` for the DEV app; a `preview` build for the full app
4. Verify identity from the built `.ipa` before announcing anything —
   `CFBundleDisplayName` should read Paldexia / Paldexia DEV and
   `CFBundleIdentifier` must be **unchanged** (command in `01_LINKS.md`)
5. Update both `manifest.plist` files (`title`), and the install hub
   (`app/public/install/index.html`: page title, both card headings, footer
   build ids), then `01_LINKS.md` and `README-PHONE.md`
6. Redeploy Pages, re-fetch both install pages, confirm HTTP 200
7. Publish an OTA to both channels so the JS matches the new binaries
