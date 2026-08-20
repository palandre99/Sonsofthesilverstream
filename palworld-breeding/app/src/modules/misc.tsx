/** Reference — how 1.0 breeding actually works, plus the receipts.
 * Content mirrors data/verification.json and the project's research docs;
 * anything not datamined is labelled with its confidence. */
import { useState } from 'preact/hooks';
import { claimsCheckedOn, verification } from '../state';
import { PalIcon } from '../components/shared';
import { HELPERS } from '../engine/helpers';

function Claims() {
  const claims = verification.value;
  const [open, setOpen] = useState(false);
  const label: Record<string, [string, string]> = {
    confirmed: ['confirmed', 'ok'],
    plausible: ['likely', 'warn'],
    contradicted: ['contradicted', 'bad'],
    not_found: ['not found', 'warn'],
  };
  const shown = open ? claims : claims.slice(0, 6);
  return (
    <>
      {shown.map((c) => {
        const [text, cls] = label[c.verdict] ?? [c.verdict, 'warn'];
        return (
          <div class="card" style={{ padding: '14px 18px', marginBottom: '8px' }}>
            <div style={{ display: 'flex', gap: '10px', alignItems: 'baseline', flexWrap: 'wrap' }}>
              <span class={`badge ${cls}`}>{text}</span>
              <b>{c.claim}</b>
            </div>
            <p style={{ color: 'var(--muted)', fontSize: '13.5px', margin: '6px 0 0' }}>
              {c.evidence}
              {/* 77 citations across 30 of the 36 claims sat in the file and
                  were shown nowhere. The other 6 name their sources inside the
                  evidence text, so they get no line rather than an empty one. */}
              {/* a <div> here was INVALID inside this <p>: the browser closes the
                  paragraph early and hoists the div out, so the sources line
                  escaped the evidence block. A block-level span nests legally
                  and looks identical. (My own E66 bug, caught by the console.) */}
              {c.sources && c.sources.length > 0 && (
                <span class="dim small" style="display:block;margin-top:5px">
                  Checked against: {c.sources.join(' · ')}
                </span>
              )}
            </p>
          </div>
        );
      })}
      {!open && claims.length > 6 && (
        <button class="btn morebtn" onClick={() => setOpen(true)}>
          Show all {claims.length} verified claims
        </button>
      )}
    </>
  );
}

const Section = ({ title, children }: { title: string; children: preact.ComponentChildren }) => (
  <div class="card bigcard" style={{ marginBottom: '14px' }}>
    <h2>{title}</h2>
    {children}
  </div>
);

export function ReferencePage() {
  return (
    <>
      <div class="pagehead">
        <h1>Reference</h1>
        <p>How 1.0 breeding actually works — and the receipts. Every mechanic below was
          cross-checked against independent sources and, where possible, the game files.
          Community-measured numbers are labelled as such.</p>
      </div>

      <Section title="The species formula">
        <p>134 pairs have a fixed recipe and one pair (Katress/Wixen) is gender-locked:
          female Katress + male Wixen gives Katress Ignis, the reverse gives Wixen Noct.
          Every other pair averages the parents' hidden CombiRanks —
          ⌊(rankA + rankB + 1) / 2⌋ — and the child is the species closest to that target
          among the 183 species in the generic pool. Variants and legendaries that only
          exist as recipe children can never roll from the formula. Exact ties go to the
          higher CombiRank. This engine replays all 44,851 precomputed game-file results
          with zero mismatches.</p>
      </Section>

      <Section title="Passives, IVs and what an egg rolls">
        <p>An egg makes three independent rolls, and the weights behind all three come
          from the game's own settings table:</p>
        <ul class="reflist">
          <li><b>Passives from the parents</b> — both parents' passives merge into one
            pool with each listed once; the child draws 1–4 of them with weights 40/30/20/10.
            Duplicated passives on both parents never double the odds.</li>
          <li><b>Random passives</b> — a second roll adds 0–3 brand-new passives
            (weights 40/30/20/10), capped at four total slots.</li>
          <li><b>IVs</b> — 1, 2 or all 3 stat categories are taken from the parents
            (50% / 33% / 17%); each inherited category picks mother or father on a coin
            flip, the rest roll fresh. At least one category is always inherited.</li>
        </ul>
        <p>The Odds Lab turns these into per-egg probabilities and egg counts for any
          real pairing — that's the page to open while you breed.</p>
      </Section>

      <Section title="Cakes">
        <p>Cake is consumed per egg and gates all breeding. The Breeding Farm is tech 19,
          the standard Cake tech 17. Incubation time was halved in 1.0 (new worlds), and
          the Ancient Hatchery (level 76) waits in the endgame.</p>
        <div class="tablewrap">
          <table class="otable">
            <thead>
              <tr><th>Cake</th><th>Tech</th><th>Station</th><th>Effect</th><th>Mutation</th></tr>
            </thead>
            <tbody>
              <tr><td><b>Cake</b></td><td>17</td><td>Cooking Pot</td><td>the baseline — species plans run entirely on this</td><td>~1% per egg</td></tr>
              <tr><td><b>Mushroom Cake</b></td><td>30</td><td>Cooking Pot</td><td>better IVs on offspring</td><td>~1%</td></tr>
              <tr><td><b>Vegetable Cake</b></td><td>47</td><td>Electric Kitchen</td><td><b>2 eggs per cycle</b> — throughput, not rate</td><td>1% × 2 eggs ≈ 2%/cycle</td></tr>
              <tr><td><b>Extravagant Veg. Cake</b></td><td>60</td><td>Large-Scale Stone Oven</td><td>best mutation odds + IVs</td><td>~3% per egg</td></tr>
              <tr><td><b>Special Cake</b></td><td>74</td><td>Ancient Kitchen</td><td>carries more parent passives (reported up to 6)</td><td>~1%</td></tr>
            </tbody>
          </table>
        </div>
        <p class="dim small" style={{ marginTop: '10px' }}>
          Standard cake: 5 Flour · 8 Red Berries · 7 Milk · 8 Eggs · 2 Honey — Mozzarina,
          Chikipi and Beegarde on a Ranch cover milk/eggs/honey. Cake in the Breeding
          Farm's chest does not spoil. Cake numbers are community-measured (the game's
          item-effect table has not been published), so treat the percentages as ≈.</p>
      </Section>

      <Section title="Helper pals worth getting early">
        <p>Straight from the game's partner-skill data — the Planner recommends these
          automatically when a plan needs them. Stars = how much they matter.</p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '9px', marginTop: '10px' }}>
          {HELPERS.map((h) => (
            <div key={h.name} style={{ display: 'flex', alignItems: 'center', gap: '9px' }}>
              <PalIcon name={h.name} size={30} />
              <div style={{ flex: 1 }}>
                <b style={{ fontSize: '13px' }}>
                  {h.name}{' '}
                  <span class="badge gold">{'★'.repeat(h.score)}</span>
                </b>
                <div style={{ color: 'var(--muted)', fontSize: '11.5px' }}>{h.effect}</div>
              </div>
            </div>
          ))}
        </div>
      </Section>

      <Section title="Mutation (new in 1.0)">
        <p>~1% of eggs on a standard cake (~3% on Extravagant) hatch <b>mutated</b>: an
          Alpha at 2★ condensation with IVs ~91–100 and four passives, at least two from
          the mutation-only rainbow set (Immortality, Idiosyncratic, Babysitter, Heavily
          Armored, Skymarcher). The species can differ from the pair's normal child.
          Once a pal carries a rainbow passive it breeds down like any other passive —
          one mutant is a permanent source. Volume wins: several farms, Vegetable Cake
          for two eggs per cycle, and the support pals below.</p>
      </Section>

      <Section title="The order for one perfect pal">
        <p>1) <b>Species</b> (Route Planner) → 2) <b>passives</b> (Pal Surgery Table,
          tech 38: implants cost 10–50k gold per operation and standard implants are not
          consumed — chain-breeding purely for passives is effectively obsolete in 1.0)
          → 3) <b>IVs</b> (Mushroom Cake + same-species breeding) → 4) <b>condensing</b>
          → 5) <b>Awakening</b> last. Gender is swapped with the Pal Reverser (consumed;
          bought with Bounty Tokens among others).</p>
      </Section>

      <Section title="Condensing (1.0)">
        <p>4★ costs <b>48 copies</b> total — 4 / 8 / 12 / 24 per star (old guides say
          116; that's pre-1.0). Each star raises one work suitability a level; 4★ raises
          all of them, and partner skill level = stars + 1. Mutant eggs hatch at 2★,
          leaving only 12 + 24 = 36 copies. <b>Starfruit</b> (Dog Coins) substitutes for
          copies in the condenser.</p>
      </Section>

      <Section title="Breeding support pals">
        <p>Once bred, these work for you: <b>Braloha</b> (+20–50% egg speed),
          <b> Dynamoff</b> (−20–40% incubation time), <b>Lullu</b> (farm produce),
          <b> Prunelia</b> (crops), <b>Sekhmet</b> (combat mount that also speeds the
          base). The Route Planner's "Breeding support" preset breeds all five.</p>
      </Section>

      <h2 style={{ margin: '26px 0 2px' }}>Verified claims</h2>
      {claimsCheckedOn.value && (
        <p class="dim small" style="margin:0 0 12px">Last checked {claimsCheckedOn.value}.</p>
      )}
      <Claims />

      <Section title="Data & provenance">
        <p>Species data: paldb.cc CombiRank table + unique combinations via the 1.0
          dataset <a href="https://github.com/beliarance/palworld-kb" target="_blank" rel="noopener">beliarance/palworld-kb</a>,
          cross-validated against <a href="https://github.com/tylercamp/palcalc" target="_blank" rel="noopener">palcalc</a>'s
          44,851 precomputed game-file results (zero mismatches) and the raw
          DT_PalCombiUnique table
          (<a href="https://github.com/Awy64/palworld-atlas-data" target="_blank" rel="noopener">palworld-atlas-data</a>).
          Inheritance weights: GameSettings via palcalc's DB generator. Icons:
          game-dump icons via <a href="https://github.com/dbgoodm/PalDex" target="_blank" rel="noopener">dbgoodm/PalDex</a>.
          Passive database: palworld-kb (114 passives, 2026-07-14).</p>
        <p class="dim small" style={{ marginTop: '8px' }}>
          Palforge is a fan project — not affiliated with or endorsed by Pocketpair.
          Game data © Pocketpair, used under the fan content policy. No ads, no tracking,
          no accounts; your box lives in your browser only.</p>
      </Section>
    </>
  );
}
