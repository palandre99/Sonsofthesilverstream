/** The pal info card — stats, work, partner skill, every breeding recipe.
 * Shared: opened from the Paldex grid AND from any pal icon in the Plan. */
import React from 'react';
import { Modal, ScrollView, Text, View } from 'react-native';
import { T } from '../theme';
import { Badge, Btn, Card, ElementChips, GenderToggles, PalIcon, s } from './kit';
import { Image } from 'react-native';
import {
  breeding, engine, pals, selfOnly, useAppVersion, workLabel,
} from '../store';
import { WORK_ICONS } from '../data/workIcons';
import { PalMap } from './PalMap';
import { ALPHA_SPOTS } from '../data/alphaSpots.g';

function StatBar({ label, v }: { label: string; v: number | null }) {
  return (
    <View style={[s.row, { gap: 8 }]}>
      <Text style={{ color: T.muted, width: 34, fontSize: 11, fontWeight: '800' }}>{label}</Text>
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
  const p = pals[name];
  if (!p) return null;
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

        <Card style={{ marginTop: 14, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <Text style={{ color: T.ink, fontWeight: '700', flex: 1 }}>In my box</Text>
          <GenderToggles name={name} />
        </Card>

        <Card style={{ marginTop: 10, gap: 6 }}>
          <Text style={s.h3}>Stats</Text>
          <StatBar label="HP" v={p.hp} />
          <StatBar label="ATK" v={p.atk} />
          <StatBar label="DEF" v={p.def} />
        </Card>

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
                  Generic pool · rank {engine.ranks.get(name)} — any pair whose rank target
                  lands on {engine.ranks.get(name)}. Use the Calculator's Child → parents.
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
            {p.wild
              ? p.regions.map((r) => <Badge key={r} kind="plain">{r}</Badge>)
              : !ALPHA_SPOTS[name]
                ? <Badge kind="plain">no regular wild spawn — breed it</Badge>
                : null}
            {p.egg_types.map((e) => <Badge key={e} kind="plain">🥚 {e}</Badge>)}
          </View>
        </Card>
      </ScrollView>
    </Modal>
  );
}

