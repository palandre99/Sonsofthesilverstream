/** HatchLab — app shell: data load gate, bottom tab bar, error boundary. */
import React, { Component, useEffect, useState, type ReactNode } from 'react';
import { ActivityIndicator, Pressable, StatusBar, StyleSheet, Text, View } from 'react-native';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { T } from './theme';
import { loadPersisted } from './store';
import { CalculatorScreen } from './screens/CalculatorScreen';
import { PlannerScreen } from './screens/PlannerScreen';
import { OddsScreen } from './screens/OddsScreen';
import { PaldexScreen } from './screens/PaldexScreen';
import { BoxScreen } from './screens/BoxScreen';
import { ReferenceScreen } from './screens/ReferenceScreen';

type Tab = 'calc' | 'plan' | 'odds' | 'paldex' | 'box' | 'ref';

const TABS: { id: Tab; label: string; glyph: string }[] = [
  { id: 'calc', label: 'Calc', glyph: '🧮' },
  { id: 'plan', label: 'Plan', glyph: '🥚' },
  { id: 'odds', label: 'Odds', glyph: '🎲' },
  { id: 'paldex', label: 'Paldex', glyph: '📖' },
  { id: 'box', label: 'Box', glyph: '📦' },
  { id: 'ref', label: 'Ref', glyph: 'ℹ️' },
];

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
  const insets = useSafeAreaInsets();
  const [tab, setTab] = useState<Tab>('calc');
  const [ready, setReady] = useState(false);

  useEffect(() => {
    void loadPersisted().then(() => setReady(true));
  }, []);

  if (!ready) {
    return (
      <View style={{ flex: 1, backgroundColor: T.bg, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color={T.accent} size="large" />
        <Text style={{ color: T.muted, marginTop: 12 }}>Loading Paldex…</Text>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: T.bg, paddingTop: insets.top }}>
      <StatusBar barStyle="light-content" />
      <View style={{ flex: 1 }}>
        {/* keyed boundary: navigating away resets a crashed screen */}
        <Boundary key={tab}>
          {tab === 'calc' ? <CalculatorScreen />
            : tab === 'plan' ? <PlannerScreen />
            : tab === 'odds' ? <OddsScreen />
            : tab === 'paldex' ? <PaldexScreen />
            : tab === 'box' ? <BoxScreen />
            : <ReferenceScreen />}
        </Boundary>
      </View>
      <View style={[styles.tabbar, { paddingBottom: Math.max(insets.bottom, 8) }]}>
        {TABS.map((t) => {
          const on = tab === t.id;
          return (
            <Pressable
              key={t.id}
              onPress={() => {
                void Haptics.selectionAsync();
                setTab(t.id);
              }}
              style={styles.tab}
              accessibilityRole="tab"
              accessibilityState={{ selected: on }}
            >
              <Text style={{ fontSize: 19, opacity: on ? 1 : 0.55 }}>{t.glyph}</Text>
              <Text style={{
                fontSize: 10, fontWeight: '700',
                color: on ? T.accentInk : T.faint,
              }}>{t.label}</Text>
            </Pressable>
          );
        })}
      </View>
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
  tabbar: {
    flexDirection: 'row',
    backgroundColor: T.bg2,
    borderTopWidth: 1,
    borderTopColor: T.line,
    paddingTop: 7,
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    gap: 1,
  },
});
