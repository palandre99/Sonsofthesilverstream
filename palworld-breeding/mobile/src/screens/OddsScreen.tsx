/** Odds Lab — passive/IV/mutation odds from the game's own weights. */
import React, { useEffect, useMemo, useState } from 'react';
import { FlatList, Modal, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { T } from '../theme';
import { Badge, Btn, Card, PageHead, s } from '../ui/kit';
import { Icon } from '../ui/Icon';
import { pals, passives } from '../store';
import {
  attemptsFor, CAKES, cakeById, ivOdds, mutationPlan, oddsTable, passiveOdds,
  type CakeId,
} from '../engine/odds';

/** Passives in the pool that something already carries. Not a warning — none
 * of these 8 is exclusive, they all breed normally — but if 19 pals are born
 * with Heavyweight, catching one may beat breeding for it, and the app never
 * said so. Entries are the dataset's own words; the only reshaping is moving
 * the "item: " prefix into plain English. */
function bornWith(p: { native_pals?: string[] | null }): {
  names: string[]; anyPal: boolean;
} {
  const raw = p.native_pals ?? [];
  return {
    names: raw.map((n) => (n.startsWith('item: ') ? `the ${n.slice(6)} (an item)` : n)),
    // Mercy Hit's two entries are ITEMS, not pals. "Catching one may be
    // quicker" is nonsense for a Ring of Mercy — caught on the render, so the
    // advice half only appears when a real pal carries it.
    anyPal: raw.some((n) => !n.startsWith('item: ')),
  };
}

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

/** The game sorts every passive into one of six kinds, and the app had never
 * said so — `category` was declared on PassiveInfo and read by nothing, so a
 * player picking from 114 entries could only search by name. These are the
 * game's own groupings; "detrimental" is the only one reworded, because
 * "Downside" is what it actually means to the person choosing. */
const PASSIVE_KINDS: { id: string; label: string }[] = [
  { id: 'combat', label: 'Combat' },
  { id: 'work', label: 'Work' },
  { id: 'mount', label: 'Riding' },
  { id: 'utility', label: 'Utility' },
  { id: 'mixed', label: 'Mixed' },
  { id: 'detrimental', label: 'Downside' },
];
const KIND_LABEL: Record<string, string> =
  Object.fromEntries(PASSIVE_KINDS.map((k) => [k.id, k.label]));

/** What a tier MEANS, in the words the data itself uses. The file's own
 * `tier_scale` reads "-3..-1 detrimental, 1..4 positive, 5 = new 1.0 'World
 * Tree' gold tier" — so tier 5 gets the game's name for it and the rest are
 * stated as the rank they are. No invented adjectives. */
function tierWords(tier: number | null): string {
  if (tier == null) return '';
  if (tier === 5) return 'World Tree tier';
  if (tier > 0) return `Rank ${tier} of 4`;
  return 'Weakens your pal';
}

function PassivePickerModal({ visible, onClose, onPick, exclude }: {
  visible: boolean; onClose: () => void; onPick: (name: string) => void;
  exclude: Set<string>;
}) {
  const [q, setQ] = useState('');
  const [kind, setKind] = useState<string | null>(null);
  const available = useMemo(
    () => passives.filter((p) => !exclude.has(p.name)), [exclude],
  );
  // counts come from what is actually pickable right now, so a chip never
  // promises entries the exclude set has already taken away
  const counts = useMemo(() => {
    const m: Record<string, number> = {};
    for (const p of available) m[p.category] = (m[p.category] ?? 0) + 1;
    return m;
  }, [available]);
  const matches = useMemo(() => {
    const needle = q.toLowerCase();
    return available
      .filter((p) => !kind || p.category === kind)
      .filter((p) => !needle || p.name.toLowerCase().includes(needle)
        || p.effects.toLowerCase().includes(needle));
  }, [q, kind, available]);

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet"
      onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: T.bg2, padding: 16 }}>
        <View style={[s.row, { marginBottom: 10 }]}>
          <Text style={[s.h2, { flex: 1 }]}>Add a passive</Text>
          <Btn label="Close" onPress={onClose} small />
        </View>
        <TextInput
          value={q} onChangeText={setQ}
          // the literal 114 was the whole file; once a passive is already on a
          // parent it is excluded here, so the box was offering to search
          // entries it would never show
          placeholder={`Search ${available.length} passives…`}
          placeholderTextColor={T.faint} autoCorrect={false} autoCapitalize="none"
          accessibilityLabel="Search passives"
          style={[s.search, { marginBottom: 8 }]} />
        <View style={[s.wrap, { marginBottom: 8 }]}>
          {[{ id: null as string | null, label: 'All', n: available.length },
            ...PASSIVE_KINDS.map((k) => ({ id: k.id as string | null, label: k.label, n: counts[k.id] ?? 0 }))]
            .filter((k) => k.n > 0)
            .map((k) => {
              const on = kind === k.id;
              return (
                <Pressable key={k.label} onPress={() => setKind(k.id)}
                  accessibilityRole="button"
                  accessibilityState={{ selected: on }}
                  accessibilityLabel={`${k.label}, ${k.n} passive${k.n === 1 ? '' : 's'}${on ? ', showing now' : ''}`}
                  style={[s.chip, {
                    backgroundColor: on ? T.accentSoft : T.surface2,
                    borderWidth: on ? 1 : 0, borderColor: on ? T.accent : 'transparent',
                    paddingHorizontal: 10, paddingVertical: 5,
                  }]}>
                  <Text style={[s.chipText, { color: on ? T.accentInk : T.muted }]}>
                    {k.label} {k.n}
                  </Text>
                </Pressable>
              );
            })}
        </View>
        {matches.length === 0 && (
          <Text style={[s.body, { color: T.muted, marginBottom: 8 }]}>
            Nothing here matches. Try another kind, or clear the search.
          </Text>
        )}
        <FlatList
          data={matches}
          keyExtractor={(p) => p.name}
          keyboardShouldPersistTaps="handled"
          renderItem={({ item: p }) => (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`${p.name}. ${KIND_LABEL[p.category] ?? p.category}, ${tierWords(p.tier)}. ${p.effects}`}
              onPress={() => { onPick(p.name); setQ(''); onClose(); }}
              style={({ pressed }) => [{
                paddingVertical: 8, paddingHorizontal: 8, borderRadius: 10, gap: 2,
              }, pressed && { backgroundColor: T.accentSoft }]}
            >
              {/* This badge used to read "T5", "T3" or "neg" — developer
                  shorthand in the one list a player has to read 114 of. The
                  CEO banned exactly this shape once already ("m7/t7 note
                  badges are terrible"). It now names the KIND, which is a
                  mined field, and the rank is spelled out beside it. */}
              <View style={[s.row, { gap: 8 }]}>
                <Badge kind={p.tier === 5 ? 'gold' : p.tier != null && p.tier > 0 ? 'ok' : 'bad'}>
                  {KIND_LABEL[p.category] ?? p.category}
                </Badge>
                <Text style={{ color: T.ink, fontWeight: '700', fontSize: 14.5, flex: 1 }}
                  numberOfLines={1}>{p.name}</Text>
                <Text style={{
                  color: p.tier === 5 ? T.goldInk : p.tier != null && p.tier > 0 ? T.muted : T.bad,
                  fontSize: 11, fontWeight: '700',
                }}>{tierWords(p.tier)}</Text>
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

/** A pal has four passive slots — the game's own limit. */
const SLOTS = 4;

/** One parent's passive list. This lived INSIDE PassivesTab, which made it a
 *  new component type on every render, so React unmounted and rebuilt both
 *  cards every time anything changed. Harmless today (they hold no state of
 *  their own) but exactly the trap that bites whoever adds some. */
function ParentCard({ list, setList, label, onAdd }: {
  list: string[]; setList: (v: string[]) => void; label: string; onAdd: () => void;
}) {
  return (
    <Card style={{ flex: 1, padding: 12, gap: 8 }}>
      <View style={s.row}>
        <Text style={[s.h3, { flex: 1 }]}>{label}</Text>
        <Text style={{ color: T.faint, fontSize: 11, fontWeight: '700' }}>{list.length}/{SLOTS}</Text>
      </View>
      {/* CHOOSING THE PASSIVES IS WHAT THE ODDS LAB IS FOR, and measuring the
          render showed the only way to do it was a 30 px "+ Add" pill — the
          smallest control on a screen with five controls on it. Same defect
          the CEO named on the Calculator ("the two most important bubbles are
          very small... it kind of drowns"), found this time by measuring
          instead of waiting for him to say it. An empty parent is now a big
          dashed target you cannot miss. */}
      {list.length === 0 ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Add a passive to ${label}`}
          onPress={onAdd}
          style={({ pressed }) => [{
            minHeight: 88, borderRadius: 12, borderWidth: 1.5,
            borderColor: T.line2, borderStyle: 'dashed',
            alignItems: 'center', justifyContent: 'center', gap: 6, padding: 10,
            opacity: pressed ? 0.75 : 1,
          }]}>
          <Icon name="plus-circle-outline" size={26} color={T.faint} />
          <Text style={{ color: T.muted, fontWeight: '800', fontSize: 12.5 }}>
            Add a passive
          </Text>
          <Text style={{ color: T.faint, fontSize: 11, fontWeight: '700' }}>
            up to {SLOTS}
          </Text>
        </Pressable>
      ) : (
        <>
          <View style={s.wrap}>
            {list.map((n) => (
              <Pressable key={n}
                accessibilityRole="button"
                accessibilityLabel={`Remove ${n} from ${label}`}
                hitSlop={8}
                onPress={() => setList(list.filter((x) => x !== n))}
                style={{
                  backgroundColor: T.surface2, borderRadius: 9,
                  paddingHorizontal: 9, minHeight: 30,
                  flexDirection: 'row', alignItems: 'center', gap: 5,
                }}>
                <Text style={{ color: T.ink, fontSize: 12, fontWeight: '700' }}>{n}</Text>
                <Icon name="close" size={13} color={T.muted} />
              </Pressable>
            ))}
          </View>
          {list.length < SLOTS && (
            <Btn label={`Add another (${SLOTS - list.length} left)`} onPress={onAdd} />
          )}
        </>
      )}
    </Card>
  );
}

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
      else if (p.exclusive_to.length) {
        // Legend is native to SIX pals and this listed three, with nothing to
        // say more existed — it read as the complete answer (self-found
        // 2026-08-16, after his Calculator screenshot showed the same shape).
        const more = p.exclusive_to.length - 3;
        out.push(`${n} is native to ${p.exclusive_to.slice(0, 3).join(', ')}${
          more > 0 ? ` and ${more} more` : ''} — a parent must already carry it.`);
      } else if (!p.breedable_known) {
        // `breedable` is true for all 114 passives, so it can never warn about
        // anything. `breedable_known` is the real flag, false for exactly the
        // seven World Tree passives — and NONE of them is caught by the two
        // warnings above, so the app quoted inheritance odds for them while
        // saying nothing about the fact that nobody confirmed they inherit.
        out.push(`${n} is a World Tree passive — no source we trust confirms it can be bred down at all, so its odds here are unproven.`);
      }
    }
    return out;
  }, [pool, byName]);

  return (
    <>
      <View style={{ flexDirection: 'row', gap: 10 }}>
        <ParentCard list={a} setList={setA} label="Parent 1"
          onAdd={() => setPicking('a')} />
        <ParentCard list={b} setList={setB} label="Parent 2"
          onAdd={() => setPicking('b')} />
      </View>

      <Card style={{ marginTop: 12 }}>
        <Text style={s.h2}>The pool</Text>
        <Text style={[s.body, { marginTop: 4 }]}>
          Both parents' passives, each listed once. Tick what you want — everything else
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
              const capped = !on && desired.length >= SLOTS;
              return (
                <Pressable
                  key={n}
                  disabled={capped}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: on, disabled: capped }}
                  // RN-web drops the state flags, and this row's whole
                  // meaning IS its state, so it goes in the words too
                  accessibilityLabel={`${n}: ${on ? 'wanted' : capped
                    ? 'not wanted — all four slots are taken' : 'not wanted'}`}
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
              {desired.length >= SLOTS ? ` · ${SLOTS} is the slot cap` : ''}
            </Text>
          </View>
        )}
      </Card>

      {pool.map((n) => {
        const p = byName.get(n);
        const born = p ? bornWith(p) : { names: [], anyPal: false };
        if (!born.names.length) return null;
        return (
          <Card key={`born-${n}`} style={{ marginTop: 10 }}>
            <Text style={[s.body, { fontSize: 12.5 }]}>
              <Text style={{ fontWeight: '800', color: T.ink }}>{n}</Text>
              {' '}is already carried by {born.names.length === 1 ? born.names[0]
                : born.names.length <= 4 ? born.names.join(', ')
                : `${born.names.slice(0, 3).join(', ')} and ${born.names.length - 3} more`}
              .{born.anyPal ? ' Catching one may be quicker than breeding for it.' : ''}
            </Text>
          </Card>
        );
      })}

      {warnings.map((w) => (
        <Card key={w} style={{ backgroundColor: T.warnSoft, borderColor: T.warn, marginTop: 10 }}>
          <Text style={[s.body, { color: T.warn }]}>{w}</Text>
        </Card>
      ))}

      {/* The cap only blocks NEW ticks, so it can be walked around: tick four,
          remove two of those passives from a parent (the cap releases), tick
          two more, then put the first two back — now six are wanted and a pal
          has four slots. The maths is then honestly 0%, but read as "this
          pairing is unlucky" rather than "you asked for the impossible".
          Say which it is. (self-found on a code read, 2026-08-16) */}
      {desired.length > SLOTS && (
        <Card style={{ backgroundColor: T.warnSoft, borderColor: T.warn, marginTop: 12 }}>
          <Text style={[s.body, { color: T.warn }]}>
            You have {desired.length} passives ticked, but a pal only ever holds
            {' '}{SLOTS}. Untick {desired.length - SLOTS} of them to see real odds.
          </Text>
        </Card>
      )}

      {odds && desired.length <= SLOTS && (
        <>
          <View style={[s.wrap, { marginTop: 12 }]}>
            {CAKES.filter((k) => k.id !== 'special').map((k) => (
              <Text key={k.id}
                accessibilityRole="button"
                accessibilityLabel={`${k.name}${cake === k.id ? ', chosen' : ''}`}
                onPress={() => setCake(k.id)}
                style={{
                  color: cake === k.id ? T.accentInk : T.muted,
                  backgroundColor: cake === k.id ? T.accentSoft : T.surface2,
                  borderRadius: 16, paddingHorizontal: 11, paddingVertical: 5,
                  fontSize: 12, fontWeight: '700', overflow: 'hidden',
                }}>{k.name}</Text>
            ))}
          </View>
          {/* The website already said this; the phone just dropped Special
              Cake from the list with no explanation, which looks like an
              oversight rather than a principle. */}
          {/* engine/odds.ts states outright that the cake table "carries a
              'community' confidence and the UI must say so" — and no screen
              read that field. Every cake here is community-measured. */}
          <Text style={[s.body, { fontSize: 11.5, marginTop: 6, color: T.faint }]}>
            Cake egg counts and mutation rates are community-measured, not read
            from the game files — the game's own cake table has never been
            published. Special Cake is left out entirely for the same reason:
            its passive override is not datamined, and this app does not invent
            numbers.
          </Text>
          <View style={[s.wrap, { marginTop: 10 }]}>
            <OddsCard hero label={`All ${desired.length} wanted`}
              big={pct(odds.allDesired)} sub={oneIn(odds.allDesired)} />
            <OddsCard label="Exactly those, no junk"
              big={pct(odds.exactlyDesired)} sub={oneIn(odds.exactlyDesired)} />
            <OddsCard label={`Eggs for 90% of all ${desired.length} wanted`}
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
          if (picking === 'a' && a.length < SLOTS) setA([...a, n]);
          if (picking === 'b' && b.length < SLOTS) setB([...b, n]);
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
                accessibilityRole="button"
                accessibilityLabel={`${label}${on ? ', wanted' : ''}`}
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
        {/* Measured at 20 px tall — the smallest interactive thing left in the
            app after the 44 pt sweep, because it was a bare <Text onPress> and
            so never went through `Btn`. Now a real row with a real box, and
            the tick is a vector icon rather than the ☐/☑ text glyphs (the
            chrome rule: vector icons or game art, never a character standing
            in for a control). */}
        <Pressable
          accessibilityRole="checkbox"
          accessibilityState={{ checked: specific }}
          accessibilityLabel={`Must come from one specific parent: ${specific ? 'yes' : 'no'}`}
          onPress={() => setSpecific(!specific)}
          hitSlop={6}
          style={({ pressed }) => [{
            marginTop: 10, minHeight: 44, flexDirection: 'row',
            alignItems: 'center', gap: 10, opacity: pressed ? 0.7 : 1,
          }]}
        >
          <View style={{
            width: 22, height: 22, borderRadius: 6, borderWidth: 1.5,
            borderColor: specific ? T.accent : T.line2,
            backgroundColor: specific ? T.accent : 'transparent',
            alignItems: 'center', justifyContent: 'center',
          }}>
            {specific && <Icon name="check" size={15} color="#08191B" />}
          </View>
          <Text style={[s.body, { flex: 1 }]}>
            Must come from one specific parent
          </Text>
        </Pressable>
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

/** The pals whose base-side partner effect is about eggs, read from the data
 * so this card can never name the wrong one. Every figure on this screen is a
 * count of eggs; nothing in the app told you that two pals make the same count
 * arrive sooner. Their own words from the game files, not a paraphrase. */
const EGG_HELPERS = Object.entries(pals)
  .filter(([, p]) => p.base_support?.type === 'egg_speed' || p.base_support?.type === 'incubation')
  .map(([name, p]) => ({ name, skill: p.partner_skill ?? '', effect: p.partner_effect ?? '' }))
  .filter((h) => h.effect)
  .sort((a, b) => a.name.localeCompare(b.name));

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
            accessibilityRole="button"
            accessibilityLabel={`${label}${mode === id ? ', showing now' : ''}`}
            onPress={() => setMode(id)}
            style={{
              // 8 rendered these tabs 34 px tall, under the 44 pt minimum
              paddingVertical: 12, paddingHorizontal: 16, borderRadius: 9,
              fontWeight: '700', fontSize: 13.5, overflow: 'hidden',
              color: mode === id ? T.ink : T.muted,
              backgroundColor: mode === id ? T.surface : 'transparent',
            }}>{label}</Text>
        ))}
      </View>
      {mode === 'passives' ? <PassivesTab /> : mode === 'ivs' ? <IvTab /> : <CakesTab />}

      {EGG_HELPERS.length > 0 && (
        <Card style={{ marginTop: 12 }}>
          <Text style={s.h2}>
            {EGG_HELPERS.length} pals make eggs arrive faster
          </Text>
          <Text style={[s.body, { marginTop: 4 }]}>
            Every number on this screen is a count of eggs. Keep these at your base and
            the same count takes less waiting.
          </Text>
          <View style={{ marginTop: 8, gap: 8 }}>
            {EGG_HELPERS.map((h) => (
              <View key={h.name}>
                <Text style={{ color: T.goldInk, fontWeight: '800', fontSize: 13.5 }}>
                  {h.name} — {h.skill}
                </Text>
                <Text style={[s.body, { fontSize: 12.5 }]}>{h.effect}</Text>
              </View>
            ))}
          </View>
          <Text style={[s.body, { marginTop: 8, fontSize: 11.5, color: T.faint }]}>
            Datamined partner effects, word for word.
          </Text>
        </Card>
      )}
    </ScrollView>
  );
}
