/** Shared UI: pal icons, chips, badges, cards, search, pickers, toggles. */
import React, { memo, useEffect, useMemo, useRef, useState } from 'react';
import { Image, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { ELEMENT_COLORS, T } from '../theme';
import { PAL_ICONS } from '../data/icons.g';
import { WORK_ICONS } from '../data/workIcons';
import { ELEMENT_ICONS } from '../data/statIcons';
import {
  breeding, genderUnsure, hasGender, pals, setGenderUnsure, setOwnedGender, topWork,
  useAppVersion, workLabel,
} from '../store';
import { navigateTo } from '../nav/intent';
import { Icon } from './Icon';

/* ---------------- pal icon ---------------- */

export const PalIcon = memo(function PalIcon({ name, size = 44, gender, ring }: {
  name: string; size?: number; gender?: 'm' | 'f';
  /** rarity ring colour — the portrait circle wears the tier (CEO 2026-08-15) */
  ring?: string | null;
}) {
  const src = PAL_ICONS[name];
  const el = (pals[name]?.elements?.[0] ?? 'Neutral').toLowerCase();
  const colors = ELEMENT_COLORS[el] ?? ELEMENT_COLORS.neutral;
  const icon = src ? (
    <Image source={src} style={{
      width: size, height: size, borderRadius: size / 2,
      borderWidth: ring ? 2 : 1.5, borderColor: ring ?? T.line2,
      backgroundColor: T.surface2,
    }} />
  ) : (
    <View style={{
      width: size, height: size, borderRadius: size / 2, backgroundColor: colors.bg,
      borderWidth: 1.5, borderColor: T.line2, alignItems: 'center', justifyContent: 'center',
    }}>
      <Text style={{ color: colors.fg, fontWeight: '800', fontSize: size * 0.32 }}>
        {name.split(' ').slice(0, 2).map((w) => w[0]).join('').toUpperCase()}
      </Text>
    </View>
  );
  if (!gender) return icon;
  return (
    <View>
      {icon}
      <View style={{
        position: 'absolute', right: -4, bottom: -2, width: 18, height: 18,
        borderRadius: 9, backgroundColor: gender === 'f' ? T.female : T.male,
        borderWidth: 2, borderColor: T.surface, alignItems: 'center', justifyContent: 'center',
      }}>
        <Text style={{ color: '#fff', fontSize: 10, fontWeight: '800', lineHeight: 13 }}>
          {gender === 'f' ? '♀' : '♂'}
        </Text>
      </View>
    </View>
  );
});

/* ---------------- chips + badges ---------------- */

export function ElementChips({ name }: { name: string }) {
  return (
    <>
      {(pals[name]?.elements ?? []).map((e) => {
        const c = ELEMENT_COLORS[e.toLowerCase()] ?? ELEMENT_COLORS.neutral;
        return (
          <View key={e} style={[s.chip, {
            backgroundColor: c.bg, flexDirection: 'row',
            alignItems: 'center', gap: 4, paddingHorizontal: 7,
          }]}>
            {ELEMENT_ICONS[e] && (
              <Image source={ELEMENT_ICONS[e]} style={{ width: 14, height: 14 }} />
            )}
            <Text style={[s.chipText, { color: c.fg }]}>{e}</Text>
          </View>
        );
      })}
    </>
  );
}

export function WorkChips({ name, top = 2, all = false, focus }: {
  name: string; top?: number; all?: boolean;
  /** the job the list is filtered/sorted by — always shown, and shown first,
   * so a Kindling-filtered list visibly stays a Kindling list (CEO 2026-08-15:
   * rows showed only the pal's best job, which read as a broken filter). */
  focus?: string | null;
}) {
  const p = pals[name];
  if (!p) return null;
  let jobs = all
    ? (Object.entries(p.work ?? {}).sort((a, b) => b[1] - a[1]) as [string, number][])
    : topWork(p, top);
  if (focus && !all) {
    const lvl = (p.work ?? {})[focus];
    if (lvl != null) {
      const rest = jobs.filter(([j]) => j !== focus);
      jobs = ([[focus, lvl], ...rest] as [string, number][]).slice(0, Math.max(1, top));
    }
  }
  // 75 of the 299 pals do more jobs than a compact row can show (Beegarde does
  // seven). Showing three and stopping read as the whole answer, the same way
  // the catch hints did — so the row now says how many it left out.
  const hidden = Object.keys(p.work ?? {}).length - jobs.length;
  return (
    <>
      {jobs.map(([job, lvl]) => {
        const on = focus === job;
        return (
          <View key={job}
            accessible accessibilityLabel={`${workLabel(job)} ${lvl}`}
            style={[s.chip, {
              backgroundColor: on ? T.accentSoft : T.surface2,
              borderWidth: on ? 1 : 0, borderColor: on ? T.accent : 'transparent',
              flexDirection: 'row',
              alignItems: 'center', gap: 5, paddingHorizontal: 8, paddingVertical: 4,
            }]}>
            {WORK_ICONS[job] ? (
              <Image source={WORK_ICONS[job]} style={{ width: 20, height: 20 }} />
            ) : (
              <Text style={[s.chipText, { color: T.ink }]}>{workLabel(job)}</Text>
            )}
            <Text style={[s.chipText, { color: T.accentInk }]}>{lvl}</Text>
          </View>
        );
      })}
      {!all && hidden > 0 && (
        <View accessible accessibilityLabel={`and ${hidden} more job${hidden === 1 ? '' : 's'}`}
          style={[s.chip, {
            backgroundColor: T.surface2, paddingHorizontal: 8, paddingVertical: 4,
          }]}>
          <Text style={[s.chipText, { color: T.faint }]}>+{hidden}</Text>
        </View>
      )}
    </>
  );
}

export type BadgeKind = 'ok' | 'warn' | 'bad' | 'gold' | 'plain' | 'unique';

const BADGE: Record<BadgeKind, { bg: string; fg: string }> = {
  ok: { bg: T.okSoft, fg: T.ok },
  warn: { bg: T.warnSoft, fg: T.warn },
  bad: { bg: T.badSoft, fg: T.bad },
  gold: { bg: T.goldSoft, fg: T.goldInk },
  plain: { bg: T.surface2, fg: T.muted },
  unique: { bg: '#20264A', fg: '#A6B0F0' },
};

export function Badge({ kind, children }: { kind: BadgeKind; children: React.ReactNode }) {
  const c = BADGE[kind];
  return (
    <View style={[s.badge, { backgroundColor: c.bg }]}>
      <Text style={[s.badgeText, { color: c.fg }]}>{children}</Text>
    </View>
  );
}

/* ---------------- layout primitives ---------------- */

export function Card({ children, style, accessibilityLabel }: {
  children: React.ReactNode; style?: object;
  /** Give a card a name when it reads as ONE thing (a parent pair, a step)
   *  rather than a container — otherwise its contents are announced as
   *  loose fragments. */
  accessibilityLabel?: string;
}) {
  return (
    <View
      style={[s.card, style]}
      accessible={accessibilityLabel ? true : undefined}
      accessibilityLabel={accessibilityLabel}
    >{children}</View>
  );
}

/** Which game build these numbers came from, and when they were read out of
 * it. Both fields are datamined and both were sitting in `breeding_1_0.json`
 * rendered by nothing on the phone.
 *
 * The blueprint's first quality criterion asks for the data stamp AND the
 * proof to be one tap from any data screen; until now the proof line lived
 * only on the Calculator and the build stamp only on About, so three of the
 * four data screens claimed numbers with no visible provenance at all. */
export function DataStamp({ beforeNavigate }: {
  /** the pal card is a MODAL — navigating to Reference underneath it would
   * leave the card sitting on top of the answer. Screens pass nothing; the
   * card passes its own close. */
  beforeNavigate?: () => void;
} = {}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Palworld ${breeding.game_version} data, read from the game files on ${
        stampDate(breeding.extracted)}. Tap to see where every number comes from.`}
      hitSlop={8}
      onPress={() => {
        void Haptics.selectionAsync();
        beforeNavigate?.();
        navigateTo({ domain: 'breeding', tab: 'ref' });
      }}
      style={({ pressed }) => [{
        flexDirection: 'row', alignItems: 'center', gap: 5,
        alignSelf: 'flex-start', marginTop: 4, paddingVertical: 3,
        opacity: pressed ? 0.6 : 1,
      }]}>
      <Icon name="shield-check-outline" size={12} color={T.faint} />
      <Text style={{ color: T.faint, fontSize: 10.5, fontWeight: '700' }}>
        Palworld {breeding.game_version} · read from the game files{' '}
        {stampDate(breeding.extracted)} · where these come from
      </Text>
    </Pressable>
  );
}

/** "2026-08-14" → "14 Aug 2026", because nobody reads a date backwards */
function stampDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return `${d.getDate()} ${d.toLocaleString(undefined, { month: 'short' })} ${d.getFullYear()}`;
}

export function PageHead({ title, sub, stamp }: {
  title: string; sub?: string;
  /** show the data-version stamp under the subtitle (data screens only) */
  stamp?: boolean;
}) {
  return (
    <View style={{ marginBottom: 14 }}>
      <Text style={s.h1}>{title}</Text>
      {sub ? <Text style={s.pageSub}>{sub}</Text> : null}
      {stamp ? <DataStamp /> : null}
    </View>
  );
}

export function Tile({ big, label }: { big: string; label: string }) {
  return (
    <View style={s.tile}>
      <Text style={s.tileBig}>{big}</Text>
      <Text style={s.tileLabel}>{label.toUpperCase()}</Text>
    </View>
  );
}

export function Btn({
  label, onPress, primary, danger, disabled, small, a11yLabel,
}: {
  label: string; onPress: () => void; primary?: boolean; danger?: boolean;
  disabled?: boolean; small?: boolean;
  /** what a screen reader says, when the visible label is a GLYPH that
   * reads as nothing — the pal card's close button shows "✕" (IL62) */
  a11yLabel?: string;
}) {
  return (
    <Pressable
      onPress={() => {
        void Haptics.selectionAsync();
        onPress();
      }}
      disabled={disabled}
      // every button in the app comes through here, and none of them told a
      // screen reader they were buttons — the visible text was the only clue,
      // and a dimmed button never announced that it was unavailable
      accessibilityRole="button"
      accessibilityLabel={a11yLabel ?? label}
      accessibilityState={{ disabled: !!disabled }}
      // MEASURED ON THE RENDER, not assumed: a normal button was 37 px tall
      // and a small one 30 px, against Apple's 44 pt minimum touch target —
      // every button in the app, on every screen. The CEO had already said
      // the parent slots on the Calculator were "very small"; this is the
      // same complaint with a number on it. Normal buttons now reach 44 and
      // small ones 36 plus a slop that carries them to 44 without growing
      // enough to reflow the rows they sit in.
      hitSlop={small ? { top: 4, bottom: 4, left: 3, right: 3 } : undefined}
      style={({ pressed }) => [
        s.btn,
        small && { paddingVertical: 7, paddingHorizontal: 13, minHeight: 36 },
        primary && { backgroundColor: T.accent, borderColor: T.accent },
        danger && { backgroundColor: T.badSoft, borderColor: T.bad },
        disabled && { opacity: 0.45 },
        pressed && { opacity: 0.75 },
      ]}
    >
      <Text style={[
        s.btnText,
        small && { fontSize: 12.5 },
        primary && { color: '#08191B' },
        danger && { color: T.bad },
      ]}>{label}</Text>
    </Pressable>
  );
}

export function SearchInput({ value, onChange, placeholder }: {
  value: string; onChange: (v: string) => void; placeholder?: string;
}) {
  const hint = placeholder ?? 'Search…';
  return (
    <TextInput
      value={value}
      onChangeText={onChange}
      placeholder={hint}
      placeholderTextColor={T.faint}
      autoCorrect={false}
      autoCapitalize="none"
      clearButtonMode="while-editing"
      // A placeholder is not a name: it is read only while the box is
      // EMPTY, so the moment you type, the field goes anonymous. This is
      // the shared search box — the Paldex, both pal pickers and the
      // category browser all use it — so it was every search box in the
      // app, not one. Naming it explicitly keeps it named while you type.
      accessibilityLabel={hint.replace(/…$/, '')}
      style={s.search}
    />
  );
}

/* ---------------- "back to the pal card" chip ---------------- */

/** Shown by a screen the player reached FROM a pal's info card — one tap
 * reopens that exact card instead of making them re-scroll the Paldex for it
 * (CEO 2026-08-15). Dismisses with the ✕ so it never becomes clutter. */
export function BackToCardChip({ name, onOpen, onDismiss }: {
  name: string; onOpen: () => void; onDismiss: () => void;
}) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 10 }}>
      <Pressable
        onPress={() => {
          void Haptics.selectionAsync();
          onOpen();
        }}
        style={({ pressed }) => [{
          flexDirection: 'row', alignItems: 'center', gap: 7,
          backgroundColor: pressed ? T.accentSoft : T.surface,
          borderWidth: 1.5, borderColor: T.accent, borderRadius: 20,
          paddingVertical: 5, paddingLeft: 6, paddingRight: 12,
        }]}
      >
        <PalIcon name={name} size={26} />
        <Text style={{ color: T.accentInk, fontWeight: '700', fontSize: 12.5 }}>
          ‹ Back to {name}
        </Text>
      </Pressable>
      <Pressable hitSlop={8} onPress={onDismiss} accessibilityRole="button" accessibilityLabel="Dismiss">
        <Text style={{ color: T.faint, fontWeight: '800', fontSize: 13 }}>✕</Text>
      </Pressable>
    </View>
  );
}

/* ---------------- gender toggles ---------------- */

export function GenderToggles({ name, size = 30 }: { name: string; size?: number }) {
  useAppVersion();
  const unsure = genderUnsure(name);
  return (
    <View style={{ flexDirection: 'row', gap: 5 }}>
      {/* "Caught it, could not tell which" — the CEO catches pals in the field
          where the gender is not visible, and wants to sort it out back at
          base. It sits WITH the gender boxes because it answers the same
          question; tapping a gender clears it. */}
      <Pressable
        onPress={() => {
          void Haptics.selectionAsync();
          // read the store AT PRESS TIME: two taps inside one long frame both
          // saw the same render-time value, so the second tap was a no-op —
          // a fast double-tap lost a tick (found in the 2026-08-18 storm test)
          setGenderUnsure(name, !genderUnsure(name));
        }}
        hitSlop={8}
        accessibilityRole="checkbox"
        accessibilityState={{ checked: unsure }}
        accessibilityLabel={`${name}: caught, gender not checked yet — ${
          unsure ? 'on' : 'off'}`}
        style={{
          width: size, height: size, borderRadius: size * 0.3,
          borderWidth: 1.5,
          borderColor: unsure ? T.gold : T.line2,
          backgroundColor: unsure ? T.goldSoft : T.surface2,
          alignItems: 'center', justifyContent: 'center',
        }}>
        <Text style={{
          color: unsure ? T.goldInk : T.faint,
          fontSize: size * 0.5, fontWeight: '900',
        }}>?</Text>
      </Pressable>
      {(['m', 'f'] as const).map((g) => {
        const on = hasGender(name, g);
        const color = g === 'm' ? T.male : T.female;
        return (
          <Pressable
            key={g}
            onPress={() => {
              void Haptics.selectionAsync();
              // press-time read, same reason as the "?" box above
              setOwnedGender(name, g, !hasGender(name, g));
            }}
            // the ♂/♀ boxes draw 28 px and are the most-tapped control in the app;
            // 6 of slop left them at 40, still under the 44 pt minimum
            hitSlop={8}
            // the label was the bare glyph, so a screen reader announced
            // "male sign" with no hint of the pal, the meaning or the state.
            // The website had the same bug and was fixed first.
            accessibilityRole="checkbox"
            accessibilityState={{ checked: on }}
            accessibilityLabel={
              `${g === 'm' ? 'Male' : 'Female'} ${name}: ${on ? 'in your Paldex' : 'not yet'}`
            }
            style={{
              width: size, height: size, borderRadius: size * 0.3,
              borderWidth: 1.5, borderColor: on ? color : T.line2,
              backgroundColor: on ? color : T.surface2,
              alignItems: 'center', justifyContent: 'center',
            }}
          >
            <Text style={{
              color: on ? '#fff' : T.faint, fontWeight: '800', fontSize: size * 0.5,
              lineHeight: size * 0.62,
            }}>{g === 'm' ? '♂' : '♀'}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/* ---------------- pal picker (modal) ---------------- */

/* recently picked pals (session-only (not persisted)) */
let recentPicks: string[] = [];
export const getRecentPicks = () => recentPicks;
export function rememberPick(n: string): void {
  recentPicks = [n, ...recentPicks.filter((x) => x !== n)].slice(0, 5);
}

/* ---------------- styles ---------------- */

export const s = StyleSheet.create({
  h1: { color: T.ink, fontSize: 28, fontWeight: '800' },
  h2: { color: T.ink, fontSize: 19, fontWeight: '800' },
  h3: { color: T.ink, fontSize: 16, fontWeight: '800' },
  pageSub: { color: T.muted, fontSize: 13.5, lineHeight: 19, marginTop: 5 },
  body: { color: T.muted, fontSize: 13.5, lineHeight: 19.5 },
  card: {
    backgroundColor: T.surface, borderColor: T.line, borderWidth: 1,
    borderRadius: T.r, padding: 16,
  },
  chip: {
    borderRadius: 20, paddingHorizontal: 9, paddingVertical: 2.5,
  },
  chipText: { fontSize: 11.5, fontWeight: '700' },
  badge: {
    borderRadius: 7, paddingHorizontal: 8, paddingVertical: 2.5,
  },
  badgeText: {
    fontSize: 10, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.5,
  },
  tile: {
    backgroundColor: T.surface, borderColor: T.line, borderWidth: 1,
    borderRadius: 12, paddingVertical: 10, paddingHorizontal: 16, minWidth: 90,
  },
  tileBig: { color: T.accentInk, fontSize: 22, fontWeight: '800' },
  tileLabel: { color: T.muted, fontSize: 9.5, fontWeight: '700', letterSpacing: 0.6, marginTop: 1 },
  btn: {
    borderWidth: 1, borderColor: T.line, backgroundColor: T.surface,
    borderRadius: 11, paddingVertical: 9, paddingHorizontal: 16,
    // 44 is the minimum touch target Apple asks for; these were rendering 37
    minHeight: 44,
    alignItems: 'center', justifyContent: 'center',
  },
  btnText: { color: T.ink, fontWeight: '700', fontSize: 14 },
  search: {
    backgroundColor: T.surface, borderColor: T.line, borderWidth: 1,
    borderRadius: 11, paddingHorizontal: 14, paddingVertical: 10,
    color: T.ink, fontSize: 15,
  },
  row: { flexDirection: 'row', alignItems: 'center' },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, alignItems: 'center' },
});
