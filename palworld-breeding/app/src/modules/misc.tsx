/** The Reference page. */
import { verification } from '../state';

export function ReferencePage() {
  const claims = verification.value;
  const label: Record<string, [string, string]> = {
    confirmed: ['confirmed', 'ok'],
    plausible: ['likely', 'warn'],
    contradicted: ['contradicted', 'bad'],
    not_found: ['not found', 'warn'],
  };
  return (
    <>
      <div class="pagehead">
        <h1>Reference</h1>
        <p>How 1.0 breeding actually works — and the receipts. Every mechanic below was
          cross-checked against independent sources and, where possible, the game files.</p>
      </div>
      <div class="card bigcard" style={{ marginBottom: '16px' }}>
        <h2>The species formula</h2>
        <p>134 pairs have a fixed recipe and one pair (Katress/Wixen) is gender-locked.
          Every other pair averages the parents' hidden CombiRanks —
          ⌊(rankA + rankB + 1) / 2⌋ — and the child is the species closest to that target
          among the 183 species in the generic pool. Variants and legendaries that only
          exist as recipe children can never roll from the formula. Exact ties go to the
          higher CombiRank. This engine replays all 44,851 precomputed game-file results
          with zero mismatches.</p>
      </div>
      {claims.map((c) => {
        const [text, cls] = label[c.verdict] ?? [c.verdict, 'warn'];
        return (
          <div class="card" style={{ padding: '14px 18px', marginBottom: '8px' }}>
            <div style={{ display: 'flex', gap: '10px', alignItems: 'baseline', flexWrap: 'wrap' }}>
              <span class={`badge ${cls}`}>{text}</span>
              <b>{c.claim}</b>
            </div>
            <p style={{ color: 'var(--muted)', fontSize: '13.5px', margin: '6px 0 0' }}>
              {c.evidence}
            </p>
          </div>
        );
      })}
    </>
  );
}
