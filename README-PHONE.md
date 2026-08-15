# Palforge on your iPhone — the three buttons

Same system as Stride. Double-click, that's it.

## 📲 One link for everything — open it in Safari on the iPhone

> ### https://palandre99.github.io/Sonsofthesilverstream/palforge/install/

That page gives you both versions and a **Connect to PC** button:

- **Full version** — the complete app at full speed, works on its own, updates
  itself each time you reopen it. This is the one to use normally.
- **Live version (DEV)** — for working sessions. Changes appear while you use
  the app, shake to refresh. Needs `START-APP.cmd` running on the PC.

**Right now they still share one icon slot**, so installing one replaces the
other. That stops as soon as you run `BUILD-DEV.cmd` once (see below) — after
that you can keep both.

**Lost the link?** Double-click `COPY-INSTALL-LINK.cmd`, or just ask Claude —
it's saved in `documents/01_LINKS.md`.

## 1. BUILD-DEV.cmd — run this once now (~15 min)
Builds the **Palforge DEV** app for your phone in Expo's cloud.

**Why you want to run it now:** it makes the live version a genuinely separate
app with its own icon, so installing the full version stops deleting it. After
this build you can keep both on the phone at the same time. Until then, it's
one or the other.
- It asks *"Do you want to log in to your Apple account?"* → type `y`
- Apple ID `palandre99@gmail.com` + your password (+ the 2FA code that pops up on your phone)
- Every other question: just press **Enter**

When it's triggered, watch it here — the **QR code** appears on the build page
when it's done; scan it with your iPhone camera and the app installs:

> https://expo.dev/accounts/palandre99/projects/hatchlab/builds

After the icon is on your phone you never run this again.

## 2. START-APP.cmd — daily driver
Starts the dev server in **tunnel mode: works on WiFi AND 5G**, anywhere.
The moment the URL is ready it's copied to your clipboard, shown in the
window, and saved to `CURRENT-DEV-URL.txt` / `.html` in this folder — open
the Palforge DEV app on the phone and it connects; every change lands live.

**Safe to double-click twice.** If you run START-APP.cmd again (or it was
already running from earlier), the new window takes over and shuts the old
server down by itself. Fixed 2026-08-15: leftover dev servers used to pile up,
hog the PC, and hand you a dead link — the launcher now cleans up on start.
Always use the **newest** window; its URL is the live one.

## 3. Updates are AUTOMATIC — you click nothing
- Connected to the dev server (button 2): changes arrive **live while you
  use the app**, exactly like Stride.
- Otherwise: Claude pushes updates from his side after each work block —
  just close and reopen Palforge and the newest version is there.
- `PUSH-UPDATE.cmd` exists only as an emergency backup if Claude is
  offline and you want to push the latest code yourself.

---
The app itself: Calculator, Route Planner, Odds Lab, Paldex, My Box,
Reference — all breeding math verified against 44,851 results from the
game files. Web version + full docs: `palworld-breeding/`.
