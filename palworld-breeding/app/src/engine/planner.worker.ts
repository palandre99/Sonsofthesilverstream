/** Web Worker wrapper for the route planner.
 *
 * Route planning is a CPU-bound fixpoint over ~299 species; on a big target
 * set it takes seconds. Running it here keeps the UI thread free. The worker
 * builds its own engine from the data it is sent once, then answers plan
 * requests, cancelling stale ones by id.
 */
import { BreedingEngine } from './formula';
import { planFor } from './planner';
import type { BreedingData, PlanStep } from './types';

export interface PlanRequest {
  type: 'plan';
  id: number;
  roster: string[];
  targets: string[];
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
  ms: number;
}

export interface PlanError {
  type: 'error';
  id: number;
  message: string;
}

let engine: BreedingEngine | null = null;
let latest = 0;

self.onmessage = (ev: MessageEvent<InitMessage | PlanRequest>) => {
  const msg = ev.data;
  if (msg.type === 'init') {
    engine = new BreedingEngine(msg.data);
    return;
  }
  if (msg.type === 'plan') {
    latest = msg.id;
    if (!engine) {
      post({ type: 'error', id: msg.id, message: 'worker not initialised' });
      return;
    }
    const t0 = performance.now();
    try {
      const { steps, unreachable } = planFor(engine, msg.roster, msg.targets);
      // a newer request may have arrived while we were computing
      if (msg.id !== latest) return;
      post({ type: 'result', id: msg.id, steps, unreachable, ms: performance.now() - t0 });
    } catch (e) {
      if (msg.id !== latest) return;
      post({ type: 'error', id: msg.id, message: String(e) });
    }
  }
};

function post(m: PlanResponse | PlanError): void {
  (self as unknown as Worker).postMessage(m);
}
