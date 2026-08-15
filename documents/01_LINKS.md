# LINKS — everything the CEO ever asks for, in one place

*If the CEO says "give me the link", "send me the app", or "where do I
install it" — the answer is on this page. Keep it correct; a stale link here
wastes his time and he has to explain himself again. Last verified
2026-08-15 (all links fetched and confirmed live).*

---

## 📱 Install the app on the iPhone

Both pages are **login-free** and hosted on our own site. Open them **in
Safari on the iPhone** — iOS refuses `itms-services` installs from Chrome.

| Which | Link | What it is |
|---|---|---|
| **DEV — live updates** ⭐ | https://palandre99.github.io/Sonsofthesilverstream/palforge/install-dev/ | Connects to the PC. Code changes appear while you use it, shake to refresh. **This is what the CEO runs today.** |
| **FAST — standalone** | https://palandre99.github.io/Sonsofthesilverstream/palforge/install/ | Full-speed release build. No PC needed. Updates on reopen via OTA. |

### ⚠️ ONE APP SLOT — read before sending either link

Both builds share the bundle id `com.palandre.hatchlab` and the name
"Palforge", and their EAS fingerprints are **identical**. iOS therefore
treats them as the same app: **installing one silently deletes the other.**

This is not a bug report, it is the current reality. On 2026-08-15 the FAST
link was sent to the CEO while he was using DEV; it overwrote his dev client,
Metro/shake/live-reload vanished, and he reasonably reported the app as
broken. **Never send an install link without saying which app it replaces.**

Making them coexist requires a dynamic `app.config.js` (per-profile bundle id
+ name), a fresh EAS build, and the CEO's interactive Apple login once. Not
done yet — it is in `AI_TODO.md`.

---

## 💻 The three launchers (workspace root, double-click)

The CEO does not use terminals. These four files are the entire interface.

| File | What it does | When |
|---|---|---|
| `START-APP.cmd` | Starts the Metro dev server in **tunnel mode** (works on 5G). Prints + copies the connect URL. | Every live-coding session. Leave the window open. |
| `PUSH-UPDATE.cmd` | Publishes an OTA update to **both** channels (`development` + `preview`). | To update the FAST app without a rebuild. |
| `BUILD-DEV.cmd` | Full EAS cloud build (~15 min). Needs his Apple login. | Only for native/icon/permission changes. |
| `COPY-INSTALL-LINK.cmd` | Puts the FAST install URL on the clipboard. | When he wants the link on the PC. |

**START-APP.cmd is safe to double-click twice** — since 2026-08-15 the newest
window takes over and shuts the older server down. Always use the newest
window; its URL is the live one.

---

## 🔌 Dev server connect URL

The ngrok tunnel hostname has been **stable across every restart**, so the
DEV install page carries a one-tap "Connect to PC" button using it:

```
https://opqgrdy-palandre99-8081.exp.direct
```

Deep link (what the button fires):

```
exp+palforge://expo-development-client/?url=https%3A%2F%2Fopqgrdy-palandre99-8081.exp.direct
```

It is also written to `CURRENT-DEV-URL.txt` / `.html` at the workspace root
and copied to the Windows clipboard every time `START-APP.cmd` runs. **If the
hostname ever changes, the live one is whatever START-APP.cmd printed** —
update the install-dev page in the same work block.

---

## 🛠 Build & project dashboards

| Thing | Link / value |
|---|---|
| EAS builds | https://expo.dev/accounts/palandre99/projects/hatchlab/builds |
| EAS project | `@palandre99/hatchlab` — id `3bb92cd1-1a95-440b-a5bf-1c3f711e71b8` |
| Repo | https://github.com/palandre99/Sonsofthesilverstream |
| Working branch | `claude/palworld-breeding-guide-i9yyuz` |
| Live website | https://palandre99.github.io/Sonsofthesilverstream/palforge/ |
| Bundle id | `com.palandre.hatchlab` · Apple team `93VP5ZXDZX` |

Current builds (iOS, runtime 1.0.0, both from commit `ae82595`):

- **DEV** `654fe7fb-1a2a-4d10-97b8-adcff9a9d945` — development channel
- **FAST** `0bd4b937-1112-4df8-8c42-f8b952613a70` — preview channel

---

## 🔁 Ritual when a NEW build finishes

A new build changes the `.ipa` URL, so the install pages go stale instantly.
In the **same commit**:

1. `app/public/install/manifest.plist` — new FAST `.ipa` URL + version
2. `app/public/install-dev/manifest.plist` — new DEV `.ipa` URL + version
3. `INSTALL-LINK.txt` + `PALFORGE-FAST-INSTALL.html` at the root
4. Build ids in this file and in `README-PHONE.md`
5. Deploy: copy the changed files into a `main` worktree and push — **there is
   no CI for Pages**, it only updates when someone pushes to `main`.
   Pushing to `main` needs the CEO's explicit go-ahead.

Then re-fetch both install pages and confirm HTTP 200 before telling him.
