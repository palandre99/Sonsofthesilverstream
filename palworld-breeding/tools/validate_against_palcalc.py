#!/usr/bin/env python3
"""Validate the planner's species formula against palcalc's 1.0 oracle.

palcalc (github.com/tylercamp/palcalc) ships db.json (per-pal BreedingPower,
i.e. CombiRank, straight from the game files) and breeding.json with every
precomputed 1.0 breeding result. If our child_of() agrees with all of them,
the formula, the pool model and the tie-break are right by construction.

    python3 tools/validate_against_palcalc.py /path/to/palcalc/PalCalc.Model

Exits non-zero on any mismatch.
"""
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
import planner as P

MODEL = Path(sys.argv[1] if len(sys.argv) > 1 else
             "/tmp/claude-0/-home-user-Sonsofthesilverstream/"
             "5e674572-0e9a-533d-91dd-612082eed86c/scratchpad/palcalc/PalCalc.Model")


def main() -> int:
    db = json.loads((MODEL / "db.json").read_text())
    br = json.loads((MODEL / "breeding.json").read_text())["Breeding"]

    to_en = {p["InternalName"]: p["LocalizedNames"]["en"] for p in db["Pals"]}
    power = {p["LocalizedNames"]["en"]: p["BreedingPower"] for p in db["Pals"]}

    # 1) name coverage
    ours = set(P.RANKS)
    theirs = set(to_en.values())
    only_ours = sorted(ours - theirs)
    only_theirs = sorted(theirs - ours)
    print(f"species: ours {len(ours)}, palcalc {len(theirs)}, "
          f"only-ours {only_ours}, only-palcalc {only_theirs}")

    # 2) CombiRank cross-check
    rank_diff = [(n, P.RANKS[n], power[n]) for n in ours & theirs
                 if P.RANKS[n] != power[n]]
    print(f"CombiRank mismatches vs palcalc BreedingPower: {len(rank_diff)}")
    for n, a, b in rank_diff[:10]:
        print(f"  {n}: kb {a} != palcalc {b}")

    # 3) full result-table replay
    n_ok = n_bad = n_skip = 0
    bad = []
    for row in br:
        a = to_en.get(row["Parent1InternalName"])
        b = to_en.get(row["Parent2InternalName"])
        c = to_en.get(row["ChildInternalName"])
        if not (a in ours and b in ours and c):
            n_skip += 1
            continue
        if row["Parent1Gender"] != "WILDCARD" or row["Parent2Gender"] != "WILDCARD":
            # the gendered Katress/Wixen rows: check against our gendered table
            wanted = {(g["mother"], g["father"]): g["child"]
                      for g in P.BREEDING["gendered_combos"]}
            mother = a if row["Parent1Gender"] == "FEMALE" else b
            father = b if mother == a else a
            ok = wanted.get((mother, father)) == c
            n_ok += ok
            n_bad += not ok
            if not ok:
                bad.append((f"{a}({row['Parent1Gender']})",
                            f"{b}({row['Parent2Gender']})", c, "gendered-mismatch"))
            continue
        got = {ch.species for ch in P.children_of(*sorted((a, b)))}
        if c in got:
            n_ok += 1
        else:
            n_bad += 1
            if len(bad) < 25:
                bad.append((a, b, c, "+".join(sorted(got))))
    print(f"breeding rows: OK {n_ok}, MISMATCH {n_bad}, skipped (unmapped) {n_skip}")
    for a, b, c, got in bad:
        print(f"  {a} + {b}: palcalc {c}, ours {got}")
    return 1 if (n_bad or rank_diff) else 0


if __name__ == "__main__":
    raise SystemExit(main())
