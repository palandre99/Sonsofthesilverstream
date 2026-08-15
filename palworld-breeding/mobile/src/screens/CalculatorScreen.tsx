/** Calculator — pair→child and child→parents, same engine as the web app. */
import React, { useEffect, useMemo, useState } from 'react';
import { ScrollView, Text, View, Pressable } from 'react-native';
import * as Haptics from 'expo-haptics';
import { T } from '../theme';
import { BackToCardChip, Badge, Btn, Card, ElementChips, PageHead, PalIcon, WorkChips, s, getRecentPicks } from '../ui/kit';
import { PalPicker } from '../ui/PalPicker';
import {
  canPairNow, engine, ownedAny, pals, selfOnly, useAppVersion,
} from '../store';
import { parseGenderNote } from '../engine/formula';
import { onNavIntent, takeIntentPayload } from '../nav/intent';
import { PalDetail } from '../ui/PalDetail';
import type { ChildResult } from '../engine/types';

function ResultFlags({ ch }: { ch: ChildResult }) {
  return (
    <View style={[s.wrap, { marginTop: 6 }]}>
      {ch.kind === 'unique' && <Badge kind="unique">unique recipe</Badge>}
      {ch.kind === 'gendered' && <Badge kind="warn">gender locked</Badge>}
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
            {bothOwned && !canPairNow(a, b, ch.genderNote) && (
              <Text style={[s.body, { marginTop: 8, color: T.warn }]}>
                ⚠ You own both species, but not a working ♂/♀ combination.
                Swap a gender with the Pal Reverser or breed another copy.
              </Text>
            )}
          </Card>
        );
      })}
    </>
  );
}

function ReverseLookup({ target }: { target: string }) {
  useAppVersion();
  const [showAll, setShowAll] = useState(false);

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

  if (selfOnly.has(target)) {
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
            {(showAll ? items : items.slice(0, 10)).map((p) => {
              const mother = p.note ? parseGenderNote(p.note)?.mother : undefined;
              return (
                <Card key={`${p.a}|${p.b}`}
                  style={{ paddingVertical: 8, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <PalIcon name={p.a} size={32} gender={p.note ? (mother === p.a ? 'f' : 'm') : undefined} />
                  <PalIcon name={p.b} size={32} gender={p.note ? (mother === p.b ? 'f' : 'm') : undefined} />
                  <Text style={{ color: T.ink, fontWeight: '700', fontSize: 13.5, flex: 1 }}>
                    {p.a} <Text style={{ color: T.faint }}>+</Text> {p.b}
                  </Text>
                  {p.kind === 'unique' && <Badge kind="unique">unique</Badge>}
                  {p.kind === 'gendered' && <Badge kind="warn">♀♂</Badge>}
                </Card>
              );
            })}
          </View>
          {!showAll && items.length > 10 && (
            <View style={{ marginTop: 8 }}>
              <Btn label={`Show all ${items.length}`} onPress={() => setShowAll(true)} small />
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
  const [picking, setPicking] = useState<'a' | 'b' | 'target' | null>(null);

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
            onPress={() => setMode(id)}
            style={{
              paddingVertical: 8, paddingHorizontal: 16, borderRadius: 9,
              fontWeight: '700', fontSize: 13.5, overflow: 'hidden',
              color: mode === id ? T.ink : T.muted,
              backgroundColor: mode === id ? T.surface : 'transparent',
            }}
          >{label}</Text>
        ))}
      </View>

      {mode === 'pair' ? (
        <>
          <View style={[s.row, { gap: 10 }]}>
            <View style={{ flex: 1 }}>
              <Btn label={a ?? 'Parent 1…'} onPress={() => setPicking('a')} />
            </View>
            <Text style={{ color: T.faint, fontWeight: '800' }}>+</Text>
            <View style={{ flex: 1 }}>
              <Btn label={b ?? 'Parent 2…'} onPress={() => setPicking('b')} />
            </View>
          </View>
          {a && b ? <PairResult a={a} b={b} /> : (
            <Card style={{ marginTop: 14 }}>
              <Text style={s.h2}>Pick two parents</Text>
              <Text style={[s.body, { marginTop: 6 }]}>
                You get the child instantly, with the math shown — and a warning whenever
                a special recipe or gender rule changes the outcome.
              </Text>
              {getRecentPicks().filter((n) => Object.hasOwn(pals, n)).length > 0 && (
                <>
                  <Text style={{
                    color: T.faint, fontSize: 10.5, fontWeight: '800',
                    letterSpacing: 1, marginTop: 12, marginBottom: 6,
                  }}>QUICK START — RECENT PALS</Text>
                  <View style={[s.wrap]}>
                    {getRecentPicks().filter((n) => Object.hasOwn(pals, n)).slice(0, 6).map((n) => (
                      <Pressable key={n}
                        onPress={() => {
                          void Haptics.selectionAsync();
                          if (!a) setA(n);
                          else if (!b) setB(n);
                        }}
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
                </>
              )}
            </Card>
          )}
        </>
      ) : (
        <>
          <Btn label={target ?? 'I want this pal…'} onPress={() => setPicking('target')} />
          {target ? <ReverseLookup target={target} /> : (
            <Card style={{ marginTop: 14 }}>
              <Text style={s.h2}>Pick a target</Text>
              <Text style={[s.body, { marginTop: 6 }]}>
                You'll see every parent pair that produces it — grouped by what's
                cheapest from your box.
              </Text>
            </Card>
          )}
        </>
      )}

      <PalPicker
        visible={picking !== null}
        onClose={() => setPicking(null)}
        title={picking === 'target' ? 'Target species' : `Parent ${picking === 'a' ? '1' : '2'}`}
        onPick={(n) => {
          if (picking === 'a') setA(n);
          else if (picking === 'b') setB(n);
          else if (picking === 'target') setTarget(n);
        }}
      />
      {viewing && <PalDetail name={viewing} onClose={() => setViewing(null)} />}
    </ScrollView>
  );
}
