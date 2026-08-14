/** Route Planner UI — worker fallback, persistence, per-target progress. */
// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/preact';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PlanPage } from '../src/modules/plan';
import { BreedingEngine } from '../src/engine/formula';
import { initPlanner } from '../src/engine/planClient';
import { stepId } from '../src/engine/planner';
import * as state from '../src/state';
import type { BreedingData } from '../src/engine/types';

const data = JSON.parse(
  readFileSync(join(__dirname, '../public/data/breeding_1_0.json'), 'utf8'),
) as BreedingData;
const palsJson = JSON.parse(
  readFileSync(join(__dirname, '../public/data/pals_1_0.json'), 'utf8'),
) as { pals: Record<string, state.PalInfo> };

beforeEach(() => {
  cleanup();
  localStorage.clear();
  // happy-dom has no real Worker with module URLs — force the sync path,
  // which is exactly what the single-file build uses
  (window as unknown as { __HATCHLAB_EMBED?: unknown }).__HATCHLAB_EMBED = undefined;
  vi.stubGlobal('Worker', undefined);
  state.setEngine(new BreedingEngine(data));
  initPlanner(data);
  state.pals.value = palsJson.pals;
  state.box.value = {
    Lamball: { m: true, f: true },
    Cattiva: { m: true, f: true },
    Chikipi: { m: true, f: true },
    Foxparks: { m: true, f: true },
    Pengullet: { m: true, f: true },
  };
});

describe('Route Planner', () => {
  it('plans through the client (sync fallback) and persists the result', async () => {
    render(<PlanPage />);
    // add a modest reachable target via the picker
    fireEvent.click(document.querySelector('.picker > button')!);
    const input = document.querySelector('.picker input') as HTMLInputElement;
    fireEvent.input(input, { target: { value: 'Fuack' } });
    const opt = [...document.querySelectorAll('[role=option]')]
      .find((b) => b.textContent!.includes('Fuack'))!;
    fireEvent.click(opt);

    fireEvent.click(screen.getByRole('button', { name: /Plan 1 targets/ }));
    await waitFor(() => {
      expect(document.querySelector('.boxstats')).toBeTruthy();
    }, { timeout: 8000 });

    // persisted for the next visit
    const savedRaw = localStorage.getItem('hatchlab-plan-v1');
    expect(savedRaw).toBeTruthy();
    const saved = JSON.parse(savedRaw!);
    expect(saved.targets).toEqual(['Fuack']);
    expect(saved.steps.length).toBeGreaterThan(0);

    // goal progress section rendered with our target
    expect(document.body.textContent).toContain('Goal progress');
    expect(document.querySelector('.goalrow .gname')!.textContent).toBe('Fuack');
  }, 20000);

  it('restores a saved plan on mount without re-planning', () => {
    const steps = [{
      wave: 1, parents: ['Lamball', 'Cattiva'] as [string, string], child: 'Chikipi',
      kind: 'generic' as const, tieBreak: false, margin: 2, genderNote: null,
      isTarget: true, neededBy: ['Chikipi'], reusedAsParent: 0,
    }];
    localStorage.setItem('hatchlab-plan-v1', JSON.stringify({
      targets: ['Chikipi'], steps, unreachable: [], planned: '2026-08-14',
    }));
    render(<PlanPage />);
    expect(document.body.textContent).toContain('breeding steps');
    expect(document.body.textContent).toContain('Goal progress');
  });

  it('ticking asks for genders, registers the pal, and is reversible', () => {
    const steps = [{
      wave: 1, parents: ['Lamball', 'Cattiva'] as [string, string], child: 'Chikipi',
      kind: 'generic' as const, tieBreak: false, margin: 2, genderNote: null,
      isTarget: true, neededBy: ['Chikipi'], reusedAsParent: 0,
    }];
    localStorage.setItem('hatchlab-plan-v1', JSON.stringify({
      targets: ['Chikipi'], steps, unreachable: [], planned: '2026-08-14',
    }));
    render(<PlanPage />);
    const tick = document.querySelector('.tick input') as HTMLInputElement;
    fireEvent.change(tick, { target: { checked: true } });

    // the hatch dialog opens instead of instantly checking
    expect(document.body.textContent).toContain('Hatched Chikipi!');
    fireEvent.click(screen.getByRole('button', { name: '♂ + ♀ both' }));

    // goal complete, check persisted WITH genders, and the pal is now owned —
    // one tick, no double registration
    expect(document.querySelector('.goalrow')!.className).toContain('complete');
    const checks = JSON.parse(localStorage.getItem('hatchlab-plan-checks-v1')!);
    const c = checks[stepId('Lamball', 'Cattiva', 'Chikipi')];
    expect(c).toEqual({ m: true, f: true, addedM: false, addedF: false });
    // (Chikipi was pre-owned in this fixture box, so nothing was "added" —
    // meaning untick must NOT remove it)
    fireEvent.change(document.querySelector('.tick input') as HTMLInputElement,
      { target: { checked: false } });
    expect(state.box.value['Chikipi']).toEqual({ m: true, f: true });
  });

  it('untick removes exactly what the tick added', () => {
    const steps = [{
      wave: 1, parents: ['Lamball', 'Cattiva'] as [string, string], child: 'Hoocrates',
      kind: 'generic' as const, tieBreak: false, margin: 2, genderNote: null,
      isTarget: true, neededBy: ['Hoocrates'], reusedAsParent: 0,
    }];
    localStorage.setItem('hatchlab-plan-v1', JSON.stringify({
      targets: ['Hoocrates'], steps, unreachable: [], planned: '2026-08-14',
    }));
    render(<PlanPage />);
    expect(state.box.value['Hoocrates']).toBeUndefined();
    fireEvent.change(document.querySelector('.tick input') as HTMLInputElement,
      { target: { checked: true } });
    fireEvent.click(screen.getByRole('button', { name: '♀ only' }));
    // registered from the tick
    expect(state.box.value['Hoocrates']).toEqual({ m: false, f: true });
    // untick reverses it completely (it was added by the tick)
    fireEvent.change(document.querySelector('.tick input') as HTMLInputElement,
      { target: { checked: false } });
    expect(state.box.value['Hoocrates']).toBeUndefined();
  });
});
