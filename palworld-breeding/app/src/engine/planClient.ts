/** Client for the planner worker, with a synchronous fallback.
 *
 * The dev/hosted build runs planning in a real Web Worker (separate chunk).
 * The single-file build (HatchLab-app.html) has no separate chunk to load, so
 * it computes on the main thread after a paint-friendly yield — same results,
 * still cancel-safe via request ids.
 */
import { BreedingEngine } from './formula';
import { planFor } from './planner';
import type { BreedingData, PlanStep } from './types';
import type { PlanError, PlanResponse } from './planner.worker';

export interface PlanOutcome {
  steps: PlanStep[];
  unreachable: string[];
  ms: number;
}

type Resolver = {
  resolve: (r: PlanOutcome) => void;
  reject: (e: Error) => void;
};

let worker: Worker | null = null;
let workerBroken = false;
let inited = false;
let nextId = 1;
const pending = new Map<number, Resolver>();
let fallbackEngine: BreedingEngine | null = null;
let fallbackData: BreedingData | null = null;

function getWorker(): Worker | null {
  if (workerBroken) return null;
  if (worker) return worker;
  // no Worker outside a browser; the single-file build has no chunk to fetch
  if (typeof window === 'undefined' || typeof Worker === 'undefined'
    || (window as unknown as { __HATCHLAB_EMBED?: unknown }).__HATCHLAB_EMBED) {
    workerBroken = true;
    return null;
  }
  try {
    worker = new Worker(new URL('./planner.worker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = (ev: MessageEvent<PlanResponse | PlanError>) => {
      const msg = ev.data;
      const p = pending.get(msg.id);
      if (!p) return;
      pending.delete(msg.id);
      if (msg.type === 'result') {
        p.resolve({ steps: msg.steps, unreachable: msg.unreachable, ms: msg.ms });
      } else {
        p.reject(new Error(msg.message));
      }
    };
    worker.onerror = () => {
      // e.g. single-file build: chunk missing. Fail over to sync for everything.
      workerBroken = true;
      const err = new Error('planner worker failed to load');
      for (const [, p] of pending) p.reject(err);
      pending.clear();
      worker?.terminate();
      worker = null;
    };
    return worker;
  } catch {
    workerBroken = true;
    return null;
  }
}

/** Must be called once after the breeding data loads. */
export function initPlanner(data: BreedingData): void {
  fallbackData = data;
  fallbackEngine = null; // built lazily only if the sync path is used
  const w = getWorker();
  if (w) w.postMessage({ type: 'init', data });
  inited = true;
}

function planSync(roster: string[], targets: string[]): PlanOutcome {
  if (!fallbackEngine) {
    if (!fallbackData) throw new Error('planner not initialised');
    fallbackEngine = new BreedingEngine(fallbackData);
  }
  const t0 = performance.now();
  const { steps, unreachable } = planFor(fallbackEngine, roster, targets);
  return { steps, unreachable, ms: performance.now() - t0 };
}

/** Plan in the worker when possible, otherwise synchronously after a yield. */
export function requestPlan(roster: string[], targets: string[]): Promise<PlanOutcome> {
  if (!inited) return Promise.reject(new Error('planner not initialised'));
  const id = nextId++;
  const w = getWorker();
  if (w) {
    return new Promise<PlanOutcome>((resolve, reject) => {
      pending.set(id, { resolve, reject });
      w.postMessage({ type: 'plan', id, roster, targets });
    }).catch((e) => {
      // worker died mid-request — recompute synchronously so the user still
      // gets their plan
      if (workerBroken) {
        return new Promise<PlanOutcome>((resolve) => {
          setTimeout(() => resolve(planSync(roster, targets)), 30);
        });
      }
      throw e;
    });
  }
  return new Promise<PlanOutcome>((resolve, reject) => {
    // one macrotask of delay so the button's busy state can paint first
    setTimeout(() => {
      try {
        resolve(planSync(roster, targets));
      } catch (e) {
        reject(e as Error);
      }
    }, 30);
  });
}
