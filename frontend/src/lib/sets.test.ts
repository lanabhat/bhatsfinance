import { describe, expect, it } from 'vitest'
import { toggled } from './sets'

describe('toggled', () => {
  it('adds a missing item and removes a present one without mutating the input', () => {
    const start = new Set(['a'])
    expect([...toggled(start, 'b')]).toEqual(['a', 'b'])
    expect([...toggled(start, 'a')]).toEqual([])
    expect([...start]).toEqual(['a'])
  })
})
