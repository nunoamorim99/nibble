/**
 * Deterministic pseudo-random number generator (mulberry32).
 *
 * These are pure functions over a numeric state — no closures, no hidden
 * mutable state. Each call returns both a value and the next state, and the
 * state lives inside `GameState`, so a session is fully reproducible from its
 * seed. `>>> 0` keeps the state a 32-bit unsigned integer throughout.
 */

/**
 * Advance the RNG once.
 * @returns `value` in [0, 1) and the next `state` to thread into the next call.
 */
export function rngNext(state: number): { value: number; state: number } {
  let a = state >>> 0
  a = (a + 0x6d2b79f5) >>> 0
  let t = a
  t = Math.imul(t ^ (t >>> 15), t | 1)
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
  const value = ((t ^ (t >>> 14)) >>> 0) / 4294967296
  return { value, state: a }
}

/**
 * Draw a uniform integer in [0, maxExclusive).
 * @returns `value` in that range and the next `state`. For `maxExclusive <= 0`
 * the value is 0 and the state still advances.
 */
export function rngInt(
  state: number,
  maxExclusive: number,
): { value: number; state: number } {
  const next = rngNext(state)
  if (maxExclusive <= 0) {
    return { value: 0, state: next.state }
  }
  return { value: Math.floor(next.value * maxExclusive), state: next.state }
}
