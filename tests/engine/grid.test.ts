import { describe, it, expect } from 'vitest'
import {
  cellEq,
  inBounds,
  wrapCell,
  cellOnSnake,
  cellInList,
} from '../../src/engine/grid'
import type { Vec2 } from '../../src/engine/types'

describe('grid helpers', () => {
  describe('cellEq', () => {
    it('is true for equal coordinates', () => {
      expect(cellEq({ x: 3, y: 4 }, { x: 3, y: 4 })).toBe(true)
    })
    it('is false when either axis differs', () => {
      expect(cellEq({ x: 3, y: 4 }, { x: 3, y: 5 })).toBe(false)
      expect(cellEq({ x: 3, y: 4 }, { x: 2, y: 4 })).toBe(false)
    })
  })

  describe('inBounds', () => {
    it('accepts the corners of the board', () => {
      expect(inBounds({ x: 0, y: 0 }, 20, 20)).toBe(true)
      expect(inBounds({ x: 19, y: 19 }, 20, 20)).toBe(true)
    })
    it('rejects cells past any edge', () => {
      expect(inBounds({ x: -1, y: 0 }, 20, 20)).toBe(false)
      expect(inBounds({ x: 0, y: -1 }, 20, 20)).toBe(false)
      expect(inBounds({ x: 20, y: 0 }, 20, 20)).toBe(false)
      expect(inBounds({ x: 0, y: 20 }, 20, 20)).toBe(false)
    })
  })

  describe('wrapCell', () => {
    it('wraps a single-step overshoot on each edge', () => {
      expect(wrapCell({ x: -1, y: 5 }, 20, 20)).toEqual({ x: 19, y: 5 })
      expect(wrapCell({ x: 20, y: 5 }, 20, 20)).toEqual({ x: 0, y: 5 })
      expect(wrapCell({ x: 5, y: -1 }, 20, 20)).toEqual({ x: 5, y: 19 })
      expect(wrapCell({ x: 5, y: 20 }, 20, 20)).toEqual({ x: 5, y: 0 })
    })
    it('leaves in-bounds cells unchanged', () => {
      expect(wrapCell({ x: 7, y: 8 }, 20, 20)).toEqual({ x: 7, y: 8 })
    })
  })

  describe('cellOnSnake / cellInList', () => {
    const snake: Vec2[] = [
      { x: 5, y: 5 },
      { x: 4, y: 5 },
      { x: 3, y: 5 },
    ]
    it('detects membership', () => {
      expect(cellOnSnake({ x: 4, y: 5 }, snake)).toBe(true)
      expect(cellInList({ x: 3, y: 5 }, snake)).toBe(true)
    })
    it('reports absence', () => {
      expect(cellOnSnake({ x: 6, y: 5 }, snake)).toBe(false)
      expect(cellInList({ x: 5, y: 6 }, snake)).toBe(false)
    })
    it('treats an empty list as no membership', () => {
      expect(cellInList({ x: 0, y: 0 }, [])).toBe(false)
    })
  })
})
