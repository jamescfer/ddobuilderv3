import { describe, expect, it } from 'vitest'
import { resolveBonus, emptyResolvedStat, type RawBonus } from '../lib/bonus'

const mk = (value: number, type: string, source = 'src'): RawBonus => ({ value, type, source })

describe('resolveBonus', () => {
  it('returns empty stat for empty input', () => {
    expect(resolveBonus([])).toEqual(emptyResolvedStat())
  })

  it('exclusive types pick only the highest positive', () => {
    const r = resolveBonus([
      mk(2, 'Enhancement', 'A'),
      mk(5, 'Enhancement', 'B'),
      mk(3, 'Enhancement', 'C'),
    ])
    expect(r.total).toBe(5)
    expect(r.bonuses.find(b => b.source === 'B')?.active).toBe(true)
    expect(r.bonuses.find(b => b.source === 'A')?.active).toBe(false)
    expect(r.bonuses.find(b => b.source === 'C')?.active).toBe(false)
  })

  it('exclusive types pick the most negative independently of positives', () => {
    const r = resolveBonus([
      mk(5, 'Enhancement', 'good'),
      mk(-1, 'Enhancement', 'small-bad'),
      mk(-3, 'Enhancement', 'big-bad'),
    ])
    // 5 (best positive) + -3 (most negative) = 2
    expect(r.total).toBe(2)
    expect(r.bonuses.find(b => b.source === 'small-bad')?.active).toBe(false)
    expect(r.bonuses.find(b => b.source === 'big-bad')?.active).toBe(true)
  })

  it('stacking types accumulate every contribution', () => {
    const r = resolveBonus([
      mk(2, 'Stacking', 'a'),
      mk(3, 'Stacking', 'b'),
      mk(4, 'Stacking', 'c'),
    ])
    expect(r.total).toBe(9)
    expect(r.bonuses.every(b => b.active)).toBe(true)
  })

  it('mixed exclusive + stacking sums correctly', () => {
    const r = resolveBonus([
      mk(3, 'Enhancement', 'enh-low'),
      mk(7, 'Enhancement', 'enh-high'),
      mk(2, 'Stacking', 'a'),
      mk(2, 'Stacking', 'b'),
    ])
    // 7 (best Enhancement) + 2 + 2 = 11
    expect(r.total).toBe(11)
  })

  it('Penalty type stacks (V2 rule: stacks_always)', () => {
    const r = resolveBonus([
      mk(-1, 'Penalty', 'a'),
      mk(-1, 'Penalty', 'b'),
    ])
    // 'Penalty' is NOT in the EXCLUSIVE set, so it stacks.
    expect(r.total).toBe(-2)
  })
})
