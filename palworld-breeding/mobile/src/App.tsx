/** Palforge — app shell: header + swipeable left panel, error boundary.
 * The drawer is the primary navigation (the companion will grow to 10+
 * sections — a bottom bar stops scaling at five). Edge-swipe opens it. */
import React, { Component, useEffect, useRef, useState, type ReactNode } from 'react';
import {
  ActivityIndicator, PanResponder, Pressable, StatusBar, StyleSheet, Text, View,
} from 'react-native';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { T } from './theme';
import { getActiveProfile, loadPersisted, useAppVersion } from './store';
import { Drawer, SECTIONS } from './ui/Drawer';
import { CalculatorScreen } from './screens/CalculatorScreen';
import { PlannerScreen } from './screens/PlannerScreen';
import { OddsScreen } from './screens/OddsScreen';
import { PaldexScreen } from './screens/PaldexScreen';
import { ReferenceScreen } from './screens/ReferenceScreen';
import { ComingSoonScreen } from './screens/ComingSoonScreen';

const SOON_COPY: Record<string, { blurb: string; planned: string[] }> = {
  map: {
    blurb: 'The full interactive map: spawn areas per species and element, alpha locations, dungeons, fast-travel points and resource nodes — connected to your Paldex so a missing pal shows you exactly where to find it.',
    planned: ['Spawn layers per species', 'Alpha + dungeon markers', 'Egg locations', 'Filter by what your collection is missing'],
  },
  items: {
    blurb: 'Every item, recipe and technology: cake ingredients and where they come from, spheres, implants, saddles — with "what do I need to farm for this" chains.',
    planned: ['Item database with sources', 'Tech tree with unlock levels', 'Crafting-chain calculator', 'Cake ingredient planner tied to your breeding plan'],
  },
  base: {
    blurb: 'Base building intelligence: work-suitability planning for your pals, production chains, and layouts that keep everything running while you breed.',
    planned: ['Best-worker suggestions from YOUR collection', 'Production chain planner', 'Base checklists per game stage'],
  },
  bosses: {
    blurb: 'Tower bosses, raids and alphas: recommended teams from the pals you actually own, element counters, and reward tables.',
    planned: ['Boss guides with counters', 'Team suggestions from your Paldex', 'Raid preparation checklists'],
  },
  import: {
    blurb: 'Import your save file and your whole collection appears in the Paldex automatically — no manual ticking. The parsing tech exists (palworld-save-tools); it needs careful, safe integration.',
    planned: ['Read-only save-file import', 'Automatic collection sync', 'Passive/IV import for the Odds Lab'],
  },
};

class Boundary extends Component<{ children: ReactNode }, { err: Error | null }> {
  state = { err: null as Error | null };
  static getDerivedStateFromError(err: Error) {
    return { err };
  }
  override componentDidCatch(err: Error) {
    console.error('screen crashed:', err);
  }
  render() {
    if (this.state.err) {
      return (
        <View style={{ flex: 1, padding: 24, justifyContent: 'center' }}>
          <Text style={{ color: T.ink, fontSize: 18, fontWeight: '800' }}>
            This screen hit an error
          </Text>
          <Text style={{ color: T.muted, marginTop: 8 }}>{String(this.state.err)}</Text>
          <Pressable
            onPress={() => this.setState({ err: null })}
            style={{
              marginTop: 16, alignSelf: 'flex-start', borderWidth: 1,
              borderColor: T.line, borderRadius: 11, paddingVertical: 9,
              paddingHorizontal: 16, backgroundColor: T.surface,
            }}
          >
            <Text style={{ color: T.ink, fontWeight: '700' }}>Try again</Text>
          </Pressable>
        </View>
      );
    }
    return this.props.children;
  }
}

function Shell() {
  useAppVersion();
  const insets = useSafeAreaInsets();
  const [section, setSection] = useState('calc');
  const [drawer, setDrawer] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    void loadPersisted().then(() => setReady(true));
  }, []);

  // edge swipe from the left opens the panel
  const edgePan = useRef(PanResponder.create({
    onMoveShouldSetPanResponder: (e, g) =>
      e.nativeEvent.pageX < 32 && g.dx > 10 && Math.abs(g.dx) > Math.abs(g.dy),
    onPanResponderRelease: (_e, g) => {
      if (g.dx > 30) {
        void Haptics.selectionAsync();
        setDrawer(true);
      }
    },
  })).current;

  if (!ready) {
    return (
      <View style={{ flex: 1, backgroundColor: T.bg, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color={T.accent} size="large" />
        <Text style={{ color: T.muted, marginTop: 12 }}>Loading Paldex…</Text>
      </View>
    );
  }

  const meta = SECTIONS.find((x) => x.id === section) ?? SECTIONS[0];
  const soon = SOON_COPY[section];

  return (
    <View style={{ flex: 1, backgroundColor: T.bg, paddingTop: insets.top }}>
      <StatusBar barStyle="light-content" />

      <View style={styles.header}>
        <Pressable
          onPress={() => {
            void Haptics.selectionAsync();
            setDrawer(true);
          }}
          hitSlop={10}
          accessibilityLabel="Open menu"
          style={({ pressed }) => [styles.burger, pressed && { opacity: 0.6 }]}
        >
          <View style={styles.burgerLine} />
          <View style={[styles.burgerLine, { width: 13 }]} />
          <View style={styles.burgerLine} />
        </Pressable>
        <Text style={styles.headerTitle}>{meta.title}</Text>
        <Text style={styles.headerProfile} numberOfLines={1}>
          {getActiveProfile().name}
        </Text>
      </View>

      <View style={{ flex: 1 }} {...edgePan.panHandlers}>
        <Boundary key={section}>
          {section === 'calc' ? <CalculatorScreen />
            : section === 'plan' ? <PlannerScreen />
            : section === 'odds' ? <OddsScreen />
            : section === 'paldex' ? <PaldexScreen />
            : section === 'ref' ? <ReferenceScreen />
            : soon ? (
              <ComingSoonScreen title={meta.title} glyph={meta.glyph}
                blurb={soon.blurb} planned={soon.planned} />
            ) : <CalculatorScreen />}
        </Boundary>
      </View>

      <Drawer open={drawer} section={section} onSelect={setSection}
        onClose={() => setDrawer(false)} />
    </View>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <Shell />
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: T.line,
    backgroundColor: T.bg2,
  },
  burger: { gap: 3.5, padding: 4 },
  burgerLine: {
    width: 19, height: 2.4, borderRadius: 2, backgroundColor: T.accentInk,
  },
  headerTitle: {
    color: T.ink, fontSize: 17, fontWeight: '800', flex: 1,
  },
  headerProfile: {
    color: T.faint, fontSize: 11.5, fontWeight: '700', maxWidth: 110,
  },
});
