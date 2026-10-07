import type { GameConfig } from '../config/types';
import { initialRngState } from './rng';
import {
  emptyCounters,
  emptyMetrics,
  emptyPipeline,
  type Layout,
  type SimState,
  type Warehouse,
} from './entities';

/** Starting layout from docs/SPEC.md §4: two storage zones feeding one dock. */
export function startingLayout(config: GameConfig): Layout {
  return {
    zones: [
      { id: 'z1', type: 'storage', capacity: 200, demandWeight: 0.6 },
      { id: 'z2', type: 'storage', capacity: 200, demandWeight: 0.4 },
      { id: 'dock0', type: 'dock', capacity: config.CFG_BASE_TRUCK_CAP, demandWeight: 0, loadRate: config.CFG_BASE_LOAD },
    ],
    edges: [
      { from: 'z1', to: 'dock0', cost: 1 },
      { from: 'z2', to: 'dock0', cost: 3 },
    ],
  };
}

/** Blueprints owned at the start: the tier-0 base line of each category (§5.3). */
export const STARTING_BLUEPRINTS = ['pick_paper', 'pack_manual', 'load_jack'] as const;

export function startingWarehouse(config: GameConfig, id = 'wh_001'): Warehouse {
  return {
    id,
    tier: 1,
    sop: 0,
    reputation: 0,
    credits: 0,
    efficiency: 0,
    onTimeScore: 0,
    unlocked: [...STARTING_BLUEPRINTS],
    upgrades: {},
    layout: startingLayout(config),
    stats: emptyMetrics(),
    counters: emptyCounters(),
    peakEfficiency: 0,
    simTimeS: 0,
    tick: 0,
  };
}

export function startingState(config: GameConfig, seed: string): SimState {
  return {
    seed,
    // The seed's own RNG state, so a save made before the first tick resumes the same sequence.
    rngState: initialRngState(seed),
    warehouse: startingWarehouse(config),
    pipeline: emptyPipeline(),
    trucks: [],
  };
}
