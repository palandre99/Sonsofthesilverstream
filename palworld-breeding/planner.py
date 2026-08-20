#!/usr/bin/env python3
"""Palworld 1.0 breeding planner.

Computes which species are reachable from a roster by breeding alone, and a
shortest shared breeding plan (common intermediates counted once) to a list
of target species. Pure stdlib; works offline once data/ exists.

Usage:
    python3 planner.py reachable            # how many / which species are reachable
    python3 planner.py what <PalA> <PalB>   # child of one pair (+ flags)
    python3 planner.py plan                 # full plan to targets in targets.txt
    python3 planner.py plan --targets "Anubis, Astegon"
    python3 planner.py add <Pal> [...]      # add pals to roster.txt and replan
    python3 planner.py path <Pal>           # cheapest derivation of one species

Roster file: roster.txt, one pal name per line ('#' comments allowed).
Targets file: targets.txt, same format.
"""
from __future__ import annotations

import argparse
import json
import sys
import unicodedata
from functools import lru_cache
from pathlib import Path

ROOT = Path(__file__).resolve().parent
DATA = ROOT / "data"


# ---------------------------------------------------------------- data loading

def _load(name: str) -> dict:
    return json.loads((DATA / name).read_text())


BREEDING = _load("breeding_1_0.json")
PALS = _load("pals_1_0.json")["pals"]
RANKS: dict[str, int] = BREEDING["combi_ranks"]
SELF_ONLY = set(BREEDING["self_breed_only"])
EXCLUDED = set(BREEDING["excluded_from_generic_pool"])
UNIQUE: dict[frozenset, str] = {
    frozenset(c["parents"]): c["child"] for c in BREEDING["unique_combos"]
}
# the one gender-dependent pair: same parents, two possible children
GENDERED: dict[frozenset, list[dict]] = {}
for c in BREEDING.get("gendered_combos", []):
    GENDERED.setdefault(frozenset((c["mother"], c["father"])), []).append(c)
# generic pool sorted by rank for nearest-rank lookup
POOL = sorted((s for s in RANKS if s not in EXCLUDED), key=lambda s: RANKS[s])
POOL_RANKS = [RANKS[s] for s in POOL]


def _norm(s: str) -> str:
    return unicodedata.normalize("NFKD", s).encode("ascii", "ignore").decode().lower().strip()


_BY_NORM = {_norm(n): n for n in RANKS}


def resolve(name: str) -> str:
    """Resolve a user-typed pal name to the canonical dataset name."""
    n = _norm(name)
    if n in _BY_NORM:
        return _BY_NORM[n]
    hits = [v for k, v in _BY_NORM.items() if k.startswith(n)]
    if len(hits) == 1:
        return hits[0]
    raise KeyError(f"Unknown pal: {name!r}" + (f" (candidates: {', '.join(hits)})" if hits else ""))


# ---------------------------------------------------------------- species rule

class Child:
    __slots__ = ("species", "kind", "tie_break", "margin", "gender_note")

    def __init__(self, species: str, kind: str, tie_break: bool = False,
                 margin: int | None = None, gender_note: str | None = None):
        self.species = species      # child species
        self.kind = kind            # 'self' | 'unique' | 'gendered' | 'generic'
        self.tie_break = tie_break  # True if result depends on the tie-break rule
        self.margin = margin        # rank distance to the runner-up (generic only)
        self.gender_note = gender_note  # which parent must be which gender


@lru_cache(maxsize=None)
def children_of(a: str, b: str) -> tuple[Child, ...]:
    """All possible child species of a + b (two results only for the one
    gender-dependent pair). Order-insensitive."""
    if a == b:
        return (Child(a, "self"),)
    key = frozenset((a, b))
    if key in GENDERED:
        return tuple(
            Child(c["child"], "gendered",
                  gender_note=f'female {c["mother"]} + male {c["father"]}')
            for c in GENDERED[key])
    if key in UNIQUE:
        return (Child(UNIQUE[key], "unique"),)
    target = (RANKS[a] + RANKS[b] + 1) // 2
    # nearest rank in pool; exact tie -> higher CombiRank wins (1.0-verified)
    best = min(POOL, key=lambda s: (abs(RANKS[s] - target), -RANKS[s]))
    dists = sorted(abs(r - target) for r in POOL_RANKS)
    tie = len(dists) > 1 and dists[0] == dists[1]
    margin = (dists[1] - dists[0]) if len(dists) > 1 else None
    return (Child(best, "generic", tie_break=tie, margin=margin),)


def child_of(a: str, b: str) -> Child:
    """Primary child of a + b (first possibility for the gendered pair)."""
    return children_of(a, b)[0]


# ---------------------------------------------------------------- reachability

def closure(roster: set[str]) -> set[str]:
    """All species reachable from the roster by breeding alone."""
    known = set(roster)
    frontier = set(roster)
    while frontier:
        new: set[str] = set()
        for a in frontier:
            for b in known:
                for ch in children_of(*sorted((a, b))):
                    if ch.species not in known:
                        new.add(ch.species)
        known |= new
        frontier = new
    return known


# ------------------------------------------------------- cheapest shared plans

Step = tuple[str, str, str]  # (parentA, parentB, child), parents sorted


def derivations(roster: set[str]) -> dict[str, frozenset[Step]]:
    """For every reachable species: the cheapest set of breeding steps that
    produces it from the roster. Cost = number of distinct steps (a shared
    intermediate is counted once). Fixpoint iteration; deterministic."""
    steps: dict[str, frozenset[Step]] = {s: frozenset() for s in roster}
    n_tie: dict[str, int] = {s: 0 for s in roster}

    def key(fs: frozenset[Step], ties: int):
        return (len(fs), ties, tuple(sorted(fs)))

    changed = True
    while changed:
        changed = False
        for a in sorted(steps):
            for b in sorted(steps):
                if b < a:
                    continue
                for ch in children_of(a, b):
                    c = ch.species
                    if c == a or c == b:
                        continue
                    step: Step = (a, b, c)
                    cand = steps[a] | steps[b] | {step}
                    ties = len({s for s in cand if child_of(s[0], s[1]).tie_break})
                    if c not in steps or key(cand, ties) < key(steps[c], n_tie[c]):
                        steps[c] = cand
                        n_tie[c] = ties
                        changed = True
    return steps


def plan_for(roster: set[str], targets: list[str]):
    """Union of cheapest derivations for all targets, in dependency order.

    Returns (ordered_steps, unreachable, derivs) where ordered_steps is a list
    of dicts with parents, child, kind/flags, wave number and the targets that
    depend on each step."""
    derivs = derivations(roster)
    unreachable = [t for t in targets if t not in derivs]
    wanted = [t for t in targets if t in derivs]

    all_steps: set[Step] = set()
    needed_by: dict[Step, set[str]] = {}
    for t in wanted:
        for s in derivs[t]:
            all_steps.add(s)
            needed_by.setdefault(s, set()).add(t)

    # dependency waves
    have = set(roster)
    remaining = set(all_steps)
    ordered = []
    wave = 0
    while remaining:
        wave += 1
        ready = sorted(s for s in remaining if s[0] in have and s[1] in have)
        if not ready:  # should not happen
            raise RuntimeError(f"dependency cycle among {remaining}")
        for a, b, c in ready:
            ch = next(x for x in children_of(a, b) if x.species == c)
            reused = sum(1 for (x, y, _) in all_steps if c in (x, y))
            ordered.append({
                "wave": wave,
                "parents": (a, b),
                "child": c,
                "kind": ch.kind,
                "tie_break": ch.tie_break,
                "margin": ch.margin,
                "gender_note": ch.gender_note,
                "is_target": c in wanted,
                "needed_by": sorted(needed_by[(a, b, c)]),
                "reused_as_parent": reused,
            })
            have.add(c)
            remaining.discard((a, b, c))
    return ordered, unreachable, derivs


# ----------------------------------------------------------------- roster I/O

def read_names(path: Path) -> list[str]:
    names = []
    for line in path.read_text().splitlines():
        line = line.split("#", 1)[0].strip()
        if line:
            names.append(resolve(line))
    return names


def load_roster() -> list[str]:
    return read_names(ROOT / "roster.txt")


def load_targets() -> list[str]:
    return read_names(ROOT / "targets.txt")


# ----------------------------------------------------------------------- CLI

def _fmt_step(s: dict) -> str:
    a, b = s["parents"]
    flags = []
    if s["kind"] == "unique":
        flags.append("unique recipe")
    if s["kind"] == "gendered":
        flags.append(f"GENDER LOCKED: {s['gender_note']}")
    if s["tie_break"]:
        flags.append("TIE-BREAK — verify!")
    elif s["kind"] == "generic" and s["margin"] is not None and s["margin"] < 10:
        flags.append(f"small margin ({s['margin']})")
    star = "★" if s["is_target"] else " "
    return (f"  {star} {a} + {b} = {s['child']}"
            + (f"   [{'; '.join(flags)}]" if flags else ""))


def cmd_reachable(args) -> None:
    roster = set(load_roster())
    known = closure(roster)
    print(f"Roster: {len(roster)} species -> reachable: {len(known)} of {len(RANKS)}")
    missing = sorted(set(RANKS) - known)
    print(f"Not reachable ({len(missing)}):")
    for m in missing:
        tag = " [self-breed-only]" if m in SELF_ONLY else ""
        print(f"  - {m}{tag}")


def cmd_what(args) -> None:
    a, b = resolve(args.a), resolve(args.b)
    for ch in children_of(*sorted((a, b))):
        extra = ""
        if ch.kind == "generic":
            t = (RANKS[a] + RANKS[b] + 1) // 2
            extra = f" (generic: target {t}, {ch.species}={RANKS[ch.species]}, margin {ch.margin})"
            if ch.tie_break:
                extra += " [TIE-BREAK-dependent!]"
        elif ch.kind == "unique":
            extra = " (unique recipe)"
        elif ch.kind == "gendered":
            extra = f" (unique recipe, GENDER LOCKED: {ch.gender_note})"
        print(f"{a} + {b} = {ch.species}{extra}")


def cmd_plan(args) -> None:
    roster = set(load_roster())
    targets = ([resolve(t.strip()) for t in args.targets.split(",")]
               if args.targets else load_targets())
    ordered, unreachable, _ = plan_for(roster, targets)
    print(f"Targets: {len(targets)} species | steps in the plan: {len(ordered)}")
    if unreachable:
        print("NOT reachable by breeding from this roster:")
        for u in unreachable:
            tag = " [self-breed-only — must be caught/hatched]" if u in SELF_ONLY else ""
            print(f"  ! {u}{tag}")
    cur = 0
    for s in ordered:
        if s["wave"] != cur:
            cur = s["wave"]
            print(f"\n— Phase {cur} —")
        print(_fmt_step(s))
    # keep-both-genders hints
    parents_used: dict[str, int] = {}
    for s in ordered:
        for p in s["parents"]:
            parents_used[p] = parents_used.get(p, 0) + 1
    hot = {p: n for p, n in parents_used.items()
           if n >= 2 and p not in roster}
    if hot:
        print("\nIntermediates used in several steps (keep both genders / extra copies):")
        for p, n in sorted(hot.items(), key=lambda kv: -kv[1]):
            print(f"  {p}: {n} steps")


def cmd_path(args) -> None:
    roster = set(load_roster())
    t = resolve(args.pal)
    ordered, unreachable, _ = plan_for(roster, [t])
    if unreachable:
        print(f"{t} is not reachable from the roster."
              + (" [self-breed-only]" if t in SELF_ONLY else ""))
        return
    print(f"Cheapest route to {t}: {len(ordered)} steps")
    for s in ordered:
        print(_fmt_step(s))


def cmd_add(args) -> None:
    path = ROOT / "roster.txt"
    have = set(load_roster())
    added = []
    for name in args.pals:
        r = resolve(name)
        if r in have:
            print(f"{r} is already in the roster.")
            continue
        with path.open("a") as f:
            f.write(f"{r}\n")
        added.append(r)
    if added:
        print(f"Added: {', '.join(added)}. New plan:\n")
        cmd_plan(argparse.Namespace(targets=None))


def main() -> None:
    try:  # clean exit when piped into head/less
        import signal
        signal.signal(signal.SIGPIPE, signal.SIG_DFL)
    except (ImportError, AttributeError, ValueError):
        pass
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest="cmd", required=True)
    sub.add_parser("reachable").set_defaults(func=cmd_reachable)
    w = sub.add_parser("what")
    w.add_argument("a"); w.add_argument("b")
    w.set_defaults(func=cmd_what)
    p = sub.add_parser("plan")
    p.add_argument("--targets", default=None)
    p.set_defaults(func=cmd_plan)
    pa = sub.add_parser("path")
    pa.add_argument("pal")
    pa.set_defaults(func=cmd_path)
    ad = sub.add_parser("add")
    ad.add_argument("pals", nargs="+")
    ad.set_defaults(func=cmd_add)
    args = ap.parse_args()
    args.func(args)


if __name__ == "__main__":
    main()
