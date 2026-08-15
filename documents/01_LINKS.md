# LINKS — everything the CEO ever asks for, in one place

*If the CEO says "give me the link", "send me the app", or "where do I
install it" — the answer is on this page. Keep it correct; a stale link here
wastes his time and he has to explain himself again. Last verified
2026-08-15 (all links fetched and confirmed live).*

---

## 📱 Install the app on the iPhone

**There is ONE link. Send him this:**

> ## https://palandre99.github.io/Sonsofthesilverstream/palforge/install/

Login-free, hosted on our own site. It must be opened **in Safari** — iOS
refuses `itms-services` installs from Chrome. It is a hub offering both
versions plus a one-tap **Connect to PC**:

| On the page | What it is |
|---|---|
| **Install full version** | Standalone release build. No PC needed, updates on reopen via OTA. His normal app. |
| **Install live version** + **Connect to PC** | Dev client. Changes appear while he uses it, shake to refresh. Needs `START-APP.cmd` running. |
| **Open the website** | The PWA at `/palforge/` — same app in a browser, offline-capable, shareable. |

`/palforge/install-dev/` forwards here — that URL was handed to him in chat on
2026-08-15, so **keep it alive, never delete it**. Its `manifest.plist` is
still the live DEV manifest and must stay where it is.

### ✅ The two apps coexist — RESOLVED 2026-08-15

Both profiles used to produce the same app (`com.palandre.hatchlab`, name
"Palforge", identical fingerprints), so **installing one deleted the other**.
The FAST link was sent to the CEO while he was using DEV; it wiped his dev
client and he reasonably reported the app as broken. That failure mode is now
gone.

`mobile/app.config.js` splits the identity per profile, and DEV build
`ccefd7d2` (2026-08-15 15:11) ships it. Verified by unpacking the `.ipa` and
reading its `Info.plist`:

| | Full | Live |
|---|---|---|
| Bundle id | `com.palandre.hatchlab` | `com.palandre.hatchlab.dev` |
| Name on phone | Palforge | Palforge DEV |
| Scheme | `palforge` | `palforge-dev` |
| Icon | sphere | sphere + orange DEV band |

**When making a new DEV build, re-verify the identity** — a config slip that
reverts the bundle id silently reintroduces the app-deleting bug:

```bash
python -c "import zipfile,plistlib,re; z=zipfile.ZipFile('dev.ipa'); \
i=[n for n in z.namelist() if re.match(r'Payload/[^/]+\.app/Info\.plist$',n)][0]; \
p=plistlib.loads(z.read(i)); print(p['CFBundleIdentifier'], '|', p.get('CFBundleDisplayName'))"
```

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

Current builds (iOS, runtime 1.0.0):

- **DEV** `ccefd7d2-8115-47ad-8d97-6ce33bc3a013` — development channel, commit
  `4bc1d87`, bundle `com.palandre.hatchlab.dev`, fingerprint `c9602f41…`
- **FAST** `0bd4b937-1112-4df8-8c42-f8b952613a70` — preview channel, commit
  `ae82595`, bundle `com.palandre.hatchlab`, fingerprint `06b76851…`

---

## 🔁 Ritual when a NEW build finishes

A new build changes the `.ipa` URL, so the install pages go stale instantly.
In the **same commit**:

1. `app/public/install/manifest.plist` — new FAST `.ipa` URL + version
2. `app/public/install-dev/manifest.plist` — new DEV `.ipa` URL + version
   (and its `bundle-identifier` becomes `com.palandre.hatchlab.dev` from the
   next DEV build onward)
3. `INSTALL-LINK.txt` + `PALFORGE-FAST-INSTALL.html` at the root
4. Build ids in the hub page footer, in this file, and in `README-PHONE.md`
5. Deploy: copy the changed files into a `main` worktree and push — **there is
   no CI for Pages**, it only updates when someone pushes to `main`.
   Pushing to `main` needs the CEO's explicit go-ahead.

Then re-fetch both install pages and confirm HTTP 200 before telling him.
