# HatchLab on your iPhone — the three buttons

Same system as Stride. Double-click, that's it.

## 1. BUILD-DEV.cmd — run ONCE (~15 min)
Builds the **HatchLab DEV** app for your phone in Expo's cloud.
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
the HatchLab DEV app on the phone and it connects; every change lands live.

## 3. PUSH-UPDATE.cmd — updates without the PC running
Pushes the latest code over the air. Reopen HatchLab on the phone and it
has the update. For JS changes only (which is nearly everything).

---
The app itself: Calculator, Route Planner, Odds Lab, Paldex, My Box,
Reference — all breeding math verified against 44,851 results from the
game files. Web version + full docs: `palworld-breeding/`.
