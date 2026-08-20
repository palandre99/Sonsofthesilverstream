# 04 — PRODUCT BLUEPRINT: From Breeding Tool to the Definitive Palworld Companion

*Round 2 of competitive research, compiled 2026-08-15. Round 1
(`03_MARKET_RESEARCH.md`) mapped the Palworld tool market; this document mines
the best companion apps **in other games** for design, information
architecture, and the growth path from single tool → full companion. ~30 new
sources this round (all in §8), including a live page-by-page dissection of
Dododex — the single best precedent for what Palforge should become.*

*Rule for this document: every recommendation names the app that proves it.*

---

## 0. The one-paragraph thesis

Dododex started as an ARK taming calculator in January 2016 and is now a
12M-download, 4.9★ (50K+ ratings) full companion — and it never demoted the
calculator: ten years later the calculator is still the first thing on every
creature page, and the whole database hangs *off* it. That is the Palforge
play, mapped 1:1: our breeding suite is the calculator; the Paldex, items,
tracking, profiles, and map data attach to it as context — never the other way
around. Everything below is the concrete spec for doing that at AAA quality on
an iPhone, with the specific app that proves each choice.

---

## 1. The Dododex dissection (read this first — it is the blueprint)

Fetched live 2026-08-15 (dododex.com home, nav menus, the Rex page, the All
Creatures browse page) plus App Store listing, help center, and Product Hunt
history.

**History:** launched Jan 7, 2016 as a taming calculator by one person (Dan
Leveille, React Native side project); integrated into ARK Mobile itself by
2019; "updated weekly since 2016"; today covers three game versions (ASA /
ASE / Ultimate Mobile Edition) and every DLC map. The co-founder of ARK
publicly endorses it on their homepage. That is the end-state: so good the
game studio treats you as infrastructure.

**Web IA is three menus plus search.** Header: persistent search box
("Search creatures & items") + `Creatures ▾` + `Items ▾` + `More ▾`
(More = Breeding Calculator, Stat Calculator, Admin Commands, Official Server
Rates, Stories). That's it. The entire 200-creature encyclopedia is reachable
from search or two dropdowns. Lesson: **section count is not nav count.**

**The creature page is the masterclass.** The Rex page, top to bottom:
1. Title + **game-version badges** (✔ ASA ✔ ASE ✔ UME) — added as a
   headline feature in v2.8. Every entity declares what game build it's true
   for.
2. Sub-tabs: Taming Calculator | Tips | Stat Calculator | Spawn Command.
   **The calculator is the first tab, always.**
3. Calculator block: level input → server-rate **presets dropdown**
   ("(1) Official Server", "(3) Single Player (ASA, Medium)", 13 presets) →
   results table (per-food: quantity, time, effectiveness, levels gained)
   → starve timer → torpor timer with narcotics needed in 4 item types.
4. A literal accuracy pledge in the page body: *"Dododex is committed to
   accuracy. Report Data Error."* — one tap from every result.
5. Knock Out section: per-weapon counts **with "Chance of Death" %** — they
   quantify risk, not just cost — plus variant toggle (X-Rex), platform
   toggle (ASA/ASE), and a "seconds between hits" fine-tuning input.
6. Stats table with **rank context** ("Health: Ranked 42 of 197") — never a
   raw number without meaning.
7. Recipes, saddles — cross-links into the item database.
8. Crowdsourced tips: point-voted, categorized (🥚 Taming & KO, 🔧 Utility,
   ⚔️ Encountering, 😂 Funny, 📖 Stories, 🏷️ Name Ideas), dated, reportable.
   400,000+ tips. Community content is clearly fenced off from data.
9. Gathering efficiency: **star ratings crowdsourced from 180K users /
   2.5M ratings** — where facts can't be datamined, they industrialized
   community measurement (exactly our hatch-telemetry idea, ten years early).
10. Breeding block: incubation temp, full maturation timeline
    (baby/juvenile/adolescent), inline quick calculator, link to full one.
11. Boolean capability matrices: Carryable By / Affected By (traps) / Can
    Damage (structures) / Fits Through (gates) / Minimum Wall Gap — dense,
    scannable ✔/✖ tables answering real decisions.
12. Category chips + per-map spawn links + SEO FAQ text + 9 translations.

**Browse page pattern:** sub-tabs (Creatures | Capabilities | Headshots |
Stats | XP), then ~50 filter chips (by map, taming method, diet, role, game
stage, rideability, game version), then curated groups (New / Flying /
Swimming / Land / Bosses) as plain name lists. Search stays in the header.
**Category chips + search beat pagination** for 200+ entities.

**Server handling = named multiplier presets** (the model for our profiles,
§4): official rates, event-weekend rates, single-player difficulties, Small
Tribes, mobile edition — one dropdown, and custom multipliers persist. Help
center has a dedicated "Configuring ARK Multipliers" article.

**Monetization:** free everything + $4.99 Dododex Pro. Warts we will not
copy: Pro bought ad removal but full-screen wiki ads still appeared (a
recurring complaint on their own help site — "I purchased Dododex Pro but I'm
still seeing ads"), and night mode was paywalled behind Pro. Charging for
dark mode is a fan-tool tell; ours is free (§5, criterion 8).

**Update handling:** creature data "added as soon as information becomes
available"; multipliers deliberately *not* auto-changed until the game's
baseline changes; v2.8's headline was per-creature game-version indicators.
When ASA launched, the app absorbed it as a **version toggle in one app**
rather than a second app — and forum threads ("ASA invaded ma Dododex… is
there an ASE version still") show even that transition strains users. Lesson
for Palworld patches: version-stamp per entity, keep one app.

---

## 2. The full recommended Palforge IA

Every section of the finished palpedia, marked **LIVE** (shipped today),
**NEXT** (v2, this quarter), **LATER** (v3+), with the competitor that proves
demand. Sections are ordered by how the app should present them, not by build
order.

| # | Section | Status | What it is | Evidence it belongs |
|---|---------|--------|------------|---------------------|
| 1 | **Today (Home)** | **NEXT** | Active routes with next actions, incubating-egg timers, patch/data-version status row, completion snapshot. The app opens to *your state*, not a menu. | HoYoLAB's resin widget + daily check-in earns a daily open before the phone unlocks; Serebii's homepage is a daily news feed people check by habit; PalCalc added per-step checkboxes (Aug 2026) — the whole market is drifting from *plan* to *execute*. Dododex notably lacks this — it's our clearest structural win over the blueprint itself. |
| 2 | **Breed** (Calculator + Route Planner + Odds Lab as sub-tabs) | **LIVE** | The heart. Pair→child, child→parents, multi-target routes from your box, verified odds math. | Dododex: the calculator stayed tab #1 on every page for ten years while the companion grew around it. Athena's ASS / Genshin Optimizer / Raidbots: optimizers that beat hand-planning become community-mandatory. |
| 3 | **Paldex** | **LIVE**, upgrade **NEXT** | One page per species (stats, work, skills, recipes-as-parent/child, rank neighborhood) — upgraded to Dododex-grade detail-sheet anatomy (§1 items 1–11: calculator-first, rank context, capability matrices, spawn links) plus **caught/alpha/lucky tracking**. | Dododex creature pages are the category masterclass. Tracking: the single most-requested feature across three Palworld apps' reviews (Round 1 §8); Paltopia's "Collector Mode" is the incumbent bar; MapGenie made found-markers core. |
| 4 | **My Box** (+ Profiles) | **LIVE**, profiles **NEXT** | Owned pals, per-world profiles, import/export; later save-file import via desktop handoff. | Dododex's server presets prove per-context state; ARK Smart Breeding keeps one creature library per server; paimon.moe supports one profile per account, local-first; PalSphere's PC-save sync earned press coverage then died — demand orphaned. |
| 5 | **Items & Tech** | **NEXT** (breeding-adjacent slice) → **LATER** (full) | Cakes, eggs, incubator, condenser materials first; full item/tech DB later. | Dododex's Items menu (kibble + resources) exists to serve the calculator — kibble IS ARK's cake. Pocket Wiki for Terraria (4.7★, $6.99, no ads) proves people pay for a complete offline crafting DB; Paltopia ships recipes + tech tree (currently stale post-1.0 — their reviews say so). |
| 6 | **Spawns & Where-to-Catch** | **NEXT** (inline in routes) → **LATER** (browse view) | "Catch this parent here" cards inside route steps; a per-pal spawn view in the Paldex. **Not** a full interactive map product. | Round 1 verdict stands (th.gl/MapGenie own maps; MapGenie's paywall resentment + blank-map 1★s show the trap). Dododex links per-map spawn pages from every creature rather than making the map the product. |
| 7 | **Bosses & Raids** | **LATER** | Alpha/tower/raid pages with counters, rewards, completion check-offs. | Dododex ships a Bosses category; Paltopia reviews ask for boss check-offs that grey out when done; MHW Companion ships quest/monster hit-tables — fight prep is core companion content. |
| 8 | **Team & Capture** | **LATER** | Element-coverage matrix from your box; capture-odds calculator. | Marriland Team Builder is evergreen; Pal Analyzer (game mod) proves "is this worth catching" demand; palworld.gg/OP.GG have shallow versions with no box awareness. |
| 9 | **Reference** | **LIVE** | Mechanics handbook + the 29-claim verification table. | Raidbots' visible methodology is why players petition Blizzard to adopt it; our verification page is the marketing moat (Round 1 lesson 2). |
| 10 | **Settings / About** | **LIVE**, grows **NEXT** | Theme, data version + changelog, profile management, export/backup, disclaimer. | Dododex help center's most-linked article is multiplier configuration — settings are product surface, not an afterthought. Data-version display: paldb.gg states build 4797106687 on its calculator; we out-do it with the oracle badge. |

**Explicit non-goals, confirmed by this round:** full interactive map
(MapGenie's own reviews are the warning), PC overlay (th.gl/Overwolf own it),
accounts/server-side anything (paimon.moe's trust contract is our lane), a
second app per game version (Dododex's ASA/ASE strain shows even the best
handle this inside one app).

---

## 3. Navigation: 10 sections on an iPhone without a junk drawer

**The evidence:**
- Apple HIG: three to five tabs on iPhone; more overflows into a "More" list
  (documented worst-practice for discoverability).
- NN/g: tab bars suit ~5 or fewer destinations; hamburger menus hide and
  therefore kill usage ("out of sight is out of mind"); the fix for many
  sections is a **hub screen plus persistent access to the few core tasks**.
- Dododex web: 200+ creatures behind exactly three menus + omnipresent search.
- Dododex app: opens into search + category chips — search-first, not menu-first.
- HoYoLAB: bottom tabs with a **Tools hub** gathering Battle Chronicle,
  Check-In, calculators — the hub-and-spoke pattern at official-app quality.
- MHW/MHRise Companion, Pocket Wiki: encyclopedic apps use a **grid-of-
  sections home** and it works because every grid cell is one tap deep.
- paldb.cc as the anti-example: five disconnected desktop-wiki tools, hostile
  on a phone (Round 1 §5.2).

**The recommendation — 4 tabs + hub, search everywhere:**

```
┌──────────────────────────────────────────────┐
│  [Today]   [Breed]   [Paldex]   [Box]  [More]│
└──────────────────────────────────────────────┘
```

- **Today** — the §2#1 home. New users without state see onboarding + news.
- **Breed** — segmented control inside: Calculator ▸ Planner ▸ Odds. The
  killer feature never shares a tab with anything else. (Dododex rule: the
  calculator is always one tap away and always first.)
- **Paldex** — browse page done the Dododex way: search field pinned on top,
  filter chips (element, work, egg group, owned/missing, alpha/lucky, new-in-
  patch), curated groups below (New in 1.0, Legendaries, Bosses, By element).
  No pagination.
- **Box** — box + profile switcher in the header (§4).
- **More** — a *designed hub grid* (HoYoLAB Tools pattern, not an iOS "More"
  list): Items & Tech, Spawns, Bosses, Team, Reference, Settings. Each cell:
  icon + name + one-line payoff. Cells promote to full sections without nav
  surgery — Items simply graduates to a richer cell, never to a sixth tab.
- **Search is global**: a magnifier in every screen's header opening one
  unified index (pals, items, routes, reference articles — Dododex indexes
  creatures *and* items in one box; paldb.cc's Ctrl-K is the web equivalent).
- **Deep links for everything** (`palforge://pal/anubis`, `/breed?target=…`)
  — we already do this on web; it's what makes share sheets and widgets work.

**Rejected alternatives, with reasons:** drawer/hamburger (NN/g discoverability
evidence; zero of the winning companions use one); 6+ tabs (HIG overflow
behavior produces the double-nav "More" list mess documented in Apple's own
dev forums); search-only nav with no tabs (Dododex app leans search-first but
still gives browse chips — 300 entities need both paths).

---

## 4. Profile & multi-save UX spec

Palworld players run multiple worlds/servers (solo, co-op, guild server) with
different boxes and progress. Nobody in the Palworld niche handles this today
— and the pattern is already solved elsewhere:

| Precedent | What they do | What we take |
|---|---|---|
| **Dododex server presets** | Named multiplier sets in a dropdown on the calculator itself; presets for common configs; custom values persist; a help article dedicated to it | Switching context happens *where it matters* (inside the calc/planner), not in a buried settings page; ship sensible presets ("Solo world", "Co-op server") |
| **ARK Smart Breeding** | One creature-library file per server; portable; save-import fills the library | One box per profile; profiles are the unit of import/export; save-import lands *into a profile* |
| **paimon.moe** | One profile per game account; manual switcher; everything local, optional user-owned backup (their Drive, not our server) | Local-first multi-profile with zero accounts is a proven, trusted pattern |
| **Genshin Optimizer** | Whole database exports to clipboard/JSON (GOOD format); community tools interoperate with it | One-file whole-profile backup; a documented open format so the community can build importers for us |
| **MapGenie** (anti-example) | Cross-device sync requires an account; sync bugs and paywall resentment fill its 1★ reviews | Don't gate continuity behind accounts; a file the user owns beats a login |

**The spec:**
1. **A profile = box + routes/plans + tracker state + settings overrides**,
   named + color/emoji chip (e.g. 🟦 "Main world", 🟨 "Guild server").
2. **Invisible until needed:** the app ships with one implicit profile; the
   switcher UI appears only after the user creates a second (Dododex doesn't
   make solo players think about servers either). Zero complexity tax for the
   90% single-world case.
3. **Switcher lives in the Box and Today headers** — one tap, no settings
   trip (Dododex puts presets on the calculator, not in settings).
4. **Per-profile export** (one JSON file, versioned schema, documented) and
   **whole-app backup** (all profiles). Import offers merge or replace with a
   preview diff — we already built exactly this UX for box import; promote it
   to profile level.
5. **Save-file import lands into a chosen profile** (v2 flagship #2 from
   Round 1): desktop drop-zone parses the .sav read-only → QR/link handoff →
   "Import into: [profile picker]".
6. **Rename/duplicate/delete** with undo; deleting requires typing the name
   (it's the user's only copy of that data — local-first cuts both ways).

---

## 5. The design-quality bar: 15 checkable criteria that separate AAA from fan-made

Each criterion is binary-checkable in a review, and names who does it best.

1. **Data-version badge on every data screen** — build number + "verified
   against 44,851 outcomes" one tap from any result. *Best today:* Dododex's
   per-creature ✔ASA/✔ASE/✔UME badges; paldb.gg's build stamp. Nobody
   combines stamp + proof — that combination is ours.
2. **Search from anywhere in ≤1 tap, results in ≤1s, fuzzy, unified index**
   (pals + items + articles). *Best:* Dododex's omnipresent header search;
   paldb.cc's Ctrl-K.
3. **≤5 bottom tabs, no hamburger, hub-grid for the rest.** *Best:* HoYoLAB's
   Tools hub; Apple HIG is the written standard.
4. **One fixed detail-sheet anatomy** — every pal page has identical section
   order (calculator/actions first, facts second, community last); a returning
   user's thumb knows where everything lives. *Best:* Dododex's creature
   pages — 200 creatures, one anatomy, ten years stable.
5. **No dead-end facts: every entity cross-links** (recipe → ingredient →
   where-to-get → back). *Best:* Pocket Wiki for Terraria's interlinked
   recipes; Dododex's saddle→item→creature chains.
6. **Numbers carry context, never float** — rank ("#42 of 299"), delta, or
   probability next to every stat. *Best:* Dododex ("Ranked 42 of 197",
   "Chance of Death 8%"). *Anti:* every Palworld web calc's naked tables.
7. **Offline-complete, not offline-degraded** — airplane mode changes
   nothing except community/live content. *Best:* Pocket Wiki ("zero ads, no
   internet required"); MHLab bundles the whole DB on-device. Demand receipts:
   Palverse exists *because* of offline (Round 1 §8).
8. **Zero ads, and dark mode is free.** *Anti-examples doing real damage:*
   Dododex paywalled night mode behind Pro and still shows wiki ads to Pro
   buyers (their own help center documents the complaints); PalCodex died at
   1.0★ paywalling lookups. Free core + one modest supporter unlock
   (Paltopia's proven $4.99–8.99 anchor) is the ceiling.
9. **Dark-first with a true designed light theme** (tokens, not inversion),
   WCAG AA both ways, gender/element never color-only. *Best:* paimon.moe's
   dark default; our own token system already enforces the AA + glyph rules —
   keep it law.
10. **Empty states that teach the killer feature** — an empty Box shows a
    3-second import pitch + "try a sample box"; an empty Planner shows a
    preset ("All aura pals") one tap from a real plan. *Best:* Poke Genie's
    zero-login scan-first onboarding (20M installs on the back of it);
    Dododex's presets dropdown, which makes the calculator useful on the very
    first tap with zero configuration. *Anti:* paldb.cc drops you into empty
    multi-tool forms.
11. **List rows carry decision-grade info scent** — icon + name + 2–3 facts
    (element, work stars, owned/alpha state) so filtering happens with eyes,
    not taps; virtualized, 60fps with 300 icons. *Best:* Dododex's browse
    chips + dense creature rows; MHW Companion's weapon-tree rows.
12. **Motion is physical and cancelable; skeletons over spinners; reduced-
    motion respected.** Nothing blocks >300ms without a skeleton. *Anti:*
    MapGenie's blank-white-map launch bug is a top complaint in its reviews —
    perceived brokenness is a design failure even when data is fine.
13. **Community/estimate content is visually fenced from verified fact** —
    label every number "game-file fact" vs "community estimate (n)". *Best:*
    Dododex fences 400K tips into a voted, categorized, reportable block that
    never contaminates the calculator; PinDrop's honest uncertainty labels.
14. **Patch-day ritual is a product feature** — an in-app news row: "Data
    updated for build X — what changed", within days of every patch. *Best:*
    Serebii's daily-news homepage habit; Dododex "updated weekly since 2016";
    Kiranico stands up whole per-game DBs within days of release.
15. **Native platform citizenship** — share sheet on every pal/plan/result,
    system haptics, widgets (incubation timer, next route step), Handoff
    between iPhone/web, proper Dynamic Type. *Best:* HoYoLAB's home-screen
    resin widget (the single strongest retention device in the genre);
    MapGenie's web↔app sync is the demand signal (their account-gating of it
    is the mistake to avoid — ours syncs via export file/QR, no login).

*(Round 1's hard rules remain in force underneath: never paywall facts, never
edit saves, "unofficial" disclaimer everywhere, modest supporter monetization
inside Pocketpair's guidelines.)*

---

## 6. Feature matrix — Palforge today vs. the top 10 companions

✔ = has it well, ~ = partial/weak, ✖ = missing. "Verified data" = provable,
not just claimed. (Palforge column = shipped breeding module, Aug 2026.)

| Capability | **Palforge** | Dododex (ARK) | Poke Genie (PoGo) | HoYoLAB (official) | paimon.moe | Genshin Optimizer | MapGenie | Pocket Wiki (Terraria) | MHW/Rise Companion | Paltopia (Palworld) | PalCalc (Palworld) |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Core calculator/solver | ✔ | ✔ | ✔ | ✖ | ~ | ✔ | ✖ | ✖ | ~ (set builder) | ~ (pair lookup) | ✔ |
| Multi-step route/optimizer | ✔ | ✖ | ✖ | ✖ | ✖ | ✔ | ✖ | ✖ | ~ | ✖ | ✔ |
| Owned-data awareness (box/roster) | ✔ | ~ (tame tracker, new 2025) | ✔ (scans) | ✔ (account) | ✔ | ✔ | ~ (markers) | ✖ | ~ (sets) | ~ (lists) | ✔ (save import) |
| Full species/entity encyclopedia | ~ (breeding-centric) | ✔ | ~ | ~ | ~ | ✖ | ✖ | ✔ | ✔ | ✔ | ✖ |
| Items/crafting DB | ✖ | ✔ | ✖ | ✖ | ~ | ✖ | ✖ | ✔ | ✔ | ✔ | ✖ |
| Completion tracking (variants) | ✖ → NEXT | ~ | ~ (scan history) | ✔ (achievements) | ✔ (wishes/achievements) | ✖ | ✔ (found markers) | ~ | ~ | ✔ (collector mode) | ~ (step checkboxes) |
| Multi-profile / multi-server | ✖ → NEXT | ✔ (rate presets) | ✖ | ~ (accounts) | ✔ | ~ (DB export) | ~ (account sync) | ✖ | ✖ | ✖ | ✔ (per-save) |
| Offline-complete | ✔ | ✔ | ~ | ✖ | ✔ | ✔ | ~ | ✔ | ✔ | ~ | ✔ |
| Verified/provable data | ✔ (oracle) | ~ (accuracy pledge + report loop) | ✔ (exact formulas) | ✔ (official) | ✔ | ✔ | n/a | ✖ | ~ | ✖ (accuracy complaints) | ~ (honest unknowns) |
| Timers/notifications/widgets | ✖ → NEXT | ✔ (starve/torpor/breeding timers) | ~ | ✔ (resin widget) | ~ (reminders) | ✖ | ✖ | ✖ | ✖ | ✖ | ✖ |
| Community layer | ✖ (deliberate, v3) | ✔ (400K tips + 2.5M ratings) | ✔ (raid matchmaking) | ✔ (forum) | ~ (community stats) | ~ (OSS) | ~ (notes) | ✖ | ✖ | ✖ | ~ (GitHub) |
| No ads | ✔ | ✖ | ~ | ~ | ✔ | ✔ | ~ | ✔ | ✔ | ~ | ✔ |
| Mobile-native quality | ~ (PWA + new iPhone app) | ✔ | ✔ | ✔ | ~ (web) | ✖ (web) | ~ (buggy) | ✔ | ✔ | ✔ | ✖ (Windows) |

**Read of the board:** nobody — in any game — holds the full row of
[verified data + optimizer + owned-data + offline + no ads + native mobile].
Dododex comes closest and is ad-funded with a weak owned-data story added only
in 2025. Palforge's shipped column already wins 4 of those 6; the NEXT column
(tracking, profiles, timers, items slice) closes the encyclopedia and
retention gaps where we're ✖. That specific full row is the "definitive
companion" position.

---

## 7. Retention mechanics that fit us (no accounts, local-first)

Ranked by evidence strength; all work with zero server-side state.

1. **The execution loop (plan → do → check off → hatch).** Today-tab route
   cards with per-step check-offs and live egg counters. *Evidence:* PalCalc
   added step checkboxes within weeks of 1.0 — the demand is measured;
   HoYoLAB proves state-checking is the strongest daily-open driver in the
   genre. This is retention mechanic #1 and it's pure local state.
2. **Incubation timers → notifications → a lock-screen/home widget.**
   *Evidence:* HoYoLAB's resin widget is so valuable whole GitHub ecosystems
   automate its check-in; Dododex ships starve/torpor/breeding timers as core.
   A "next egg ready / next route step" widget is the same muscle for us.
3. **Completion tracking with variant depth (caught/alpha/lucky + catch
   bonus).** *Evidence:* most-requested feature across three Palworld apps
   (Round 1 §8); MapGenie's found-markers and Paltopia's collector mode are
   the proofs; ties into the in-game catch-bonus so it's utility, not just
   collection itch.
4. **Patch-day news row.** "Build X verified — 3 recipes changed" the day a
   patch lands. *Evidence:* Serebii built a decades-long daily habit on news;
   our oracle turns every Palworld patch into a moment only we can narrate
   with proof.
5. **The trust contract as a feature:** everything exportable, nothing
   phones home, works in airplane mode — stated in-app. *Evidence:*
   paimon.moe is the standard wish tracker *because* it stores nothing
   server-side; Poke Genie hit 20M installs with zero logins.
6. **(v3, opt-in) community benchmarking:** anonymized hatch telemetry →
   "your odds vs measured reality", publishing the mutation-rate answer
   nobody has. *Evidence:* Dododex's 2.5M crowdsourced gathering ratings are
   this exact mechanic a decade earlier; akasha.cv/Pikalytics show
   benchmarking = return visits.

---

## 8. Sources (Round 2)

**Dododex (live dissection + listings):**
- https://dododex.com/ + /taming/rex + /dinosaurs (fetched via browser 2026-08-15: nav, More menu, full Rex page anatomy, browse chips)
- https://apps.apple.com/us/app/dododex-ark-survival-ascended/id1071311292
- https://help.dododex.com/ (article list: multipliers, offline, Pro complaints, accuracy)
- https://ark.wiki.gg/wiki/Dododex · https://www.producthunt.com/products/dododex (origin story, React Native, monetization)
- https://mwm.ai/apps/dododex-ark-survival-ascended/1071311292 (94.7K-rating snapshot, app structure)
- https://survivetheark.com/index.php?%2Fforums%2Ftopic%2F720188-asa-invaded-ma-dododex-app-is-there-a-ase-version-still%2F= (version-transition strain)
- Play listing: https://play.google.com/store/apps/details?id=com.danlev.dododex

**Pokémon ecosystem:**
- https://apps.apple.com/us/app/poke-genie-remote-raid-iv-pvp/id1143920524 (tiers, scan flow, 20M/4.8★/201K)
- https://pokemondb.net/ (4-group IA) · https://www.serebii.net/ (daily-news homepage) · https://bulbapedia.bulbagarden.net/wiki/Main_Page (10-hub wiki IA)

**HoYo ecosystem:**
- https://paimon.moe/ (sidebar IA, local-first, multi-profile) + gamertweak.com/how-to-use-paimon-moe-genshin-impact/
- https://github.com/frzyc/genshin-optimizer (GOOD format, DB export) + keqingmains.com/misc/multi-optimization/
- HoYoLAB tools structure: gamerant.com/genshin-impact-hoyolab-tools-explained-battle-chronicle-map-diary-enhancement/ + hoyolab.com widget guides (articles 18458763, 17629622) + sportskeeda widget guides

**ARK / MH / Terraria / maps:**
- https://github.com/cadon/ARKStatsExtractor (ARK Smart Breeding: per-server libraries, tab structure)
- https://ark.wiki.gg/wiki/Apps + A-Calc listings (id1100153389, id1151408989)
- https://apps.apple.com/us/app/mhw-companion/id1348753553 · /mhrise-companion/id1560917688 · /mhwilds-companion/id6743035428 · MHLab id6747290689 · https://mhwilds.kiranico.com/ (14-section DB IA)
- https://apps.apple.com/us/app/pocket-wiki-for-terraria/id862447693 (offline/no-ads economics, interlink IA)
- https://apps.apple.com/us/app/mapgenie-elden-ring-map/id1618843254 (Pro model, sync, blank-map complaints)

**Navigation/design standards:**
- https://developer.apple.com/design/human-interface-guidelines/tab-bars (3–5 tabs; More overflow) + developer.apple.com/forums/thread/764293
- https://www.nngroup.com/articles/mobile-navigation-patterns/ (tab vs hamburger discoverability evidence)

**Palworld incumbent re-check:**
- https://apps.apple.com/us/app/paltopia-pal-tools-map/id6476646632 (v1.2.6 Aug 7; section list; post-1.0 accuracy complaints)

*Round 1 sources (`03_MARKET_RESEARCH.md` §13) remain the evidence base for
all Palworld-market claims referenced here.*
