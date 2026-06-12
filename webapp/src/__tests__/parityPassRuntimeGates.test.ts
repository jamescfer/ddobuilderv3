/**
 * V2-exact runtime requirement gates (Requirement.cpp):
 *  - EnemyType: `met = false` in BOTH dispatches (:467, :513) — favored-enemy
 *    style effects never apply inside the planner. V3 used to pass them.
 *  - MaterialType (:1083-1100): equipped item's Material in the named V2 slot
 *    must equal Item[0].
 *  - Skill (:1040-1048): skill total >= Value (resolved via the fixed point).
 */

import { describe, it, expect } from 'vitest'
import { requirementsMet, type EffectContext } from '../lib/effectParser'

function ctx(extra: Partial<EffectContext> = {}): EffectContext {
  return {
    race: 'Human', alignment: 'True Neutral',
    classLevels: {}, baseClassLevels: {}, totalLevel: 20,
    feats: new Set(), enhancements: new Set(),
    abilityTotals: {}, stances: new Set(), bab: 20,
    weaponTypes: new Set(),
    ...extra,
  }
}

describe('EnemyType', () => {
  it('is never met (V2 met = false)', () => {
    expect(requirementsMet({ Requirement: [{ Type: 'EnemyType', Item: 'Undead' }] }, ctx())).toBe(false)
  })
})

describe('MaterialType', () => {
  const reqs = { Requirement: [{ Type: 'MaterialType', Item: ['Wood', 'Weapon1'] }] }
  it('met when the slot item has the material', () => {
    expect(requirementsMet(reqs, ctx({ materialBySlot: { Weapon1: 'Wood' } }))).toBe(true)
  })
  it('not met for a different material or empty slot', () => {
    expect(requirementsMet(reqs, ctx({ materialBySlot: { Weapon1: 'Steel' } }))).toBe(false)
    expect(requirementsMet(reqs, ctx({ materialBySlot: {} }))).toBe(false)
  })
  it('passes conservatively when the caller has no gear context', () => {
    expect(requirementsMet(reqs, ctx())).toBe(true)
  })
})

describe('Skill', () => {
  const reqs = { Requirement: [{ Type: 'Skill', Item: 'Spot', Value: 10 }] }
  it('compares the resolved skill total to Value', () => {
    expect(requirementsMet(reqs, ctx({ skillTotals: { Spot: 12 } }))).toBe(true)
    expect(requirementsMet(reqs, ctx({ skillTotals: { Spot: 9 } }))).toBe(false)
  })
  it('passes conservatively without resolved totals (pass 1)', () => {
    expect(requirementsMet(reqs, ctx())).toBe(true)
  })
})
