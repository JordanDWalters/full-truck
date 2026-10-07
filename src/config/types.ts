/**
 * Types for the CFG_ layer (docs/SPEC.md §2). The values themselves live in
 * defaults.json; this file only describes their shape and provenance.
 */

/** Whether a constant was transcribed from the §2 table or added to make the formulas runnable. */
export type ConfigSource = 'spec' | 'extension';

/**
 * Provenance and sweep bounds for one constant. `min`/`max` bound what a balance
 * sweep may explore; `integer` and `array` describe the value's shape.
 */
export interface ConfigDescriptor {
  key: keyof GameConfig;
  source: ConfigSource;
  /** Spec section the value is transcribed from, or the section it supports. */
  section: string;
  min: number;
  max: number;
  integer?: boolean;
  array?: boolean;
}

/**
 * Every tunable in the game, mirroring src/config/defaults.json one-for-one.
 * A key present in one and not the other fails tests/config.test.ts.
 */
export interface GameConfig {
  // --- §2 Configuration Constants ---
  CFG_TICK_MS: number;
  CFG_RENDER_FPS: number;
  CFG_OFFLINE_CAP_H: number;
  CFG_OFFLINE_EFF: number;

  CFG_BASE_PICK: number;
  CFG_BASE_PACK: number;
  CFG_BASE_LOAD: number;
  CFG_BASE_ORDER_RATE: number;
  CFG_BASE_TRUCK_CAP: number;
  CFG_TRUCK_ARRIVAL_RATE: number;

  CFG_COST_GROWTH: number;
  CFG_COST_BASE: number;

  CFG_VALUE_PER_ITEM: number;
  CFG_ONTIME_BONUS: number;
  CFG_REP_MULT_MAX: number;

  CFG_ERR_BASE: number;
  CFG_ONTIME_BASE: number;

  CFG_PRESTIGE_K: number;
  CFG_PRESTIGE_MIN: number;
  CFG_SOP_BONUS_PER: number;

  // --- extensions: required by §3/§4/§5 but not listed in §2 ---
  CFG_STAGE_SLOTS_BASE: number;
  CFG_STAGE_TURNOVER_BASE: number;
  CFG_DOCK_COUNT_BASE: number;
  CFG_PALLET_ITEMS: number;

  CFG_ORDER_QTY_MIN: number;
  CFG_ORDER_QTY_MAX: number;
  CFG_RUSH_SHARE: number;

  CFG_TRUCK_WINDOW_S: number;
  CFG_TRUCK_MIN_FILL: number;

  CFG_STAFF_FACTOR_BASE: number;
  CFG_AUTOMATION_FACTOR_BASE: number;
  CFG_DISTANCE_REF_COST: number;

  CFG_REP_GAIN_RATE: number;
  CFG_REP_DECAY_RATE: number;

  CFG_OFFLINE_MIN_S: number;
  CFG_MAX_CATCHUP_TICKS: number;
  CFG_CALM_EFF: number;
  CFG_PRESTIGE_SOP_TIERS: number[];
}
