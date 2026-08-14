/** Shared UI: pal icons, chips, badges, cards, search, pickers, toggles. */
import React, { memo, useEffect, useMemo, useRef, useState } from 'react';
import {
  FlatList, Image, Modal, Pressable, StyleSheet, Text, TextInput, View,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { ELEMENT_COLORS, T } from '../theme';
import { PAL_ICONS } from '../data/icons.g';
import {
  hasGender, palNumberSort, pals, setOwnedGender, topWork, useAppVersion, workLabel,
} from '../store';

/* ---------------- pal icon ---------------- */

export const PalIcon = memo(function PalIcon({ name, size = 44, gender }: {
  name: string; size?: number; gender?: 'm' | 'f';
}) {
  const src = PAL_ICONS[name];
  const el = (pals[name]?.elements?.[0] ?? 'Neutral').toLowerCase();
  const colors = ELEMENT_COLORS[el] ?? ELEMENT_COLORS.neutral;
  const icon = src ? (
    <Image source={src} style={{
      width: size, height: size, borderRadius: size / 2,
      borderWidth: 1.5, borderColor: T.line2, backgroundColor: T.surface2,
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
          <View key={e} style={[s.chip, { backgroundColor: c.bg }]}>
            <Text style={[s.chipText, { color: c.fg }]}>{e}</Text>
          </View>
        );
      })}
    </>
  );
}

export function WorkChips({ name, top = 2 }: { name: string; top?: number }) {
  const p = pals[name];
  if (!p) return null;
  return (
    <>
      {topWork(p, top).map(([job, lvl]) => (
        <View key={job} style={[s.chip, { backgroundColor: T.surface2 }]}>
          <Text style={[s.chipText, { color: T.ink }]}>
            {workLabel(job)} <Text style={{ color: T.accentInk }}>{lvl}</Text>
          </Text>
        </View>
      ))}
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

export function Card({ children, style }: {
  children: React.ReactNode; style?: object;
}) {
  return <View style={[s.card, style]}>{children}</View>;
}

export function PageHead({ title, sub }: { title: string; sub?: string }) {
  return (
    <View style={{ marginBottom: 14 }}>
      <Text style={s.h1}>{title}</Text>
      {sub ? <Text style={s.pageSub}>{sub}</Text> : null}
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

export function Btn({ label, onPress, primary, danger, disabled, small }: {
  label: string; onPress: () => void; primary?: boolean; danger?: boolean;
  disabled?: boolean; small?: boolean;
}) {
  return (
    <Pressable
      onPress={() => {
        void Haptics.selectionAsync();
        onPress();
      }}
      disabled={disabled}
      style={({ pressed }) => [
        s.btn,
        small && { paddingVertical: 6, paddingHorizontal: 12 },
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
  return (
    <TextInput
      value={value}
      onChangeText={onChange}
      placeholder={placeholder ?? 'Search…'}
      placeholderTextColor={T.faint}
      autoCorrect={false}
      autoCapitalize="none"
      clearButtonMode="while-editing"
      style={s.search}
    />
  );
}

/* ---------------- gender toggles ---------------- */

export function GenderToggles({ name, size = 30 }: { name: string; size?: number }) {
  useAppVersion();
  return (
    <View style={{ flexDirection: 'row', gap: 5 }}>
      {(['m', 'f'] as const).map((g) => {
        const on = hasGender(name, g);
        const color = g === 'm' ? T.male : T.female;
        return (
          <Pressable
            key={g}
            onPress={() => {
              void Haptics.selectionAsync();
              setOwnedGender(name, g, !on);
            }}
            hitSlop={6}
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

export function PalPicker({ visible, onClose, onPick, title }: {
  visible: boolean; onClose: () => void; onPick: (name: string) => void; title: string;
}) {
  const [q, setQ] = useState('');
  const inputRef = useRef<TextInput>(null);
  const names = useMemo(() => {
    const all = [...Object.keys(pals)].sort(palNumberSort);
    if (!q) return all;
    const needle = q.toLowerCase();
    return all.filter((n) => n.toLowerCase().includes(needle));
  }, [q]);

  useEffect(() => {
    if (visible) {
      setQ('');
      setTimeout(() => inputRef.current?.focus(), 250);
    }
  }, [visible]);

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet"
      onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: T.bg2, padding: 16 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 10 }}>
          <Text style={[s.h2, { flex: 1 }]}>{title}</Text>
          <Btn label="Close" onPress={onClose} small />
        </View>
        <TextInput
          ref={inputRef}
          value={q}
          onChangeText={setQ}
          placeholder="Search pals…"
          placeholderTextColor={T.faint}
          autoCorrect={false}
          autoCapitalize="none"
          style={[s.search, { marginBottom: 8 }]}
        />
        <FlatList
          data={names}
          keyExtractor={(n) => n}
          keyboardShouldPersistTaps="handled"
          initialNumToRender={16}
          renderItem={({ item: n }) => (
            <Pressable
              onPress={() => {
                void Haptics.selectionAsync();
                onPick(n);
                onClose();
              }}
              style={({ pressed }) => [{
                flexDirection: 'row', alignItems: 'center', gap: 10,
                paddingVertical: 7, paddingHorizontal: 8, borderRadius: 10,
              }, pressed && { backgroundColor: T.accentSoft }]}
            >
              <PalIcon name={n} size={34} />
              <Text style={{ color: T.ink, fontWeight: '600', fontSize: 15, flex: 1 }}>{n}</Text>
              <Text style={{ color: T.faint, fontSize: 12 }}>#{pals[n]?.number || '—'}</Text>
            </Pressable>
          )}
        />
      </View>
    </Modal>
  );
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
