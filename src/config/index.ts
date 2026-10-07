import defaults from './defaults.json';
import type { ConfigDescriptor, ConfigSource, GameConfig } from './types';

/**
 * Describes every constant: provenance (spec table vs. extension needed to make the
 * formulas runnable) and the range a sweep may explore. Extension constants are
 * deliberately marked so a reader can tell spec values from ours.
 */
export const CONFIG_DESCRIPTORS: ConfigDescriptor[] = [
  // --- spec §2 ---
  { key: 'CFG_TICK_MS', source: 'spec', section: '§2', min: 50, max: 1000, integer: true },
  { key: 'CFG_RENDER_FPS', source: 'spec', section: '§2', min: 10, max: 120, integer: true },
  { key: 'CFG_OFFLINE_CAP_H', source: 'spec', section: '§2', min: 0, max: 72 },
  { key: 'CFG_OFFLINE_EFF', source: 'spec', section: '§2', min: 0, max: 1 },
  { key: 'CFG_BASE_PICK', source: 'spec', section: '§2', min: 1, max: 100000 },
  { key: 'CFG_BASE_PACK', source: 'spec', section: '§2', min: 1, max: 100000 },
  { key: 'CFG_BASE_LOAD', source: 'spec', section: '§2', min: 1, max: 100000 },
  { key: 'CFG_BASE_ORDER_RATE', source: 'spec', section: '§2', min: 0, max: 1000 },
  { key: 'CFG_BASE_TRUCK_CAP', source: 'spec', section: '§2', min: 1, max: 10000 },
  { key: 'CFG_TRUCK_ARRIVAL_RATE', source: 'spec', section: '§2', min: 0, max: 100 },
  { key: 'CFG_COST_GROWTH', source: 'spec', section: '§2', min: 1.01, max: 3 },
  { key: 'CFG_COST_BASE', source: 'spec', section: '§2', min: 1, max: 1e9 },
  { key: 'CFG_VALUE_PER_ITEM', source: 'spec', section: '§2', min: 0, max: 1e6 },
  { key: 'CFG_ONTIME_BONUS', source: 'spec', section: '§2', min: 0, max: 5 },
  { key: 'CFG_REP_MULT_MAX', source: 'spec', section: '§2', min: 1, max: 10 },
  { key: 'CFG_ERR_BASE', source: 'spec', section: '§2', min: 0, max: 1 },
  { key: 'CFG_ONTIME_BASE', source: 'spec', section: '§2', min: 0, max: 1 },
  { key: 'CFG_PRESTIGE_K', source: 'spec', section: '§2', min: 1, max: 1e12 },
  { key: 'CFG_PRESTIGE_MIN', source: 'spec', section: '§2', min: 0, max: 1e12 },
  { key: 'CFG_SOP_BONUS_PER', source: 'spec', section: '§2', min: 0, max: 1 },

  // --- extensions: values the formulas require but §2 does not specify ---
  {
    key: 'CFG_STAGE_SLOTS_BASE',
    source: 'extension',
    section: '§3.1 (slot-based staging)',
    min: 1,
    max: 1000,
    integer: true,
  },
  {
    key: 'CFG_STAGE_TURNOVER_BASE',
    source: 'extension',
    section: '§3.1 (slot turnover/min)',
    min: 0.01,
    max: 1000,
  },
  {
    key: 'CFG_DOCK_COUNT_BASE',
    source: 'extension',
    section: '§5.1 (dock_count base)',
    min: 1,
    max: 100,
    integer: true,
  },
  {
    key: 'CFG_PALLET_ITEMS',
    source: 'extension',
    section: '§1 (trucks carry pallets)',
    min: 1,
    max: 1000,
    integer: true,
  },
  { key: 'CFG_ORDER_QTY_MIN', source: 'extension', section: '§1 (order items)', min: 1, max: 1000, integer: true },
  { key: 'CFG_ORDER_QTY_MAX', source: 'extension', section: '§1 (order items)', min: 1, max: 1000, integer: true },
  { key: 'CFG_RUSH_SHARE', source: 'extension', section: '§1 (order.priority)', min: 0, max: 1 },
  { key: 'CFG_TRUCK_WINDOW_S', source: 'extension', section: '§3.2 (window closes)', min: 1, max: 86400 },
  { key: 'CFG_TRUCK_MIN_FILL', source: 'extension', section: '§3.2 (depart rule)', min: 0, max: 1 },
  { key: 'CFG_STAFF_FACTOR_BASE', source: 'extension', section: '§3.1 (staff_factor)', min: 0, max: 100 },
  { key: 'CFG_AUTOMATION_FACTOR_BASE', source: 'extension', section: '§3.1 (automation_factor)', min: 0, max: 100 },
  { key: 'CFG_DISTANCE_REF_COST', source: 'extension', section: '§4 (inverse-distance)', min: 0.1, max: 100 },
  { key: 'CFG_REP_GAIN_RATE', source: 'extension', section: '§3.3 (reputation gain)', min: 0, max: 100 },
  { key: 'CFG_REP_DECAY_RATE', source: 'extension', section: '§3.3 (reputation decay)', min: 0, max: 100 },
  { key: 'CFG_OFFLINE_MIN_S', source: 'extension', section: '§3.4', min: 0, max: 3600 },
  { key: 'CFG_MAX_CATCHUP_TICKS', source: 'extension', section: '§3.2 (catch-up bound)', min: 1, max: 1e6, integer: true },
  { key: 'CFG_CALM_EFF', source: 'extension', section: '§9 (calm mode)', min: 0, max: 1 },
  { key: 'CFG_PRESTIGE_SOP_TIERS', source: 'spec', section: '§7', min: 1, max: 1e9, array: true },
];

export const CONFIG_KEYS: (keyof GameConfig)[] = CONFIG_DESCRIPTORS.map((d) => d.key);

export function descriptorFor(key: keyof GameConfig): ConfigDescriptor | undefined {
  return CONFIG_DESCRIPTORS.find((d) => d.key === key);
}

export function configSource(key: keyof GameConfig): ConfigSource {
  return descriptorFor(key)?.source ?? 'extension';
}

export class ConfigError extends Error {
  readonly problems: string[];

  constructor(problems: string[]) {
    super(`Invalid config: ${problems.join('; ')}`);
    this.name = 'ConfigError';
    this.problems = problems;
  }
}

function isPositiveFinite(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

/** Validates a candidate config against the descriptor table. Returns problem strings. */
export function validateConfig(candidate: unknown): string[] {
  const problems: string[] = [];
  if (typeof candidate !== 'object' || candidate === null) {
    return ['config must be an object'];
  }
  const record = candidate as Record<string, unknown>;

  for (const key of Object.keys(record)) {
    if (!CONFIG_KEYS.includes(key as keyof GameConfig)) {
      problems.push(`unknown config key ${key}`);
    }
  }

  for (const d of CONFIG_DESCRIPTORS) {
    const value = record[d.key];
    if (value === undefined) {
      problems.push(`missing ${d.key}`);
      continue;
    }
    if (d.array) {
      if (!Array.isArray(value) || value.length === 0) {
        problems.push(`${d.key} must be a non-empty array`);
        continue;
      }
      for (const item of value) {
        if (!isPositiveFinite(item) || item < d.min || item > d.max) {
          problems.push(`${d.key} entry out of range [${d.min}, ${d.max}]`);
        }
      }
      continue;
    }
    if (!isPositiveFinite(value)) {
      problems.push(`${d.key} must be a finite number`);
      continue;
    }
    if (value < d.min || value > d.max) {
      problems.push(`${d.key}=${value} out of range [${d.min}, ${d.max}]`);
    }
    if (d.integer && !Number.isInteger(value)) {
      problems.push(`${d.key}=${value} must be an integer`);
    }
  }

  if (record.CFG_ORDER_QTY_MIN !== undefined && record.CFG_ORDER_QTY_MAX !== undefined) {
    if ((record.CFG_ORDER_QTY_MIN as number) > (record.CFG_ORDER_QTY_MAX as number)) {
      problems.push('CFG_ORDER_QTY_MIN must be <= CFG_ORDER_QTY_MAX');
    }
  }
  if (record.CFG_PRESTIGE_MIN !== undefined && record.CFG_PRESTIGE_K !== undefined) {
    if ((record.CFG_PRESTIGE_MIN as number) > (record.CFG_PRESTIGE_K as number)) {
      problems.push('CFG_PRESTIGE_MIN must be <= CFG_PRESTIGE_K');
    }
  }

  return problems;
}

/** Loads the shipped defaults, validating them before handing them out. */
export function loadConfig(): GameConfig {
  const problems = validateConfig(defaults);
  if (problems.length > 0) throw new ConfigError(problems);
  return structuredClone(defaults) as GameConfig;
}

/** Applies a partial override set (used by the balance sweep and tests). */
export function withOverrides(base: GameConfig, overrides: Partial<GameConfig>): GameConfig {
  const merged = { ...structuredClone(base), ...structuredClone(overrides) };
  const problems = validateConfig(merged);
  if (problems.length > 0) throw new ConfigError(problems);
  return merged;
}
