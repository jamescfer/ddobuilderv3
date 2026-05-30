// Parity pass 36: Reaper XP required for n RAPs
//
// V2 ReaperEnhancementsPane.cpp:248-255 computes:
//   reaperXp = sum(2i + 1, i=0..n-1) = n^2
// and shows it as "Requires Nk Reaper XP" in the panel title.
// V3 had no formula for this — just a manual AP slider.

import { describe, it, expect } from 'vitest'
import { reaperXpRequired } from '../lib/v2Formulas'

describe('reaperXpRequired', () => {
  it('returns 0 for 0 RAPs', () => {
    expect(reaperXpRequired(0)).toBe(0)
  })

  it('returns 1 for 1 RAP (V2: 0*2+1 = 1k XP)', () => {
    expect(reaperXpRequired(1)).toBe(1)
  })

  it('returns 4 for 2 RAPs (V2: 1+3 = 4k XP)', () => {
    expect(reaperXpRequired(2)).toBe(4)
  })

  it('returns 9 for 3 RAPs (V2: 1+3+5 = 9k XP)', () => {
    expect(reaperXpRequired(3)).toBe(9)
  })

  it('returns 25 for 5 RAPs', () => {
    expect(reaperXpRequired(5)).toBe(25)
  })

  it('returns 100 for 10 RAPs', () => {
    expect(reaperXpRequired(10)).toBe(100)
  })

  it('returns n^2 for arbitrary n (V2 loop formula matches closed form)', () => {
    // Verify the closed form against a direct loop simulation matching V2
    for (let n = 0; n <= 50; n++) {
      let v2LoopResult = 0
      for (let i = 0; i < n; i++) {
        v2LoopResult += (i * 2 + 1)
      }
      expect(reaperXpRequired(n)).toBe(v2LoopResult)
    }
  })
})
