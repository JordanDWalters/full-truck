# Roadmap

Built feature by feature; one commit per feature on `main`. Status reflects this repository.

| # | Feature | Spec | Status |
|---|---|---|---|
| 0 | Scaffold (Vite + TS + vitest), spec import | — | done |
| 1 | `CFG_` config file, loader, validation, spec-value pinning | §2 | done |
| 2 | Entity/state schema, seeded RNG, save model (local-first, deterministic) | §1, §0 | todo |
| 3 | Simulation core: 5-stage bottleneck pipeline + fixed-tick loop | §3.1, §3.2 | todo |
| 4 | Efficiency scalar + metrics (flow / error / onTime) | §3.3 | todo |
| 5 | Layout zone graph + inverse-distance pick factor | §4 | todo |
| 6 | Upgrade system: stat keys, §5.2 generators, upgrade table | §5 | todo |
| 7 | Progression gates on EFF/reputation | §6 | todo |
| 8 | Prestige / Warehouse Rebuild + SOP bonuses | §7 | todo |
| 9 | Offline earnings | §3.4 | todo |
| 10 | Floor view + per-stage utilization heatmap | §9 | todo |
| 11 | Dashboard: efficiency ring + stage bars | §9 | todo |
| 12 | Upgrades screen + Rebuild screen | §9 | todo |
| 13 | Calm mode visual state at EFF ≥ 0.9 | §9 | todo |
| 14 | Balance harness asserting §8 acceptance targets | §8 | todo |
| 15 | Monetization hooks (cosmetic/convenience only, no progress gates) | §10 | todo |

## Interpretation notes

Places where the spec is silent and a decision was required. Each is implemented in code and recorded here
so later features stay consistent.

- **Pallets vs items.** §1 gives trucks a capacity in pallets and §3.1 gives stages capacities in items/min.
  Bridged by `CFG_PALLET_ITEMS` (extension constant): packing groups items into pallets, staging holds
  pallets in slots, loading moves pallets.
- **`theoretical_max` in §3.3.** Undefined in the spec. Taken to be the uncapped demand ceiling — the
  maximum the pipeline could ship if nothing were starved or blocked — so `flow_score` measures how much of
  the possible flow is actually achieved rather than comparing against a fixed constant.
- **`avg_error`.** Mean of per-stage rework rates weighted by that stage's throughput share, so a high-error
  stage that processes little does not dominate.
- **Reputation.** §1 says 0..100 and gates content; §3.3 says EFF drives reputation gain. Implemented as
  gain proportional to EFF and onTime, with a small decay, scaled by `rep_gain_mult`.
- **Truck arrival "trucks/min/hour scaling".** `CFG_TRUCK_ARRIVAL_RATE` is read as a rate that grows with
  warehouse tier, so demand rises as capacity does and the bottleneck keeps moving.
