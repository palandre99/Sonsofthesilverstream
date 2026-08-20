# Paldexia on your iPhone — the buttons

Same system as Stride. Double-click, that's it.

## 📲 One link for everything — open it in Safari on the iPhone

> ### https://palandre99.github.io/Sonsofthesilverstream/palforge/install/

That page gives you everything:

- **Full version** — the complete app at full speed, works on its own, updates
  itself each time you reopen it. This is the one to use normally.
- **Live version (DEV)** — for working sessions. Changes appear while you use
  the app, shake to refresh. Needs `START-APP.cmd` running on the PC. Its icon
  has an orange **DEV** badge so you can't mix them up.
- **The website** — same app in a browser, on the PC or anywhere else.

**Both apps can sit on your phone at the same time** (since 15 Aug). Installing
one no longer removes the other.

### Updating the full version does NOT need a build
I push an update, you reopen the app, done — about two minutes. The 15-minute
build is only for changes to the icon, the app name, or phone permissions.

**Claude now publishes every finished piece of work automatically**, so the
full version stays close to current without you asking. When an update has
downloaded, a **"new version ready"** bar appears in the app — one tap and
you're on the newest version.

Two things worth knowing, because they surprise people:

- **Reinstalling from the link does NOT get you newer code.** The download is
  a fixed copy from when the app was last built. New work arrives as an
  update on top of it, not by downloading again.
- **Live coding publishes nothing.** While Claude works, changes stream
  straight to the DEV app only. The full version updates when he finishes a
  piece and publishes it.

**Lost the link?** Double-click `COPY-INSTALL-LINK.cmd`, or just ask Claude —
it's saved in `documents/01_LINKS.md`.

## 1. BUILD-DEV.cmd — you already ran this (15 Aug). Rarely needed again.
Builds the app itself in Expo's cloud (~15 min).

**You only need this for the app's icon, its name, or phone permissions.**
Everything else — new screens, features, fixes — reaches you without a build
(see §3). If Claude asks you to run it, he should tell you exactly why.

- It asks *"Do you want to log in to your Apple account?"* → type `y`
- Apple ID `palandre99@gmail.com` + your password (+ the 2FA code that pops up on your phone)
- Every other question: just press **Enter**

Watch progress here (it needs a login, so it's easier to just ask Claude):

> https://expo.dev/accounts/palandre99/projects/hatchlab/builds

When it finishes, Claude updates the install page and you reinstall from the
one link above — no QR codes, no logins.

## 2. START-APP.cmd — daily driver
Starts the dev server in **tunnel mode: works on WiFi AND 5G**, anywhere.
The moment the URL is ready it's copied to your clipboard, shown in the
window, and saved to `CURRENT-DEV-URL.txt` / `.html` in this folder — open
the Paldexia DEV app on the phone and it connects; every change lands live.

**Safe to double-click twice.** If you run START-APP.cmd again (or it was
already running from earlier), the new window takes over and shuts the old
server down by itself. Fixed 2026-08-15: leftover dev servers used to pile up,
hog the PC, and hand you a dead link — the launcher now cleans up on start.
Always use the **newest** window; its URL is the live one.

## 3. Updates are AUTOMATIC — you click nothing
- Connected to the dev server (button 2): changes arrive **live while you
  use the app**, exactly like Stride.
- Otherwise: Claude pushes updates from his side after each work block —
  just close and reopen Paldexia and the newest version is there.
- `PUSH-UPDATE.cmd` exists only as an emergency backup if Claude is
  offline and you want to push the latest code yourself.

---
The app itself: Calculator, Route Planner, Odds Lab, Paldex, My Box,
Reference — all breeding math verified against 44,851 results from the
game files. Web version + full docs: `palworld-breeding/`.
