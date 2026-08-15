# C4 — Suggestion Engine v2: research + build plan

*Started 2026-08-15 ~18:00. CEO mandate: fighting tab, "best pals in the
game" tab, MORE suggestions per tab, stage-aware brain that reads MY box,
mounts + passive-utility pals. Everything sourced; meta claims labelled
community, mechanics from the dump.*

## Research so far (cross-check before shipping ANY list)

Source 1 — game8 tier list (fetched 2026-08-15, game8.co/games/Palworld/archives/440209):
- Combat S: Knocklem Ignis, Eidrolon Ignis, Bellanoir Libero, Orserk,
  Blazamut Ryu, Shaolong, Dandilord, Moldron, Bastigor, Frostallion Noct,
  Anubis, Frostallion, Jormuntide Ignis, Silvegis, Neptilius, Hartalis, Felbat
- Combat A: Jetragon, Necromus, Lyleen Noct, Shadowbeak, Blazamut,
  Jormuntide, Selyne, Lovander, Bushi Noct, Dualith, Xenolord
- Work SS: Anubis, Sekhmet, Knocklem, Eidrolon, Solenne, Orserk, Bastigor,
  Shaolong, Dandilord (+ Terraria-collab humans: Legendary Grocer/Pharmacist/
  Gourmet/Game Hunter, Dr. Brawn, Eye of Cthulhu)
- Mounts: FLYING SS Jetragon ("fastest top speed", low stamina) + Xenolord
  (more stamina); GROUND SS Necromus/Hartalis/Paladius; WATER SS Neptilius;
  GLIDER SS Galeclaw ("still the fastest glider")
- Combat support: Prixter, Celesdir Noct, Silvegis, Solenne
- STILL NEEDED: cross-check vs pindrop.gg/palworld/tier-list and
  palworldguides.com/tier-list before any list ships. One source is a rumor.

Source 2 — pending. Source 3 — pending.

## The data-first insight (do this FIRST, it needs no external source)

Our dump already carries `partner_skill` + `partner_effect` text for all 299.
MINE IT: classify pals into utility roles by parsing partner_effect —
- carrying capacity / weight reduction ("carrying capacity", "weight")
- drop-rate boosters ("drop more items", "% more items")
- logging/mining/gathering efficiency ("efficiency")
- mount speed hints ("can be ridden", "while mounted")
- gliders ("glider")
- farming/ranch (already in helpers.ts)
This gives PROVABLE utility squads (Cattiva/Broncherry/Wumpo-class weight
pals, Gumoss logging assistance, etc.) with zero community dependency.
Community tier lists ONLY label the subjective "best overall/fighting" sets,
shown with a "community consensus" provenance chip in the UI.

## Stage-aware brain (C4c) — design sketch

Player stage from the box, no questions asked:
- `stageLevel` = max wild-catchable level implied by owned pals? NO — the box
  has no levels. Honest proxies we DO have: box size, highest rarity owned,
  fraction of endgame (rarity>=8) species owned, reachable-set size (closure).
- Suggestion filter: candidate pools per tab are ranked by
  (a) VALUE (tier/job level), then
  (b) ATTAINABILITY for THIS box: breed distance (planFor addSteps from
  roster — cached, computed lazily per tab open, worker/deferred so no JS
  freeze) or catchability (minWild level vs stage proxy).
- Early player (few pals): hide rarity-20 grind, lead with "great now" picks
  (low addSteps / low minWild). Late player: lead with the missing top-metas.
- Reuse helperAdvice's costing pattern; NEVER run 299 planFor calls on tap —
  budget: rank statically first, cost only the top ~8 per tab.

## Tabs (C4a/C4b/C4d)

Suggested-goals sections become: Cake supply · Speed & luck · Aura ·
Fighting (community-labelled) · Best in game (community-labelled) ·
Mounts: Flying / Ground / Glider (data: mount field + community speed) ·
Utility partner skills (data-mined) · Best at each job (already live,
raise to top-5 collapsed / top-8 expanded — CEO wants MORE than 3).

## Status
- [x] Ledger intake (AI_TODO §C4)
- [x] Source 1 fetched
- [x] 2026-08-15 18:05 partner_effect miner SHIPPED —
      tools/extract_utility_roles.py → utilityRoles.g.ts both platforms:
      efficiency 9 (Digtoise ore-mining 800-2000%, Fuddler, Gumoss…),
      weight 8 (Reptyro ore, Turtacle 80-100% ore, Cattiva/Lunaris carry),
      drops 35, gliders 5, mounts flying 29 / ground 83 / swim 9.
      All verbatim game text. NOTE: one truncated effect string spotted
      (Ribbuny Botan ends mid-sentence "…or") — upstream kb truncation;
      check kb clone before quoting it in UI.
- [x] 2026-08-15 ~22:15: the 7 saddle-less mounts VERIFIED correct — Panthalus
      is rideable with no saddle item (paldb partner skill: "Can be ridden as
      a flying mount", no technology entry), and the 6 Terraria-collab slimes
      likewise carry no saddle item. nulls are true data, not fetch misses.
- [x] Sources 2-3 cross-check done (pindrop fetched; palworldguides is
      JS-rendered/no content; playerauctions 403; skycoach rejected as dated
      — noted in meta.ts)
- [ ] Stage-aware ranking in engine (shared, mirrored, tested)
- [ ] SuggestedGoals v2 UI: Fighting · Best in game · Mounts (fly/ground/
      glider) · Utility squads · top-5/8 per job — provenance chips
      ("game data" vs "community consensus") on every tab
