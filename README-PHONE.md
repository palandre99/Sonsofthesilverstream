# Palforge on your iPhone — the three buttons

Same system as Stride. Double-click, that's it.

## 📲 The two versions — you can only have ONE at a time

Your iPhone treats them as the same app, so **installing one deletes the
other**. That is why the app "lost its Metro" on 2026-08-15 — the fast link
overwrote the live one. Always check which link you're tapping.

| Version | Link (open in **Safari** on the iPhone) | What it's for |
|---|---|---|
| **DEV — live updates** ⭐ *what you use now* | https://palandre99.github.io/Sonsofthesilverstream/palforge/install-dev/ | Changes appear while you use it. Shake to refresh. Needs START-APP.cmd running. |
| **FAST — standalone** | https://palandre99.github.io/Sonsofthesilverstream/palforge/install/ | Full speed, no PC needed. Updates when you reopen it. |

The DEV page is a 3-step page: install, then tap **Connect to PC**. Nothing
to type. After the first connect the app remembers your PC.

**Lost the link?** Double-click `COPY-INSTALL-LINK.cmd` (fast version), or ask
Claude — both links are stored in `documents/01_LINKS.md`.

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
