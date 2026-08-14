/** Odds Lab UI — DOM-level checks without a browser (happy-dom).
 *
 * These are behavioral: build a pool from two parents, tick wanted passives,
 * and assert the rendered numbers equal the engine's closed-form output.
 */
// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from 'vitest';
import { render, fireEvent, screen, cleanup } from '@testing-library/preact';
import { OddsPage } from '../src/modules/odds';
import { passives } from '../src/state';
import type { PassiveInfo } from '../src/state';

const P = (name: string, extra: Partial<PassiveInfo> = {}): PassiveInfo => ({
  name,
  tier: 3,
  category: 'combat',
  effects: `${name} effect text`,
  breedable: true,
  breedable_known: true,
  mutation_exclusive: false,
  world_tree: false,
  exclusive_to: [],
  ...extra,
});

beforeEach(() => {
  cleanup();
  passives.value = [
    P('Swift'),
    P('Runner'),
    P('Nimble'),
    P('Legend', { exclusive_to: ['Paladius', 'Necromus'] }),
    P('Immortality', { mutation_exclusive: true, tier: 4 }),
  ];
});

async function addPassiveToParent(panelTitle: string, passiveName: string) {
  const panel = screen.getByRole('heading', { name: panelTitle }).closest('.parentpanel')!;
  const addBtn = panel.querySelector('.ppicker > button') as HTMLButtonElement;
  fireEvent.click(addBtn);
  const input = panel.querySelector('.ppicker input') as HTMLInputElement;
  fireEvent.input(input, { target: { value: passiveName } });
  const option = [...panel.querySelectorAll('[role=option]')]
    .find((b) => b.textContent!.includes(passiveName)) as HTMLButtonElement;
  fireEvent.click(option);
}

describe('Odds Lab page', () => {
  it('renders the three tabs and defaults to passives', () => {
    render(<OddsPage />);
    expect(screen.getByRole('tab', { name: 'Passive skills' })).toBeTruthy();
    expect(screen.getByRole('tab', { name: 'Stats (IVs)' })).toBeTruthy();
    expect(screen.getByRole('tab', { name: 'Cakes & mutation' })).toBeTruthy();
    expect(screen.getByText('The pool')).toBeTruthy();
  });

  it('builds a deduplicated pool and shows the right odds', async () => {
    render(<OddsPage />);
    await addPassiveToParent('Parent 1', 'Swift');
    await addPassiveToParent('Parent 2', 'Swift'); // duplicate — must merge
    await addPassiveToParent('Parent 2', 'Runner');

    // pool must show 2, not 3
    const summary = document.querySelector('.poolsum')!;
    expect(summary.textContent).toContain('Pool of 2');

    // tick Swift as wanted
    const item = [...document.querySelectorAll('.poolitem')]
      .find((el) => el.textContent!.includes('Swift'))!;
    fireEvent.click(item.querySelector('input')!);

    // pool 2, want 1: P = 0.4*(1/2) + (0.3+0.2+0.1)*1 = 0.8
    const hero = document.querySelector('.oddscard.hero b')!;
    expect(hero.textContent).toBe('80.0%');
  });

  it('shows the derived clean-pair table (40/24/12/10)', () => {
    render(<OddsPage />);
    const table = [...document.querySelectorAll('.otable')].at(-1)!;
    const cells = [...table.querySelectorAll('tbody b')].map((b) => b.textContent);
    expect(cells).toEqual(['40.0%', '24.0%', '12.0%', '10.0%']);
  });

  it('warns about boss-exclusive and mutation-only passives in the pool', async () => {
    render(<OddsPage />);
    await addPassiveToParent('Parent 1', 'Legend');
    expect(document.body.textContent).toContain('Legend is native to Paladius, Necromus');
    await addPassiveToParent('Parent 2', 'Immortality');
    expect(document.body.textContent).toContain('only appears on a mutated pal first');
  });

  it('computes IV odds for the selected stats', () => {
    render(<OddsPage />);
    fireEvent.click(screen.getByRole('tab', { name: 'Stats (IVs)' }));
    // default: one stat selected -> 5/9 = 55.6%
    expect(document.querySelector('.oddscard.hero b')!.textContent).toBe('55.6%');
    // select all three -> 1/6 = 16.7%
    fireEvent.click(screen.getByRole('button', { name: 'HP' }));
    fireEvent.click(screen.getByRole('button', { name: 'Defence' }));
    expect(document.querySelector('.oddscard.hero b')!.textContent).toBe('16.7%');
  });

  it('renders the cake table with the honest per-cycle math', () => {
    render(<OddsPage />);
    fireEvent.click(screen.getByRole('tab', { name: 'Cakes & mutation' }));
    const text = document.body.textContent!;
    expect(text).toContain('Vegetable Cake');
    // 1 - 0.99^2 as a per-cycle rate
    expect(text).toContain('1.99%');
    expect(text).toContain('The mutation-only passives');
    expect(text).toContain('Immortality');
  });
});
