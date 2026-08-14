# Eggfabrikken — Palworld 1.0 breeding-planlegger

Pål-Andres verktøy for å bre seg fram til de beste palsene i Palworld 1.0 —
kun breeding, ingen fangst. Regner ut korteste delte breeding-tre fra rosteret
til alle mål, og genererer **den ultimate breeding-guiden** som HTML med ekte
palikoner, stats og avkryssing.

## Kom i gang

Krever bare Python 3 (ingen pakker, ingen nett etter kloning):

```bash
python3 planner.py plan              # hele planen i terminalen
python3 planner.py what Katress Wixen   # hva gir ett par?
python3 planner.py path Anubis       # billigste vei til én art
python3 planner.py reachable         # hvilke arter kan nås?
python3 planner.py add Frostplume    # ny pal i boksen -> oppdatert plan
python3 build_guide.py               # regenerer guide/index.html
python3 -m unittest discover tests   # kjør alle testene
```

Rediger `roster.txt` (palene dine) og `targets.txt` (målene) fritt —
begge er rene tekstfiler.

## Filene

| Fil | Hva |
|---|---|
| `planner.py` | motoren: artsformel, nåbarhet, korteste delte tre, CLI |
| `build_guide.py` | genererer guiden (`--embed` lager frittstående versjon med innbakte ikoner) |
| `roster.txt` / `targets.txt` | dine pals og mål — redigerbare |
| `guide/index.html` | **guiden** — åpne i nettleser; avkryssing lagres lokalt |
| `guide/icons/` | 298 ekte spillikoner (github.com/dbgoodm/PalDex, game-dump) |
| `data/breeding_1_0.json` | CombiRanks, 134 unike + 2 kjønnsavhengige kombos, pulje-eksklusjoner |
| `data/pals_1_0.json` | stats, arbeidsnivåer, partner skills, spawn-info per art |
| `data/oracle_pairs.json.gz` | fasit: alle 44 851 1.0-resultater (palcalc, generert fra spillfilene) |
| `data/verification.json` | 23 kryssjekkede påstander med status og kilder |
| `tools/extract_from_kb.py` | regenererer datafilene fra beliarance/palworld-kb |
| `tools/validate_against_palcalc.py` | replay av hele fasiten mot motoren |
| `tests/` | 10 tester: 31 kjente par + strukturelle egenskaper + full orakel-replay |

## Hvorfor det stemmer

Artsformelen (mål `⌊(rankA+rankB+1)/2⌋`, generisk pulje på 183 arter,
tie-break til høyeste CombiRank) er **replikert mot alle 44 851
forhåndsberegnede 1.0-resultater** fra palcalc — null avvik — og kryssjekket
av 8 uavhengige research-agenter (se `data/verification.json`).
Katress+Wixen er spillets eneste kjønnsavhengige par og håndteres eksplisitt.

## Teknologivalg

Python 3 uten avhengigheter: forhåndsinstallert på det meste, én fil å kjøre,
og dataene ligger i versjonerte JSON-filer med kilde og dato. Guiden er ren
statisk HTML uten byggverktøy — funker offline, i alle nettlesere, og kan
legges rett på GitHub Pages.

## Ved spillpatch

1. Oppdater klonen av `beliarance/palworld-kb` (eller tilsvarende datasett).
2. `python3 tools/extract_from_kb.py <sti>` — nye datafiler med ny dato.
3. `python3 -m unittest discover tests` — orakelet avslører formelendringer.
4. `python3 build_guide.py` — ny guide.

Datert 2026-08-14 · Palworld 1.0 (10. juli 2026) · nivåtak 80.
