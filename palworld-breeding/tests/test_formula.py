#!/usr/bin/env python3
"""Tests for the Palworld 1.0 species formula.

Expected children come from sources OUTSIDE the planner logic:
- 'paldb'      : paldb.cc Breeding_Farm 'Breed Unique' table (fetched 2026-07-14)
- 'player'     : verified in-game by a player (date noted)
- 'prev-plan'  : the shortest-path search from the previous session, whose steps
                 1-5 the player has since CONFIRMED in-game by breeding them
- 'structural' : property that must hold for the paldb pool model

Run:  python3 -m unittest discover tests  (from palworld-breeding/)
"""
import gzip
import json
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from planner import (BREEDING, EXCLUDED, POOL, RANKS, SELF_ONLY, UNIQUE,
                     Child, child_of, children_of, resolve)

ORACLE = Path(__file__).resolve().parent.parent / "data" / "oracle_pairs.json.gz"

# (parent_a, parent_b, expected_child, provenance)
KNOWN_PAIRS = [
    # --- unique combos (paldb 'Breed Unique', classics unchanged from EA) ---
    ("Relaxaurus", "Sparkit", "Relaxaurus Lux", "paldb"),
    ("Incineram", "Maraith", "Incineram Noct", "paldb"),
    ("Mau", "Pengullet", "Mau Cryst", "paldb"),
    ("Vanwyrm", "Foxcicle", "Vanwyrm Cryst", "paldb"),
    ("Eikthyrdeer", "Hangyu", "Eikthyrdeer Terra", "paldb"),
    ("Pyrin", "Katress", "Pyrin Noct", "paldb"),
    ("Elphidran", "Surfent", "Elphidran Aqua", "paldb"),
    ("Katress", "Wixen", "Katress Ignis", "paldb"),
    ("Beakon", "Helzephyr", "Helzephyr Lux", "paldb"),
    ("Broncherry", "Fuack", "Broncherry Aqua", "paldb"),
    ("Jolthog", "Pengullet", "Jolthog Cryst", "paldb"),
    # NB: EA-era guides list other parents for Caprity Noct; 1.0 uses Tarantriss
    ("Caprity", "Tarantriss", "Caprity Noct", "paldb"),
    # --- unique combos player-confirmed in-game (backbone steps bred) ---
    ("Foxcicle", "Reptyro", "Reptyro Cryst", "player 2026-07"),
    ("Digtoise", "Warsect", "Warsect Terra", "player 2026-07"),
    # --- 1.0 unique combos involving new species (paldb) ---
    ("Frostplume", "Univolt", "Univolt Cryst", "paldb"),
    ("Blazehowl", "Jormuntide", "Jormuntide Ignis", "paldb"),
    ("Lapure", "Sibelyx", "Sibelyx Primo", "paldb"),
    ("Celesdir", "Kitsun Noct", "Celesdir Noct", "paldb"),
    ("Celesdir", "Starryon", "Starryon Primo", "paldb"),
    ("Chillet Ignis", "Whalaska", "Whalaska Ignis", "paldb"),
    ("Slowatt", "Solmora", "Solmora Lux", "paldb"),
    ("Munchill", "Smokie", "Smokie Cryst", "paldb"),
    # --- generic formula, player-confirmed in-game (bred, steps 2/4 + current) ---
    ("Helzephyr Lux", "Verdash", "Reptyro", "player 2026-07"),
    ("Blazehowl", "Quivern", "Warsect", "player 2026-07"),
    ("Menasting", "Reptyro Cryst", "Frostplume", "player 2026-08 (egg in farm)"),
    # --- generic formula, prev-plan cross-check ---
    ("Univolt Cryst", "Warsect Terra", "Jormuntide", "prev-plan"),
    # --- tie-break: equidistant, higher CombiRank must win ---
    ("Turtacle", "Aegidron", "Nitemary", "player 2026-07 (tie 1210/1230)"),
    # --- same species ---
    ("Lamball", "Lamball", "Lamball", "structural"),
    ("Jetragon", "Jetragon", "Jetragon", "paldb self-only row"),
    ("Orserk", "Orserk", "Orserk", "paldb self-only row"),
    # --- classic EA generic recipes that still hold in 1.0 ranks ---
    ("Chikipi", "Chikipi", "Chikipi", "structural"),
]


class TestSpeciesFormula(unittest.TestCase):
    def test_known_pairs(self):
        self.assertGreaterEqual(len(KNOWN_PAIRS), 30, "need at least 30 known pairs")
        for a, b, want, src in KNOWN_PAIRS:
            with self.subTest(pair=f"{a}+{b}", source=src):
                got = child_of(*sorted((a, b)))
                self.assertEqual(got.species, want,
                                 f"{a}+{b}: got {got.species}, want {want} [{src}]")

    def test_order_insensitive(self):
        for a, b, _, _ in KNOWN_PAIRS[:10]:
            self.assertEqual(child_of(*sorted((a, b))).species,
                             child_of(*sorted((b, a))).species)

    def test_tie_break_flags_turtacle_case(self):
        ch = child_of(*sorted(("Turtacle", "Aegidron")))
        self.assertTrue(ch.tie_break, "Turtacle+Aegidron must be flagged tie-break")
        self.assertEqual(ch.margin, 0)

    def test_excluded_never_generic(self):
        """The rank formula must never produce a unique-combo child or a
        self-breed-only species (paldb pool model, 'structural')."""
        pool = set(POOL)
        self.assertFalse(pool & EXCLUDED)
        # a target of 10 (Astralym's rank) must NOT return Astralym
        sample = [s for s in RANKS if s not in EXCLUDED][:40]
        for a in sample:
            for b in sample:
                if a < b:
                    ch = child_of(a, b)
                    if ch.kind == "generic":
                        self.assertNotIn(ch.species, EXCLUDED,
                                         f"{a}+{b} produced excluded {ch.species}")

    def test_pool_has_unique_ranks(self):
        """No two generic-pool species share a CombiRank => formula is
        deterministic modulo the documented tie-break."""
        ranks = [RANKS[s] for s in POOL]
        self.assertEqual(len(ranks), len(set(ranks)))
        self.assertEqual(len(POOL), 183)

    def test_dataset_shape(self):
        self.assertEqual(len(RANKS), 299)
        self.assertEqual(len(BREEDING["unique_combos"]), 134)
        self.assertEqual(len(BREEDING["gendered_combos"]), 2)
        self.assertEqual(len(SELF_ONLY), 28)

    def test_gendered_pair(self):
        """Katress+Wixen is the game's only gender-dependent combo."""
        kids = children_of("Katress", "Wixen")
        self.assertEqual({k.species for k in kids}, {"Katress Ignis", "Wixen Noct"})
        by = {k.species: k for k in kids}
        self.assertIn("female Katress", by["Katress Ignis"].gender_note)
        self.assertIn("female Wixen", by["Wixen Noct"].gender_note)

    def test_full_oracle_replay(self):
        """Replay EVERY breeding result from palcalc's 1.0 dataset (44 851 rows,
        generated from the game files). Zero mismatches allowed."""
        with gzip.open(ORACLE, "rt") as f:
            oracle = json.load(f)
        bad = []
        for a, b, c, g in oracle["rows"]:
            if a not in RANKS or b not in RANKS:
                continue
            got = {ch.species for ch in children_of(*sorted((a, b)))}
            if c not in got:
                bad.append((a, b, c, got))
        self.assertEqual(bad, [], f"{len(bad)} oracle mismatches, first: {bad[:5]}")

    def test_removed_ea_combos_are_self_only(self):
        """EA recipes removed in 1.0: those children are now self-breed-only
        and their old parent pairs must yield something else."""
        for child in ("Lyleen", "Grizzbolt", "Faleris", "Orserk", "Shadowbeak"):
            self.assertIn(child, SELF_ONLY, f"{child} should be self-breed-only")
        for a, b, old_child in [("Mossanda", "Petallia", "Lyleen"),
                                ("Mossanda", "Rayhound", "Grizzbolt"),
                                ("Vanwyrm", "Anubis", "Faleris"),
                                ("Grizzbolt", "Relaxaurus", "Orserk"),
                                ("Kitsun", "Astegon", "Shadowbeak")]:
            got = child_of(*sorted((a, b)))
            self.assertNotEqual(got.species, old_child,
                                f"EA combo {a}+{b} must no longer give {old_child}")

    def test_resolve(self):
        self.assertEqual(resolve("lamball"), "Lamball")
        self.assertEqual(resolve("warsect t"), "Warsect Terra")
        with self.assertRaises(KeyError):
            resolve("Godbin")


if __name__ == "__main__":
    unittest.main()
