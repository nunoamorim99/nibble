import { describe, it, expect } from 'vitest'
import * as engine from '../../src/engine'

/**
 * Phase 0 smoke test.
 *
 * There is no gameplay yet — `src/engine/index.ts` is an empty stub. This
 * test exists only to prove the Vitest wiring works end-to-end: test
 * discovery, TypeScript transpilation, and `src` module resolution from
 * `tests/`. Real engine behavior (movement, collision, food, scoring,
 * levels) gets its own tests once the engine exists.
 */
describe('engine module (Phase 0 smoke test)', () => {
  it('is defined and resolvable from tests/', () => {
    expect(engine).toBeDefined()
  })
})
