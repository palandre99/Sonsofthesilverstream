/** Paldex — the encyclopedia AND your collection, one screen.
 * Ownership lives here: ♂/♀ toggles on every row, import, stats — the
 * separate Box tab was folded in (two near-identical lists were confusing). */
import React, { memo, useEffect, useMemo, useState } from 'react';
import { FlatList, Modal, Pressable, Share, Text, TextInput, View } from 'react-native';
import { T } from '../theme';
import {
  Badge, Btn, Card, DataStamp, ElementChips, GenderToggles, PalIcon, SearchInput,
  WorkChips, s,
} from '../ui/kit';
import {
  clearBox, engine, getBox, importNames, ownedAny, pals, setOwnedGender, unsureCount,
  useAppVersion, workLabel, type OwnedGenders,
} from '../store';
import { Icon } from '../ui/Icon';
import { closure } from '../engine/planner';
import { PalDetail } from '../ui/PalDetail';
import { rarityTint } from '../data/rarity';
import { FilterSheet } from '../ui/FilterSheet';
import {
  applyFilters, NO_FILTERS, sortedPals, type Filters, type SortKey,
} from '../ui/palFilters';
import { SAMPLE_BOX } from '../data/sampleBox';
import { exportLine, parseImport } from '../boxShare';
import { onNavIntent, takeIntentPayload } from '../nav/intent';

/** The empty Paldex used to be 299 untickable-looking rows and a footer
 * button — nothing on it said that ticking pals is what makes every other
 * screen work, and nothing let you find out without typing a list first.
 *
 * So: one tap fills the box with twelve first-hour pals and the Planner
 * starts answering questions immediately. It is only ever offered on an
 * EMPTY box, and it names itself as a sample for as long as the box is
 * exactly the sample — so it can never quietly become someone's real
 * collection, and removing it takes one tap. */
function StarterCard({ onImport }: { onImport: () => void }) {
  const box = getBox();
  const owned = Object.keys(box);
  const isSample = owned.length === SAMPLE_BOX.length
    && SAMPLE_BOX.every((n) => box[n]);

  if (isSample) {
    return (
      <Card style={{ marginBottom: 10, borderColor: T.accent }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Icon name="flask-outline" size={15} color={T.accentInk} />
          <Text style={[s.h3, { color: T.accentInk }]}>You're trying the sample box</Text>
        </View>
        <Text style={[s.body, { marginTop: 4 }]}>
          These {SAMPLE_BOX.length} pals are an example, not your save. Tick your
          own pals over them whenever you like — or take the sample back out and
          start clean.
        </Text>
        <View style={[s.wrap, { marginTop: 10 }]}>
          <Btn small label="Import my real list…" onPress={onImport} />
          <Btn small label={`Remove the ${SAMPLE_BOX.length} sample pals`}
            onPress={() => {
              for (const n of SAMPLE_BOX) {
                setOwnedGender(n, 'm', false);
                setOwnedGender(n, 'f', false);
              }
            }} />
        </View>
      </Card>
    );
  }

  if (owned.length > 0) return null;

  return (
    <Card style={{ marginBottom: 10 }}>
      <Text style={s.h3}>Nothing ticked yet</Text>
      <Text style={[s.body, { marginTop: 4 }]}>
        Tick the pals you actually have and every other screen starts working
        from your save — what you can breed, what it costs, what to catch next.
      </Text>
      <View style={[s.wrap, { marginTop: 10 }]}>
        <Btn primary small label="Try a sample box"
          onPress={() => {
            importNames(
              SAMPLE_BOX.map((n) => [n, { m: true, f: true }] as [string, OwnedGenders]),
              false,
            );
          }} />
        <Btn small label="Import my list…" onPress={onImport} />
      </View>
      <Text style={{ color: T.faint, fontSize: 11.5, marginTop: 8 }}>
        The sample is {SAMPLE_BOX.length} pals you'd have in your first hour —
        clearly labelled, and one tap to remove.
      </Text>
    </Card>
  );
}

const Row = memo(function Row({ name, onOpen, focus }: {
  name: string; onOpen: (n: string) => void; focus?: string | null;
}) {
  const p = pals[name];
  const owned = ownedAny(name);
  // VANILLA rows (CEO 2026-08-15 evening: rarity colour experiments parked —
  // "remove the palettes, keep it like before, I'll get to it later").
  // Only the original thin edge tint remains.
  return (
    <Pressable
      onPress={() => onOpen(name)}
      // the row opened a pal card but never said it was pressable, and
      // "you own this" lived only in the row's opacity (self-found while
      // measuring the job chips, 2026-08-16)
      accessibilityRole="button"
      accessibilityLabel={`${name}. ${owned ? 'in your Paldex' : 'not in your Paldex yet'}`}
      style={({ pressed }) => [{
        flexDirection: 'row', alignItems: 'center', gap: 8,
        backgroundColor: T.surface, borderColor: T.line, borderWidth: 1,
        borderLeftWidth: 3, borderLeftColor: rarityTint(p?.rarity, T.line),
        borderRadius: 12, padding: 8, marginBottom: 6, opacity: owned ? 1 : 0.65,
      }, pressed && { borderColor: T.accent }]}
    >
      <PalIcon name={name} size={40} />
      <View style={{ flex: 1 }}>
        <Text style={{ color: T.ink, fontWeight: '800', fontSize: 14 }}>
          {name} <Text style={{ color: T.faint, fontSize: 10.5 }}>#{p.number || '—'}</Text>
        </Text>
        <View style={[s.wrap, { marginTop: 2 }]}>
          <ElementChips name={name} />
          {/* was ONE job unless you had filtered — you could not tell a
              Mining-3 pal from one that is Mining 3 AND Lumbering 2. Three,
              matching the pal picker (CEO 2026-08-16). */}
          <WorkChips name={name} top={3} focus={focus} />
        </View>
      </View>
      <GenderToggles name={name} size={28} />
    </Pressable>
  );
});

/* ---------------- import sheet (from the old Box tab) ----------------
 * The parser (and the share writer it must never drift from) live in
 * ../boxShare.ts — importable, so the round trip is really tested. */

function ImportSheet({ onClose }: { onClose: () => void }) {
  const [text, setText] = useState('');
  const parsed = useMemo(() => parseImport(text, Object.keys(pals)), [text]);
  return (
    <Modal visible animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: T.bg2, padding: 18 }}>
        <View style={[s.row, { marginBottom: 8 }]}>
          <Text style={[s.h2, { flex: 1 }]}>Import a pal list</Text>
          <Btn label="Close" onPress={onClose} small />
        </View>
        <Text style={s.body}>
          Paste names, one per line (optional ♂/♀ suffix), or a JSON backup
          from the website. Nothing is applied until
          you confirm.
        </Text>
        <TextInput
          // the only thing a screen reader had here was the placeholder,
          // which is example pal names rather than what the box is for
          accessibilityLabel="Paste pal names, one per line"
          multiline value={text} onChangeText={setText}
          placeholder={'Anubis\nKatress ♀\nWixen ♂'}
          placeholderTextColor={T.faint}
          autoCorrect={false} autoCapitalize="none"
          style={[s.search, { marginTop: 10, height: 170, textAlignVertical: 'top' }]}
        />
        <View style={[s.wrap, { marginTop: 10 }]}>
          <Badge kind={parsed.entries.length ? 'ok' : 'plain'}>
            {parsed.entries.length} recognised
          </Badge>
          {parsed.unknown.length > 0 && (
            <Badge kind="warn">{parsed.unknown.length} not recognised</Badge>
          )}
        </View>
        <View style={{ marginTop: 12 }}>
          <Btn primary disabled={!parsed.entries.length}
            // said "Add 1 pals" on a single name, and "Add  pals" on none
            // "Add 0 pals" is what a template string says, not what a person
            // says. With nothing pasted the button is disabled anyway, so it
            // may as well tell you what to do instead of counting nothing.
            label={parsed.entries.length === 0
              ? 'Paste a list first'
              : parsed.entries.length === 1
                ? 'Add 1 pal'
                : `Add ${parsed.entries.length} pals`}
            onPress={() => {
              importNames(parsed.entries, false);
              onClose();
            }} />
        </View>
      </View>
    </Modal>
  );
}

/* ---------------- sorting + filtering ---------------- */

export function PaldexScreen() {
  useAppVersion();
  const [q, setQ] = useState('');
  const [filters, setFilters] = useState<Filters>(NO_FILTERS);
  const [sort, setSort] = useState<SortKey>('number');
  const [open, setOpen] = useState<string | null>(null);
  const [sheet, setSheet] = useState<'none' | 'import' | 'clear' | 'filter'>('none');

  // arriving with a pal in the intent payload opens that pal's card — the
  // Paldex half of "come back to the card you were reading" from anywhere
  // that can only send an intent (e.g. the full map's way back)
  useEffect(() => {
    const apply = () => {
      const p = takeIntentPayload('paldex');
      if (p?.pal) setOpen(p.pal);
    };
    apply(); // payload waiting from before this screen mounted
    return onNavIntent(apply); // ...or arriving while it's already open
  }, []);
  // bulk un-own arms once before it fires, so a stray tap cannot wipe a
  // filtered slice of the collection
  const [armUnown, setArmUnown] = useState(false);

  const box = getBox();
  const ownedNames = Object.keys(box);
  const reachable = useMemo(
    () => (ownedNames.length ? closure(engine, ownedNames).size : 0),
    [box],
  );

  const names = useMemo(() => {
    let list = Object.keys(pals);
    if (q) list = list.filter((n) => n.toLowerCase().includes(q.toLowerCase()));
    list = applyFilters(list, filters);
    return sortedPals(list, sort);
  }, [q, filters, sort, box]);

  // the job the list is currently about — highlighted on every row so a
  // filtered list is visibly still that filter as you scroll
  const focusJob = filters.work ?? (sort.startsWith('work:') ? sort.slice(5) : null);
  const toCheck = unsureCount();

  const OWN_LABELS: Record<Filters['own'], string> = {
    all: 'All', owned: 'Owned', missing: 'Missing',
    pairready: 'Have ♂+♀', onegender: 'One gender',
    unsure: 'Gender to check',
  };
  const activeBits: string[] = [];
  if (filters.own !== 'all') activeBits.push(OWN_LABELS[filters.own]);
  if (filters.elements.length) activeBits.push(filters.elements.join('/'));
  if (filters.work) activeBits.push(`${workLabel(filters.work)} pals`);
  if (sort !== 'number' && !(filters.work && sort === `work:${filters.work}`)) {
    const sortNames: Record<string, string> = {
      name: 'A–Z', rarity_desc: 'Rarest first', rarity_asc: 'Common first',
      hp: 'by Health', atk: 'by Attack', def: 'by Defense',
    };
    activeBits.push(sort.startsWith('work:')
      ? `best ${workLabel(sort.slice(5))} first` : sortNames[sort] ?? sort);
  }

  return (
    <View style={{ flex: 1, paddingHorizontal: 16, paddingTop: 10 }}>
      {/* compact header: one stat line, everything else in sheets */}
      <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 10, marginBottom: 8 }}>
        <Text style={s.h1}>Paldex</Text>
        <Text style={{ color: T.muted, fontSize: 12.5, fontWeight: '700', flex: 1 }}>
          {ownedNames.length} owned · {reachable}/{Object.keys(pals).length} reachable
        </Text>
      </View>
      {/* Its OWN row, below the title. The first version sat inside the title
          row, where its long label out-muscled the flex-1 stats text on a real
          phone — "131 owned" wrapped one character per line and the header ate
          half the screen (CEO screenshot, 2026-08-17 18:13). One tap filters
          the list to the pals whose gender is still a question. */}
      {toCheck > 0 && (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Show the ${toCheck} pal${toCheck === 1 ? '' : 's'} whose gender you have not checked`}
          onPress={() => setFilters({ ...filters, own: 'unsure' })}
          style={{ alignSelf: 'flex-start', marginTop: -4, marginBottom: 8 }}>
          <Text style={{ color: T.goldInk, fontSize: 12, fontWeight: '800' }} numberOfLines={1}>
            {toCheck === 1
              ? '1 pal to check the gender of — show it'
              : `${toCheck} pals to check the gender of — show them`}
          </Text>
        </Pressable>
      )}
      {/* the Paldex has its own compact header rather than PageHead, so the
          data stamp is placed by hand — every screen that prints datamined
          numbers carries it */}
      <View style={{ marginBottom: 8 }}><DataStamp /></View>
      <View style={{ flexDirection: 'row', gap: 8, marginBottom: 8 }}>
        <View style={{ flex: 1 }}>
          <SearchInput value={q} onChange={setQ} placeholder="Search pals…" />
        </View>
        <Btn small label={activeBits.length ? `Filters · ${activeBits.length}` : 'Filters'}
          primary={activeBits.length > 0}
          onPress={() => setSheet('filter')} />
      </View>
      {activeBits.length > 0 && (
        <View style={[s.wrap, { marginBottom: 8 }]}>
          <Text style={{ color: T.accentInk, fontSize: 11.5, fontWeight: '700' }}>
            {activeBits.join(' · ')}
          </Text>
          <Pressable
            onPress={() => { setFilters(NO_FILTERS); setSort('number'); }}
            accessibilityRole="button"
            accessibilityLabel="Clear all filters and sorting">
            <Text style={{ color: T.faint, fontSize: 11.5, fontWeight: '800' }}> ✕ clear</Text>
          </Pressable>
        </View>
      )}
      <FlatList
        keyboardShouldPersistTaps="handled"
        // the keyboard used to sit on top of the results the moment you
        // scrolled to read them (CEO 2026-08-15)
        keyboardDismissMode="on-drag"
        data={names}
        keyExtractor={(n) => n}
        initialNumToRender={12}
        windowSize={7}
        renderItem={({ item }) => <Row name={item} onOpen={setOpen} focus={focusJob} />}
        // sits above the list rather than in the footer: a new player should
        // not have to scroll 299 rows to be told what ticking is for
        ListHeaderComponent={<StarterCard onImport={() => setSheet('import')} />}
        // this said "Nothing matches those filters." even when no filter was
        // set and the search alone had emptied the list — the message named
        // a cause the player could not act on (self-found on a code read)
        ListEmptyComponent={
          <Text style={[s.body, { textAlign: 'center', marginTop: 30 }]}>
            {q && activeBits.length ? `Nothing matches “${q}” with those filters.`
              : q ? `No pal matches “${q}”.`
              : 'Nothing matches those filters.'}
          </Text>
        }
        ListFooterComponent={
          <View style={[s.wrap, { justifyContent: 'center', paddingVertical: 14 }]}>
            {/* THE WEBSITE HAS HAD BULK OWN/UN-OWN SINCE LAUNCH AND THE PHONE
                NEVER DID — and the phone is where it matters, because ticking
                a filtered list one pal at a time is two taps each. Filter to
                "Fire pals" or "Missing" and you can take the whole list in
                one press.

                It only appears when a filter or a search is actually
                narrowing things, so "all shown" always means something
                smaller than the whole dex — otherwise the button would be a
                trap that owns all 299. The un-own arms first and then names
                the exact number, the same two-step the website uses. */}
            {/* Searching one pal by name is the commonest way to reach these
                buttons, and at one result they read "Own all 1 shown" and
                "Really un-own 1?" — "all" of a single thing, and a DESTRUCTIVE
                confirm that counts instead of naming what disappears. At one,
                say which pal. That is the CEO's own rule from the goal tray:
                name the thing, so the label is the whole answer. */}
            {(activeBits.length > 0 || !!q) && names.length > 0 && (() => {
              const ownedShown = names.filter((n) => ownedAny(n));
              const shownOwned = ownedShown.length;
              return (
                <>
                  {shownOwned < names.length && (
                    <Btn small
                      label={names.length === 1
                        ? `Own ${names[0]}`
                        : `Own all ${names.length} shown`}
                      onPress={() => {
                        for (const n of names) {
                          setOwnedGender(n, 'm', true);
                          setOwnedGender(n, 'f', true);
                        }
                        setArmUnown(false);
                      }} />
                  )}
                  {shownOwned > 0 && (
                    <Btn small danger
                      label={shownOwned === 1
                        ? (armUnown
                          ? `Really un-own ${ownedShown[0]}?`
                          : `Un-own ${ownedShown[0]}`)
                        : (armUnown
                          ? `Really un-own ${shownOwned}?`
                          : `Un-own ${shownOwned} shown`)}
                      onPress={() => {
                        if (!armUnown) { setArmUnown(true); return; }
                        for (const n of names) {
                          setOwnedGender(n, 'm', false);
                          setOwnedGender(n, 'f', false);
                        }
                        setArmUnown(false);
                      }} />
                  )}
                </>
              );
            })()}
            <Btn small label="Import list…" onPress={() => setSheet('import')} />
            <Btn small disabled={!ownedNames.length} label="Share my list…"
              onPress={() => {
                // gender-suffixed lines — the exact format Import understands,
                // so a collection moves between installs in two taps
                const text = ownedNames.sort()
                  .map((n) => exportLine(n, box[n])).join('\n');
                void Share.share({ message: text });
              }} />
            <Btn small danger disabled={!ownedNames.length} label="Clear collection…"
              onPress={() => setSheet('clear')} />
          </View>
        }
      />
      {open && <PalDetail name={open} onClose={() => setOpen(null)} />}
      {sheet === 'filter' && (
        <FilterSheet filters={filters} sort={sort}
          onApply={(f, sk) => { setFilters(f); setSort(sk); setSheet('none'); }}
          onClose={() => setSheet('none')} />
      )}
      {sheet === 'import' && <ImportSheet onClose={() => setSheet('none')} />}
      {sheet === 'clear' && (
        <Modal visible transparent animationType="fade" onRequestClose={() => setSheet('none')}>
          <View style={{
            flex: 1, backgroundColor: 'rgba(0,0,0,0.55)',
            alignItems: 'center', justifyContent: 'center', padding: 24,
          }}>
            <Card style={{ borderColor: T.bad, width: '100%' }}>
              <Text style={s.h2}>Clear the whole collection?</Text>
              <Text style={[s.body, { marginTop: 6 }]}>
                {ownedNames.length === 1
                  ? 'Removes the one species you have on this device.'
                  : `Removes all ${ownedNames.length} species on this device.`}
                {' '}Plan check-offs are kept.
              </Text>
              <View style={[s.wrap, { marginTop: 14 }]}>
                <Btn danger label={`Yes, clear ${ownedNames.length}`}
                  onPress={() => { clearBox(); setSheet('none'); }} />
                <Btn label="Keep my collection" onPress={() => setSheet('none')} />
              </View>
            </Card>
          </View>
        </Modal>
      )}
    </View>
  );
}
