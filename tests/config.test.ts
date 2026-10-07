import { describe, expect, it } from 'vitest';

import {
  CONFIG_DESCRIPTORS,
  ConfigError,
  loadConfig,
  validateConfig,
  withOverrides,
} from '../src/config';
import type { GameConfig } from '../src/config/types';

/** Values transcribed from docs/SPEC.md §2. If one of these changes, the spec changed. */
const SPEC_VALUES: Partial<Record<keyof GameConfig, number | number[]>> = {
  CFG_TICK_MS: 250,
  CFG_RENDER_FPS: 30,
  CFG_OFFLINE_CAP_H: 8,
  CFG_OFFLINE_EFF: 0.5,
  CFG_BASE_PICK: 30,
  CFG_BASE_PACK: 40,
  CFG_BASE_LOAD: 60,
  CFG_BASE_ORDER_RATE: 6,
  CFG_BASE_TRUCK_CAP: 40,
  CFG_TRUCK_ARRIVAL_RATE: 1.2,
  CFG_COST_GROWTH: 1.18,
  CFG_COST_BASE: 50,
  CFG_VALUE_PER_ITEM: 5,
  CFG_ONTIME_BONUS: 0.5,
  CFG_REP_MULT_MAX: 2.0,
  CFG_ERR_BASE: 0.12,
  CFG_ONTIME_BASE: 0.4,
  CFG_PRESTIGE_K: 1e6,
  CFG_PRESTIGE_MIN: 1e5,
  CFG_SOP_BONUS_PER: 0.05,
  CFG_PRESTIGE_SOP_TIERS: [10, 100, 1000],
};

describe('config: spec constants (§2)', () => {
  const config = loadConfig();

  for (const [key, expected] of Object.entries(SPEC_VALUES)) {
    it(`${key} matches the spec table`, () => {
      expect(config[key as keyof GameConfig]).toEqual(expected);
    });
  }

  it('pipeline ratios are the designed pick:pack:load = 30:40:60', () => {
    expect([config.CFG_BASE_PICK, config.CFG_BASE_PACK, config.CFG_BASE_LOAD]).toEqual([30, 40, 60]);
  });
});

describe('config: descriptors and validation', () => {
  it('every key in defaults.json has a descriptor', () => {
    const config = loadConfig();
    const described = new Set(CONFIG_DESCRIPTORS.map((d) => d.key));
    for (const key of Object.keys(config)) {
      expect(described.has(key as keyof GameConfig), `undocumented key ${key}`).toBe(true);
    }
  });

  it('every descriptor is labelled spec or extension', () => {
    for (const d of CONFIG_DESCRIPTORS) {
      expect(['spec', 'extension']).toContain(d.source);
      expect(d.section).toMatch(/^§/);
    }
  });

  it('rejects out-of-range values with a named problem', () => {
    const problems = validateConfig({ ...loadConfig(), CFG_COST_GROWTH: 0.5 });
    expect(problems).toContain('CFG_COST_GROWTH=0.5 out of range [1.01, 3]');
  });

  it('rejects unknown keys so typos cannot silently no-op', () => {
    const problems = validateConfig({ ...loadConfig(), CFG_BASE_PIKC: 30 });
    expect(problems).toContain('unknown config key CFG_BASE_PIKC');
  });

  it('rejects missing keys', () => {
    const partial = { ...loadConfig() } as Partial<GameConfig>;
    delete partial.CFG_BASE_PACK;
    expect(validateConfig(partial)).toContain('missing CFG_BASE_PACK');
  });

  it('rejects non-integer tick length', () => {
    expect(validateConfig({ ...loadConfig(), CFG_TICK_MS: 250.5 })).toContain(
      'CFG_TICK_MS=250.5 must be an integer',
    );
  });

  it('rejects contradictory order quantity bounds', () => {
    expect(
      validateConfig({ ...loadConfig(), CFG_ORDER_QTY_MIN: 20, CFG_ORDER_QTY_MAX: 5 }),
    ).toContain('CFG_ORDER_QTY_MIN must be <= CFG_ORDER_QTY_MAX');
  });

  it('loadConfig throws rather than handing out a broken config', () => {
    expect(() => withOverrides(loadConfig(), { CFG_ERR_BASE: 1.5 })).toThrow(ConfigError);
  });

  it('withOverrides returns a validated copy and leaves the base untouched', () => {
    const base = loadConfig();
    const tuned = withOverrides(base, { CFG_VALUE_PER_ITEM: 8 });
    expect(tuned.CFG_VALUE_PER_ITEM).toBe(8);
    expect(base.CFG_VALUE_PER_ITEM).toBe(5);
  });

  it('loadConfig returns a defensive copy', () => {
    const a = loadConfig();
    a.CFG_BASE_PICK = 999;
    expect(loadConfig().CFG_BASE_PICK).toBe(30);
  });
});
