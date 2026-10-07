import { describe, expect, it } from 'vitest';

import { loadConfig } from '../src/config';
import { SAVE_FORMAT, SAVE_VERSION, SaveError, deserializeSave, loadState, memoryStore, saveState, serializeSave, validateSave } from '../src/sim/save';
import { createRng, initialRngState, restoreRng } from '../src/sim/rng';
import { startingState } from '../src/sim/initial';
import type { SimState } from '../src/sim/entities';
import { SAVE_KEY, webStorageStore } from '../src/platform/storage';

function sampleState(): SimState {
  return startingState(loadConfig(), 'seed-42');
}

/** Mutates a parsed envelope in place; used to build invalid saves. */
function tamper(envelope: unknown, mutate: (value: Record<string, any>) => void): unknown {
  mutate(envelope as Record<string, any>);
  return envelope;
}

describe('save: round-trip', () => {
  it('a starting state survives serialize -> deserialize unchanged', () => {
    const state = sampleState();
    const raw = serializeSave(state, 1_700_000_000_000);
    const envelope = deserializeSave(raw);
    expect(envelope.state).toEqual(state);
    expect(envelope.format).toBe(SAVE_FORMAT);
    expect(envelope.version).toBe(SAVE_VERSION);
    expect(envelope.savedAtMs).toBe(1_700_000_000_000);
  });

  it('a state with in-flight orders and trucks survives the round-trip', () => {
    const state = sampleState();
    state.warehouse.credits = 1234.5;
    state.warehouse.upgrades['pick_conveyor'] = 3;
    state.pipeline.orderQueue.push({
      id: 'ord_1',
      items: [{ sku: 'snack', qty: 12 }, { sku: 'elec', qty: 4 }],
      priority: 1,
      truckId: null,
      state: 'queued',
      createdAtS: 12.5,
      itemCount: 16,
    });
    state.pipeline.activePicks.push({ orderId: 'ord_1', picked: 4 });
    state.pipeline.carry.pick = 0.25;
    state.trucks.push({
      id: 'trk_17',
      dock: 0,
      capacity: 40,
      loaded: 12,
      routeOrder: ['A', 'B'],
      eta: 0,
      state: 'loading',
      windowOpenedS: 100,
      deadlineS: 220,
      shippedPallets: 0,
      shippedItems: 0,
      onTime: false,
    });
    const raw = serializeSave(state, 1_700_000_000_000);
    expect(deserializeSave(raw).state).toEqual(state);
  });

  it('loadState returns null for an empty store and the state after saveState', () => {
    const store = memoryStore();
    expect(loadState(store)).toBeNull();
    const state = sampleState();
    saveState(store, state, 1_700_000_000_000);
    expect(loadState(store)).toEqual(state);
    store.clear();
    expect(loadState(store)).toBeNull();
  });
});

describe('save: determinism (spec §0 "deterministic given seed")', () => {
  it('a restored RNG continues the same sequence as an uninterrupted one', () => {
    const rng = createRng('seed-42');
    for (let i = 0; i < 25; i++) rng.next();
    const savedState = rng.state();
    const expected = [rng.next(), rng.next(), rng.next()];

    const resumed = restoreRng(savedState);
    expect([resumed.next(), resumed.next(), resumed.next()]).toEqual(expected);
  });

  it('a saved SimState carries the RNG state, so resuming reproduces the run', () => {
    const state = sampleState();
    const rng = createRng(state.seed);
    for (let i = 0; i < 50; i++) {
      state.rngState = rng.state();
      rng.nextInt(1, 100);
    }
    const restored = deserializeSave(serializeSave(state, 0)).state;
    const resumed = restoreRng(restored.rngState);
    const direct = restoreRng(state.rngState);
    const fromResumed = Array.from({ length: 10 }, () => resumed.next());
    const fromDirect = Array.from({ length: 10 }, () => direct.next());
    expect(fromResumed).toEqual(fromDirect);
  });

  it('serializing the same state twice produces byte-identical output', () => {
    const state = sampleState();
    expect(serializeSave(state, 5)).toBe(serializeSave(state, 5));
  });

  it('a save written before the first tick resumes the seed run, not a re-seeded one', () => {
    const state = sampleState();
    const uninterrupted = createRng(state.seed);
    const resumed = restoreRng(deserializeSave(serializeSave(state, 0)).state.rngState);
    const fromUninterrupted = Array.from({ length: 20 }, () => uninterrupted.next());
    const fromResumed = Array.from({ length: 20 }, () => resumed.next());
    expect(fromResumed).toEqual(fromUninterrupted);
  });

  it('startingState carries the seed RNG state, and seeds give distinct states', () => {
    const config = loadConfig();
    expect(startingState(config, 'seed-42').rngState).toBe(initialRngState('seed-42'));
    expect(startingState(config, 'seed-42').rngState).toBe(startingState(config, 'seed-42').rngState);
    expect(startingState(config, 'seed-43').rngState).not.toBe(startingState(config, 'seed-42').rngState);
  });

  it('a zero RNG state normalizes to the same sequence as a zero seed', () => {
    expect(restoreRng(0).next()).toBe(createRng(0).next());
  });
});

describe('save: corrupt-save rejection', () => {
  it('rejects malformed JSON with a SaveError', () => {
    expect(() => deserializeSave('{not json')).toThrow(SaveError);
  });

  it('rejects a foreign JSON blob by format, not by field', () => {
    const problems = validateSave({ hello: 'world' });
    expect(problems).toContain(`format must be ${SAVE_FORMAT}`);
    expect(problems.some((p) => p.startsWith('version'))).toBe(true);
  });

  it('rejects an unsupported version rather than guessing', () => {
    const raw = serializeSave(sampleState(), 0);
    const envelope = JSON.parse(raw) as Record<string, any>;
    envelope.version = SAVE_VERSION + 1;
    const problems = validateSave(envelope);
    expect(problems).toContain(`version ${SAVE_VERSION + 1} is not supported (expected ${SAVE_VERSION})`);
  });

  it('rejects out-of-range and missing fields with named problems', () => {
    const raw = serializeSave(sampleState(), 0);
    const envelope = JSON.parse(raw) as Record<string, any>;
    tamper(envelope, (env) => {
      env.state.warehouse.reputation = 150;
      delete env.state.warehouse.credits;
      env.state.pipeline.pickedItems = -3;
      env.state.rngState = 1.5;
    });
    const problems = validateSave(envelope);
    expect(problems).toContain('state.warehouse.reputation must be <= 100');
    expect(problems).toContain('state.warehouse.credits must be a finite number');
    expect(problems).toContain('state.pipeline.pickedItems=-3 out of range [0, Infinity]');
    expect(problems).toContain('state.rngState=1.5 must be an integer');
  });

  it('rejects invalid enum values on orders and trucks', () => {
    const raw = serializeSave(sampleState(), 0);
    const envelope = JSON.parse(raw) as Record<string, any>;
    envelope.state.pipeline.orderQueue.push({
      id: 'ord_1',
      items: [],
      priority: 7,
      truckId: null,
      state: 'teleported',
      createdAtS: 0,
      itemCount: 0,
    });
    envelope.state.trucks.push({
      id: 'trk_1',
      dock: 0,
      capacity: 40,
      loaded: 0,
      routeOrder: [],
      eta: 0,
      state: 'flying',
      windowOpenedS: 0,
      deadlineS: 10,
      shippedPallets: 0,
      shippedItems: 0,
      onTime: 'yes',
    });
    const problems = validateSave(envelope);
    expect(problems).toContain('state.pipeline.orderQueue[0].priority must be 0 or 1');
    expect(problems).toContain('state.pipeline.orderQueue[0].state is not a valid order state');
    expect(problems).toContain('state.trucks[0].state is not a valid truck state');
    expect(problems).toContain('state.trucks[0].onTime must be a boolean');
  });

  it('a broken save is never half-applied: deserializeSave throws, store keeps the raw text', () => {
    const store = memoryStore();
    store.save('{"format":"full-truck-save","version":1,"savedAtMs":0,"state":{"seed":"x"}}');
    expect(() => loadState(store)).toThrow(SaveError);
    expect(store.load()).toContain('full-truck-save');
  });

  it('a valid save validates clean', () => {
    const raw = JSON.parse(serializeSave(sampleState(), 0)) as unknown;
    expect(validateSave(raw)).toEqual([]);
  });
});

describe('save: storage adapters', () => {
  it('webStorageStore round-trips through a fake WebStorage under the save key', () => {
    const backing = new Map<string, string>();
    const storage = {
      getItem: (k: string) => backing.get(k) ?? null,
      setItem: (k: string, v: string) => {
        backing.set(k, v);
      },
      removeItem: (k: string) => {
        backing.delete(k);
      },
    };
    const store = webStorageStore(storage);
    expect(store.load()).toBeNull();
    const state = sampleState();
    saveState(store, state, 1_700_000_000_000);
    expect(backing.has(SAVE_KEY)).toBe(true);
    expect(loadState(store)).toEqual(state);
    store.clear();
    expect(backing.size).toBe(0);
  });

  it('separate keys are separate save slots', () => {
    const backing = new Map<string, string>();
    const storage = {
      getItem: (k: string) => backing.get(k) ?? null,
      setItem: (k: string, v: string) => {
        backing.set(k, v);
      },
      removeItem: (k: string) => {
        backing.delete(k);
      },
    };
    const slotA = webStorageStore(storage, 'full-truck:save:slot-a');
    const slotB = webStorageStore(storage, 'full-truck:save:slot-b');
    const stateA = startingState(loadConfig(), 'alpha');
    saveState(slotA, stateA, 0);
    expect(loadState(slotB)).toBeNull();
    expect(loadState(slotA)).toEqual(stateA);
  });
});
