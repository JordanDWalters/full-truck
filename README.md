# Full Truck

Idle / incremental / flow-optimization warehouse simulator. Mobile-first (portrait), offline-first, deterministic.

The normative design is in [`docs/SPEC.md`](docs/SPEC.md). Every number in this project comes from
[`src/config/defaults.json`](src/config/defaults.json) under the `CFG_` namespace — nothing is hardcoded
in game logic.

## What it is

A 5-stage pipeline (pick → pack → stage → load) that the player optimizes by buying capacity and rules,
never by micromanaging individual actions. The headline metric is a single scalar:

```
EFFICIENCY = 0.5*flow_score + 0.3*error_score + 0.2*ontime_score
```

The simulation is tick-based with a fixed logical tick (`CFG_TICK_MS`); rendering is decoupled.

## Stack

- TypeScript + [Vite](https://vitejs.dev) — mobile-first PWA, portrait layout. Wrappable with Capacitor
  for iOS/Android stores; the spec is engine-agnostic and the sim core has no DOM dependency.
- `vitest` — unit tests plus a balance harness that asserts the §8 acceptance targets.
- Simulation core (`src/sim/`) is pure and headless: it runs identically in tests, in the app, and in the
  offline-accrual path.

## Development

```bash
npm install
npm run dev      # dev server
npm test         # unit + balance tests
npm run build    # typecheck + production build
```

## Layout

```
src/
  config/     CFG_ constants (single source of truth) + loader/validation
  sim/        entities, tick loop, pipeline model, metrics, prestige, offline
  data/       upgrade table + scaling generators
  ui/         floor view, dashboard, upgrades, rebuild screens
tests/        unit tests + balance acceptance tests
```

## Status

Built feature by feature; each feature is a separate commit on `main`. See the commit history and
[`docs/ROADMAP.md`](docs/ROADMAP.md).
