/** One search for everything — pals, items, and the app's own screens.
 *
 * The AAA bar's criterion 2 (04_PRODUCT_BLUEPRINT §5): "search from
 * anywhere in ≤1 tap, unified index". Design notes and the three
 * placements weighed are in 09_ITEMS_PLAN §6; the CEO handed the call
 * back ("u make decisions"), so this is option A — a search button in
 * the top bar of every screen, opening this overlay.
 *
 * Every hit routes through the NavIntent mailbox that already carries
 * pal and item payloads, so a result lands on the real card in the real
 * fane. Nothing here invents data: pals come from the engine's table,
 * items from the shipped backbone, screens from the nav registry.
 */
import React, { useMemo, useState } from 'react';
import { FlatList, Modal, Pressable, Text, View } from 'react-native';
import { T } from '../theme';
import { Btn, PalIcon, SearchInput, s } from './kit';
import { ItemIcon } from './ItemIcon';
import { Icon } from './Icon';
import { pals } from '../store';
import {
  collapseFamilies, familyOf, ITEM_STATS, ITEMS, kindWord, searchItems,
  sortItems, tierWord,
} from '../itemsData';
import { DOMAINS } from '../nav/domains';
import { navigateTo } from '../nav/intent';

interface Hit {
  kind: 'pal' | 'item' | 'screen';
  id: string;
  title: string;
  sub: string;
  domain: string;
  tab: string;
}

/** Screens a player might search for by name, from the live registry —
 * so a domain we haven't built yet can never become a dead result. */
const SCREEN_HITS: Hit[] = DOMAINS.flatMap((d) =>
  d.tabs
    .filter((t) => !t.soon && !d.soon)
    .map((t) => ({
      kind: 'screen' as const,
      id: `${d.id}/${t.id}`,
      title: t.label === d.title ? d.title : `${d.title} · ${t.label}`,
      sub: 'Screen',
      domain: d.id,
      tab: t.id,
    })));

/* How many rows to draw. A row measures 59px on a phone, so 50 items is
 * about four screens of scrolling — generous without being a list nobody
 * can read. "armor" genuinely matches 130 things and "a" matches 1,627;
 * the answer to those is a better query, not more scrolling, so the
 * header says the true total and the footer says so out loud (IL39). */
const PAL_CAP = 20;
const ITEM_CAP = 50;

interface Results {
  /** the rows actually drawn */
  hits: Hit[];
  /** how many things really match — NOT the number of rows (IL39) */
  total: number;
}

function hitsFor(q: string): Results {
  const needle = q.trim().toLowerCase();
  if (needle.length < 2) return { hits: [], total: 0 };
  const palAll = Object.keys(pals)
    .filter((n) => n.toLowerCase().includes(needle));
  const palHits: Hit[] = palAll
    .slice(0, PAL_CAP)
    .map((n) => ({
      kind: 'pal', id: n, title: n,
      sub: (pals[n].elements ?? []).join(' · ') || 'Pal',
      domain: 'breeding', tab: 'paldex',
    }));
  // One row per FAMILY, exactly as the item index does (IL38). 506 of
  // the 1,892 items share their name with a rarity tier of themselves,
  // so searching raw ids returned "Old Bow, Bow" five identical times —
  // and worse, those duplicates ate the 14-row budget and hid the other
  // bows completely. The tier a player wants is on the card either way.
  const itemAll = sortItems(collapseFamilies(searchItems(q)), 'power', true);
  const itemHits: Hit[] = itemAll
    .slice(0, ITEM_CAP)
    .map((id) => {
      const fam = familyOf(id);
      const top = fam[fam.length - 1];
      const topWord = ITEM_STATS[top]?.tier ?? tierWord(ITEMS[top].rarity);
      return {
        kind: 'item' as const, id, title: ITEMS[id].name,
        sub: fam.length > 1
          ? `${kindWord(id)} · ${fam.length} tiers up to ${topWord}`
          : kindWord(id),
        domain: 'items', tab: 'allitems',
      };
    });
  const screenHits = SCREEN_HITS.filter(
    (h) => h.title.toLowerCase().includes(needle));
  return {
    hits: [...palHits, ...itemHits, ...screenHits],
    total: palAll.length + itemAll.length + screenHits.length,
  };
}

export function SearchEverything({ onClose }: { onClose: () => void }) {
  const [q, setQ] = useState('');
  const { hits, total } = useMemo(() => hitsFor(q), [q]);
  const typing = q.trim().length >= 2;
  const hidden = total - hits.length;

  const go = (h: Hit) => {
    onClose();
    navigateTo({
      domain: h.domain,
      tab: h.tab,
      payload: h.kind === 'pal' ? { pal: h.id }
        : h.kind === 'item' ? { item: h.id } : undefined,
    });
  };

  return (
    <Modal visible animationType="slide" presentationStyle="pageSheet"
      onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: T.bg2, padding: 16 }}>
        <View style={[s.row, { gap: 10, marginBottom: 10 }]}>
          <View style={{ flex: 1 }}>
            <SearchInput value={q} onChange={setQ}
              placeholder="Search pals, items, screens…" />
          </View>
          <Btn small label="Close" onPress={onClose} />
        </View>
        {!typing ? (
          <Text style={[s.body, { color: T.faint, fontSize: 12.5 }]}>
            Type two letters to search every pal, every item and every
            screen at once.
          </Text>
        ) : hits.length === 0 ? (
          <Text style={[s.body, { fontSize: 12.5 }]}>
            Nothing matches “{q.trim()}”.
          </Text>
        ) : (
          <Text style={[s.body, { fontSize: 12.5, marginBottom: 6 }]}>
            {total === 1 ? '1 result' : `${total} results`}
            {hidden > 0 ? ` — showing the closest ${hits.length}` : ''}
          </Text>
        )}
        <FlatList
          data={hits}
          keyExtractor={(h) => `${h.kind}:${h.id}`}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          renderItem={({ item: h }) => (
            <Pressable
              onPress={() => go(h)}
              accessibilityRole="button"
              accessibilityLabel={`${h.title}, ${h.sub}. Open it`}
              style={({ pressed }) => ({
                flexDirection: 'row', alignItems: 'center', gap: 10,
                paddingVertical: 8, paddingHorizontal: 10, borderRadius: 12,
                backgroundColor: pressed ? T.surface2 : T.surface,
                borderWidth: 1, borderColor: T.line, marginBottom: 6,
              })}>
              {h.kind === 'pal' ? <PalIcon name={h.id} size={32} />
                : h.kind === 'item' ? <ItemIcon icon={ITEMS[h.id].icon} size={32} />
                : (
                  <View style={{
                    width: 32, height: 32, borderRadius: 8,
                    alignItems: 'center', justifyContent: 'center',
                    backgroundColor: T.surface2,
                  }}>
                    <Icon name="compass-outline" size={17} color={T.muted} />
                  </View>
                )}
              <View style={{ flex: 1 }}>
                <Text style={{ color: T.ink, fontWeight: '800', fontSize: 14 }}
                  numberOfLines={1}>{h.title}</Text>
                <Text style={{ color: T.muted, fontSize: 12 }} numberOfLines={1}>
                  {h.sub}
                </Text>
              </View>
            </Pressable>
          )}
          contentContainerStyle={{ paddingBottom: 30 }}
          ListFooterComponent={hidden > 0 ? (
            /* the end of the list is where a player decides they have
               seen everything — say plainly that they have not */
            <Text style={[s.body, {
              fontSize: 12, color: T.faint, paddingHorizontal: 10,
              paddingTop: 4,
            }]}>
              {hidden === 1
                ? '1 more match is not shown. Type a bit more to find it.'
                : `${hidden} more matches are not shown. Type a bit more to narrow it down.`}
            </Text>
          ) : null}
        />
      </View>
    </Modal>
  );
}
