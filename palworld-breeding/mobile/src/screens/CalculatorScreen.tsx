/** Calculator — pair→child and child→parents, same engine as the web app. */
import React, { useEffect, useMemo, useState } from 'react';
import { ScrollView, Text, View, Pressable } from 'react-native';
import * as Haptics from 'expo-haptics';
import { T } from '../theme';
import { BackToCardChip, Badge, Btn, Card, ElementChips, PageHead, PalIcon, WorkChips, s, getRecentPicks } from '../ui/kit';
import { PalPicker } from '../ui/PalPicker';
import {
  canPairNow, engine, getBox, ownedAny, pals, selfOnly, useAppVersion,
} from '../store';
import { parseGenderNote } from '../engine/formula';
import { genderGap } from '../logic/genderGap';
import { onNavIntent, takeIntentPayload } from '../nav/intent';
import { PalDetail } from '../ui/PalDetail';
import { Icon } from '../ui/Icon';
import type { ChildResult } from '../engine/types';


/** What the Calculator shows BEFORE you have picked anything.
 *
 * The CEO's screenshot (2026-08-16): a title, two buttons, one small card,
 * then most of the screen black — "same issue as u addressed on the home
 * page of plan tab, empty and poor design". The existing quick-start row
 * only appeared once you had ALREADY used the tab, so a first visit showed
 * nothing at all.
 *
 * So the space is filled with the two things that are always true and
 * always useful: the pals you actually own, one tap away, and a plain
 * explanation of what each of the two modes does. */
function CalcStartHelp({ onPick, mode, onBrowseOwned }: {
  onPick: (name: string) => void;
  mode: 'pair' | 'reverse';
  /** opens the full picker already filtered to YOUR pals, with its search */
  onBrowseOwned: () => void;
}) {
  useAppVersion();
  const [howOpen, setHowOpen] = useState(false);
  // Pals you have actually used come first. This list used to sit BELOW a
  // second, near-identical "quick start — recent pals" row on the same
  // screen: two chip rows, same tap, different headings. One list now.
  const recent = getRecentPicks().filter((n) => Object.hasOwn(pals, n));
  const box = Object.keys(getBox()).filter((n) => Object.hasOwn(pals, n));
  const owned = [...recent.filter((n) => box.includes(n)),
    ...box.filter((n) => !recent.includes(n))];
  return (
    <>
      {owned.length > 0 ? (
        <Card style={{ marginTop: 12 }}>
          <Text style={{
            color: T.faint, fontSize: 10.5, fontWeight: '800',
            letterSpacing: 1, marginBottom: 7,
          }}>START FROM YOUR PALDEX</Text>
          <View style={[s.wrap]}>
            {/* 8 was "only a few" with a 56-pal collection (CEO 2026-08-16) */}
            {owned.slice(0, 12).map((n) => (
              <Pressable key={n}
                onPress={() => {
                  void Haptics.selectionAsync();
                  onPick(n);
                }}
                accessibilityRole="button"
                accessibilityLabel={`Use ${n}`}
                style={({ pressed }) => [{
                  flexDirection: 'row', alignItems: 'center', gap: 6,
                  backgroundColor: pressed ? T.accentSoft : T.surface2,
                  borderWidth: 1, borderColor: pressed ? T.accent : T.line,
                  borderRadius: 10, paddingVertical: 5, paddingHorizontal: 9,
                }]}>
                <PalIcon name={n} size={26} />
                <Text style={{ color: T.ink, fontWeight: '700', fontSize: 12.5 }}>{n}</Text>
              </Pressable>
            ))}
          </View>
          {/* This used to be a dead sentence pointing at "the button above" —
              which opens ALL 299 pals, not yours. With a big collection you
              could see eight shortcuts and had no way to reach the rest of
              your own pals, and no search (CEO 2026-08-16, with screenshot).
              Now it is a real button onto YOUR pals, and the picker it opens
              already has search, filters and sorting. */}
          {owned.length > 12 && (
            <View style={{ marginTop: 9 }}>
              <Btn small label={`Show all ${owned.length} of your pals`}
                onPress={onBrowseOwned} />
            </View>
          )}
        </Card>
      ) : (
        <Card style={{ marginTop: 12 }}>
          <Text style={[s.body, { fontSize: 12.5 }]}>
            Tick the pals you own in the Paldex and they will show up here as
            one-tap shortcuts.
          </Text>
        </Card>
      )}

      {/* This three-step explainer was always open, so the screen led with a
          wall of text and the parent slots came second. It is a good
          explanation and it stays — but folded away, because someone who
          already knows what the Calculator does should see the pals, not the
          manual. ("can be annoying to users who don't want too much text") */}
      <Pressable onPress={() => setHowOpen((v) => !v)} hitSlop={6}
        accessibilityRole="button"
        accessibilityState={{ expanded: howOpen }}
        accessibilityLabel={howOpen ? 'Hide how this works' : 'Show how this works'}
        style={[s.row, { marginTop: 12, gap: 6, paddingVertical: 4 }]}>
        <Text style={{ color: T.muted, fontSize: 12.5, fontWeight: '800', flex: 1 }}>
          How this works
        </Text>
        <Icon name={howOpen ? 'chevron-up' : 'chevron-down'} size={18} color={T.muted} />
      </Pressable>
      {howOpen && (
      <Card style={{ marginTop: 4, gap: 12 }}>
        {[
          mode === 'pair'
            ? { n: '1', h: 'Pair → child', b: 'Pick any two pals and you get exactly what they make, with the maths shown.' }
            : { n: '1', h: 'Child → parents', b: 'Pick the pal you want and you get every pair that produces it.' },
          mode === 'pair'
            ? { n: '2', h: 'Swap to Child → parents', b: 'Already know what you want? Use the other tab above to work backwards instead.' }
            : { n: '2', h: 'Swap to Pair → child', b: 'Curious what two pals make? Use the other tab above to work forwards instead.' },
          { n: '3', h: 'It tells you when the rule changes', b: 'Special recipes and gender-locked pairs are called out, so a surprise result is never unexplained.' },
        ].map((r) => (
          <View key={r.n} style={{ flexDirection: 'row', gap: 11 }}>
            <View style={{
              width: 24, height: 24, borderRadius: 12, backgroundColor: T.accentSoft,
              alignItems: 'center', justifyContent: 'center',
            }}>
              <Text style={{ color: T.accentInk, fontWeight: '800', fontSize: 12 }}>{r.n}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ color: T.ink, fontWeight: '800', fontSize: 13.5 }}>{r.h}</Text>
              <Text style={[s.body, { fontSize: 12.5, marginTop: 2 }]}>{r.b}</Text>
            </View>
          </View>
        ))}
      </Card>
      )}
    </>
  );
}

/** One of the two parent slots on the Calculator — the primary target on the
 * whole screen, so it is sized like one. Empty it reads as a place something
 * goes (dashed ring, a plus, "Tap to choose"); filled it shows the pal's own
 * portrait and name, with a clear button that does not fight the main tap. */
function ParentSlot({ which, name, onPick, onClear }: {
  which: 1 | 2; name: string | null; onPick: () => void; onClear: () => void;
}) {
  const filled = !!name;
  return (
    <View style={{ flex: 1 }}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={filled
          ? `Parent ${which}: ${name}. Tap to choose a different pal.`
          : `Choose parent ${which}`}
        onPress={() => { void Haptics.selectionAsync(); onPick(); }}
        style={({ pressed }) => [{
          minHeight: 118, borderRadius: 16, paddingVertical: 12, paddingHorizontal: 8,
          alignItems: 'center', justifyContent: 'center', gap: 7,
          backgroundColor: filled ? T.surface : T.surface2,
          borderWidth: filled ? 1.5 : 1.5,
          borderColor: filled ? T.accent : T.line2,
          borderStyle: filled ? 'solid' : 'dashed',
          opacity: pressed ? 0.75 : 1,
        }]}>
        {filled ? (
          <PalIcon name={name!} size={54} />
        ) : (
          <View style={{
            width: 54, height: 54, borderRadius: 27, borderWidth: 1.5,
            borderColor: T.line2, borderStyle: 'dashed',
            alignItems: 'center', justifyContent: 'center',
          }}>
            <Icon name="plus" size={24} color={T.faint} />
          </View>
        )}
        <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}
          style={{
            color: filled ? T.ink : T.muted,
            fontWeight: '800', fontSize: filled ? 14.5 : 13, textAlign: 'center',
          }}>
          {filled ? name : `Parent ${which}`}
        </Text>
        {!filled && (
          <Text style={{ color: T.faint, fontSize: 11, fontWeight: '700' }}>
            Tap to choose
          </Text>
        )}
      </Pressable>
      {filled && (
        <Pressable hitSlop={10} onPress={onClear}
          accessibilityRole="button"
          accessibilityLabel={`Clear parent ${which}`}
          style={{ position: 'absolute', right: -6, top: -6 }}>
          <View style={{
            width: 24, height: 24, borderRadius: 12, backgroundColor: T.surface2,
            borderWidth: 1, borderColor: T.line2,
            alignItems: 'center', justifyContent: 'center',
          }}>
            <Icon name="close" size={14} color={T.muted} />
          </View>
        </Pressable>
      )}
    </View>
  );
}

function ResultFlags({ ch }: { ch: ChildResult }) {
  return (
    <View style={[s.wrap, { marginTop: 6 }]}>
      {/* the SAME mechanic was called "unique recipe" here and "fixed
          recipe" on the Plan tab, in the Paldex and in the Reference — a
          player would fairly read those as two different things. "fixed
          recipe" wins on both plainness and majority. And "gender locked"
          named the mechanic rather than the consequence; the ♂/♀ are drawn
          on the parents right beside this badge. */}
      {ch.kind === 'unique' && <Badge kind="unique">fixed recipe</Badge>}
      {ch.kind === 'gendered' && (
        <Badge kind="warn">only works with the genders shown</Badge>
      )}
      {ch.kind === 'self' && <Badge kind="plain">same species</Badge>}
      {ch.tieBreak && <Badge kind="warn">close call — higher rank wins</Badge>}
    </View>
  );
}

function PairResult({ a, b }: { a: string; b: string }) {
  useAppVersion();
  const results = engine.childrenOf(a, b);
  const ra = engine.ranks.get(a)!;
  const rb = engine.ranks.get(b)!;
  const target = Math.floor((ra + rb + 1) / 2);
  const bothOwned = ownedAny(a) && ownedAny(b);
  return (
    <>
      {results.map((ch) => {
        const mother = ch.genderNote ? parseGenderNote(ch.genderNote)?.mother : undefined;
        return (
          <Card key={ch.species} style={{ marginTop: 12 }}>
            <View style={[s.row, { gap: 10 }]}>
              <PalIcon name={a} size={44}
                gender={ch.kind === 'gendered' ? (mother === a ? 'f' : 'm') : undefined} />
              <Text style={{ color: T.faint, fontWeight: '800', fontSize: 18 }}>+</Text>
              <PalIcon name={b} size={44}
                gender={ch.kind === 'gendered' ? (mother === b ? 'f' : 'm') : undefined} />
              <Text style={{ color: T.faint, fontWeight: '800', fontSize: 18 }}>→</Text>
              <PalIcon name={ch.species} size={56} />
              <View style={{ flex: 1 }}>
                <Text style={[s.h2]}>{ch.species}</Text>
                <View style={[s.wrap, { marginTop: 4 }]}>
                  <ElementChips name={ch.species} />
                </View>
              </View>
            </View>
            <View style={[s.wrap, { marginTop: 8 }]}>
              <WorkChips name={ch.species} top={3} />
            </View>
            <ResultFlags ch={ch} />
            {ch.kind === 'generic' && (
              <Text style={[s.body, { marginTop: 8 }]}>
                rank target ⌊({ra} + {rb} + 1)/2⌋ = {target} → {ch.species}
                {' '}({engine.ranks.get(ch.species)})
                {ch.tieBreak ? ' · tie resolved to the higher CombiRank' : ''}
              </Text>
            )}
            {ch.kind === 'gendered' && (
              <Text style={[s.body, { marginTop: 8 }]}>
                {ch.genderNote} → {ch.species}. Swap the genders for the other child.
              </Text>
            )}
            {/* The help card promises "the maths shown", and a generic or
                gender-locked result explains itself above. A fixed recipe and
                a same-species pair used to show a badge and nothing else — the
                player was left to guess why the rank line had vanished. Both
                sentences are confirmed claims in verification.json. */}
            {ch.kind === 'unique' && (
              <Text style={[s.body, { marginTop: 8 }]}>The game files give this pair a fixed recipe, so the rank formula is skipped.</Text>
            )}
            {ch.kind === 'self' && (
              <Text style={[s.body, { marginTop: 8 }]}>Two of the same species always make that species — the rank formula is skipped.</Text>
            )}
            {bothOwned && !canPairNow(a, b, ch.genderNote) && (
              <Text style={[s.body, { marginTop: 8, color: T.warn }]}>
                ⚠ You have both species, but not a pair that can breed.{' '}
                {genderGap(a, b, getBox()[a] ?? NONE, getBox()[b] ?? NONE,
                  ch.genderNote ? parseGenderNote(ch.genderNote) : null)}{' '}
                Swap a gender with the Pal Reverser, or breed another copy.
              </Text>
            )}
          </Card>
        );
      })}
    </>
  );
}

/** what an unowned species looks like in the box */
const NONE = { m: false, f: false };

function ReverseLookup({ target }: { target: string }) {
  useAppVersion();
  // One expanded flag per group. It used to be a single boolean: pressing
  // "Show all 24" on ONE group silently expanded every other group too, and
  // it never reset when you picked a new target — so the next pal you looked
  // up rendered every one of its pairs at once, with no way back.
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  useEffect(() => { setExpanded(new Set()); }, [target]);

  const pairs = useMemo(() => {
    const names = Object.keys(pals);
    const out: { a: string; b: string; kind: string; note: string | null }[] = [];
    for (let i = 0; i < names.length; i++) {
      for (let j = i; j < names.length; j++) {
        for (const ch of engine.childrenOf(names[i], names[j])) {
          if (ch.species === target && !(names[i] === target && names[j] === target)) {
            out.push({ a: names[i], b: names[j], kind: ch.kind, note: ch.genderNote });
          }
        }
      }
    }
    return out;
  }, [target]);

  const groups = useMemo(() => {
    const ready: typeof pairs = [];
    const blocked: typeof pairs = [];
    const one: typeof pairs = [];
    const none: typeof pairs = [];
    for (const p of pairs) {
      if (canPairNow(p.a, p.b, p.note)) ready.push(p);
      else if (ownedAny(p.a) && ownedAny(p.b)) blocked.push(p);
      else if (ownedAny(p.a) || ownedAny(p.b)) one.push(p);
      else none.push(p);
    }
    return [
      ['Breed right now', ready] as const,
      ['Own both — wrong genders', blocked] as const,
      ['One step away', one] as const,
      ['All other pairs', none] as const,
    ].filter(([, items]) => items.length > 0);
  }, [pairs]);

  // Two of the 28 self-breed-only species ALSO have a fixed recipe:
  // Mossanda Lux = Grizzbolt + Mossanda, and Relaxaurus Lux = Relaxaurus +
  // Sparkit. This branch used to fire on the flag alone and return EARLY, so
  // for those two the app hid a recipe the player could very likely use
  // today and told them to go catch one instead. The honest test is not
  // "is it flagged" but "does any other pair actually make it" — so only
  // claim it when the pair list really is empty (self-found 2026-08-16).
  if (selfOnly.has(target) && pairs.length === 0) {
    return (
      <Card style={{ marginTop: 12, backgroundColor: T.warnSoft, borderColor: T.warn }}>
        <Text style={[s.body, { color: T.warn }]}>
          {target} is self-breed-only: the only pair that produces it is
          {' '}{target} + {target}. Catch or hatch your first one, then multiply it.
        </Text>
      </Card>
    );
  }
  if (!pairs.length) {
    return (
      <Card style={{ marginTop: 12 }}>
        <Text style={s.body}>No cross-species pair produces {target}.</Text>
      </Card>
    );
  }
  return (
    <>
      {groups.map(([title, items]) => (
        <View key={title} style={{ marginTop: 16 }}>
          <Text style={[s.h3, { marginBottom: 6 }]}>
            {title} <Text style={{ color: T.muted, fontWeight: '600' }}>· {items.length}</Text>
          </Text>
          <View style={{ gap: 6 }}>
            {(expanded.has(title) ? items : items.slice(0, 10)).map((p) => {
              const mother = p.note ? parseGenderNote(p.note)?.mother : undefined;
              return (
                <Card key={`${p.a}|${p.b}`}
                  accessibilityLabel={`${p.a} plus ${p.b}${p.note ? `, ${p.note}` : ''}`}
                  style={{ paddingVertical: 8, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <PalIcon name={p.a} size={32} gender={p.note ? (mother === p.a ? 'f' : 'm') : undefined} />
                  <PalIcon name={p.b} size={32} gender={p.note ? (mother === p.b ? 'f' : 'm') : undefined} />
                  <Text style={{ color: T.ink, fontWeight: '700', fontSize: 13.5, flex: 1 }}>
                    {p.a} <Text style={{ color: T.faint }}>+</Text> {p.b}
                  </Text>
                  {p.kind === 'unique' && <Badge kind="unique">fixed recipe</Badge>}
                  {p.kind === 'gendered' && <Badge kind="warn">genders as shown</Badge>}
                </Card>
              );
            })}
          </View>
          {/* ONE-WAY DOOR, same shape as the finished-phase bug the CEO found
              on the Plan tab: `Show all N` added the group to `expanded` and
              then hid itself, so nothing could ever collapse it again. A
              group can hold dozens of pairs, so expanding one meant scrolling
              past all of them for the rest of the visit. It is a toggle now.
              (Found by sweeping every `new Set(prev).add(` for a matching
              `.delete(` — sub-method 25.) */}
          {items.length > 10 && (
            <View style={{ marginTop: 8 }}>
              <Btn small
                label={expanded.has(title) ? 'Show fewer' : `Show all ${items.length}`}
                onPress={() => setExpanded((prev) => {
                  const next = new Set(prev);
                  if (next.has(title)) next.delete(title);
                  else next.add(title);
                  return next;
                })} />
            </View>
          )}
        </View>
      ))}
    </>
  );
}

export function CalculatorScreen() {
  const [mode, setMode] = useState<'pair' | 'reverse'>('pair');
  const [a, setA] = useState<string | null>(null);
  const [b, setB] = useState<string | null>(null);
  const [target, setTarget] = useState<string | null>(null);
  // the "-owned" variants open the SAME picker already filtered to your own
  // pals, so "show all N of your pals" lands on your pals rather than on all
  // 299 (CEO 2026-08-16)
  type Picking = 'a' | 'b' | 'target' | 'a-owned' | 'b-owned' | 'target-owned';
  const [picking, setPicking] = useState<Picking | null>(null);

  // arriving from a pal card's "show me every pair" — land with the answer
  // already on screen, and keep a one-tap way BACK to that card
  const [fromCard, setFromCard] = useState<string | null>(null);
  const [viewing, setViewing] = useState<string | null>(null);
  useEffect(() => {
    const apply = () => {
      const p = takeIntentPayload('calc');
      if (!p?.pal) return;
      setMode(p.mode ?? 'reverse');
      if ((p.mode ?? 'reverse') === 'reverse') setTarget(p.pal);
      else setA(p.pal);
      if (p.fromCard) setFromCard(p.fromCard);
    };
    apply(); // payload waiting from before this screen mounted
    return onNavIntent(apply); // ...or arriving while it's already open
  }, []);

  return (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
      <PageHead title="Calculator"
        sub="The exact 1.0 formula, verified against all 44,851 outcomes from the game files." />

      {fromCard && (
        <BackToCardChip name={fromCard}
          onOpen={() => setViewing(fromCard)}
          onDismiss={() => setFromCard(null)} />
      )}

      <View style={{
        flexDirection: 'row', backgroundColor: T.surface2, borderRadius: 12,
        padding: 3, marginBottom: 14, alignSelf: 'flex-start',
      }}>
        {([['pair', 'Pair → child'], ['reverse', 'Child → parents']] as const).map(([id, label]) => (
          <Text
            key={id}
            // the tab's PRIMARY control — a bare <Text onPress>, so it had no
            // role, no name and no keyboard focus at all. My earlier sweep
            // only looked for labels MISSING a role, so a control with
            // neither slipped straight through (self-found 2026-08-16).
            accessibilityRole="button"
            accessibilityLabel={`${label}${mode === id ? ', showing now' : ''}`}
            onPress={() => setMode(id)}
            style={{
              // 8 rendered these tabs 34 px tall, under the 44 pt minimum
              paddingVertical: 12, paddingHorizontal: 16, borderRadius: 9,
              fontWeight: '700', fontSize: 13.5, overflow: 'hidden',
              color: mode === id ? T.ink : T.muted,
              backgroundColor: mode === id ? T.surface : 'transparent',
            }}
          >{label}</Text>
        ))}
      </View>

      {mode === 'pair' ? (
        <>
          {/* PICKING THE TWO PARENTS IS WHAT THIS PAGE IS FOR, and it used to
              be two small text pills that the explanation cards below them
              completely out-shouted. The CEO: "the two most important bubbles
              parent 1/2 are very small; selecting parents is basically the
              main thing for this page and it kind of drowns in other
              information" (2026-08-17).

              They are slots now — tall enough to be the obvious target, with
              the pal's own portrait in them once chosen, and a dashed empty
              ring saying what goes there when not. */}
          <View style={[s.row, { gap: 10, marginTop: 2 }]}>
            <ParentSlot which={1} name={a} onPick={() => setPicking('a')}
              onClear={() => setA(null)} />
            {/* both picked? one tap swaps them — cheaper than re-picking when
                you meant the other order (self-found queue item) */}
            <Pressable hitSlop={10} disabled={!a || !b}
              accessibilityRole="button"
              accessibilityLabel={a && b ? 'Swap the two parents' : 'Pick both parents to swap them'}
              onPress={() => {
                void Haptics.selectionAsync();
                setA(b);
                setB(a);
              }}
              style={{
                width: 34, height: 34, borderRadius: 17, alignSelf: 'center',
                alignItems: 'center', justifyContent: 'center',
                backgroundColor: a && b ? T.accentSoft : 'transparent',
              }}>
              <Icon name={a && b ? 'swap-horizontal' : 'plus'} size={20}
                color={a && b ? T.accentInk : T.faint} />
            </Pressable>
            <ParentSlot which={2} name={b} onPick={() => setPicking('b')}
              onClear={() => setB(null)} />
          </View>
          {a && b ? <PairResult a={a} b={b} /> : (
            <Card style={{ marginTop: 14 }}>
              <Text style={s.h2}>Pick two parents</Text>
              <Text style={[s.body, { marginTop: 6 }]}>
                You get the child instantly, with the math shown — and a warning whenever
                a special recipe or gender rule changes the outcome.
              </Text>
            </Card>
          )}
          {!(a && b) && (
            <CalcStartHelp mode="pair"
              onPick={(n) => { if (!a) setA(n); else if (!b) setB(n); }}
              onBrowseOwned={() => setPicking(a ? 'b-owned' : 'a-owned')} />
          )}
        </>
      ) : (
        <>
          <Btn label={target ?? 'I want this pal…'} onPress={() => setPicking('target')} />
          {target ? <ReverseLookup target={target} /> : (
            <>
              <Card style={{ marginTop: 14 }}>
                <Text style={s.h2}>Pick a target</Text>
                <Text style={[s.body, { marginTop: 6 }]}>
                  You'll see every parent pair that produces it — grouped by what's
                  cheapest from your box.
                </Text>
              </Card>
              <CalcStartHelp mode="reverse" onPick={(n) => setTarget(n)}
                onBrowseOwned={() => setPicking('target-owned')} />
            </>
          )}
        </>
      )}

      <PalPicker
        visible={picking !== null}
        onClose={() => setPicking(null)}
        initialOwn={picking?.endsWith('-owned') ? 'owned' : undefined}
        title={picking?.startsWith('target') ? 'Target species'
          : picking?.endsWith('-owned') ? 'Your pals'
          : `Parent ${picking === 'a' ? '1' : '2'}`}
        onPick={(n) => {
          if (picking === 'a' || picking === 'a-owned') setA(n);
          else if (picking === 'b' || picking === 'b-owned') setB(n);
          else if (picking?.startsWith('target')) setTarget(n);
        }}
      />
      {viewing && <PalDetail name={viewing} onClose={() => setViewing(null)} />}
    </ScrollView>
  );
}
