/**
 * Entity and state schema (docs/SPEC.md §1, §4). All entities are plain data with
 * stable string IDs, so a save is just a JSON snapshot of these shapes.
 *
 * Fields marked "extension" are not in §1 but are required to run the §3 tick loop;
 * they are listed in docs/ROADMAP.md.
 */

export type OrderState = 'queued' | 'picking' | 'packed' | 'staged' | 'loaded' | 'shipped';
export type TruckState = 'queued' | 'loading' | 'departed';
export type ZoneType = 'storage' | 'dock';

export interface OrderItem {
  sku: string;
  qty: number;
}

export interface Order {
  id: string;
  items: OrderItem[];
  /** 0 normal, 1 rush. */
  priority: 0 | 1;
  /** Assigned at staging. */
  truckId: string | null;
  state: OrderState;
  /** Extension: sim seconds the order entered the queue, for on-time scoring. */
  createdAtS: number;
  /** Extension: total item count, cached so metrics do not rescan items. */
  itemCount: number;
}

export interface Truck {
  id: string;
  dock: number;
  /** Pallets. */
  capacity: number;
  loaded: number;
  /** Affects load sequence rules. */
  routeOrder: string[];
  /** Sim seconds until arrival; counts down while queued. */
  eta: number;
  state: TruckState;
  /** Extension: sim seconds the loading window opened, for the §3.2 depart rule. */
  windowOpenedS: number;
  /** Extension: sim seconds by which the truck must depart to count as on time. */
  deadlineS: number;
  /** Extension: pallets and items recorded at departure. */
  shippedPallets: number;
  shippedItems: number;
  /** Extension: set when the truck departed inside its window. */
  onTime: boolean;
}

export interface Zone {
  id: string;
  type: ZoneType;
  capacity: number;
  /** Share of demand served from this zone; hot-zone upgrades rewire it. */
  demandWeight: number;
  /** Extension: dock zones only. */
  loadRate?: number;
}

export interface Edge {
  from: string;
  to: string;
  cost: number;
}

export interface Layout {
  zones: Zone[];
  edges: Edge[];
}

/** §3.3 headline scalars plus the counters they are derived from. */
export interface Metrics {
  efficiency: number;
  flowScore: number;
  errorScore: number;
  onTimeScore: number;
  throughputRaw: number;
  throughputEff: number;
  theoreticalMax: number;
  avgError: number;
  /** items/min per stage, and the used/max capacity used by the heatmap. */
  stageCapacity: Record<StageId, number>;
  stageUtilization: Record<StageId, number>;
  bottleneck: StageId | null;
}

export type StageId = 'pick' | 'pack' | 'stage' | 'load';

export const STAGE_IDS: StageId[] = ['pick', 'pack', 'stage', 'load'];

/** Cumulative counters over a run; the source of the §3.3 scores. */
export interface RunCounters {
  ordersSpawned: number;
  itemsPicked: number;
  itemsPacked: number;
  itemsStaged: number;
  itemsLoaded: number;
  itemsShipped: number;
  itemsShippedOnTime: number;
  itemsReworked: number;
  itemsProcessed: number;
  trucksDeparted: number;
  trucksDepartedOnTime: number;
  creditsEarned: number;
}

export interface UpgradeLevels {
  [upgradeId: string]: number;
}

/**
 * The per-save-slot warehouse. `stats` is always a computed snapshot, never a
 * player-editable field.
 */
export interface Warehouse {
  id: string;
  tier: number;
  /** Prestige currency. */
  sop: number;
  /** 0..100, gates content. */
  reputation: number;
  credits: number;
  efficiency: number;
  onTimeScore: number;
  unlocked: string[];
  upgrades: UpgradeLevels;
  layout: Layout;
  stats: Metrics;
  counters: RunCounters;
  /** Extension: highest EFF reached, so gates stay open after a temporary dip. */
  peakEfficiency: number;
  /** Extension: sim seconds elapsed in the current run. */
  simTimeS: number;
  tick: number;
}

/** Work in progress between stages — the pipeline's mutable state. */
export interface Pipeline {
  orderQueue: Order[];
  /** Items picked and waiting for packing. */
  pickedItems: number;
  /** Pallets packed and waiting for a staging slot. */
  packedPallets: number;
  /** Pallets occupying staging slots. */
  stagedPallets: number;
  /** Orders currently being picked, with the item count already picked. */
  activePicks: { orderId: string; picked: number }[];
  /** Fractional production carried between ticks so rates are not quantized. */
  carry: { pick: number; pack: number; stage: number; load: number };
  /** Fractional order arrivals carried between ticks. */
  orderSpawnCarry: number;
  /** Fractional truck arrivals carried between ticks. */
  truckSpawnCarry: number;
  nextOrderId: number;
  nextTruckId: number;
}

export interface SimState {
  seed: string;
  rngState: number;
  warehouse: Warehouse;
  pipeline: Pipeline;
  trucks: Truck[];
}

export function emptyCounters(): RunCounters {
  return {
    ordersSpawned: 0,
    itemsPicked: 0,
    itemsPacked: 0,
    itemsStaged: 0,
    itemsLoaded: 0,
    itemsShipped: 0,
    itemsShippedOnTime: 0,
    itemsReworked: 0,
    itemsProcessed: 0,
    trucksDeparted: 0,
    trucksDepartedOnTime: 0,
    creditsEarned: 0,
  };
}

export function emptyMetrics(): Metrics {
  const zero = { pick: 0, pack: 0, stage: 0, load: 0 };
  return {
    efficiency: 0,
    flowScore: 0,
    errorScore: 1,
    onTimeScore: 0,
    throughputRaw: 0,
    throughputEff: 0,
    theoreticalMax: 0,
    avgError: 0,
    stageCapacity: { ...zero },
    stageUtilization: { ...zero },
    bottleneck: null,
  };
}

export function emptyPipeline(): Pipeline {
  return {
    orderQueue: [],
    pickedItems: 0,
    packedPallets: 0,
    stagedPallets: 0,
    activePicks: [],
    carry: { pick: 0, pack: 0, stage: 0, load: 0 },
    orderSpawnCarry: 0,
    truckSpawnCarry: 0,
    nextOrderId: 1,
    nextTruckId: 1,
  };
}
