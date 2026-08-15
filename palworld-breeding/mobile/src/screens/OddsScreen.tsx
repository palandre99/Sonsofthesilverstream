/** Odds Lab — passive/IV/mutation odds from the game's own weights. */
import React, { useEffect, useMemo, useState } from 'react';
import { FlatList, Modal, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { T } from '../theme';
import { Badge, Btn, Card, PageHead, s } from '../ui/kit';
import { passives, type PassiveInfo } from '../store';
import {
  attemptsFor, CAKES, cakeById, ivOdds, mutationPlan, oddsTable, passiveOdds,
  type CakeId,
} from '../engine/odds';

function pct(p: number): string {
  if (!isFinite(p) || p <= 0) return '0%';
  if (p >= 0.99995) return '100%';
  if (p >= 0.01) return `${(p * 100).toFixed(1)}%`;
  return `${(p * 100).toFixed(2)}%`;
}

function oneIn(p: number): string {
  if (!isFinite(p) || p <= 0) return 'not possible';
  const n = 1 / p;
  return `1 in ${n < 10 ? n.toFixed(1) : Math.round(n)} eggs`;
}

/* ---------------- passive picker modal ---------------- */

function PassivePickerModal({ visible, onClose, onPick, exclude }: {
  visible: boolean; onClose: () => void; onPick: (name: string) => void;
  exclude: Set<string>;
}) {
  const [q, setQ] = useState('');
  const matches = useMemo(() => {
    const needle = q.toLowerCase();
    return passives
      .filter((p) => !exclude.has(p.name))
      .filter((p) => !needle || p.name.toLowerCase().includes(needle)
        || p.effects.toLowerCase().includes(needle));
  }, [q, exclude]);

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet"
      onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: T.bg2, padding: 16 }}>
        <View style={[s.row, { marginBottom: 10 }]}>
          <Text style={[s.h2, { flex: 1 }]}>Add a passive</Text>
          <Btn label="Close" onPress={onClose} small />
        </View>
        <TextInput
          value={q} onChangeText={setQ} placeholder="Search 114 passives…"
          placeholderTextColor={T.faint} autoCorrect={false} autoCapitalize="none"
          style={[s.search, { marginBottom: 8 }]} />
        <FlatList
          data={matches}
          keyExtractor={(p) => p.name}
          keyboardShouldPersistTaps="handled"
          renderItem={({ item: p }) => (
            <Pressable
              onPress={() => { onPick(p.name); setQ(''); onClose(); }}
              style={({ pressed }) => [{
                paddingVertical: 8, paddingHorizontal: 8, borderRadius: 10, gap: 2,
              }, pressed && { backgroundColor: T.accentSoft }]}
            >
              <View style={[s.row, { gap: 8 }]}>
                <Badge kind={p.tier != null && p.tier >= 4 ? 'gold' : p.tier != null && p.tier > 0 ? 'ok' : 'bad'}>
                  {p.tier != null && p.tier > 0 ? `T${p.tier}` : 'neg'}
                </Badge>
                <Text style={{ color: T.ink, fontWeight: '700', fontSize: 14.5 }}>{p.name}</Text>
              </View>
              <Text style={{ color: T.muted, fontSize: 12 }} numberOfLines={1}>{p.effects}</Text>
            </Pressable>
          )}
        />
      </View>
    </Modal>
  );
}

/* ---------------- passives tab ---------------- */

function OddsCard({ label, big, sub, hero }: {
  label: string; big: string; sub: string; hero?: boolean;
}) {
  return (
    <View style={{
      flex: 1, minWidth: 150, borderRadius: T.r, padding: 14, borderWidth: 1,
      backgroundColor: hero ? T.accentSoft : T.surface,
      borderColor: hero ? T.accent : T.line,
    }}>
      <Text style={{ color: T.muted, fontSize: 10, fontWeight: '800', letterSpacing: 0.6 }}>
        {label.toUpperCase()}
      </Text>
      <Text style={{ color: T.accentInk, fontSize: 30, fontWeight: '800', marginTop: 2 }}>
        {big}
      </Text>
      <Text style={{ color: T.muted, fontSize: 12 }}>{sub}</Text>
    </View>
  );
}

/** Session cache: switching bottom tabs unmounts this screen, and re-entering
 * it used to wipe carefully-picked parent passives (self-found 2026-08-15).
 * Module-level, deliberately not persisted — a fresh app start starts fresh. */
const oddsSession = {
  a: [] as string[], b: [] as string[], want: [] as string[],
  cake: 'cake' as CakeId,
};

function PassivesTab() {
  const [a, setA] = useState<string[]>(oddsSession.a);
  const [b, setB] = useState<string[]>(oddsSession.b);
  const [want, setWant] = useState<string[]>(oddsSession.want);
  const [cake, setCake] = useState<CakeId>(oddsSession.cake);
  const [picking, setPicking] = useState<'a' | 'b' | null>(null);
  useEffect(() => {
    oddsSession.a = a;
    oddsSession.b = b;
    oddsSession.want = want;
    oddsSession.cake = cake;
  }, [a, b, want, cake]);

  const byName = useMemo(() => new Map(passives.map((p) => [p.name, p])), []);
  const pool = useMemo(() => [...new Set([...a, ...b])], [a, b]);
  const desired = want.filter((n) => pool.includes(n));
  const junk = pool.length - desired.length;
  const odds = desired.length > 0 ? passiveOdds({ poolSize: pool.length, desiredCount: desired.length }) : null;
  const c = cakeById(cake);

  const warnings = useMemo(() => {
    const out: string[] = [];
    for (const n of pool) {
      const p = byName.get(n);
      if (!p) continue;
      if (p.mutation_exclusive) out.push(`${n} only appears on a mutated pal first — once a pal has it, it passes down normally.`);
      else if (p.exclusive_to.length) out.push(`${n} is native to ${p.exclusive_to.slice(0, 3).join(', ')} — a parent must already carry it.`);
    }
    return out;
  }, [pool, byName]);

  const Parent = ({ list, setList, label, which }: {
    list: string[]; setList: (v: string[]) => void; label: string; which: 'a' | 'b';
  }) => (
    <Card style={{ flex: 1, padding: 12, gap: 8 }}>
      <View style={s.row}>
        <Text style={[s.h3, { flex: 1 }]}>{label}</Text>
        <Text style={{ color: T.faint, fontSize: 11, fontWeight: '700' }}>{list.length}/4</Text>
      </View>
      <View style={s.wrap}>
        {list.map((n) => (
          <Text key={n}
            onPress={() => setList(list.filter((x) => x !== n))}
            style={{
              color: T.ink, backgroundColor: T.surface2, borderRadius: 9,
              paddingHorizontal: 9, paddingVertical: 4, fontSize: 12, fontWeight: '700',
              overflow: 'hidden',
            }}>{n} ✕</Text>
        ))}
        {list.length === 0 && <Text style={{ color: T.faint, fontSize: 12 }}>No passives yet</Text>}
      </View>
      {list.length < 4 && <Btn small label="+ Add" onPress={() => setPicking(which)} />}
    </Card>
  );

  return (
    <>
      <View style={{ flexDirection: 'row', gap: 10 }}>
        <Parent list={a} setList={setA} label="Parent 1" which="a" />
        <Parent list={b} setList={setB} label="Parent 2" which="b" />
      </View>

      <Card style={{ marginTop: 12 }}>
        <Text style={s.h2}>The pool</Text>
        <Text style={[s.body, { marginTop: 4 }]}>
          Both parents' passives, de-duplicated. Tick what you want — everything else
          is junk that dilutes the draw.
        </Text>
        {pool.length === 0 ? (
          <Text style={[s.body, { marginTop: 10, color: T.faint }]}>
            Add passives to a parent above and the pool appears here.
          </Text>
        ) : (
          <View style={{ marginTop: 10, gap: 6 }}>
            {pool.map((n) => {
              const on = want.includes(n);
              const capped = !on && desired.length >= 4;
              return (
                <Pressable
                  key={n}
                  disabled={capped}
                  onPress={() => setWant(on ? want.filter((x) => x !== n) : [...want, n])}
                  style={{
                    flexDirection: 'row', alignItems: 'center', gap: 8,
                    borderRadius: 10, borderWidth: 1, padding: 9,
                    backgroundColor: on ? T.accentSoft : T.surface2,
                    borderColor: on ? T.accent : T.line, opacity: capped ? 0.45 : 1,
                  }}
                >
                  <Text style={{ color: on ? T.accentInk : T.faint, fontWeight: '800' }}>
                    {on ? '☑' : '☐'}
                  </Text>
                  <Text style={{ color: T.ink, fontWeight: '700', fontSize: 13 }}>{n}</Text>
                  <Text style={{ color: T.muted, fontSize: 11, flex: 1 }} numberOfLines={1}>
                    {byName.get(n)?.effects}
                  </Text>
                </Pressable>
              );
            })}
            <Text style={[s.body, { fontSize: 12.5 }]}>
              Pool {pool.length} · wanted {desired.length}
              {junk > 0 ? ` · ${junk} junk` : ''}
              {desired.length >= 4 ? ' · 4 is the slot cap' : ''}
            </Text>
          </View>
        )}
      </Card>

      {warnings.map((w) => (
        <Card key={w} style={{ backgroundColor: T.warnSoft, borderColor: T.warn, marginTop: 10 }}>
          <Text style={[s.body, { color: T.warn }]}>{w}</Text>
        </Card>
      ))}

      {odds && (
        <>
          <View style={[s.wrap, { marginTop: 12 }]}>
            {CAKES.filter((k) => k.id !== 'special').map((k) => (
              <Text key={k.id}
                onPress={() => setCake(k.id)}
                style={{
                  color: cake === k.id ? T.accentInk : T.muted,
                  backgroundColor: cake === k.id ? T.accentSoft : T.surface2,
                  borderRadius: 16, paddingHorizontal: 11, paddingVertical: 5,
                  fontSize: 12, fontWeight: '700', overflow: 'hidden',
                }}>{k.name}</Text>
            ))}
          </View>
          <View style={[s.wrap, { marginTop: 10 }]}>
            <OddsCard hero label={`All ${desired.length} wanted`}
              big={pct(odds.allDesired)} sub={oneIn(odds.allDesired)} />
            <OddsCard label="Exactly those, no junk"
              big={pct(odds.exactlyDesired)} sub={oneIn(odds.exactlyDesired)} />
            <OddsCard label="Eggs for 90%"
              big={isFinite(odds.eggsFor90) ? String(odds.eggsFor90) : '—'}
              sub={isFinite(odds.eggsFor90)
                ? `${Math.ceil(odds.eggsFor90 / c.eggsPerCycle)} cycles on ${c.name}`
                : 'not reachable'} />
          </View>
        </>
      )}

      <Card style={{ marginTop: 12 }}>
        <Text style={s.h2}>If parents carry only what you want</Text>
        <Text style={[s.body, { marginTop: 4 }]}>
          Per-egg chances from the game's own inheritance weights. "Perfect" =
          the egg carries your passives and nothing else. "With extras" = all
          your passives, possibly plus random ones you'd breed out later.
        </Text>
        <View style={{ marginTop: 10, gap: 4 }}>
          <View style={[s.row, { gap: 10 }]}>
            <Text style={{ width: 90 }} />
            <Text style={{ color: T.faint, width: 60, fontSize: 10.5, fontWeight: '800', letterSpacing: 0.5 }}>PERFECT</Text>
            <Text style={{ color: T.faint, fontSize: 10.5, fontWeight: '800', letterSpacing: 0.5 }}>WITH EXTRAS</Text>
          </View>
          {oddsTable().map((r) => (
            <View key={r.skills} style={[s.row, { gap: 10 }]}>
              <Text style={{ color: T.muted, width: 90, fontSize: 13 }}>{r.skills} passive{r.skills > 1 ? 's' : ''}</Text>
              <Text style={{ color: T.accentInk, fontWeight: '800', width: 60, fontSize: 13 }}>{pct(r.clean)}</Text>
              <Text style={{ color: T.muted, fontSize: 12.5 }}>{pct(r.withJunk)}</Text>
            </View>
          ))}
        </View>
      </Card>

      <PassivePickerModal
        visible={picking !== null}
        onClose={() => setPicking(null)}
        exclude={new Set(picking === 'a' ? a : b)}
        onPick={(n) => {
          if (picking === 'a' && a.length < 4) setA([...a, n]);
          if (picking === 'b' && b.length < 4) setB([...b, n]);
        }}
      />
    </>
  );
}

/* ---------------- IVs ---------------- */

function IvTab() {
  const [picked, setPicked] = useState<string[]>(['atk']);
  const [specific, setSpecific] = useState(false);
  const n = picked.length;
  const odds = n >= 1 && n <= 3 ? ivOdds(n) : null;
  const p = odds ? (specific ? odds.fromChosenParent : odds.categoriesInherited) : 0;

  return (
    <>
      <Card>
        <Text style={s.h2}>Which stats matter?</Text>
        <Text style={[s.body, { marginTop: 4 }]}>
          At least one hidden potential is always taken from a parent; the rest roll fresh.
        </Text>
        <View style={[s.wrap, { marginTop: 10 }]}>
          {([['hp', 'HP'], ['atk', 'Attack'], ['def', 'Defence']] as const).map(([id, label]) => {
            const on = picked.includes(id);
            return (
              <Text key={id}
                onPress={() => setPicked(on ? picked.filter((x) => x !== id) : [...picked, id])}
                style={{
                  color: on ? T.accentInk : T.muted,
                  backgroundColor: on ? T.accentSoft : T.surface2,
                  borderWidth: 1.5, borderColor: on ? T.accent : T.line2,
                  borderRadius: 11, paddingHorizontal: 18, paddingVertical: 9,
                  fontWeight: '700', overflow: 'hidden',
                }}>{label}</Text>
            );
          })}
        </View>
        <Text
          onPress={() => setSpecific(!specific)}
          style={[s.body, { marginTop: 10 }]}
        >
          {specific ? '☑' : '☐'}  Must come from one specific parent
        </Text>
      </Card>

      {odds ? (
        <View style={[s.wrap, { marginTop: 12 }]}>
          <OddsCard hero label={specific ? 'From your chosen parent' : 'From either parent'}
            big={pct(p)} sub={oneIn(p)} />
          <OddsCard label="Eggs for 90%" big={String(attemptsFor(p, 0.9))}
            sub={`${n} stat${n > 1 ? 's' : ''}`} />
        </View>
      ) : (
        <Card style={{ marginTop: 12, backgroundColor: T.warnSoft, borderColor: T.warn }}>
          <Text style={[s.body, { color: T.warn }]}>Pick at least one stat.</Text>
        </Card>
      )}

      <Card style={{ marginTop: 12 }}>
        <Text style={s.h2}>Why you can't force all three</Text>
        <Text style={[s.body, { marginTop: 4 }]}>
          The game inherits one category half the time, two a third of the time, all three
          one time in six — then each inherited category picks mother or father on a coin
          flip. Serious IV work is volume plus selection across generations. Mushroom and
          Extravagant Vegetable Cake help; their exact bonus was never published.
        </Text>
      </Card>
    </>
  );
}

/* ---------------- cakes ---------------- */

function CakesTab() {
  const mutationPassives = passives.filter((p) => p.mutation_exclusive);
  return (
    <>
      <Card>
        <Text style={s.h2}>Which cake for which job</Text>
        <View style={{ marginTop: 10, gap: 10 }}>
          {CAKES.map((k) => {
            const m = mutationPlan(k.id);
            return (
              <View key={k.id} style={{ gap: 2 }}>
                <View style={[s.row, { gap: 8 }]}>
                  <Text style={{ color: T.ink, fontWeight: '800', fontSize: 14 }}>{k.name}</Text>
                  <Badge kind="plain">{k.eggsPerCycle} egg{k.eggsPerCycle > 1 ? 's' : ''}/cycle</Badge>
                  <Badge kind="plain">{pct(m.mutationPerCycle)} mut/cycle</Badge>
                </View>
                <Text style={[s.body, { fontSize: 12.5 }]}>{k.effect}</Text>
              </View>
            );
          })}
        </View>
        <Text style={[s.body, { marginTop: 10, fontSize: 12 }]}>
          Cake numbers are community-measured — treat percentages as ≈. Two eggs at 1%
          each is 1.99% per cycle, not 2% per egg.
        </Text>
      </Card>

      <Card style={{ marginTop: 12 }}>
        <Text style={s.h2}>Hunting a mutation</Text>
        <View style={[s.wrap, { marginTop: 10 }]}>
          {(['cake', 'vegetable', 'extravagant'] as CakeId[]).map((id) => {
            const m = mutationPlan(id);
            return (
              <OddsCard key={id} hero={id === 'extravagant'}
                label={cakeById(id).name} big={String(m.cyclesFor90)}
                sub={`cycles for 90% · ~${Math.round(m.expectedEggs)} eggs avg`} />
            );
          })}
        </View>
      </Card>

      <Card style={{ marginTop: 12 }}>
        <Text style={s.h2}>The mutation-only passives</Text>
        <Text style={[s.body, { marginTop: 4 }]}>
          These exist nowhere else. Once a pal carries one, it breeds down like any
          other passive — one mutant is a permanent source.
        </Text>
        <View style={{ marginTop: 8, gap: 6 }}>
          {mutationPassives.map((p) => (
            <View key={p.name}>
              <Text style={{ color: T.goldInk, fontWeight: '800', fontSize: 13.5 }}>{p.name}</Text>
              <Text style={[s.body, { fontSize: 12.5 }]}>{p.effects}</Text>
            </View>
          ))}
        </View>
      </Card>
    </>
  );
}

/* ---------------- page ---------------- */

export function OddsScreen() {
  const [mode, setMode] = useState<'passives' | 'ivs' | 'cakes'>('passives');
  return (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
      <PageHead title="Odds Lab"
        sub="What a pairing actually costs in eggs — driven by the game's own inheritance weights." />
      <View style={{
        flexDirection: 'row', backgroundColor: T.surface2, borderRadius: 12,
        padding: 3, marginBottom: 14, alignSelf: 'flex-start',
      }}>
        {([['passives', 'Passives'], ['ivs', 'IVs'], ['cakes', 'Cakes']] as const).map(([id, label]) => (
          <Text key={id}
            onPress={() => setMode(id)}
            style={{
              paddingVertical: 8, paddingHorizontal: 16, borderRadius: 9,
              fontWeight: '700', fontSize: 13.5, overflow: 'hidden',
              color: mode === id ? T.ink : T.muted,
              backgroundColor: mode === id ? T.surface : 'transparent',
            }}>{label}</Text>
        ))}
      </View>
      {mode === 'passives' ? <PassivesTab /> : mode === 'ivs' ? <IvTab /> : <CakesTab />}
    </ScrollView>
  );
}
