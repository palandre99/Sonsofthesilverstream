/** The pal info card — stats, work, partner skill, every breeding recipe.
 * Shared: opened from the Paldex grid AND from any pal icon in the Plan. */
import React, { useEffect, useState } from 'react';
import { Modal, Pressable, ScrollView, Text, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { T } from '../theme';
import { Badge, Btn, Card, ElementChips, GenderToggles, PalIcon, s } from './kit';
import { Image } from 'react-native';
import {
  breeding, engine, pals, selfOnly, useAppVersion, workLabel,
} from '../store';
import { WORK_ICONS } from '../data/workIcons';
import { PalMap } from './PalMap';
import { STAT_ICONS } from '../data/statIcons';
import { rarityTint } from '../data/rarity';
import { ABOUT } from '../data/about';
import { Icon } from './Icon';
import { ALPHA_SPOTS } from '../data/alphaSpots.g';

function StatBar({ label, icon, v }: { label: string; icon?: number; v: number | null }) {
  return (
    <View style={[s.row, { gap: 8 }]}>
      {icon != null && <Image source={icon} style={{ width: 18, height: 18 }} />}
      <Text style={{ color: T.muted, width: 56, fontSize: 11, fontWeight: '800' }}>{label}</Text>
      <View style={{ flex: 1, height: 8, borderRadius: 4, backgroundColor: T.surface2 }}>
        <View style={{
          width: `${Math.min(100, ((v ?? 0) / 150) * 100)}%`,
          height: '100%', borderRadius: 4, backgroundColor: T.accent,
        }} />
      </View>
      <Text style={{ color: T.ink, width: 32, fontSize: 12, textAlign: 'right' }}>{v ?? '—'}</Text>
    </View>
  );
}

export function PalDetail({ name, onClose }: { name: string; onClose: () => void }) {
  useAppVersion();
  // condensation preview: +5% HP/ATK/DEF per star, partner skill level 1-5,
  // every existing work suitability +1 at 4 stars (1.0, wiki-verified)
  const [stars, setStars] = useState(0);
  const [aboutOpen, setAboutOpen] = useState(false);
  useEffect(() => {
    setStars(0);
    setAboutOpen(false);
  }, [name]);
  const p = pals[name];
  if (!p) return null;
  const boost = (v: number | null) => (v == null ? v : Math.round(v * (1 + 0.05 * stars)));
  const asChild = breeding.unique_combos.filter((c) => c.child === name);
  const asParent = breeding.unique_combos.filter((c) => c.parents.includes(name));
  const gendered = breeding.gendered_combos.filter(
    (g) => g.child === name || g.mother === name || g.father === name,
  );
  const inPool = !breeding.excluded_from_generic_pool.includes(name);

  return (
    <Modal visible animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <ScrollView style={{ flex: 1, backgroundColor: T.bg2 }}
        contentContainerStyle={{ padding: 18, paddingBottom: 50 }}>
        <View style={[s.row, { gap: 14 }]}>
          <PalIcon name={name} size={72} />
          <View style={{ flex: 1 }}>
            <Text style={s.h1}>{name}</Text>
            <View style={[s.wrap, { marginTop: 5 }]}>
              <Badge kind="plain">#{p.number || '—'}</Badge>
              <ElementChips name={name} />
              {p.nocturnal ? <Badge kind="plain">nocturnal</Badge> : null}
            </View>
          </View>
          <Btn label="✕" onPress={onClose} small />
        </View>

        {ABOUT[name] && (
          <Pressable onPress={() => setAboutOpen(!aboutOpen)} style={({ pressed }) => [{
            marginTop: 14, backgroundColor: T.surface, borderWidth: 1,
            borderColor: pressed ? T.accent : T.line, borderRadius: 14,
            padding: 12, gap: 4,
          }]}>
            <View style={[s.row, { gap: 6 }]}>
              <Icon name="book-open-variant" size={14} color={T.accentInk} />
              <Text style={{
                color: T.faint, fontSize: 10, fontWeight: '800', letterSpacing: 1.2,
              }}>ABOUT {name.toUpperCase()}</Text>
            </View>
            <Text style={[s.body, { fontStyle: 'italic' }]}
              numberOfLines={aboutOpen ? undefined : 2}>
              {ABOUT[name]}
            </Text>
            {!aboutOpen && (
              <Text style={{ color: T.accentInk, fontSize: 11, fontWeight: '700' }}>
                tap to read more
              </Text>
            )}
          </Pressable>
        )}

        <Card style={{ marginTop: 10, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <Text style={{ color: T.ink, fontWeight: '700', flex: 1 }}>In my box</Text>
          <GenderToggles name={name} />
        </Card>

        <Card style={{ marginTop: 10, gap: 7 }}>
          <View style={[s.row, { gap: 8 }]}>
            <Text style={[s.h3, { flex: 1 }]}>Base stats</Text>
            <View style={{ flexDirection: 'row', gap: 3, alignItems: 'center' }}>
              {[1, 2, 3, 4].map((n) => (
                <Pressable key={n} hitSlop={6}
                  onPress={() => {
                    void Haptics.selectionAsync();
                    setStars(stars === n ? 0 : n);
                  }}
                  accessibilityLabel={`${n} star${n === 1 ? '' : 's'} condensed`}>
                  <Icon name={stars >= n ? 'star' : 'star-outline'} size={20}
                    color={stars >= n ? T.gold : T.faint} />
                </Pressable>
              ))}
              {stars > 0 && (
                <Text style={{ color: T.goldInk, fontSize: 11, fontWeight: '800' }}>
                  {' '}+{stars * 5}%
                </Text>
              )}
            </View>
          </View>
          <StatBar label="Health" icon={STAT_ICONS.health} v={boost(p.hp)} />
          <StatBar label="Attack" icon={STAT_ICONS.attack} v={boost(p.atk)} />
          <StatBar label="Defense" icon={STAT_ICONS.defense} v={boost(p.def)} />
          {stars > 0 && (
            <Text style={[s.body, { fontSize: 11.5, color: T.goldInk }]}>
              Condensed {stars}★: stats +{stars * 5}% · partner skill level {stars + 1} of 5
              {stars === 4 ? ' · every work suitability below +1' : ''}
            </Text>
          )}
          {p.food != null && (
            <View style={[s.row, { gap: 8, marginTop: 2 }]}>
              <Image source={STAT_ICONS.food_on} style={{ width: 18, height: 18 }} />
              <Text style={{ color: T.muted, width: 56, fontSize: 11, fontWeight: '800' }}>Food</Text>
              <View style={{ flexDirection: 'row', gap: 2 }}>
                {Array.from({ length: 10 }, (_, i) => (
                  <Image
                    key={i}
                    source={i < (p.food ?? 0) ? STAT_ICONS.food_on : STAT_ICONS.food_off}
                    style={{ width: 15, height: 15, opacity: i < (p.food ?? 0) ? 1 : 0.45 }}
                  />
                ))}
              </View>
            </View>
          )}
          <View style={[s.wrap, { marginTop: 4 }]}>
            {p.size && <Badge kind="plain">size {p.size}</Badge>}
            {p.rarity && (
              <View style={{
                borderWidth: 1.5,
                borderColor: rarityTint(p.rarity, T.line),
                borderRadius: 7, paddingHorizontal: 7, paddingVertical: 2,
              }}>
                <Text style={{
                  color: rarityTint(p.rarity, T.muted), fontSize: 10.5,
                  fontWeight: '800', letterSpacing: 0.6, textTransform: 'uppercase',
                }}>{p.rarity}</Text>
              </View>
            )}
            {p.craft_speed != null && <Badge kind="plain">work speed {p.craft_speed}</Badge>}
            {p.max_wild_level != null && <Badge kind="plain">wild up to Lv {p.max_wild_level}</Badge>}
          </View>
        </Card>

        {(p.drops?.length > 0 || (p.ranch_produce?.length ?? 0) > 0) && (
          <Card style={{ marginTop: 10 }}>
            <Text style={s.h3}>Drops</Text>
            <View style={[s.wrap, { marginTop: 8 }]}>
              {p.drops.map((d) => <Badge key={d} kind="plain">{d}</Badge>)}
              {(p.ranch_produce ?? []).map((r) => (
                <Badge key={`r-${r}`} kind="ok">Ranch: {r}</Badge>
              ))}
            </View>
          </Card>
        )}

        {Object.keys(p.work ?? {}).length > 0 && (
          <Card style={{ marginTop: 10 }}>
            <Text style={s.h3}>Work suitability</Text>
            <View style={[s.wrap, { marginTop: 8 }]}>
              {Object.entries(p.work).sort((x, y) => y[1] - x[1]).map(([job, lvl]) => (
                <View key={job} style={[s.chip, {
                  backgroundColor: T.surface2, flexDirection: 'row',
                  alignItems: 'center', gap: 5, paddingHorizontal: 8, paddingVertical: 3,
                }]}>
                  {WORK_ICONS[job] && (
                    <Image source={WORK_ICONS[job]} style={{ width: 20, height: 20 }} />
                  )}
                  <Text style={[s.chipText, { color: T.ink }]}>
                    {workLabel(job)} <Text style={{ color: T.accentInk }}>{lvl}</Text>
                  </Text>
                </View>
              ))}
            </View>
          </Card>
        )}

        {p.partner_skill && (
          <Card style={{ marginTop: 10 }}>
            <Text style={s.h3}>Partner skill — {p.partner_skill}</Text>
            <Text style={[s.body, { marginTop: 4 }]}>{p.partner_effect}</Text>
          </Card>
        )}

        <Card style={{ marginTop: 10, gap: 8 }}>
          <Text style={s.h3}>How to breed it</Text>
          {selfOnly.has(name) ? (
            <View style={[s.wrap]}>
              <Badge kind="bad">self-breed-only</Badge>
              <Text style={s.body}>{name} + {name} = {name}</Text>
            </View>
          ) : (
            <>
              {asChild.map((c) => (
                <View key={c.parents.join()} style={[s.row, { gap: 6, flexWrap: 'wrap' }]}>
                  <Badge kind="unique">unique</Badge>
                  <PalIcon name={c.parents[0]} size={24} />
                  <Text style={s.body}>{c.parents[0]} +</Text>
                  <PalIcon name={c.parents[1]} size={24} />
                  <Text style={s.body}>{c.parents[1]} = {name}</Text>
                </View>
              ))}
              {gendered.filter((g) => g.child === name).map((g) => (
                <View key={g.mother} style={[s.row, { gap: 6, flexWrap: 'wrap' }]}>
                  <Badge kind="warn">♀♂</Badge>
                  <PalIcon name={g.mother} size={24} gender="f" />
                  <Text style={s.body}>{g.mother} +</Text>
                  <PalIcon name={g.father} size={24} gender="m" />
                  <Text style={s.body}>{g.father} = {name}</Text>
                </View>
              ))}
              {inPool && (
                <Text style={s.body}>
                  No fixed recipe — many different parent pairs can breed this pal.
                  Open the Calculator and search it under Child → parents to see
                  every pair you can make right now.
                </Text>
              )}
            </>
          )}
        </Card>

        {(asParent.length > 0 || gendered.some((g) => g.child !== name)) && (
          <Card style={{ marginTop: 10, gap: 8 }}>
            <Text style={s.h3}>Special recipes as a parent</Text>
            {asParent.map((c) => {
              const other = c.parents[0] === name ? c.parents[1] : c.parents[0];
              return (
                <View key={c.child} style={[s.row, { gap: 6, flexWrap: 'wrap' }]}>
                  <Text style={s.body}>{name} +</Text>
                  <PalIcon name={other} size={24} />
                  <Text style={s.body}>{other} =</Text>
                  <PalIcon name={c.child} size={24} />
                  <Text style={s.body}>{c.child}</Text>
                </View>
              );
            })}
            {gendered.filter((g) => g.child !== name).map((g) => (
              <View key={g.child} style={[s.row, { gap: 6, flexWrap: 'wrap' }]}>
                <Badge kind="warn">♀♂</Badge>
                <PalIcon name={g.mother} size={24} gender="f" />
                <Text style={s.body}>{g.mother} +</Text>
                <PalIcon name={g.father} size={24} gender="m" />
                <Text style={s.body}>{g.father} = {g.child}</Text>
              </View>
            ))}
          </Card>
        )}

        <Card style={{ marginTop: 10, gap: 8 }}>
          <Text style={s.h3}>Where to find it</Text>
          <PalMap name={name} />
          <View style={[s.wrap]}>
            {/* the map + its Spawns line carry the regions now — chips here
                only for what the map can't say */}
            {!p.wild && !ALPHA_SPOTS[name] && (
              <Badge kind="plain">no regular wild spawn — breed it</Badge>
            )}
            {p.egg_types.map((e) => <Badge key={e} kind="plain">Egg: {e}</Badge>)}
          </View>
        </Card>
      </ScrollView>
    </Modal>
  );
}

