# Palforge on your iPhone — the three buttons

Same system as Stride. Double-click, that's it.

## ⚡ NEW (2026-08-15): the FAST app — install this one
The dev app runs debug code through an internet tunnel, which is why images
and screens feel slow. The **FAST version** is a near-release build: full
speed, images bundled on the phone, and it still gets every update
automatically when you reopen it. Install it once from your iPhone:

> open `PALFORGE-FAST-INSTALL.html` (in this folder) on the phone, or go to
> https://palandre99.github.io/Sonsofthesilverstream/palforge/install/

Keep both: **Palforge (fast)** for daily testing, **Palforge DEV** for
live-coding sessions with START-APP.cmd.

**Lost the link?** Double-click `COPY-INSTALL-LINK.cmd` — the install URL
lands straight in your clipboard (kept pointing at the newest build).

## 1. BUILD-DEV.cmd — run ONCE (~15 min)
Builds the **Palforge DEV** app for your phone in Expo's cloud.
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
