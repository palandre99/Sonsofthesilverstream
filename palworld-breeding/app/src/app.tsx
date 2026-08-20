/** HatchLab app shell: sidebar navigation (bottom bar on mobile) + router. */
import './design/tokens.css';
import './design/app.css';
import { Component, type ComponentChildren } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import { dataReady, loadData, route, theme } from './state';
import { CalculatorPage } from './modules/calculator';
import { PaldexPage } from './modules/paldex';
import { PlanPage } from './modules/plan';
import { OddsPage } from './modules/odds';
import { ReferencePage } from './modules/misc';
import { MapPage } from './modules/map';

/* The game's Pal Sphere: blue glass orb, gold swirl, gold pole caps —
 * NOT pokeball grammar (no horizontal band, no center button). */
const Logo = () => (
  <svg viewBox="0 0 100 100" aria-hidden="true">
    <defs>
      <radialGradient id="pfglass" cx="0.38" cy="0.32" r="0.9">
        <stop offset="0" stop-color="#A8E2F8" />
        <stop offset="0.35" stop-color="#69C4EE" />
        <stop offset="0.75" stop-color="#349AD6" />
        <stop offset="1" stop-color="#1860A0" />
      </radialGradient>
      <clipPath id="pforb"><circle cx="50" cy="50" r="36" /></clipPath>
    </defs>
    <circle cx="50" cy="50" r="36" fill="url(#pfglass)" stroke="#1860A0" stroke-width="2" />
    <g clip-path="url(#pforb)">
      <path d="M8 40 C 30 22, 46 58, 66 62 S 92 58, 98 50"
        fill="none" stroke="#966C22" stroke-width="11" />
      <path d="M8 38 C 30 20, 46 56, 66 60 S 92 56, 98 48"
        fill="none" stroke="#D8A83E" stroke-width="8" />
      <path d="M8 36.5 C 30 18.5, 46 54.5, 66 58.5"
        fill="none" stroke="#F0CD69" stroke-width="3.5" />
    </g>
    <path d="M50 4 L61 21 H39 Z" fill="#D8A83E" />
    <path d="M50 4 L61 21 H50 Z" fill="#966C22" />
    <path d="M50 96 L59 81 H41 Z" fill="#D8A83E" />
    <path d="M50 96 L59 81 H50 Z" fill="#966C22" />
  </svg>
);

const icons = {
  calc: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="4" y="3" width="16" height="18" rx="3" /><path d="M8 8h8M8 12h3m5 0h0M8 16h3m5 0h0" stroke-linecap="round" /></svg>,
  plan: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 4v6a4 4 0 0 0 4 4h4" stroke-linecap="round" /><circle cx="6" cy="4" r="2" /><circle cx="18" cy="14" r="2" /><path d="M18 16v1a4 4 0 0 1-4 4H9" stroke-linecap="round" /><circle cx="7" cy="21" r="2" /></svg>,
  paldex: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="8" /><path d="M4.5 9 C 9 5, 12 14, 19.5 13" stroke-linecap="round" /><path d="M12 1.5l2.2 3.4h-4.4Z" fill="currentColor" stroke="none" /><path d="M12 22.5l2-3h-4Z" fill="currentColor" stroke="none" /></svg>,
  box: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 8l8-4 8 4v8l-8 4-8-4Z" stroke-linejoin="round" /><path d="M4 8l8 4 8-4M12 12v8" /></svg>,
  ref: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 4h6a3 3 0 0 1 3 3v13a2 2 0 0 0-2-2H5Z" stroke-linejoin="round" /><path d="M19 4h-5a3 3 0 0 0-3 3v13a2 2 0 0 1 2-2h6Z" stroke-linejoin="round" /></svg>,
  odds: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 20V10m5 10V4m5 16v-7m5 7V8" stroke-linecap="round" /></svg>,
};

const NAV = [
  { hash: 'calc', label: 'Calculator', icon: icons.calc, match: 'calc' },
  { hash: 'plan', label: 'Route Planner', icon: icons.plan, match: 'plan' },
  { hash: 'odds', label: 'Odds Lab', icon: icons.odds, match: 'odds' },
  { hash: 'paldex', label: 'Paldex', icon: icons.paldex, match: 'paldex' },
  { hash: 'map', label: 'Map', icon: icons.paldex, match: 'map' },
  { hash: 'reference', label: 'Reference', icon: icons.ref, match: 'reference' },
];

/** Render errors on one page must never blank the whole app.
 * Mounted with key={page}, so navigating to another page replaces the whole
 * boundary — a crashed page resets on navigation and ONLY on navigation
 * (comparing children vnodes would "reset" on every parent re-render). */
class Boundary extends Component<{ children: ComponentChildren }, { err: Error | null }> {
  state = { err: null as Error | null };
  static getDerivedStateFromError(err: Error) {
    return { err };
  }
  override componentDidCatch(err: Error) {
    console.error('page crashed:', err); // keep the stack for bug reports
  }
  render() {
    if (this.state.err) {
      return (
        <div class="card bigcard" role="alert">
          <h2>This page hit an error</h2>
          <p>{String(this.state.err)}</p>
          <p style={{ marginTop: '10px' }}>
            <button class="btn" onClick={() => this.setState({ err: null })}>Try again</button>
          </p>
        </div>
      );
    }
    return this.props.children;
  }
}

export function App() {
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    loadData().catch((e) => setError(String(e)));
  }, []);

  const page = route.value.page;

  return (
    <div class="shell">
      <aside class="side">
        <a class="brand" href="#/calc">
          <Logo />
          <b>Palforge</b>
        </a>
        <nav class="nav" aria-label="Main">
          {NAV.map((n) => (
            <a key={n.hash} href={`#/${n.hash}`} aria-current={page === n.match ? 'page' : undefined}>
              {n.icon}
              <span>{n.label}</span>
            </a>
          ))}
          <div class="navsoon" aria-hidden="true">
            {['Items & Tech', 'Base & Builds', 'Bosses & Raids', 'Save Import'].map((t) => (
              <span key={t} class="soonitem">{t}<i>SOON</i></span>
            ))}
          </div>
        </nav>
        <button class="themebtn" type="button"
          onClick={() => (theme.value = theme.value === 'dark' ? 'light' : 'dark')}>
          {theme.value === 'dark' ? '☀' : '☾'} <span>{theme.value === 'dark' ? 'Light mode' : 'Dark mode'}</span>
        </button>
        <div class="foot">
          Palworld 1.0 · data verified against the game files · not affiliated with Pocketpair
        </div>
      </aside>
      <main class="main">
        {error && <div class="notebox">Failed to load data: {error}</div>}
        {!dataReady.value && !error && <div class="empty">Loading Paldex…</div>}
        {dataReady.value && (
          <Boundary key={page}>
            {page === 'calc' ? <CalculatorPage /> :
            page === 'paldex' ? <PaldexPage /> :
            page === 'plan' ? <PlanPage /> :
            page === 'odds' ? <OddsPage /> :
            page === 'map' ? <MapPage /> :
            <ReferencePage />}
          </Boundary>
        )}
      </main>
    </div>
  );
}
