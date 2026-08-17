/**
 * The map preview on the pal card, and the way back.
 *
 * CEO, 2026-08-17: *"Open the full map feature inside pal info card is nice
 * but it takes me all out of the paldex so I can't easily return to the
 * paldex pal info card"* — and, explicitly, the Map fane itself is another
 * worker's lane. So the fix lives entirely on the breeding side: the card no
 * longer NEEDS to throw the player out.
 *
 * Before: the whole preview was one Pressable whose only action was
 * navigateTo the Map domain — fullscreen, no tabs, and returning meant side
 * panel → Breeding → Paldex → search → reopen the card. A one-way door with
 * no warning on it.
 *
 * Now: tapping the preview ENLARGES IT IN PLACE — a modal stacked on the
 * card, so closing lands exactly where he was. The Map fane stays one tap
 * away, but only from controls that say they leave ("Full map ›" in the
 * footer, "Open the full map (leaves the Paldex)" in the enlarged view).
 *
 * A state you can enter must be exitable (#25), and a door that takes you
 * somewhere else must say so (#11's cousin). PalMap.tsx is breeding-lane;
 * it IMPORTS the Map lane's MapPreview but edits none of their files.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const code = readFileSync(
  join(__dirname, '../../mobile/src/ui/PalMap.tsx'), 'utf8')
  .replace(/\{\s*\/\*(?:(?!\*\/)[\s\S])*\*\/\s*\}/g, '')
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/^\s*\/\/.*$/gm, '');

describe('the map preview enlarges in place instead of leaving the Paldex', () => {
  it('tapping the preview expands, it does not navigate', () => {
    expect(code, 'the preview is a one-way door to the Map fane again')
      .toContain('onPress={() => setExpanded(view)}');
    expect(code).toContain("spawns bigger");
  });

  it('the enlarged view can be closed back to the card', () => {
    // a modal stacked on the card — closing lands exactly where he was
    expect(code).toContain('onRequestClose={() => setExpanded(null)}');
    expect(code).toContain('`‹ Back to ${name}`');
  });

  it('the enlarged map is actually bigger than the preview', () => {
    expect(code).toContain("Dimensions.get('window').width");
  });

  it('the Map fane is still reachable — from controls that SAY they leave', () => {
    // removing the capability would be the wrong fix; hiding the cost would
    // be the old bug
    expect(code).toContain('Full map ›');
    expect(code).toContain('leaves the Paldex');
    expect(code, 'the full-map jump lost its return payload')
      .toContain("payload: { pal: name, fromCard: name }");
  });

  it('no unlabelled control navigates to the Map domain', () => {
    // every path to navigateTo must go through openFullMap, whose callers
    // are the two labelled controls
    const jumps = code.match(/navigateTo\(/g) ?? [];
    expect(jumps.length).toBe(1);
    expect((code.match(/openFullMap/g) ?? []).length,
      'a new caller of openFullMap appeared — check it says it leaves')
      .toBeLessThanOrEqual(4);
  });
});
