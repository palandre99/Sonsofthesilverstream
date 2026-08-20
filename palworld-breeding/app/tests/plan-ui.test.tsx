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
  state.clearDraftTargets(); // module-level draft must not leak across tests
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

// 20s budget for the whole file: these tests mount the full PlanPage with the
// real engine, and the default 5s flakes under load (dev servers, CI) — the
// heaviest test here always carried 20s; the rest deserve the same.
describe('Route Planner', { timeout: 20000 }, () => {
  it('plans through the client (sync fallback) and persists the result', async () => {
    render(<PlanPage />);
    // add a modest reachable target via the picker
    fireEvent.click(document.querySelector('.picker > button')!);
    const input = document.querySelector('.picker input') as HTMLInputElement;
    fireEvent.input(input, { target: { value: 'Fuack' } });
    const opt = [...document.querySelectorAll('[role=option]')]
      .find((b) => b.textContent!.includes('Fuack'))!;
    fireEvent.click(opt);

    // "1 target", not "1 targets" — the CEO banned "1 steps"/"1 cakes"
    // grammar and the web button still had it
    fireEvent.click(screen.getByRole('button', { name: /Plan 1 target$/ }));
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
    fireEvent.click(screen.getByRole('button', { name: 'Both male and female' }));

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

  it('Start over undoes all ticks properly; Clear plan keeps the collection', () => {
    const steps = [{
      wave: 1, parents: ['Lamball', 'Cattiva'] as [string, string], child: 'Hoocrates',
      kind: 'generic' as const, tieBreak: false, margin: 2, genderNote: null,
      isTarget: true, neededBy: ['Hoocrates'], reusedAsParent: 0,
    }];
    localStorage.setItem('hatchlab-plan-v1', JSON.stringify({
      targets: ['Hoocrates'], steps, unreachable: [], planned: '2026-08-14',
    }));
    render(<PlanPage />);
    // hatch it via the tick
    fireEvent.change(document.querySelector('.tick input') as HTMLInputElement,
      { target: { checked: true } });
    fireEvent.click(screen.getByRole('button', { name: 'Both male and female' }));
    expect(state.box.value['Hoocrates']).toEqual({ m: true, f: true });

    // Start over: tick-registered pal is removed again
    fireEvent.click(screen.getByRole('button', { name: 'Start over' }));
    fireEvent.click(screen.getAllByRole('button', { name: 'Start over' }).at(-1)!);
    expect(state.box.value['Hoocrates']).toBeUndefined();
    expect(JSON.parse(localStorage.getItem('hatchlab-plan-checks-v1')!)).toEqual({});

    // Clear plan: the plan disappears, the pre-owned collection stays
    fireEvent.click(screen.getByRole('button', { name: 'Clear plan' }));
    fireEvent.click(screen.getAllByRole('button', { name: 'Clear plan' }).at(-1)!);
    expect(document.querySelector('.tick')).toBeNull();
    expect(document.body.textContent).not.toContain('Goal progress');
    expect(state.box.value['Lamball']).toEqual({ m: true, f: true });
  });

  it('Escape backs out of the confirm dialog without destroying the plan', () => {
    const steps = [{
      wave: 1, parents: ['Lamball', 'Cattiva'] as [string, string], child: 'Chikipi',
      kind: 'generic' as const, tieBreak: false, margin: 2, genderNote: null,
      isTarget: true, neededBy: ['Chikipi'], reusedAsParent: 0,
    }];
    localStorage.setItem('hatchlab-plan-v1', JSON.stringify({
      targets: ['Chikipi'], steps, unreachable: [], planned: '2026-08-14',
    }));
    render(<PlanPage />);
    fireEvent.click(screen.getByRole('button', { name: 'Clear plan' }));
    // the dialog announces the question it asks, not a bare "dialog"
    expect(screen.getByRole('dialog', { name: 'Clear the plan?' })).toBeTruthy();

    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
    // Escape must CANCEL, never confirm — the plan is still here
    expect(document.body.textContent).toContain('Goal progress');
  });

  it('un-adding a goal sticks — even after leaving the page and returning', () => {
    // the CEO's bug: goals added from the suggestions sheet could not be
    // un-added, and removals were resurrected by a page remount
    state.addDraftTargets(['Fuack', 'Hoocrates']);
    const first = render(<PlanPage />);
    expect(screen.getByRole('button', { name: 'Remove Fuack' })).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Remove Fuack' }));
    expect(screen.queryByRole('button', { name: 'Remove Fuack' })).toBeNull();

    // leave the Plan page and come back — the removal must stick and the
    // remaining goal must survive
    first.unmount();
    render(<PlanPage />);
    expect(screen.queryByRole('button', { name: 'Remove Fuack' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Remove Hoocrates' })).toBeTruthy();
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
    fireEvent.click(screen.getByRole('button', { name: 'Female only' }));
    // registered from the tick
    expect(state.box.value['Hoocrates']).toEqual({ m: false, f: true });
    // clicking a PARTIAL tick offers complete-or-untick; untick reverses it
    fireEvent.change(document.querySelector('.tick input') as HTMLInputElement,
      { target: { checked: false } });
    expect(document.body.textContent).toContain('Complete Hoocrates?');
    fireEvent.click(screen.getByRole('button', { name: 'Untick step' }));
    expect(state.box.value['Hoocrates']).toBeUndefined();
  });
});
