/** Web Worker wrapper for the route planner.
 *
 * Route planning is a CPU-bound fixpoint over ~299 species; on a big target
 * set it takes seconds. Running it here keeps the UI thread free. The worker
 * builds its own engine from the data it is sent once, then answers every
 * plan request in order — being single-threaded it cannot abandon a
 * computation midway, so "cancellation" lives client-side: the client matches
 * responses to requests by id and simply ignores ones it no longer wants.
 */
import { BreedingEngine } from './formula';
import { derivations, planFor } from './planner';
import { helperAdvice, type HelperAdvice } from './helpers';
import type { BreedingData, PlanStep } from './types';

export interface PlanRequest {
  type: 'plan';
  id: number;
  roster: string[];
  targets: string[];
  /** the CURRENT box (may be richer than roster) — used for helper advice */
  ownedNames?: string[];
}

export interface InitMessage {
  type: 'init';
  data: BreedingData;
}

export interface PlanResponse {
  type: 'result';
  id: number;
  steps: PlanStep[];
  unreachable: string[];
  advice: HelperAdvice[];
  ms: number;
}

export interface PlanError {
  type: 'error';
  id: number;
  message: string;
}

let engine: BreedingEngine | null = null;

self.onmessage = (ev: MessageEvent<InitMessage | PlanRequest>) => {
  const msg = ev.data;
  if (msg.type === 'init') {
    engine = new BreedingEngine(msg.data);
    return;
  }
  if (msg.type === 'plan') {
    if (!engine) {
      post({ type: 'error', id: msg.id, message: 'worker not initialised' });
      return;
    }
    const t0 = performance.now();
    try {
      // one derivations pass serves the plan AND the helper advice, so the
      // UI can render steps and recommendations in the same frame
      const derivs = derivations(engine, new Set(msg.roster));
      const { steps, unreachable } = planFor(engine, msg.roster, msg.targets, derivs);
      const owned = msg.ownedNames ?? msg.roster;
      const ownedSet = new Set(owned);
      const advice = helperAdvice(engine, owned, (n) => ownedSet.has(n),
        { targets: msg.targets, steps, roster: msg.roster }, derivs);
      post({
        type: 'result', id: msg.id, steps, unreachable, advice,
        ms: performance.now() - t0,
      });
    } catch (e) {
      post({ type: 'error', id: msg.id, message: String(e) });
    }
  }
};

function post(m: PlanResponse | PlanError): void {
  (self as unknown as Worker).postMessage(m);
}
