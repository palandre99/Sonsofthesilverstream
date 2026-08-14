/** HatchLab app shell: sidebar navigation (bottom bar on mobile) + router. */
import './design/tokens.css';
import './design/app.css';
import { useEffect, useState } from 'preact/hooks';
import { dataReady, loadData, route, theme } from './state';
import { CalculatorPage } from './modules/calculator';
import { PaldexPage } from './modules/paldex';
import { BoxPage } from './modules/box';
import { PlanPage, ReferencePage } from './modules/misc';

const Logo = () => (
  <svg viewBox="0 0 32 40" aria-hidden="true">
    <path d="M16 2C9 2 3 14 3 24a13 13 0 0 0 26 0C29 14 23 2 16 2Z"
      fill="none" stroke="currentColor" stroke-width="2.6" />
    <path d="M10 22l4 4 3-6 3 5 2-3" fill="none" stroke="currentColor"
      stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" />
  </svg>
);

const icons = {
  calc: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="4" y="3" width="16" height="18" rx="3" /><path d="M8 8h8M8 12h3m5 0h0M8 16h3m5 0h0" stroke-linecap="round" /></svg>,
  plan: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 4v6a4 4 0 0 0 4 4h4" stroke-linecap="round" /><circle cx="6" cy="4" r="2" /><circle cx="18" cy="14" r="2" /><path d="M18 16v1a4 4 0 0 1-4 4H9" stroke-linecap="round" /><circle cx="7" cy="21" r="2" /></svg>,
  paldex: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9" /><path d="M3 12h6m6 0h6" /><circle cx="12" cy="12" r="3" /></svg>,
  box: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 8l8-4 8 4v8l-8 4-8-4Z" stroke-linejoin="round" /><path d="M4 8l8 4 8-4M12 12v8" /></svg>,
  ref: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 4h6a3 3 0 0 1 3 3v13a2 2 0 0 0-2-2H5Z" stroke-linejoin="round" /><path d="M19 4h-5a3 3 0 0 0-3 3v13a2 2 0 0 1 2-2h6Z" stroke-linejoin="round" /></svg>,
};

const NAV = [
  { hash: 'calc', label: 'Calculator', icon: icons.calc, match: 'calc' },
  { hash: 'plan', label: 'Route Planner', icon: icons.plan, match: 'plan' },
  { hash: 'paldex', label: 'Paldex', icon: icons.paldex, match: 'paldex' },
  { hash: 'box', label: 'My Box', icon: icons.box, match: 'box' },
  { hash: 'reference', label: 'Reference', icon: icons.ref, match: 'reference' },
];

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
          <b>HatchLab</b>
        </a>
        <nav class="nav" aria-label="Main">
          {NAV.map((n) => (
            <a href={`#/${n.hash}`} aria-current={page === n.match ? 'page' : undefined}>
              {n.icon}
              <span>{n.label}</span>
            </a>
          ))}
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
          page === 'calc' ? <CalculatorPage /> :
          page === 'paldex' ? <PaldexPage /> :
          page === 'box' ? <BoxPage /> :
          page === 'plan' ? <PlanPage /> :
          <ReferencePage />
        )}
      </main>
    </div>
  );
}
