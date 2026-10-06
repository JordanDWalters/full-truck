# FULL TRUCK — Production Spec (Model Handoff)

**Purpose:** This document is written to be consumed directly by a development model / engine. All numeric
values are tuning constants under the `CFG_` namespace and are intended to be loaded from a config file,
not hardcoded. Formulas are normative. Tables define the upgrade schema; the scaling rules section defines
how to generate the full table from seeds. The simulation is tick-based with a fixed logical tick;
rendering is decoupled.

## 0. Meta

| Field | Value |
|---|---|
| Title | Full Truck |
| Genre | Idle / Incremental / Flow-Optimization Simulator |
| Platform | Mobile (iOS/Android), portrait, offline-first |
| Engine target | Any (Unity/Godot/web). Spec is engine-agnostic. |
| Core loop | Orders → Pick → Pack → Stage → Load → Depart → Revenue → Upgrade → Prestige |
| Core fantasy | Turn a chaotic warehouse into a smooth automated flow; watch trucks fill and leave on time. |
| Session length | 30s–5min active; offline progress expected. |
| Monetization | Light: cosmetic + convenience + research pass. No pay-to-progress gates. |
| Save model | Local-first, cloud sync optional. Deterministic given seed. |

**Design pillars (hard constraints for any feature):**

1. **Flow is visible.** Every stage's throughput and bottleneck must be renderable as a heatmap.
2. **Player optimizes, never micro-manages.** The player sets rules and capacity, not individual actions.
3. **Numbers go up, chaos goes down.** Efficiency must be a single readable scalar.
4. **Prestige resets state, never knowledge.** Permanent unlocks are blueprints/SOPs.

## 1. Entity / State Schema

All entities are plain data. IDs are stable strings.

```jsonc
// Warehouse (per save slot)
{
  "id": "wh_001",
  "tier": 1,
  "sop": 0,                       // prestige currency
  "reputation": 0,                // 0..100, gates content
  "credits": 0,                   // soft currency
  "efficiency": 0.0,              // computed, 0..1
  "onTimeScore": 0.0,             // computed, 0..1
  "config": { /* see CFG_ below */ },
  "unlocked": ["pick_paper"],     // blueprint ids
  "upgrades": { /* upgradeId -> level */ },
  "layout": { /* zone graph, see §4 */ },
  "stats": { /* computed pipeline, see §3 */ }
}
```

```jsonc
// Order (transient, in-flight)
{
  "id": "ord_1042",
  "items": [ {"sku":"snack","qty":12}, {"sku":"elec","qty":4} ],
  "priority": 0,                  // 0 normal, 1 rush
  "truckId": "trk_17",            // assigned at staging
  "state": "queued|picking|packed|staged|loaded|shipped"
}
```

```jsonc
// Truck (transient)
{
  "id": "trk_17",
  "dock": 0,
  "capacity": 100,                // pallets
  "loaded": 0,
  "routeOrder": ["A","B","C"],    // affects load sequence rules
  "eta": 0,                       // sim seconds until arrival
  "state": "queued|loading|departed"
}
```

## 2. Configuration Constants (CFG_)

These are the single source of truth. A model should load these and never invent numbers.

```jsonc
{
  "CFG_TICK_MS": 250,                 // logical sim tick
  "CFG_RENDER_FPS": 30,               // decoupled visual
  "CFG_OFFLINE_CAP_H": 8,             // max offline accrual
  "CFG_OFFLINE_EFF": 0.5,             // offline throughput multiplier

  // Pipeline base rates (items/min unless noted)
  "CFG_BASE_PICK": 30,
  "CFG_BASE_PACK": 40,
  "CFG_BASE_LOAD": 60,                // per dock
  "CFG_BASE_ORDER_RATE": 6,           // orders/min
  "CFG_BASE_TRUCK_CAP": 40,           // pallets
  "CFG_TRUCK_ARRIVAL_RATE": 1.2,      // trucks/min/hour scaling

  // Cost curve (geometric)
  "CFG_COST_GROWTH": 1.18,            // cost(n+1)=cost(n)*growth
  "CFG_COST_BASE": 50,

  // Revenue
  "CFG_VALUE_PER_ITEM": 5,            // base credits/item
  "CFG_ONTIME_BONUS": 0.5,            // +50% revenue at onTime=1
  "CFG_REP_MULT_MAX": 2.0,

  // Efficiency math
  "CFG_ERR_BASE": 0.12,               // base rework rate
  "CFG_ONTIME_BASE": 0.4,

  // Prestige
  "CFG_PRESTIGE_K": 1e6,              // credits per SOP^2
  "CFG_PRESTIGE_MIN": 1e5,            // min credits to prestige
  "CFG_SOP_BONUS_PER": 0.05           // +5% permanent mult per SOP spent
}
```

## 3. Simulation Model (Normative)

### 3.1 Pipeline = bottleneck model

The warehouse is a 5-stage pipeline. Each stage `s` has a capacity `C_s` (items/min) and an error/rework
factor `E_s`. Effective throughput is the minimum stage capacity, penalized by rework.

```
stage_capacity(s) = base_s * Π(1 + upgrade_mult) * staff_factor * automation_factor
throughput_raw    = min(stage_capacity for s in [pick, pack, stage, load])
throughput_eff    = throughput_raw * (1 - avg_error)
```

stage capacity is slot-based (not flow-based): `C_stage = stage_slots * turnover_per_min`. If slots fill,
upstream stalls. This is the "staging lane" chokepoint — the heart of the optimization.

### 3.2 Per-tick update (pseudo-code)

```
function tick(dt):
  orders = spawn_orders(order_rate * dt)
  for o in orders: assign_route(o)        // sets truckId via scheduling rule

  // each stage moves WIP if downstream has space
  pick_stage(dt)      // consumes queued orders, produces picked items
  pack_stage(dt)      // consumes picked, produces pallets
  stage_stage(dt)     // consumes pallets, fills staging slots (capacity-limited)
  load_stage(dt)      // consumes staged pallets into trucks (load_rate * docks)
  depart_trucks()     // when loaded==capacity or window closes -> ship

  credits += shipped_items * value * (1 + onTimeBonus) * repMult
  update_metrics()
```

### 3.3 Efficiency scalar (the headline number)

```
flow_score   = throughput_eff / theoretical_max        // 0..1
error_score  = 1 - avg_error
ontime_score = shipped_on_time / shipped_total
EFFICIENCY   = 0.5*flow_score + 0.3*error_score + 0.2*ontime_score
```

`EFFICIENCY` drives: revenue multiplier, reputation gain, unlock gates, and the "calm mode" visual state.

### 3.4 Offline earnings

```
offline_items = CFG_OFFLINE_EFF * throughput_eff * min(elapsed, CFG_OFFLINE_CAP_H)
credits_offline = offline_items * value * repMult   // no onTime bonus offline
```

## 4. Layout / Zones (Data-Driven)

The warehouse is a graph. The player edits it via upgrades, not drag-and-drop.

```jsonc
"layout": {
  "zones": [
    {"id":"z1","type":"storage","capacity":200,"demandWeight":0.6},
    {"id":"z2","type":"storage","capacity":200,"demandWeight":0.4},
    {"id":"dock0","type":"dock","loadRate":60}
  ],
  "edges": [ {"from":"z1","to":"dock0","cost":1}, {"from":"z2","to":"dock0","cost":3} ]
}
```

`pick_rate` is multiplied by an inverse-distance factor derived from edges and `demandWeight`. Hot-zone
upgrades rewire `demandWeight` toward the dock — this is the "put fast movers near the door" optimization,
expressed as data.

## 5. Upgrade System

### 5.1 Stat keys (the only things upgrades may modify)

```
pick_rate, pick_accuracy, pack_rate, pack_accuracy,
stage_slots, stage_turnover,
load_rate, dock_count,
order_rate, value_per_item,
error_rate, ontime_base,
staff_eff, automation_unlock,
offline_eff, rep_gain_mult
```

### 5.2 Cost & effect scaling (generator rules)

For an upgrade line with seed `(base, growth, effect_per_level, cap)`:

```
cost(level)   = base * CFG_COST_GROWTH^level
effect(level) = min(effect_per_level * level, cap)   // hard cap prevents runaway
```

- Rate upgrades (pick/load/etc.): linear effect, geometric cost, cap at +300%.
- Error/ontime upgrades: diminishing effect `1-(1-e)^level`, cap at -90% error.
- Capacity upgrades (stage_slots, dock_count): integer steps, steeper cost, no cap.
- Automation unlocks: one-time boolean, very high cost, enables new rules.

### 5.3 Upgrade table (representative rows; model extrapolates via §5.2)

| ID | Category | Tier | Name | Stat key | effect/level | cap | base cost | unlock req |
|---|---|---|---|---|---|---|---|---|
| pick_paper | Picking | 0 | Paper Pick Lists | (base) | — | — | 0 | start |
| pick_scan | Picking | 1 | Barcode Scanning | pick_accuracy + | 0.03 | 0.30 | 120 | — |
| pick_batch | Picking | 2 | Batch Picking | pick_rate + | 0.20 | 3.00 | 900 | pick_scan≥3 |
| pick_light | Picking | 3 | Pick-to-Light | pick_rate + | 0.35 | 3.00 | 8000 | pick_batch≥5 |
| pick_ai | Picking | 4 | AI Pick Routing | pick_rate + | 0.50 | 3.00 | 120000 | pick_light≥5 |
| pack_manual | Packing | 0 | Packing Bench | (base) | — | — | 0 | start |
| pack_box | Packing | 1 | Auto Box Sizing | pack_rate + | 0.15 | 2.00 | 250 | — |
| pack_label | Packing | 2 | Auto Labeling | pack_accuracy + | 0.05 | 0.40 | 1500 | pack_box≥3 |
| pack_robot | Packing | 3 | Palletizer | pack_rate + | 0.40 | 3.00 | 25000 | pack_label≥4 |
| stage_floor | Staging | 0 | Floor Markings | stage_turnover + | 0.10 | 1.00 | 150 | — |
| stage_lane | Staging | 1 | Staging Lanes | stage_slots + | +2 | 24 | 600 | — |
| stage_board | Staging | 2 | Dock Staging Board | stage_turnover + | 0.25 | 2.00 | 4000 | stage_lane≥3 |
| stage_dyn | Staging | 3 | Dynamic Lane Assign | stage_slots + | +4 | 48 | 60000 | stage_board≥4 |
| load_jack | Loading | 0 | Pallet Jack | (base) | — | — | 0 | start |
| load_fork | Loading | 1 | Forklift | load_rate + | 0.30 | 3.00 | 500 | — |
| load_seq | Loading | 2 | Load Sequencing | ontime_base + | 0.10 | 0.50 | 3000 | load_fork≥3 |
| load_dock2 | Loading | 3 | Second Dock | dock_count + | +1 | 8 | 15000 | load_seq≥3 |
| load_auto | Loading | 4 | Auto-Load System | load_rate + | 0.60 | 3.00 | 200000 | load_dock2≥2 |
| sched_appt | Scheduling | 0 | Dock Appointments | ontime_base + | 0.15 | 0.60 | 800 | — |
| sched_ai | Scheduling | 1 | Dispatch Optimizer | ontime_base + | 0.25 | 0.60 | 30000 | sched_appt≥4 |
| auto_agv | Automation | 0 | Guided Carts | pick_rate + | 0.80 | 3.00 | 500000 | stage_dyn≥3 |
| auto_bot | Automation | 1 | Robotic Pickers | pick_rate + | 1.00 | 3.00 | 5e6 | auto_agv≥3 |
| hot_zone | Storage | 0 | Hot-Zone Layout | pick_rate + | 0.25 | 2.00 | 2000 | — |
| hot_ai | Storage | 1 | Demand Forecasting | pick_rate + | 0.40 | 2.00 | 80000 | hot_zone≥4 |

**Extrapolation rule for the model:** generate tiers beyond those listed using §5.2 with the same
`effect_per_level` and `cap`; gate each tier behind the previous tier's level requirement shown in
`unlock req`.

## 6. Progression Gates

Content unlocks on `EFFICIENCY` and reputation, never on raw credits (prevents pay-to-progress).

| Gate | Requirement | Unlocks |
|---|---|---|
| G1 | EFF ≥ 0.35 | Stage lanes, second dock |
| G2 | EFF ≥ 0.55 | Pick-to-light, scheduling |
| G3 | EFF ≥ 0.70 | Automation (AGV) |
| G4 | EFF ≥ 0.85 | Robotic pickers, multi-zone |
| G5 | EFF ≥ 0.95 | Prestige / Rebuild |

Reputation gates cosmetic and contract content (e.g., "rush orders", "charter trucks").

## 7. Prestige — "Warehouse Rebuild"

```
SOP_earned = floor( sqrt(credits / CFG_PRESTIGE_K) )     // credits above CFG_PRESTIGE_MIN
on prestige:
   reset: credits, upgrades, layout, in-flight orders/trucks, reputation
   keep:  unlocked blueprints, SOP, permanent SOP bonus
   apply: global_mult = Π(1 + CFG_SOP_BONUS_PER * sop_spent)
```

`global_mult` multiplies all `*_rate` and `value_per_item` — the permanent "knowledge" carryover. No stat
is lost that the player earned via knowledge.

Rebuild tiers (cosmetic + layout templates) unlock at SOP thresholds: 10 / 100 / 1000.

## 8. Balance Targets (acceptance criteria for tuning)

| Milestone | Target time (active) |
|---|---|
| First upgrade | ≤ 30s |
| First dock bottleneck resolved | ≤ 3min |
| EFF ≥ 0.35 (G1) | ≤ 8min |
| First prestige | ≤ 25min (first run) |
| Steady-state session | < 2min taps, mostly watching |

Tuning knobs a model may sweep: `CFG_COST_GROWTH`, `CFG_BASE_*`, `CFG_VALUE_PER_ITEM`, `CFG_PRESTIGE_K`.
The pipeline ratios (pick:pack:load = 30:40:60) are intentional: loading is the designed bottleneck early,
pushing players to fix staging/load first (the core optimization lesson).

## 9. UI Spec (minimal, for the model)

- **Screen 1 — Floor View:** isometric/top-down; zones, aisles, staging lanes, dock doors, animated dots
  for items/workers. Heatmap overlay = per-stage utilization (`C_used/C_max`).
- **Screen 2 — Dashboard:** single big EFFICIENCY ring + per-stage throughput bars + onTimeScore +
  credits/SOP counters.
- **Screen 3 — Upgrades:** grouped by category, each row shows current level, next cost, next effect, cap,
  lock reason.
- **Screen 4 — Rebuild/Prestige:** shows SOP gain preview, what's kept vs reset.
- **Calm mode visual:** when EFF≥0.9, reduce warnings, desaturate heat, smooth paths, lower audio. This is
  a state, not a setting.

## 10. Monetization (spec'd, not designed to gate)

| Type | Item | Constraint |
|---|---|---|
| Cosmetic | warehouse/forklift/truck skins, calm themes | never affect stats |
| Convenience | auto-upgrade toggle, +2 offline cap, +1 dock slot | dock slot is cosmetic-adjacent only if ≤ layout cap |
| Research Pass | daily efficiency challenges, weekly goals | rewards = credits/SOP/cosmetics only |

No IAP may modify `CFG_*` runtime multipliers that affect progress speed.
