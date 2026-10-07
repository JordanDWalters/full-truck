/**
 * Deterministic PRNG. The state is a plain integer so it can be serialized into a
 * save and resumed exactly (docs/SPEC.md §0: "Deterministic given seed").
 */
export interface Rng {
  /** Float in [0, 1). */
  next(): number;
  /** Integer in [min, max] inclusive. */
  nextInt(min: number, max: number): number;
  /** Float in [min, max). */
  nextFloat(min: number, max: number): number;
  /** True with probability p. */
  chance(p: number): boolean;
  /** Current internal state, for saving. */
  state(): number;
}

const MIX_A = 0x6d2b79f5;
const MIX_B = 0x85ebca6b;
const MIX_C = 0xc2b2ae35;

/** xorshift cannot have state 0, so a zero seed/state is remapped to a fixed non-zero one. */
const ZERO_STATE = 0x9e3779b9;

function hashSeed(seed: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, MIX_C) >>> 0;
  }
  return h >>> 0;
}

function normalizeState(state: number): number {
  const s = state >>> 0;
  return s === 0 ? ZERO_STATE : s;
}

/**
 * The RNG state a fresh run starts from. `restoreRng(initialRngState(seed))` produces exactly the
 * same sequence as `createRng(seed)`, which is what lets a save written before the first tick be
 * resumed instead of silently re-seeded.
 */
export function initialRngState(seed: string): number {
  return normalizeState(hashSeed(seed));
}

export function createRng(seed: string | number): Rng {
  let s = typeof seed === 'number' ? normalizeState(seed) : initialRngState(seed);

  const next = (): number => {
    s ^= s << 13;
    s >>>= 0;
    s ^= s >>> 17;
    s ^= s << 5;
    s >>>= 0;
    // Mix to spread low-bit structure before producing a float.
    let t = (s + MIX_A) >>> 0;
    t = Math.imul(t ^ (t >>> 15), MIX_B) >>> 0;
    t = Math.imul(t ^ (t >>> 13), MIX_C) >>> 0;
    return ((t ^ (t >>> 16)) >>> 0) / 4294967296;
  };

  return {
    next,
    nextInt(min, max) {
      const lo = Math.ceil(Math.min(min, max));
      const hi = Math.floor(Math.max(min, max));
      return lo + Math.floor(next() * (hi - lo + 1));
    },
    nextFloat(min, max) {
      return min + next() * (max - min);
    },
    chance(p) {
      return next() < p;
    },
    state: () => s,
  };
}

/** Restores an RNG from a saved state. State 0 is not a valid xorshift state. */
export function restoreRng(state: number): Rng {
  return createRng(normalizeState(state));
}
