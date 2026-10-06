# AGENTS.md — Full Truck

## What this repo is

Full Truck: an idle / incremental / flow-optimization warehouse simulator. Mobile-first (portrait),
offline-first, deterministic given a seed. The normative design document — formulas, tables and all tuning
constants — is `docs/SPEC.md`. Read it before implementing anything in `src/sim/` or `src/data/`.

## Non-negotiable project rules (from the spec)

1. **Never invent numbers.** Every tunable is a `CFG_*` constant in `src/config/defaults.json`. Game logic
   reads config; it does not contain literals that stand for balance.
2. **Formulas in `docs/SPEC.md` §3 are normative.** Implement them as written. If a formula is ambiguous,
   resolve it in code with a comment citing the section, not by changing the formula.
3. **The sim is headless and pure.** `src/sim/` must not touch the DOM, `requestAnimationFrame`, or
   browser APIs. Rendering is decoupled from the fixed logical tick (`CFG_TICK_MS`).
4. **Upgrades may only modify the stat keys listed in `docs/SPEC.md` §5.1.** No new stat keys without a
   spec update.
5. **No pay-to-progress.** Nothing purchasable may change `CFG_*` runtime multipliers that affect speed.
6. **Design pillars are acceptance criteria**, not aspirations: flow visible as a heatmap, player sets rules
   rather than actions, efficiency is one readable scalar, prestige resets state but never knowledge.

## Repository layout

```
docs/SPEC.md            normative spec (do not silently deviate)
docs/ROADMAP.md         feature-by-feature build plan
src/config/             CFG_ constants + loader + validation
src/sim/                entities, RNG, tick loop, pipeline model, metrics, prestige, offline
src/data/               upgrade table + §5.2 scaling generators
src/ui/                 floor view, dashboard, upgrades, rebuild screens
tests/                  unit tests + balance acceptance tests (§8 targets)
```

## Commands

```bash
npm install         # deps (npm on Windows: use npm.cmd, see gotchas below)
npm run dev         # vite dev server
npm test            # vitest: unit + balance tests
npm run balance     # only the §8 balance acceptance tests
npm run build       # tsc --noEmit then vite build
```

TypeScript is strict, with `noUncheckedIndexedAccess` and `exactOptionalPropertyTypes` on. Expect to
handle "possibly undefined" explicitly rather than asserting.

## Testing / balance

`tests/balance.test.ts` encodes the §8 acceptance targets (first upgrade ≤30s, G1 EFF ≥0.35 ≤8min, first
prestige ≤25min). These are the tuning contract: if a balance change breaks them, either the change or the
test is wrong — decide deliberately and say which. Simulation tests should use fixed seeds; never assert on
wall-clock timing.

## Git / GitHub gotchas on this machine (read before touching git)

These cost real time to rediscover:

- **PowerShell variable syntax.** Use `$env:GITHUB_PERSONAL_ACCESS_TOKEN` in strings. `${VAR}` is PowerShell
  scope syntax, not an env lookup — it silently expands to empty and produces a broken remote URL like
  `https://@github.com/...`, which fails as "Repository not found" rather than an auth error.
- **Git Credential Manager intercepts auth.** A system-level `credential.helper = manager` is set in
  `C:/Program Files/Git/etc/gitconfig`. It cannot prompt in this non-interactive shell. Override it per
  command with `-c credential.helper=`:
  ```powershell
  git -c credential.helper= fetch origin
  git -c credential.helper= push -u origin <branch>
  ```
- **The remote URL already embeds the PAT** (`https://<token>@github.com/...`), so `-c credential.helper=`
  is enough. The token is a `gith…` GitHub App installation token: it works for the REST API and git smart
  HTTP, but only with the credential helper disabled.
- **Set `$env:GIT_TERMINAL_PROMPT='0'`** so a failed auth fails fast instead of hanging the session.
- The token can expire mid-session. On auth failure, re-set the remote URL with the current
  `$env:GITHUB_PERSONAL_ACCESS_TOKEN` rather than assuming the repo is gone.
- **`npm` must be invoked as `npm.cmd`** — PowerShell execution policy blocks `npm.ps1`.
- **Workflow:** one commit per feature, pushed to `main` (the user asked for per-feature pushes to this
  repo). Do not force-push. Use `git --no-pager log/diff` to avoid paged output hanging.
