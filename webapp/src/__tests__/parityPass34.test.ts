/**
 * Parity pass 34 — AttackRates.xml integration for DPS calculation
 *
 * V2 parity source: DDOBuilder/DPSPane.cpp + AttackRates.xml
 *   V2's CDPSPane::SetBasicAttackCooldown() derives attacks per minute from
 *   AttackRates.xml keyed by combat style and BAB, then cooldown = 60 / APM.
 *   DPS = DPR * APM / 60, i.e. attacksPerRound = APM / 10 in a 6-second round.
 *
 * V3 bug: buildAttackEntry hardcodes attacksPerRound = 5 (synthesized).
 *   AttackRates.xml is loaded and served via /api/attack-rates but nothing
 *   passes the real APM values to the DPS formula.
 *
 * Expected V2-parity values from AttackRates.xml (BAB 20 / BAB 25):
 *   Two Weapon Fighting:    98 / 100 APM → 9.8 / 10.0 APR
 *   Two Handed Fighting:   104 / 110 APM → 10.4 / 11.0 APR
 *   Sword and Board:       100 / 104 APM → 10.0 / 10.4 APR
 *   Single WeaponFighting: 138 / 140 APM → 13.8 / 14.0 APR
 *   Unarmed:                 0 / 113 APM →   0  / 11.3 APR
 */

import { describe, it, expect } from 'vitest'
import { lookupAttacksPerMinute, pickCombatStyleName } from '../lib/combat/attackRate'
import type { AttackRate } from '../server/dataLoaders'

// Minimal fixture matching the shape of AttackRates.xml
const fixtureRates: AttackRate[] = [
  {
    Style: 'Two Weapon Fighting',
    Race: 'All',
    AttacksPerMinute: '0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 98 0 0 0 0 100',
  },
  {
    Style: 'Two Handed Fighting',
    Race: 'All',
    AttacksPerMinute: '0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 104 0 0 0 0 110',
  },
  {
    Style: 'Sword and Board',
    Race: 'All',
    AttacksPerMinute: '0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 100 0 0 0 0 104',
  },
  {
    Style: 'Single WeaponFighting',
    Race: 'All',
    AttacksPerMinute: '0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 138 0 0 0 0 140',
  },
  {
    Style: 'Unarmed',
    Race: 'All',
    AttacksPerMinute: '0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 113',
  },
]

describe('lookupAttacksPerMinute — V2 AttackRates.xml table lookup', () => {
  it('TWF at BAB 20 → 98 APM', () => {
    expect(lookupAttacksPerMinute(fixtureRates, 'Two Weapon Fighting', 20)).toBe(98)
  })

  it('TWF at BAB 25 → 100 APM', () => {
    expect(lookupAttacksPerMinute(fixtureRates, 'Two Weapon Fighting', 25)).toBe(100)
  })

  it('TWF at BAB 22 → 98 APM (scan back to nearest non-zero)', () => {
    expect(lookupAttacksPerMinute(fixtureRates, 'Two Weapon Fighting', 22)).toBe(98)
  })

  it('THF at BAB 20 → 104 APM', () => {
    expect(lookupAttacksPerMinute(fixtureRates, 'Two Handed Fighting', 20)).toBe(104)
  })

  it('THF at BAB 25 → 110 APM', () => {
    expect(lookupAttacksPerMinute(fixtureRates, 'Two Handed Fighting', 25)).toBe(110)
  })

  it('SWF at BAB 20 → 138 APM', () => {
    expect(lookupAttacksPerMinute(fixtureRates, 'Single WeaponFighting', 20)).toBe(138)
  })

  it('Unarmed at BAB 25 → 113 APM', () => {
    expect(lookupAttacksPerMinute(fixtureRates, 'Unarmed', 25)).toBe(113)
  })

  it('Unarmed at BAB 20 → 0 (no rate defined below BAB 25)', () => {
    expect(lookupAttacksPerMinute(fixtureRates, 'Unarmed', 20)).toBe(0)
  })

  it('unknown style → 0', () => {
    expect(lookupAttacksPerMinute(fixtureRates, 'Flying Kick', 20)).toBe(0)
  })

  it('empty rates → 0', () => {
    expect(lookupAttacksPerMinute([], 'Two Weapon Fighting', 20)).toBe(0)
  })

  it('BAB clamped at 25', () => {
    expect(lookupAttacksPerMinute(fixtureRates, 'Two Weapon Fighting', 30)).toBe(100)
  })
})

describe('pickCombatStyleName — maps build state to V2 style strings', () => {
  it('TWF with offhand → "Two Weapon Fighting"', () => {
    expect(pickCombatStyleName({ twfTier: 1, twoHanded: false, hasOffhand: true, isUnarmed: false }))
      .toBe('Two Weapon Fighting')
  })

  it('two-handed weapon → "Two Handed Fighting"', () => {
    expect(pickCombatStyleName({ twfTier: 0, twoHanded: true, hasOffhand: false, isUnarmed: false }))
      .toBe('Two Handed Fighting')
  })

  it('one-handed no offhand → "Single WeaponFighting"', () => {
    expect(pickCombatStyleName({ twfTier: 0, twoHanded: false, hasOffhand: false, isUnarmed: false }))
      .toBe('Single WeaponFighting')
  })

  it('one-handed with offhand but no TWF feats → "Sword and Board"', () => {
    expect(pickCombatStyleName({ twfTier: 0, twoHanded: false, hasOffhand: true, isUnarmed: false }))
      .toBe('Sword and Board')
  })

  it('unarmed → "Unarmed" (takes precedence over twoHanded/offhand)', () => {
    expect(pickCombatStyleName({ twfTier: 0, twoHanded: false, hasOffhand: false, isUnarmed: true }))
      .toBe('Unarmed')
  })
})
