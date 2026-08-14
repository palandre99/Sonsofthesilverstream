# 03 — MARKET RESEARCH: The Competitive Landscape for Palforge

*Compiled 2026-08-14 from ~30 live web sources (all listed in §13). Written for
the CEO: plain language, evidence first, opinions labeled as opinions. Numbers
that come from third-party estimators (SEMrush etc.) are labeled as estimates.*

---

## 0. Executive summary — the ten things that matter

1. **The market just 10x'd and then reset.** Palworld 1.0 (July 10, 2026)
   peaked at ~961,000 concurrent Steam players — the second-biggest game in
   Steam history by CCU — and **rewrote the entire breeding table** (72 new
   Pals, ~300 total, new Mutation/Awakening mechanics). Every pre-1.0 tool,
   chart, and app became silently wrong overnight. This is the single biggest
   competitive event in this niche, and it happened five weeks ago.
2. **The web is crowded; correctness is not.** At least 15 sites now ship a
   "1.0 breeding calculator." They *disagree with each other* on basic facts
   (unique-combo counts of 134 vs 144 vs 185; mutation base rate of 0.6% vs
   1%). Nobody shows proof. Palforge's oracle-replay verification is a real
   moat — but only if we make the proof visible to users.
3. **Mobile is nearly undefended.** The best iOS companion (Paltopia, 4.8★)
   has post-1.0 data-accuracy complaints in its own reviews; the #2 (PalSphere)
   has been abandoned since Feb 2024; the newest (PalCodex) has a 1.0★ rating
   because it paywalled free data behind a $0.99/week sub. There is **no
   provably-correct, 1.0-current breeding tool on the App Store.** That is our
   opening.
4. **The best tool in the niche is trapped on Windows.** PalCalc (tylercamp)
   does save-file import, passives, IVs, and optimal breeding trees — and is
   actively updated (v1.19.1, Aug 2, 2026). It is the only competitor that does
   what our planner does. It cannot follow us to the phone.
5. **Daily retention comes from *the player's own data*, never from the game's
   data.** Every gold-standard companion (Poke Genie 20M downloads, HoYoLAB
   15M+, paimon.moe, Raidbots) wins by answering "what should *I* do next with
   *my* stuff," not "what does X breed."
6. **Import friction decides reach.** Poke Genie got to 20M downloads with
   screenshot scanning and zero logins. PalCalc's save-file import is superior
   data but desktop-only. The winning play is: manual-first, save-import as a
   desktop companion step, screenshot/OCR as a moonshot.
7. **Fans pay for convenience and compute — never for data.** Raidbots and
   Wowhead sell premium on top of free cores; Poke Genie's tiered IAP is
   beloved. PalCodex charged for lookups and got torched; MapGenie's Pro
   paywall spawned a bypass browser extension.
8. **The most-requested small feature everywhere: completion tracking.**
   Caught/alpha/lucky checklists and map check-offs appear in App Store reviews
   of three separate Palworld apps and in every successful map tool.
9. **IP risk is real but manageable.** Pocketpair's derivative-works
   guidelines permit fan tools but prohibit "highly commercial" use and
   anything mistakable for official product. Unofficial Palworld apps have
   lived on the App Store for 2+ years. Keep monetization modest, keep the
   name "Palforge" (no "Palworld" in the title), ship disclaimers, be careful
   with game art.
10. **Act on the data-freshness finding in §12 first:** paldb.gg is serving
    data from game build **4797106687 (Aug 12, 2026)** — newer than our July
    extraction — and paldb.cc now carries a "hide Terraria Monster" toggle.
    A collab patch may have touched the roster. Re-run our extraction pipeline
    and re-verify the oracle before shipping anything else.

---

## 1. Market context

| Fact | Value | Sources |
|---|---|---|
| Palworld 1.0 release | July 10, 2026 | Forbes, Game8, palbreeder.com |
| 1.0 Steam CCU peak | ~956k–961k (2nd-best in Steam history; 24h peak 855,525) | AllThings.How, MassivelyOP, Game8, ResetEra |
| Early-access all-time peak | ~2.1M (Jan 2024) | TechRadar |
| Roster after 1.0 | ~299–300 Pals (72 new) | Game8, palbreeder.com, PinDrop |
| Breeding in 1.0 | Result table rewritten; Mutation (mutated eggs → Alpha variants, exclusive passives); Awakening; specialty cakes; one gender-locked pair (Katress/Wixen) | palbreeder.com, GamingBolt, PalMods, XGamingServer |
| Official companion app | **None.** (The App Store "Palworld" listing is the $29.99 Mac game itself.) | Apple App Store |

**What the 1.0 reset did to the ecosystem:** the classic Penking + Bushi =
Anubis recipe now produces Sibelyx; legendaries now breed same-species only
(per palbreeder.com's changelog — cross-check against our oracle, §12). A
Medium explainer (July 13) is telling: it warns at length that "many breeding
calculators still circulating online contain Early Access data" — and then
*names no tools and gives no examples*, because verifying correctness is hard.
Nobody in this market can prove they're right. We can.

---

## 2. Competitor matrix — Palworld web tools

| Site | What it is | Strengths | Weaknesses (brutal & specific) | Our angle |
|---|---|---|---|---|
| **palworld.gg** | Broadest DB + tools suite (Pals, map, tier list, items, tech tree, breeding calc, capture calc, team builder) | **Biggest traffic in the niche: ~2.47M visits/mo (SEMrush est.)**; clean nav; multi-language | **Zero data-version transparency** — no "updated for build X" anywhere on the site; no owned-pal awareness; no routes; no proof of correctness; part of a network farm (Wuthering.gg, Marvel Rivals Tracker…) that optimizes for SEO, not depth | Show the build number + oracle badge on every screen. Depth beats reach with breeders. |
| **paldb.cc** | The datamine wiki (breed tree w/ shortest path, breed-2-pals, parent calc, multi-pal breeder, IV calc, "Pal Surgery Table") | Updated fast (v1.0.3 dated **2026-08-12**); 15+ languages; genuinely deep tools; has a "select your pals" multi-breeder | ~800–835K visits/mo (est.), a third of palworld.gg; UI is dense/hostile on mobile; owned-pal entry is manual clicking, no import; passives/IVs live in separate disconnected tools; no odds math shown | One integrated flow (box → route → odds) vs. their five separate tools. Mobile-native. |
| **palworld.tools** | Full-suite challenger (Paldex, maps, breeding path finder, egg hatch calc, **IV-recovery-from-status-screen**, team/damage/capture/XP calcs, save import, no ads) | 1.0 build cited (24088745, July 13); breadth rivals paldb.cc; IV recovery tool is clever | Build cited is a month old already; breadth over depth — no correctness claims, no probability math for passives; "save import" is listed but undocumented | They're the closest philosophical competitor on web. Beat them on verified odds + phone. |
| **OP.GG Palworld** | Esports-tooling giant entering the niche: breeding calc + **7 breeding sub-tools** (IV calc, Mutation calc beta, **Route Calculator, Shortest Path, Breeding Tree**, custom breeding) | Huge brand + traffic machine; states inheritance math (30/30/40 talent rule); ships route tools | Ad-supported with paid ad-removal; mutation calc self-labeled "beta"; community-measured numbers with a disclaimer that they "may vary from actual mechanics" — i.e., unverified; no save/box awareness | The dangerous one long-term. They have engineers and traffic. Our defense is provable correctness + native mobile + no ads. |
| **Game8 Palworld** | Media guide giant; breeding calc + **chain-breeding calculator** (multi-step paths), updated Aug 7, 2026 | SEO monster; chain calculator is real route planning; per-account favorites | Favorites require Game8 login; membership upsell prompts; chains are species-only — no passives, no IVs, no owned-pal input; calculator embedded in an ad-heavy article page | Their chain calc validates our planner concept — for free. We do it with the player's actual box and real odds. |
| **paldb.gg** | New precision play: breeding calc "from the game files," auto-refreshed | States exact build (4797106687, **Aug 12**) and the real algorithm (unique combos take priority, else closest breed rank); 185 hand-authored unique combos claim; no ads | Species-only — no passives, IVs, routes, or box; new site, tiny audience; their "185 unique combos" disagrees with every other count (see §12) | They copied our positioning (file-extracted truth) without the verification. We have the 44,851-row oracle; they have a claim. |
| **PinDrop.gg** | 3-tool calc (parents→child, target→parents, mutation odds), free, no ads, no login | Honest about sources — openly uses **PalCalc's MIT dataset**; publishes mutation-odds uncertainty ("nearer 0.6% than 1%"); Ctrl-K search | No passives/IVs/chains by their own admission; mutation numbers are pooled guesses; web-only | Their honesty proves the demand for verified data. Our odds lab can settle the numbers they admit they don't know. |
| **palbreeder.com** | Single-purpose 1.0 breeding calc (299 Pals, "44,850 combos"), free | Best public changelog of 1.0 breeding changes (Penking+Bushi→Sibelyx; legendaries same-species-only; Katress♀+Wixen♂ gender rule); data "from the 1.0 game files," verified 2026-07-25 | **Their stated table count is 44,850; the correct 1.0 enumeration is 44,851** — consistent with collapsing the gender-order-dependent Katress/Wixen pair into one row (their FAQ knows the rule; their table count suggests the data doesn't). Species-only; verified date already 3 weeks stale | This is exactly the class of subtle error our oracle catches. Use it (politely) in marketing: "we replay all 44,851 outcomes." |
| **palbreeding.com / palbreed.com / palworldbreed.com** | Thin single-page calculators | Exist; rank on SEO | Interchangeable; no version transparency; no mechanics beyond parent/child lookup | Ignore. They compete for search clicks, not users. |
| **Palpedia (palpedia.net & palpedia.com — two different sites)** | DB + breeding (parent/child/multi/mutations) + **Pal Tracker checklist** + shareable progress | Tracker/checklist answers a real demand (see §8); 1.0 dataset claims | Confusingly split across two domains; no odds math; no routes; tracker is manual-only | Their tracker validates our v2 checklist feature. Do it with per-variant (alpha/lucky) tracking + sync. |
| **XGamingServer tools** | Server-host content marketing: breeding calc, **online save editor/inspector** (.sav→JSON in browser), stats calc | Free; save-editor-in-browser is technically notable | Breeding page still advertises "138 Pals + 28 special combos" — **early-access numbers, flatly wrong for 1.0**; tools exist to funnel server-hosting sales | Example #1 of a stale calculator that looks current. Name-and-date every dataset we ship. |
| **PalMods.gg** | Mod hub + tools (map from 1.0 files w/ spawn heatmaps, breeding calc, mutation guide, TCG DB) + Windows mod manager | 1.0-version-aware mod listings; spawn heatmaps are good | Tools are an adjunct to the mod business; no box/route/odds depth | Non-overlapping; possible data cross-check partner. |
| **PalSphere.app (web — unrelated to the iOS app)** | Fan DB + toolkit, data "extracted from official client assets" | Clean; honest about extraction | No planner, no odds, no tracking | No threat; another extraction-truth positioning without proof. |
| **palworldcompanion.com** | Guide site + calculators + "My Pal Box" | Has a box concept; 1.0 guides | Affiliate-monetized content site; box is manual; no odds/routes | Confirms "my box" is the direction everyone gropes toward. |
| **Interactive maps: palworld.th.gl, MapGenie, op.gg/map, palworld.gg/map, PinDrop map** | Maps with POI layers | th.gl: 164 maps incl. all dungeons + **live in-game position overlay** (Companion app/Overwolf); MapGenie: polished, 4k+ locations in its other games | MapGenie Pro paywall is widely resented (a free-unlock browser extension exists); th.gl is ad-supported w/ Patreon | Don't fight full-map tools head-on in v2. Integrate *targeted* spawn locations into breeding routes ("catch this parent here"). |

---

## 3. Competitor matrix — desktop & overlay

| Tool | What it is | Strengths | Weaknesses | Our angle |
|---|---|---|---|---|
| **PalCalc (tylercamp, GitHub, MIT)** | *The* breeding solver: reads your save (Steam/Xbox auto-detect), finds optimal breeding trees for target species + passives + IVs, with time estimates and a Save Inspector | Only competitor doing owned-box route planning; models gender probabilities and passive insertion; active post-1.0 (v1.19.1 Aug 2; step-completion checkboxes added Aug 1); 278★; its dataset is being reused by other sites (PinDrop) — it's becoming the community's de-facto data source | **Windows-only .NET desktop app** — zero mobile/web reach; README openly lists unknowns (breeding-duration formula, wild-pal passive distributions, inherited-passive validation); server saves need manual file copying; UX is enthusiast-grade | Respect it — it validated our whole category. We win on reach (iPhone + PWA), UX, and *verified* probability math where they document uncertainty. Consider matching their save-format parsing (their stack builds on MIT palworld-save-tools). |
| **Save editors: PalEdit (1.0 fork), Palbox Studio (reads GlobalPalStorage.sav), PalworldSaveTools, palsaveeditor.com, KrisCris Pal-Editor** | Edit/inspect .sav files | Prove that 1.0 save parsing (incl. the new Global Palbox) is a solved, open-source problem | Editors, not planners; cheating-adjacent reputation | The parsing layer for our box import is free and battle-tested. We import read-only — never edit (keeps us clean reputationally and with Pocketpair). |
| **TH.GL Companion / Overwolf apps (Paldeck Enhanced etc.)** | In-game overlays: live position, dungeon floor plans in real time, second-screen | Real-time overlay is a genuinely different capability; free + Patreon | PC-only; Overwolf install burden; ad-supported | Different lane. A phone *is* the second screen — our positioning line writes itself. |
| **Pal Analyzer (CurseForge/Nexus mod)** | Hover a wild pal in-game to see stats/IVs | Solves "is this wild pal worth catching" | It's a game mod — console players excluded; mod-averse players excluded | The same question, answered legally on a phone: our odds lab + (v3) capture advisor. |

---

## 4. Competitor matrix — mobile apps (our home turf)

| App | Platform | Rating | Price | State (brutal) | Our angle |
|---|---|---|---|---|---|
| **Paltopia: Pal tools & Map** | iOS | **4.8★ (1.2K)** | Free + $4.99/$8.99 IAP | The incumbent to beat. DB, 2-mode breeding finder, map, teams, personal lists, collector mode (alpha/lucky), device sync. Updated Aug 7, 2026 — *but its own reviews flag post-1.0 data accuracy problems and a stale tech tree*. Ads in free tier (called "non-intrusive" by reviewers). | Beat it on correctness (their soft spot, on record), route planning (they have none), and odds math (none). Their 4.8★ proves the market pays $5–9 for this. |
| **PalSphere — Paldex & Info** | iOS | 3.4★ (17) | Free + $2.99/mo, $9.99 lifetime | **Abandoned.** Last update Feb 29, 2024; content stops at Pal #111; reviews cite crashes and silent dev. Its one great idea — PC save sync of catch progress ("carry your progress on the go," covered by Dot Esports) — is now unmaintained. | The save-sync idea was praised and then orphaned. Pick it up and do it right. |
| **PalCodex — Pal Companion** | iOS | **1.0★** | $0.99/wk, $5.99/yr, $9.99 lifetime | The cautionary tale. Sole review: "Why would I drop $12 to check breeding combos I can google for free… completely useless." | Never paywall lookups. Charge (if ever) for compute/sync/convenience. §10. |
| **Palworld Map Companion** | Android | n/a | Free | Offline map + Paldeck + breeding + items covering the full 299 roster. Reviews ask for checklists/check-offs. | Confirms offline + full-1.0-roster is table stakes on mobile; checklist demand again. |
| **Pals Guide / PalGuide / PalMap / Fan-made Paldeck (assorted)** | iOS | low volume | Free/IAP | 2024-era guide shells, most stale; PalMap review: "lacking checklist… isn't much to make it competitive with web maps." | Noise. They dilute App Store search but hold no users. |
| **Palverse (itch.io)** | Android/desktop | n/a | Free | Exists explicitly because players wanted an **offline** database; added breeding DB later. | Offline-first demand, again. Our PWA already does this; the native app must too. |
| **Super Pal (itch.io)** | Windows/Android | n/a | Free | Hobby breeding calc. | Noise. |

**Bottom line on mobile:** one live competitor (Paltopia) with a documented
correctness weakness, one corpse with our feature idea (PalSphere), one
object lesson in bad monetization (PalCodex). No one on any phone store does
routes, odds, or verified data. This is the softest large market I found.

---

## 5. Deep dives — the six that matter

### 5.1 PalCalc — the capability benchmark
Save import (auto-detects Steam/Xbox saves), optimal multi-step breeding
trees toward species+passives+IVs, gender-probability modeling, time
estimates, Save Inspector with filters, per-step completion checkboxes
(added Aug 1 — they're evolving toward a *plan-execution* loop, exactly our
planner-run concept). MIT-licensed; the community is standardizing on its
extracted dataset. Its README honestly lists open unknowns: exact breeding
duration formula, wild-pal passive probability distributions, validation of
inherited-passive math. **Strategic read:** PalCalc is the proof that our
product thesis is right, and its Windows-only prison is the proof that our
platform thesis is right. Watch its releases; treat its "unknowns" list as
our odds-lab research agenda.

### 5.2 paldb.cc — the datamine incumbent
Fastest updater among the wikis (Aug 12 data build), deepest raw data, and
already has a "multi-pal breeder" where you click the pals you own to see
what you can make — a manual, odds-free cousin of our box planner. Traffic
~800K+/mo (est.). Weaknesses: five disconnected tools instead of one flow;
desktop-wiki UI that punishes phones; no probability math anywhere; no
proof. **Strategic read:** they will always beat us on being a *wiki*.
Never compete on breadth of raw tables; compete on integrated answers.

### 5.3 OP.GG — the invader
OP.GG has cloned the whole toolbox (breeding, IV, route calculator,
shortest path, breeding tree, custom breeding, mutation beta) and bolted it
to one of the biggest gaming-tools brands on earth. Their own pages
disclaim that inheritance numbers are community-measured and "may vary."
Ad-funded with paid ad removal. **Strategic read:** if this niche stays
big, OP.GG is the long-term winner on web SEO. Differentiation that
survives them: provable correctness, native mobile UX, offline, no ads,
and the owned-box loop (they have no save/box story at all).

### 5.4 Paltopia — the mobile incumbent
4.8★ from 1.2K ratings, actively updated, sensible freemium ($4.99/$8.99),
collector mode, sync. Its reviews (post-1.0) flag data accuracy and stale
sections — the exact wound a verified engine attacks. **Strategic read:**
match its collection/QoL features (tracker, favorites, sync), exceed it on
truth and planning, and mirror its price anchor.

### 5.5 Game8 — the SEO wall
Their chain-breeding calculator (multi-step paths, updated Aug 7) is the
most planner-like thing on the mainstream web, but species-only and buried
in a membership-upsell article. We will never outrank Game8 for "palworld
breeding calculator." **Strategic read:** don't fight for the head query;
own the intent queries ("breed X with passives from my pals", "mutation
odds calculator verified") and the App Store, where Game8 doesn't exist.

### 5.6 The maps (th.gl / MapGenie)
th.gl's live-position overlay and 164 dungeon maps are impressive PC-side;
MapGenie's mobile apps show both the demand (people paid $5 within an hour)
and the resentment ceiling (Pro paywall bypass extensions, "cheaper on web
than app" complaints, blank-map bugs). **Strategic read:** maps are a
different, already-served product. In Palforge, the map is a *feature of
the route* (where to catch a needed parent), not a product.

---

## 6. Gold standards from similar games — what actually made them win

| Tool (game) | Scale | The winning mechanic | Data/accounts | What communities say |
|---|---|---|---|---|
| **Poke Genie** (Pokémon GO) | **20M+ downloads, 4.8★ / 201K ratings** | Screenshot-scan IV checking — zero login, zero TOS risk, works *while playing* (keyboard overlay). Then stacked social utility on top: remote-raid matchmaking. | No account needed; scan stays on device | Praised: non-invasive ads, free core, rural-player raid access. Tiered IAP $2.99–$47.99 accepted happily. |
| **HoYoLAB** (Genshin/HoYo, official) | 15M+ Android installs | Daily check-in rewards (real in-game currency) + **home-screen resin widget** — the app earns a daily open before you even unlock the phone | Official account | The benchmark for official companions; whole GitHub ecosystems exist just to automate its check-in — that's how strong the daily hook is |
| **paimon.moe** (Genshin, fan) | de-facto standard wish tracker | Tracks *your* pity/pulls; **local-first browser storage + optional Google Drive backup**; import via script | No server accounts; your data stays yours | Trusted precisely because it stores nothing server-side |
| **Genshin Optimizer** (fan, OSS) | de-facto standard build tool | Constraint-solving optimizer over *your scanned artifacts* — finds builds humans can't; clean UI; relentless roadmap | Local data, open source | Praise for power + transparency; grumbles are feature requests, not trust issues |
| **akasha.cv** (Genshin, fan) | community leaderboards | Enter your UID → your builds ranked against everyone's. Benchmarking = infinite return visits | Reads public in-game showcase; no login | Players use it to validate niche builds ("is anyone making this work?") |
| **Pikalytics** (competitive Pokémon) | the VGC meta site | Live usage stats from tournaments/ladder: top mons, items, spreads, *teammates*. The meta changes weekly → players check weekly | Public data aggregation | Community actively tells newcomers "Serebii is not for battle info — go to Pikalytics" |
| **Serebii / PokémonDB / Bulbapedia** | the encyclopedias | News + complete dex data; Serebii's daily news makes it a habit, not a lookup | None | Loved, but nobody "lives" in a dex — retention comes from the news layer |
| **Pokémon HOME** (official) | millions of forced users | **Anti-example.** $15.99/yr to move your own creatures; storage never expanded; one-way "Pokémon prison" transfers; GTS flooded with impossible requests | Mandatory Nintendo account | Metacritic/user reviews are brutal. Official ≠ good. Fan tools win on generosity |
| **Marriland Team Builder** (Pokémon) | evergreen | One question answered perfectly: team-wide weakness/resistance table at a glance; 9 languages | None; stateless | Beloved for doing one thing instantly with zero friction |
| **Kiranico** (Monster Hunter) | the MH database | Per-game datamined DBs up within days of release (mhwilds.kiranico.com live for Wilds); other tools build on its data | None | Trusted as raw truth; UI spartan and nobody cares |
| **Athena's ASS** (Monster Hunter) | legendary desktop tool | Constraint solver for armor: "without it you fit 5 skills; with it, 6 offensive + 2 defensive + 1 luxury." **Optimizers that beat hand-planning become mandatory** | Local desktop | Decade of reverence; the archetype PalCalc (and our planner) descends from |
| **objmap / objmap-totk** (Zelda, zeldamods) | the completionist map | Every object from the game files with respawn data + checklists; integrates with modding tools | Local; open source | The "game-file truth" archetype for maps |
| **MapGenie** (Elden Ring etc.) | biggest map platform | 4,000+ locations, cross-device sync of found-markers, notes | Account for sync; Pro paywall | Mixed: people pay fast when value is obvious, but paywall resentment created a free-unlock extension; app bugs (blank map, jumpy UI) fuel 1★ reviews |
| **Wowhead** (WoW) | 64.6M visitors | User-generated data via client uploads + comment culture on every DB page; premium removes ads | Optional accounts | The encyclopedia endgame — reachable only with a huge community; not our v2 fight |
| **Raidbots** (WoW) | the simulator | **Provably-correct simulation as a service** (SimulationCraft in the browser) + Droptimizer: "sim every drop in the raid, tell me what to farm." Personal, correct, actionable. Premium = faster compute queue | Account for premium; sims from your character string | So trusted players petition Blizzard to build it into the game. The archetype Palforge should grow into |

---

## 7. The ten lessons, each with evidence

1. **Personal state beats reference data for retention.** Poke Genie (your
   scans, 20M installs), paimon.moe (your pity), Raidbots Droptimizer (your
   gear), HoYoLAB (your resin, on a widget) are daily drivers; Serebii and
   PokémonDB are visits. *Palforge translation: the owned box, active routes,
   and hatch counters are the product; the Paldex is the lobby.*
2. **Correctness only wins if it's visible.** Raidbots earned trust by running
   the community's own open simulator; every Palworld calc claims "from the
   game files" (paldb.gg, palbreeder, XGamingServer) and none shows proof —
   while shipping contradictions (44,850 vs 44,851 rows; 134 vs 144 vs 185
   unique combos; 0.6% vs 1% mutation). *Show the oracle: a "verified against
   44,851 game-file outcomes, build N, date D" badge in-app, and a public
   verification page.*
3. **A version reset is a land grab — data *pipelines* win it, snapshots lose
   it.** 1.0 killed PalSphere-class apps (stuck at Pal #111), wounded Paltopia
   (accuracy reviews), left XGamingServer advertising EA-era numbers, and
   minted new winners that update in days (paldb.cc Aug 12, Game8 Aug 7,
   PalCalc Aug 2). *Our extract_from_kb.py pipeline + oracle re-run must be a
   one-command ritual after every patch — it's a competitive weapon, not
   plumbing.*
4. **Import friction is the reach ceiling.** Best-in-class data import
   (PalCalc save reading) reaches thousands on Windows; frictionless import
   (Poke Genie screenshots) reached 20 million on phones. paimon.moe sits in
   between (PowerShell script — PC players only). *Ladder: manual box entry
   (now) → desktop save-import helper that hands off to the phone (v2) →
   screenshot import of a Pal's status screen (v3 moonshot; palworld.tools'
   "IV recovery from status screen" hints it's tractable).*
5. **Local-first with optional sync is the fan-tool trust contract.**
   paimon.moe (browser + your own Google Drive), Genshin Optimizer (local),
   Poke Genie (no login) — versus Pokémon HOME threatening to delete your
   creatures when the sub lapses. *Palforge: everything works logged-out and
   offline; sync is opt-in and exportable.*
6. **Optimizers become mandatory; lookups stay optional.** Athena's ASS
   ("one more skill than you could fit by hand"), Genshin Optimizer, Raidbots,
   PalCalc — tools that *beat manual planning* get institutionalized by their
   communities. Game8's chain calc and OP.GG's route calc show the market
   drifting this way with species-only toys. *Our planner with real
   probabilities and egg-cost math is the "one more skill" moment for breeding.*
7. **Charge for convenience and compute, never for facts.** Accepted: Raidbots
   premium (faster sims), Wowhead premium (no ads), Poke Genie tiers
   (faster scans, raid hosting), Paltopia $4.99–8.99. Punished: PalCodex 1.0★
   ($0.99/wk for googleable data), MapGenie Pro (bypass extension, cross-
   platform price complaints), Pokémon HOME ($15.99/yr hostage storage).
8. **Completion tracking is chronically underbuilt and loudly demanded.**
   Paltopia reviews ask for caught/alpha/lucky tracking and map check-offs;
   PalMap's review says the missing checklist makes it uncompetitive;
   Palpedia built a dedicated Pal Tracker; objmap/MapGenie made found-markers
   core. *Cheap to build on top of our Paldex; disproportionate goodwill.*
9. **Community benchmarking creates the return visit that data can't.**
   akasha.cv (build leaderboards from UIDs), Pikalytics (weekly meta), Wowhead
   (comments). *v3+: anonymized aggregate stats from opted-in Palforge users —
   "your Jetragon is faster than 92%," real hatch-rate telemetry that settles
   the mutation-odds argument publicly.*
10. **There is no official companion and the official-app bar is low.**
    Pocketpair ships no companion (the App Store "Palworld" is the Mac game);
    when officials do ship, they under-deliver (Pokémon HOME) or demand an
    ecosystem no indie has (HoYoLAB's reward-funded check-ins). *The window is
    open; the standard to beat is fan-tool generosity, not official polish.*

---

## 8. What Palworld players are asking for (demand evidence)

- **Catch/completion tracking with variants** — Paltopia review: wishes for
  tracking "what pals you've caught… and if you've caught the alpha or lucky
  variants," plus map check-offs that grey out completed bosses. PalMap
  review: "the lacking checklist" keeps it behind web maps. Palpedia shipped
  a tracker; palpedia.com markets a "Pal Tracker – full checklist & catch
  bonus tracker." *(Also directly feeds the in-game catch-bonus mechanic —
  utility, not just collection OCD.)*
- **Progress on the phone, synced from the game** — PalSphere's PC-save sync
  was novel enough for press coverage (Dot Esports: "Track on the go") and
  users called it "a great help"; it died with the app. PalCalc's most-used
  feature per its Steam-forum fans is that it plans "using your own pals."
- **Offline** — Palverse exists explicitly "for offline use"; Palworld Map
  Companion leads with "offline map"; our PWA already delivers this — keep it
  in the native app.
- **Verified odds for the new 1.0 systems** — mutation base rate is publicly
  contested (PinDrop: "nearer 0.6% than 1%… unconfirmed"; XGamingServer/
  PalMods: ~1% base / ~3% with Extravagant Cake; Pocketpair has published
  nothing). PalCalc's README begs for community help on breeding-duration
  and wild-passive distributions. Nobody can answer; a provably-correct odds
  lab plus opt-in hatch telemetry can.
- **Post-1.0 trustworthy answers at all** — the Medium explainer market
  ("your calculator might be using the wrong data"), Steam threads asking
  which calc is current, and palbreeder building its landing page around
  "most pre-1.0 combos now hatch something different" all show players know
  they're being lied to by stale tools and have no way to tell who's right.

---

## 9. Prioritized opportunities for Palforge v2+ (demand evidence × feasibility)

| # | Build | Why (evidence) | Feasibility | Verdict |
|---|---|---|---|---|
| 0 | **Re-extract data against the Aug 12 build & re-run oracle; then put the build number + "verified" badge in the UI and a public /verification page** | §12 finding: paldb.gg serves build 4797106687 (Aug 12); Terraria-collab content appears in paldb.cc. Correctness is our brand; being one build stale kills it. Lesson 2 & 3. | Trivial — pipeline exists (`tools/extract_from_kb.py` + oracle) | **Do first, this week** |
| 1 | **Paldex completion tracker: caught / alpha / lucky per Pal + catch-bonus progress, offline, exportable** | The single most-requested feature across three competing apps' reviews (§8). Paltopia's collector mode is the incumbent bar; ours ties into routes ("you already own a parent"). | Low — UI + local storage on existing Paldex | **v2 flagship #1** |
| 2 | **Box import: desktop helper (or web drop-zone) that parses the save read-only and hands the box to the phone via QR/link** | PalSphere proved demand and died; PalCalc proves feasibility (MIT parsing stack incl. 1.0 GlobalPalStorage.sav — PalEdit fork, Palbox Studio, PalworldSaveTools all read it); XGamingServer even parses .sav in-browser. Removes the #1 friction from our best feature (routes from owned box). Read-only keeps us clean of the editor/cheating lane. | Medium — parsing is solved OSS; the handoff UX is ours to design | **v2 flagship #2** |
| 3 | **Odds Lab v2: mutation & cake math with explicit confidence labels ("game-file fact" vs "community estimate"), plus opt-in anonymous hatch telemetry to settle the rates** | Publicly contested numbers (0.6% vs 1% vs 3%); PinDrop openly punts; OP.GG labels theirs beta; PalCalc begs for data. First mover to *measured* rates becomes the citation. Lessons 2 & 9. | Math: low. Telemetry: medium (needs opt-in + a tiny backend) | **v2, math now, telemetry v2.5** |
| 4 | **Hatch/route execution mode: live egg counters, per-step check-offs, expected-vs-actual eggs, incubation timers with notifications (+ lock-screen widget later)** | PalCalc just added step checkboxes (Aug 1) — the market is moving from *plan* to *execute*; HoYoLAB's widget shows timers drive daily opens (Lesson 1). Nobody has this on a phone. | Low-medium — planner already produces steps | **v2.5 — this is the daily-driver hook** |
| 5 | **"Where do I get the parents": spawn locations + Alpha respawns inline in every route step** | Kills the tab-switch to map sites at the exact moment of need; our data files already carry spawns; map incumbents (§5.6) don't do routes. | Low — data exists in `pals_1_0.json` | **v2.5** |
| 6 | **Team builder / element-coverage matrix (Marriland-style) + capture-odds calc** | Marriland archetype: one-glance coverage table is evergreen; palworld.gg/OP.GG have shallow versions with no box awareness — ours reads the imported box. | Medium | v3 |
| 7 | **Community meta layer: anonymized usage/leaderboards ("top bred targets this week," IV percentiles)** | akasha.cv/Pikalytics lesson — benchmarking = retention; needs user base first. | High (backend, privacy) | v3+, after 2 & 3 seed the data |
| 8 | **Screenshot import (OCR a Pal's status screen → box entry)** | Poke Genie's 20M-download mechanic; palworld.tools' status-screen IV recovery suggests the screen carries enough info; would make console players (no save access) first-class. | High (OCR across languages/resolutions) | v3 moonshot — prototype on iOS Vision APIs |
| 9 | Full interactive map product | Served by th.gl/MapGenie/OP.GG; heavy content maintenance; paywall resentment zone | High | **Don't build.** Integrate (see #5) |
| 10 | In-game overlay / PC second-screen app | th.gl/Overwolf own it; PC-only lane off our roadmap | High | **Don't build.** The phone is the second screen |

---

## 10. Monetization guidance (what fans accept, what they punish)

**Accepted patterns (evidence):** free core + one-time unlock or modest sub
for *convenience*: Paltopia $4.99/$8.99 at 4.8★; Poke Genie $2.99–$47.99
tiers under a free scanner, praised in reviews; Raidbots premium = faster
compute; Wowhead premium = no ads; th.gl = free + Patreon.

**Punished patterns (evidence):** PalCodex $0.99/week for lookup data →
1.0★; MapGenie Pro data-paywall → community bypass extension + pricing
complaints; Pokémon HOME's hostage-storage sub → review bombing.

**Recommendation for Palforge:** keep every fact and calculator free
forever. If/when we monetize: a single lifetime "Supporter/Pro" unlock
($4.99–$9.99, matching Paltopia's proven anchor) covering cosmetics, cloud
sync/backup, widgets, and future compute-heavy features (deep route search,
telemetry dashboards). No ads ever — it's a differentiator against OP.GG,
Game8, and Paltopia's free tier, and it keeps us small enough to stay
comfortably inside Pocketpair's non-commercial comfort zone (§11).

---

## 11. IP & compliance guardrails

1. **Pocketpair's Derivative Works Guidelines (updated 2024-01-18)** permit
   fan creations without prior approval but prohibit: (a) *"highly
   business-like, profit-driven use, paid or unpaid"*, (b) anything
   *"mistakable for official products"*, (c) rights-infringing or offensive
   content. They answer no individual inquiries and may change terms anytime.
   **Consequences for us:** keep monetization modest and clearly
   supporter-style (a $200k/yr subscription business would test clause (a);
   a tip-jar unlock does not); never use "Palworld" alone as the app name
   ("Palforge — tools for Palworld" style subtitle is the established safe
   pattern; every competitor carries "unofficial / not affiliated with
   Pocketpair, Inc." — we must too, in-app and on the store listing).
2. **Game assets are the real exposure.** Pal names, stats, and numbers are
   facts (not copyrightable); official renders/icons/key art are Pocketpair's
   property. Competitors use ripped icons ubiquitously and Pocketpair has not
   (as of 2026-08) issued takedowns against *tools* — the only Palworld
   takedown on record is **Nintendo** DMCA-ing the Pokémon-model mod (Jan
   2024). Risk-tiered policy: prefer our own iconography/silhouettes where
   cheap; if using game images, be ready to swap them out within days;
   absolutely nothing Pokémon-adjacent, ever (Nintendo v. Pocketpair patent
   suit is still live; Nintendo's fan-project record — Pokémon Essentials
   DMCA, 379 games purged from Game Jolt, Uranium, AM2R — shows what the
   worst-case rights-holder does; Pocketpair is demonstrably not that, and
   positions itself mod-tolerant, but we should behave as if terms can
   harden overnight).
3. **Read-only stance on saves.** Import, never edit. Save *editors* live in
   a gray zone reputationally (cheating) and are the likeliest first target
   if Pocketpair ever polices tools. Our box import parses and displays.
4. **App Store precedent is good:** unofficial Palworld companions (Paltopia,
   PalSphere, guides) have lived on iOS for 2+ years without removal. Apple's
   practical bar: don't use the game's name as your app *title*, don't use
   official art as your *icon*, carry the disclaimer.
5. **Data provenance:** we extract from community datamine repos
   (beliarance/palworld-kb) as does the entire ecosystem (PalCalc's MIT
   dataset is openly reused by PinDrop). This is normalized practice; keep
   our extraction scripts and sources documented (they already are in
   `00_START_HERE.md`) so the chain of custody is defensible.
6. **Telemetry (opportunity #3/#7):** if we collect hatch stats, collect
   zero personal data, opt-in only, publish the aggregates openly — the
   paimon.moe/akasha trust contract, and it doubles as marketing.

---

## 12. Open verification actions (things only our oracle can settle)

- [ ] **Data freshness (urgent):** paldb.gg reports game build 4797106687
  (2026-08-12); paldb.cc shows a "hide Terraria Monster" filter (collab
  content in data). Our extraction dates to the July build (palworld.tools
  cites 24088745 / July 13 for the same era). Re-clone palworld-kb, re-run
  `tools/extract_from_kb.py` + `extract_passives.py`, re-run the 62-test
  suite. If the collab added breedable Pals, our 44,851-row oracle and the
  "299/300 Pals" copy both change.
- [ ] **Unique-combo count discrepancy:** we ship 134 unique + 1
  gender-locked; PinDrop says 144 special; paldb.gg says 185 hand-authored.
  Either builds differ or someone counts differently (e.g., including
  same-species-only legendary locks as "unique combos"). Settle it from the
  fresh extraction and publish the number with its definition on the
  verification page — it's a marketing weapon.
- [ ] **palbreeder's 44,850 vs our 44,851:** consistent with them collapsing
  the gender-order-dependent Katress/Wixen pair into one row. Confirm from
  our table that the correct enumeration is 44,851 (C(299,2)+299 self-pairs
  +1 gender-order duplicate) before we use this in public comparisons.
- [ ] **Penking+Bushi → Sibelyx** (palbreeder's headline example): confirm
  against our oracle so we can cite it as verified rather than repeated.
- [ ] **Mutation rates:** our `verification.json` should record what the game
  files actually pin down vs. what remains empirical, so Odds Lab v2 can
  label every number "file fact" or "community estimate (n eggs)."

---

## 13. Sources

**Palworld tools — web:**
- https://paldb.cc/en/Breed and https://paldb.cc/en/Breeding_Farm
- https://palworld.gg/ and https://palworld.gg/breeding-calculator and https://palworld.gg/map
- https://www.palworld.tools/
- https://op.gg/palworld/breeding and https://op.gg/palworld/map
- https://game8.co/games/Palworld/archives/440530 and https://game8.co/games/Palworld/archives/439640
- https://paldb.gg/breeding/
- https://pindrop.gg/palworld/breeding and https://pindrop.gg/palworld/map
- https://palbreeder.com/ and https://palbreeder.com/mutation-calculator
- https://palbreeding.com/ · https://palbreed.com/ · https://www.palpedia.net/ · https://www.palpedia.net/breeding · https://palpedia.com/ · https://palpedia.com/tools/pal-tracker
- https://xgamingserver.com/tools/palworld/breeding-calculator and https://xgamingserver.com/tools/palworld/save-editor and https://xgamingserver.com/blog/palworld-mutations-guide/
- https://www.palmods.gg/ and https://www.palmods.gg/tools and https://www.palmods.gg/guides/whats-new/mutation
- https://palsphere.app/ and https://palsphere.app/about
- https://palworldcompanion.com/
- https://palworld.th.gl/ and https://www.th.gl/apps/palworld and https://www.th.gl/companion-app
- https://medium.com/beyond-the-game/your-palworld-breeding-calculator-might-be-using-the-wrong-data-fea35a8fa62a
- https://www.pikammo.fr/Palworld/en/news/palworld-1-0-genetic-recombination · https://gamingbolt.com/palworld-1-0-guide-new-mutation-mechanic-and-how-best-to-use-it · https://palworldgame.wiki/guides/mutations-guide/ · https://palpikt.com/guides/mutation-pals-eggs/

**Palworld tools — desktop/save ecosystem:**
- https://github.com/tylercamp/palcalc and https://github.com/tylercamp/palcalc/releases and https://www.nexusmods.com/palworld/mods/1651
- https://steamcommunity.com/app/1623730/discussions/0/691996377956354519/ (PalCalc praise thread)
- https://github.com/EternalWraith/PalEdit · https://www.nexusmods.com/palworld/mods/4427 (Palbox Studio) · https://github.com/deafdudecomputers/PalworldSaveTools · https://palsaveeditor.com/ · https://github.com/KrisCris/Palworld-Pal-Editor
- https://www.curseforge.com/palworld/blueprint-code-mods/pal-analyzer and https://www.pcgamesn.com/palworld/mod-pal-analyzer
- https://www.overwolf.com/browse-by-game/palworld and https://www.overwolf.com/app/azerpug-paldeck_enhanced

**Palworld — mobile apps:**
- https://apps.apple.com/us/app/paltopia-pal-tools-map/id6476646632
- https://apps.apple.com/us/app/palsphere-paldex-and-info/id6477295374
- https://apps.apple.com/us/app/palcodex-pal-companion/id6792511390
- https://apps.apple.com/us/app/palworld/id6503918400 (official Mac game listing)
- https://play.google.com/store/apps/details?id=com.xerxz.palworldmap (Palworld Map Companion)
- https://play.google.com/store/apps/details?id=com.palworld.breedingcalculator
- https://apps.apple.com/us/app/palworld-pals-guide/id6477204622 · https://apps.apple.com/us/app/pals-guide-for-palworld-game/id6478479126 · https://apps.apple.com/us/app/palmap-find-and-explore-pals/id6476887925
- https://toastycatstudios.itch.io/palverse · https://bl4cksh33p.itch.io/super-pal
- https://dotesports.com/palworld/news/track-on-the-go-this-incredible-palworld-app-adds-paldeck-to-your-phone

**Market size / 1.0 launch:**
- https://allthings.how/palworld-1-0-update-drives-its-steam-player-count-toward-1-million/
- https://massivelyop.com/2026/07/21/palworld-has-now-hit-nearly-a-million-concurrent-players-since-its-1-0-launch/
- https://game8.co/articles/latest/palworld-1-0-becomes-one-of-steams-biggest-launches-ever-with-850-thousand-players
- https://www.forbes.com/sites/paultassi/2026/07/11/both-palworld-and-palworld-10-are-in-steams-best-ever-playercount-list/
- https://www.resetera.com/threads/palworld-full-release-surpasses-855-000-concurrent-players-on-steam.1574392/
- SEMrush traffic estimates via https://cw.semrush.com/website/palworld.gg/overview and related pages

**Gold standards — other games:**
- https://apps.apple.com/us/app/poke-genie-remote-raid-iv-pvp/id1143920524
- https://www.appbrain.com/app/hoyolab/com.mihoyo.hoyolab and https://www.hoyolab.com/article/17210708 (widget) and https://genshin-impact.fandom.com/wiki/HoYoLAB_Community_Daily_Check-In
- https://paimon.moe/ and https://github.com/MadeBaruna/paimon-moe
- https://github.com/frzyc/genshin-optimizer
- https://akasha.cv/leaderboards and https://thegamercodex.com/en/genshin-impact/tools/akasha-system
- https://www.pikalytics.com/ and https://www.threads.com/@pkmncast/post/DXSLxAslPzD/
- https://www.imore.com/pokemon-home-review and https://www.metacritic.com/game/pokemon-home/ and https://justuseapp.com/en/app/1485352913/pok%C3%A9mon-home/reviews
- https://marriland.com/tools/team-builder/
- https://mhwilds.kiranico.com/ and https://mhworld.kiranico.com/en
- https://monsterhunter.fandom.com/wiki/Athenas_Armor_Set_Search
- https://objmap.zeldamods.org/ and https://github.com/zeldamods/objmap-totk
- https://apps.apple.com/us/app/mapgenie-elden-ring-map/id1618843254 and https://github.com/V1P3R-FMG/free-map-genie/issues
- https://en.wikipedia.org/wiki/Wowhead and https://www.wowhead.com/premium
- https://www.raidbots.com/ and https://support.raidbots.com/article/59-droptimizer-how-does-it-work and https://www.icy-veins.com/wow/how-to-sim-your-wow-character-a-guide-to-raidbots

**IP / policy:**
- Pocketpair Derivative Works Guidelines: https://www.pocketpair.jp/guidelines-derivativework
- https://backyarddrunkard.com/games/can-you-use-mods-in-palworld-1-0/
- Nintendo v. Pocketpair and mod takedown: https://www.techradar.com/gaming/nintendo/after-months-of-silence-nintendo-and-the-pokemon-company-are-finally-suing-palworld · https://en.wikipedia.org/wiki/Intellectual_property_protection_by_Nintendo · https://www.nintendolife.com/news/2026/05/pocketpair-continues-to-defy-nintendo-with-new-palworld-trademark
- Nintendo fan-project history: https://www.techspot.com/news/76202-nintendo-slaps-fan-game-creation-tool-pokemon-essentials.html · https://www.nintendolife.com/news/2021/01/nintendo_issues_mass_dmca_takedown_379_fan-made_games_forcibly_removed · https://www.cbr.com/most-infamous-nintendo-fan-game-shutdowns/
