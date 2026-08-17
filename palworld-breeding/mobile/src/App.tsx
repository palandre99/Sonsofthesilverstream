/** Palforge — app shell (CEO architecture, 2026-08-15):
 * side panel = main domains; bottom bar = the current domain's tabs with the
 * Paldex anchored in the center slot everywhere; coming-soon sections are
 * real screens so the finished app's shape is visible today. */
import React, { Component, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  ActivityIndicator, PanResponder, Pressable, StatusBar, StyleSheet, Text, View,
} from 'react-native';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import * as Haptics from 'expo-haptics';
import * as Updates from 'expo-updates';
import { T } from './theme';
import { getActiveProfile, loadPersisted, useAppVersion } from './store';
import { DOMAINS } from './nav/domains';
import { onNavIntent } from './nav/intent';
import { DomainPanel } from './ui/DomainPanel';
import { Icon } from './ui/Icon';
import { CalculatorScreen } from './screens/CalculatorScreen';
import { PlannerScreen } from './screens/PlannerScreen';
import { OddsScreen } from './screens/OddsScreen';
import { PaldexScreen } from './screens/PaldexScreen';
import { ReferenceScreen } from './screens/ReferenceScreen';
import { ComingSoonScreen } from './screens/ComingSoonScreen';
import { MapScreen } from './screens/MapScreen';
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
  map: MapScreen,   // fullscreen domain: keyed by domain id, not a tab id
  calc: CalculatorScreen,
  plan: PlannerScreen,
  paldex: PaldexScreen,
  odds: OddsScreen,
  ref: ReferenceScreen,
  profiles: ProfilesScreen,
  about: AboutScreen,
};

/** "New version ready — restart" banner. The app launches from cache for
 * instant startup; when the background download lands, one tap applies it —
 * no more close-twice ritual (CEO 2026-08-15). */
function UpdateBanner() {
  const { isUpdatePending } = Updates.useUpdates();
  if (!isUpdatePending) return null;
  return (
    <Pressable
      onPress={() => {
        void Updates.reloadAsync();
      }}
      accessibilityRole="button"
      accessibilityLabel="New version ready — tap to restart"
      style={({ pressed }) => [{
        position: 'absolute', left: 14, right: 14, bottom: 96, zIndex: 60,
        backgroundColor: pressed ? T.accent : T.accentSoft,
        borderWidth: 1.5, borderColor: T.accent, borderRadius: 14,
        paddingVertical: 11, paddingHorizontal: 14,
        flexDirection: 'row', alignItems: 'center', gap: 9,
        shadowColor: '#000', shadowOpacity: 0.4, shadowRadius: 8,
      }]}
    >
      <ActivityIndicator size="small" color={T.accentInk} />
      <Text style={{ color: T.accentInk, fontWeight: '800', fontSize: 13.5, flex: 1 }}>
        New version ready — tap to restart
      </Text>
    </Pressable>
  );
}

/** On the web QA build, `#map` or `#breeding/plan` opens straight to a screen.
 *  Native has no location, so this is a no-op there. Standing order is to look
 *  at every change with our own eyes — that needs a way to reach the screen. */
function initialRoute(): { domain: string; tab: string } {
  // the Paldex is Breeding's home hub (CEO 2026-08-17): the collection is
  // what every other breeding screen works from, so the app opens on it
  const fallback = { domain: 'breeding', tab: 'paldex' };
  const hash = typeof window !== 'undefined' ? window.location?.hash ?? '' : '';
  const [domain, tab] = hash.replace(/^#\/?/, '').split('/');
  const found = DOMAINS.find((d) => d.id === domain);
  if (!found) return fallback;
  const wanted = found.tabs.find((t) => t.id === tab);
  return { domain: found.id, tab: wanted?.id ?? found.tabs[0]?.id ?? '' };
}

function Shell() {
  useAppVersion();
  const insets = useSafeAreaInsets();
  const start = useMemo(initialRoute, []);
  const [domainId, setDomainId] = useState(start.domain);
  const [tabId, setTabId] = useState(start.tab);
  const [panel, setPanel] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    void loadPersisted().then(() => setReady(true));
  }, []);

  // On the web QA build, follow the hash when it CHANGES too, not only at
  // mount — otherwise a scripted journey across domains ("own a pal, then go
  // to the Map") silently stays put and the test proves nothing. Native has no
  // location, so this never runs there.
  useEffect(() => {
    if (typeof window === 'undefined' || !window.addEventListener) return undefined;
    const onHash = () => {
      const r = initialRoute();
      setDomainId(r.domain);
      setTabId(r.tab);
    };
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  // cards can hand the player straight to another screen ("open this in the
  // Calculator") instead of printing directions for them to follow
  useEffect(() => onNavIntent((i) => {
    setDomainId(i.domain);
    setTabId(i.tab);
    setPanel(false);
  }), []);

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
  // a domain with no tabs is FULLSCREEN (the Map): no bottom bar at all
  const fullscreen = domain.tabs.length === 0;
  const tab = fullscreen ? null : (domain.tabs.find((t) => t.id === tabId) ?? domain.tabs[2]);
  // fullscreen domains own the whole area, so they register under the DOMAIN id
  const Live = fullscreen ? LIVE_SCREENS[domain.id] : (tab ? LIVE_SCREENS[tab.id] : undefined);

  const selectDomain = (id: string) => {
    const d = DOMAINS.find((x) => x.id === id)!;
    setDomainId(id);
    // Breeding lands on the Paldex — its home hub (CEO 2026-08-17). Other
    // domains land on their own first live tab so a new domain leads with
    // its own story rather than the shared anchor.
    const first = id === 'breeding'
      ? d.tabs.find((t) => t.id === 'paldex')
      : d.tabs.find((t) => LIVE_SCREENS[t.id] && t.id !== 'paldex') ?? d.tabs[0];
    setTabId(first ? first.id : '');
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
          // the glyph draws 22 px; 12 of slop each side clears the 44 pt
          // minimum (10 left it at 42 — measured, not guessed)
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel="Open sections"
          style={({ pressed }) => [styles.burger, pressed && { opacity: 0.6 }]}
        >
          <View style={styles.burgerLine} />
          <View style={[styles.burgerLine, { width: 12 }]} />
          <View style={styles.burgerLine} />
        </Pressable>
        <Text style={styles.headerTitle}>
          {domain.title}
          {tab && tab.id !== 'paldex' && tab.label !== domain.title
            ? <Text style={{ color: T.faint }}>  ·  {tab.label}</Text>
            : null}
        </Text>
        <Text style={styles.headerProfile} numberOfLines={1}>
          {getActiveProfile().name}
        </Text>
      </View>

      <View style={{ flex: 1 }} {...edgePan.panHandlers}>
        <Boundary key={`${domainId}/${tab?.id ?? 'full'}`}>
          {Live ? <Live /> : (
            <ComingSoonScreen
              title={!tab || tab.label === domain.title
                ? domain.title : `${domain.title} — ${tab.label}`}
              icon={tab?.icon ?? domain.icon}
              blurb={tab?.blurb ?? domain.blurb ?? ''}
              planned={(tab?.planned?.length ? tab.planned : domain.planned) ?? []}
            />
          )}
        </Boundary>
      </View>

      {!fullscreen && (
      <View style={[styles.tabbar, { paddingBottom: Math.max(insets.bottom, 8) }]}>
        {domain.tabs.map((t, i) => {
          const on = tab!.id === t.id;
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
              // the visible text is an icon GLYPH followed by the word, so
              // without this a screen reader reads a private-use character
              // before the name. Measured: every tab was nameless.
              accessibilityLabel={t.soon ? `${t.label}, coming soon` : t.label}
            >
              <View style={center ? [styles.centerTab, on && { borderColor: T.accent }] : { height: 24, justifyContent: 'center' }}>
                <Icon name={t.icon} size={center ? 22 : 21}
                  color={on ? T.accentInk : t.soon ? T.faint : T.muted} />
              </View>
              <Text style={{
                fontSize: 10, fontWeight: '700',
                color: on ? T.accentInk : t.soon ? T.faint : T.muted,
              }}>{t.label}</Text>
            </Pressable>
          );
        })}
      </View>
      )}

      <DomainPanel open={panel} domain={domainId}
        onSelect={selectDomain} onClose={() => setPanel(false)} />
      <UpdateBanner />
    </View>
  );
}

export default function App() {
  return (
    // GestureHandlerRootView must wrap the whole tree or any GestureDetector
    // below it throws on device. react-native-web does NOT enforce this, so a
    // browser-only visual pass will happily pass while the phone crashes —
    // which is exactly how the Map fane's first build reached the CEO.
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <Shell />
      </SafeAreaProvider>
    </GestureHandlerRootView>
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
    paddingHorizontal: 12,
    paddingVertical: 3,
    marginTop: -6,
    backgroundColor: T.surface,
  },
});
