/** Palforge — app shell (CEO architecture, 2026-08-15):
 * side panel = main domains; bottom bar = the current domain's tabs with the
 * Paldex anchored in the center slot everywhere; coming-soon sections are
 * real screens so the finished app's shape is visible today. */
import React, { Component, useEffect, useRef, useState, type ReactNode } from 'react';
import {
  ActivityIndicator, PanResponder, Pressable, StatusBar, StyleSheet, Text, View,
} from 'react-native';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { T } from './theme';
import { getActiveProfile, loadPersisted, useAppVersion } from './store';
import { DOMAINS } from './nav/domains';
import { DomainPanel } from './ui/DomainPanel';
import { CalculatorScreen } from './screens/CalculatorScreen';
import { PlannerScreen } from './screens/PlannerScreen';
import { OddsScreen } from './screens/OddsScreen';
import { PaldexScreen } from './screens/PaldexScreen';
import { ReferenceScreen } from './screens/ReferenceScreen';
import { ComingSoonScreen } from './screens/ComingSoonScreen';
import { AboutScreen, ProfilesScreen } from './screens/SettingsScreens';

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

const LIVE_SCREENS: Record<string, () => React.JSX.Element> = {
  calc: CalculatorScreen,
  plan: PlannerScreen,
  paldex: PaldexScreen,
  odds: OddsScreen,
  ref: ReferenceScreen,
  profiles: ProfilesScreen,
  about: AboutScreen,
};

function Shell() {
  useAppVersion();
  const insets = useSafeAreaInsets();
  const [domainId, setDomainId] = useState('breeding');
  const [tabId, setTabId] = useState('calc');
  const [panel, setPanel] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    void loadPersisted().then(() => setReady(true));
  }, []);

  const edgePan = useRef(PanResponder.create({
    onMoveShouldSetPanResponder: (e, g) =>
      e.nativeEvent.pageX < 32 && g.dx > 10 && Math.abs(g.dx) > Math.abs(g.dy),
    onPanResponderRelease: (_e, g) => {
      if (g.dx > 30) {
        void Haptics.selectionAsync();
        setPanel(true);
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

  const domain = DOMAINS.find((d) => d.id === domainId) ?? DOMAINS[0];
  const tab = domain.tabs.find((t) => t.id === tabId) ?? domain.tabs[2];
  const Live = LIVE_SCREENS[tab.id];

  const selectDomain = (id: string) => {
    const d = DOMAINS.find((x) => x.id === id)!;
    setDomainId(id);
    // land on the domain's first live tab, else its first tab
    const first = d.tabs.find((t) => LIVE_SCREENS[t.id] && t.id !== 'paldex') ?? d.tabs[0];
    setTabId(first.id);
  };

  return (
    <View style={{ flex: 1, backgroundColor: T.bg, paddingTop: insets.top }}>
      <StatusBar barStyle="light-content" />

      <View style={styles.header}>
        <Pressable
          onPress={() => {
            void Haptics.selectionAsync();
            setPanel(true);
          }}
          hitSlop={10}
          accessibilityLabel="Open sections"
          style={({ pressed }) => [styles.burger, pressed && { opacity: 0.6 }]}
        >
          <View style={styles.burgerLine} />
          <View style={[styles.burgerLine, { width: 12 }]} />
          <View style={styles.burgerLine} />
        </Pressable>
        <Text style={styles.headerTitle}>
          {domain.title}
          {tab.id !== 'paldex' && tab.label !== domain.title
            ? <Text style={{ color: T.faint }}>  ·  {tab.label}</Text>
            : null}
        </Text>
        <Text style={styles.headerProfile} numberOfLines={1}>
          {getActiveProfile().name}
        </Text>
      </View>

      <View style={{ flex: 1 }} {...edgePan.panHandlers}>
        <Boundary key={`${domainId}/${tab.id}`}>
          {Live ? <Live /> : (
            <ComingSoonScreen
              title={tab.label === domain.title ? domain.title : `${domain.title} — ${tab.label}`}
              glyph={tab.glyph}
              blurb={tab.blurb ?? domain.blurb ?? ''}
              planned={tab.planned ?? []}
            />
          )}
        </Boundary>
      </View>

      <View style={[styles.tabbar, { paddingBottom: Math.max(insets.bottom, 8) }]}>
        {domain.tabs.map((t, i) => {
          const on = tab.id === t.id;
          const center = i === 2;
          return (
            <Pressable
              key={t.id}
              onPress={() => {
                void Haptics.selectionAsync();
                setTabId(t.id);
              }}
              style={styles.tab}
              accessibilityRole="tab"
              accessibilityState={{ selected: on }}
            >
              <View style={center ? [styles.centerTab, on && { borderColor: T.accent }] : undefined}>
                <Text style={{
                  fontSize: center ? 21 : 19,
                  opacity: on ? 1 : t.soon ? 0.4 : 0.55,
                }}>{t.glyph}</Text>
              </View>
              <Text style={{
                fontSize: 10, fontWeight: '700',
                color: on ? T.accentInk : t.soon ? T.faint : T.muted,
              }}>{t.label}</Text>
            </Pressable>
          );
        })}
      </View>

      <DomainPanel open={panel} domain={domainId}
        onSelect={selectDomain} onClose={() => setPanel(false)} />
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
    color: T.ink, fontSize: 16.5, fontWeight: '800', flex: 1,
  },
  headerProfile: {
    color: T.faint, fontSize: 11.5, fontWeight: '700', maxWidth: 110,
  },
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
  centerTab: {
    borderWidth: 1.5,
    borderColor: 'transparent',
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 2,
    marginTop: -4,
    backgroundColor: T.surface,
  },
});
