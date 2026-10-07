/**
 * Local-first save model (docs/SPEC.md §0: "Local-first... Deterministic given seed",
 * §1: "All entities are plain data").
 *
 * A save is a versioned envelope wrapping a plain-data `SimState`. This module is pure:
 * it never touches `localStorage`, `Date` or `requestAnimationFrame`. The caller supplies
 * the wall-clock timestamp and owns the storage adapter (see src/platform/).
 */

import type {
  Layout,
  Metrics,
  Order,
  OrderState,
  Pipeline,
  RunCounters,
  SimState,
  StageId,
  Truck,
  TruckState,
  Warehouse,
} from './entities';
import { STAGE_IDS } from './entities';

/** Bumped whenever the persisted shape changes. Older saves are rejected, not guessed at. */
export const SAVE_VERSION = 1;

/** Magic string so a foreign JSON blob in storage is reported as "not a save", not "corrupt field". */
export const SAVE_FORMAT = 'full-truck-save';

export interface SaveEnvelope {
  format: string;
  version: number;
  /** Wall-clock ms the save was written; supplied by the caller, never read by the sim. */
  savedAtMs: number;
  state: SimState;
}

export class SaveError extends Error {
  readonly problems: string[];

  constructor(problems: string[]) {
    super(`Invalid save: ${problems.join('; ')}`);
    this.name = 'SaveError';
    this.problems = problems;
  }
}

const ORDER_STATES: OrderState[] = ['queued', 'picking', 'packed', 'staged', 'loaded', 'shipped'];
const TRUCK_STATES: TruckState[] = ['queued', 'loading', 'departed'];

export function serializeSave(state: SimState, savedAtMs: number): string {
  const envelope: SaveEnvelope = { format: SAVE_FORMAT, version: SAVE_VERSION, savedAtMs, state };
  return JSON.stringify(envelope);
}

/**
 * Parses and validates a save. Throws `SaveError` listing every problem found, so a
 * broken save is never half-applied to a running game.
 */
export function deserializeSave(raw: string): SaveEnvelope {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (cause) {
    throw new SaveError([`not valid JSON (${(cause as Error).message})`]);
  }
  const problems = validateSave(parsed);
  if (problems.length > 0) throw new SaveError(problems);
  return parsed as SaveEnvelope;
}

export function validateSave(candidate: unknown): string[] {
  const problems: string[] = [];
  if (!isRecord(candidate)) return ['save must be an object'];

  if (candidate.format !== SAVE_FORMAT) problems.push(`format must be ${SAVE_FORMAT}`);
  if (candidate.version !== SAVE_VERSION) {
    problems.push(`version ${String(candidate.version)} is not supported (expected ${SAVE_VERSION})`);
  }
  num(problems, candidate.savedAtMs, 'savedAtMs', 0);

  const state = candidate.state;
  if (!isRecord(state)) {
    problems.push('state must be an object');
    return problems;
  }
  if (typeof state.seed !== 'string' || state.seed.length === 0) problems.push('state.seed must be a non-empty string');
  int(problems, state.rngState, 'state.rngState', 0);

  validateWarehouse(problems, state.warehouse, 'state.warehouse');
  validatePipeline(problems, state.pipeline, 'state.pipeline');
  if (!Array.isArray(state.trucks)) {
    problems.push('state.trucks must be an array');
  } else {
    state.trucks.forEach((truck, i) => validateTruck(problems, truck, `state.trucks[${i}]`));
  }
  return problems;
}

function validateWarehouse(problems: string[], value: unknown, path: string): void {
  if (!isRecord(value)) {
    problems.push(`${path} must be an object`);
    return;
  }
  for (const key of ['id', 'tier', 'sop', 'reputation', 'credits', 'efficiency', 'onTimeScore'] as const) {
    if (key === 'id') {
      if (typeof value.id !== 'string' || value.id.length === 0) problems.push(`${path}.id must be a non-empty string`);
      continue;
    }
    num(problems, value[key], `${path}.${key}`, 0);
  }
  num(problems, value.peakEfficiency, `${path}.peakEfficiency`, 0);
  num(problems, value.simTimeS, `${path}.simTimeS`, 0);
  int(problems, value.tick, `${path}.tick`, 0);

  if (typeof value.reputation === 'number' && value.reputation > 100) problems.push(`${path}.reputation must be <= 100`);
  for (const key of ['efficiency', 'onTimeScore', 'peakEfficiency'] as const) {
    num(problems, value[key], `${path}.${key}`, 0, 1);
  }

  if (!Array.isArray(value.unlocked)) {
    problems.push(`${path}.unlocked must be an array`);
  } else {
    value.unlocked.forEach((id, i) => {
      if (typeof id !== 'string' || id.length === 0) problems.push(`${path}.unlocked[${i}] must be a non-empty string`);
    });
  }

  if (!isRecord(value.upgrades)) {
    problems.push(`${path}.upgrades must be an object`);
  } else {
    for (const [upgradeId, level] of Object.entries(value.upgrades)) {
      int(problems, level, `${path}.upgrades.${upgradeId}`, 0);
    }
  }

  validateLayout(problems, value.layout, `${path}.layout`);
  validateMetrics(problems, value.stats, `${path}.stats`);
  validateCounters(problems, value.counters, `${path}.counters`);
}

function validateLayout(problems: string[], value: unknown, path: string): void {
  if (!isRecord(value)) {
    problems.push(`${path} must be an object`);
    return;
  }
  if (!Array.isArray(value.zones)) {
    problems.push(`${path}.zones must be an array`);
  } else {
    value.zones.forEach((zone, i) => {
      const zp = `${path}.zones[${i}]`;
      if (!isRecord(zone)) {
        problems.push(`${zp} must be an object`);
        return;
      }
      if (typeof zone.id !== 'string' || zone.id.length === 0) problems.push(`${zp}.id must be a non-empty string`);
      if (zone.type !== 'storage' && zone.type !== 'dock') problems.push(`${zp}.type must be storage or dock`);
      num(problems, zone.capacity, `${zp}.capacity`, 0);
      num(problems, zone.demandWeight, `${zp}.demandWeight`, 0, 1);
      if (zone.loadRate !== undefined) num(problems, zone.loadRate, `${zp}.loadRate`, 0);
    });
  }
  if (!Array.isArray(value.edges)) {
    problems.push(`${path}.edges must be an array`);
  } else {
    value.edges.forEach((edge, i) => {
      const ep = `${path}.edges[${i}]`;
      if (!isRecord(edge)) {
        problems.push(`${ep} must be an object`);
        return;
      }
      for (const key of ['from', 'to'] as const) {
        if (typeof edge[key] !== 'string' || edge[key].length === 0) {
          problems.push(`${ep}.${key} must be a non-empty string`);
        }
      }
      num(problems, edge.cost, `${ep}.cost`, 0);
    });
  }
}

function validateMetrics(problems: string[], value: unknown, path: string): void {
  if (!isRecord(value)) {
    problems.push(`${path} must be an object`);
    return;
  }
  for (const key of ['efficiency', 'flowScore', 'errorScore', 'onTimeScore'] as const) {
    num(problems, value[key], `${path}.${key}`, 0, 1);
  }
  for (const key of ['throughputRaw', 'throughputEff', 'theoreticalMax', 'avgError'] as const) {
    num(problems, value[key], `${path}.${key}`, 0);
  }
  for (const bag of ['stageCapacity', 'stageUtilization'] as const) {
    if (!isRecord(value[bag])) {
      problems.push(`${path}.${bag} must be an object`);
      continue;
    }
    for (const stage of STAGE_IDS) {
      num(problems, value[bag][stage], `${path}.${bag}.${stage}`, 0);
    }
  }
  if (value.bottleneck !== null && !isStageId(value.bottleneck)) {
    problems.push(`${path}.bottleneck must be a stage id or null`);
  }
}

function validateCounters(problems: string[], value: unknown, path: string): void {
  if (!isRecord(value)) {
    problems.push(`${path} must be an object`);
    return;
  }
  const keys: (keyof RunCounters)[] = [
    'ordersSpawned',
    'itemsPicked',
    'itemsPacked',
    'itemsStaged',
    'itemsLoaded',
    'itemsShipped',
    'itemsShippedOnTime',
    'itemsReworked',
    'itemsProcessed',
    'trucksDeparted',
    'trucksDepartedOnTime',
    'creditsEarned',
  ];
  for (const key of keys) num(problems, value[key], `${path}.${key}`, 0);
}

function validatePipeline(problems: string[], value: unknown, path: string): void {
  if (!isRecord(value)) {
    problems.push(`${path} must be an object`);
    return;
  }
  if (!Array.isArray(value.orderQueue)) {
    problems.push(`${path}.orderQueue must be an array`);
  } else {
    value.orderQueue.forEach((order, i) => validateOrder(problems, order, `${path}.orderQueue[${i}]`));
  }
  if (!Array.isArray(value.activePicks)) {
    problems.push(`${path}.activePicks must be an array`);
  } else {
    value.activePicks.forEach((pick, i) => {
      const pp = `${path}.activePicks[${i}]`;
      if (!isRecord(pick)) {
        problems.push(`${pp} must be an object`);
        return;
      }
      if (typeof pick.orderId !== 'string' || pick.orderId.length === 0) {
        problems.push(`${pp}.orderId must be a non-empty string`);
      }
      num(problems, pick.picked, `${pp}.picked`, 0);
    });
  }
  for (const key of ['pickedItems', 'packedPallets', 'stagedPallets'] as const) {
    num(problems, value[key], `${path}.${key}`, 0);
  }
  if (isRecord(value.carry)) {
    for (const stage of STAGE_IDS) num(problems, value.carry[stage], `${path}.carry.${stage}`, 0);
  } else {
    problems.push(`${path}.carry must be an object`);
  }
  for (const key of ['orderSpawnCarry', 'truckSpawnCarry', 'nextOrderId', 'nextTruckId'] as const) {
    num(problems, value[key], `${path}.${key}`, 0);
  }
}

function validateOrder(problems: string[], value: unknown, path: string): void {
  if (!isRecord(value)) {
    problems.push(`${path} must be an object`);
    return;
  }
  if (typeof value.id !== 'string' || value.id.length === 0) problems.push(`${path}.id must be a non-empty string`);
  if (value.priority !== 0 && value.priority !== 1) problems.push(`${path}.priority must be 0 or 1`);
  if (!ORDER_STATES.includes(value.state as OrderState)) problems.push(`${path}.state is not a valid order state`);
  if (value.truckId !== null && typeof value.truckId !== 'string') problems.push(`${path}.truckId must be a string or null`);
  num(problems, value.createdAtS, `${path}.createdAtS`, 0);
  num(problems, value.itemCount, `${path}.itemCount`, 0);
  if (!Array.isArray(value.items)) {
    problems.push(`${path}.items must be an array`);
  } else {
    value.items.forEach((item, i) => {
      const ip = `${path}.items[${i}]`;
      if (!isRecord(item)) {
        problems.push(`${ip} must be an object`);
        return;
      }
      if (typeof item.sku !== 'string' || item.sku.length === 0) problems.push(`${ip}.sku must be a non-empty string`);
      num(problems, item.qty, `${ip}.qty`, 1);
    });
  }
}

function validateTruck(problems: string[], value: unknown, path: string): void {
  if (!isRecord(value)) {
    problems.push(`${path} must be an object`);
    return;
  }
  if (typeof value.id !== 'string' || value.id.length === 0) problems.push(`${path}.id must be a non-empty string`);
  if (!TRUCK_STATES.includes(value.state as TruckState)) problems.push(`${path}.state is not a valid truck state`);
  for (const key of [
    'dock',
    'capacity',
    'loaded',
    'eta',
    'windowOpenedS',
    'deadlineS',
    'shippedPallets',
    'shippedItems',
  ] as const) {
    num(problems, value[key], `${path}.${key}`, 0);
  }
  if (typeof value.onTime !== 'boolean') problems.push(`${path}.onTime must be a boolean`);
  if (!Array.isArray(value.routeOrder)) {
    problems.push(`${path}.routeOrder must be an array`);
  } else {
    value.routeOrder.forEach((stop, i) => {
      if (typeof stop !== 'string' || stop.length === 0) problems.push(`${path}.routeOrder[${i}] must be a non-empty string`);
    });
  }
}

function isRecord(value: unknown): value is Record<string, any> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isStageId(value: unknown): value is StageId {
  return typeof value === 'string' && (STAGE_IDS as string[]).includes(value);
}

function num(problems: string[], value: unknown, path: string, min: number, max = Infinity): void {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    problems.push(`${path} must be a finite number`);
    return;
  }
  if (value < min || value > max) problems.push(`${path}=${value} out of range [${min}, ${max}]`);
}

function int(problems: string[], value: unknown, path: string, min: number): void {
  num(problems, value, path, min);
  if (typeof value === 'number' && Number.isFinite(value) && !Number.isInteger(value)) {
    problems.push(`${path}=${value} must be an integer`);
  }
}

/** Storage port. The sim depends on this interface only; adapters live in src/platform/. */
export interface SaveStore {
  load(): string | null;
  save(raw: string): void;
  clear(): void;
}

/** In-memory store for tests and headless runs. */
export function memoryStore(): SaveStore {
  let raw: string | null = null;
  return {
    load: () => raw,
    save: (value) => {
      raw = value;
    },
    clear: () => {
      raw = null;
    },
  };
}

/** Reads and validates a save from a store. Returns null when nothing is stored. */
export function loadState(store: SaveStore): SimState | null {
  const raw = store.load();
  if (raw === null) return null;
  return deserializeSave(raw).state;
}

export function saveState(store: SaveStore, state: SimState, savedAtMs: number): void {
  store.save(serializeSave(state, savedAtMs));
}

/** Re-exports so callers can type a loaded save without importing entities twice. */
export type { Layout, Metrics, Order, Pipeline, Truck, Warehouse };
