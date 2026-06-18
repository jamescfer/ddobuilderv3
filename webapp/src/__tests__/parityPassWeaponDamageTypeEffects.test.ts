/**
 * N2 — Weapon damage-type-gated effects (V2 BreakdownItemWeaponEffects.cpp:306-323,
 * BreakdownItemWeaponAttackBonus.cpp:255-258, BreakdownItemWeaponDamageBonus.cpp).
 * V2 gates these 5 effect types on the wielded weapon's damage-type group membership
 * (Bludgeoning / Slashing / Piercing / Ranged — all regular weapon groups in
 * WeaponGroupings.xml). Previously all returned []; now gated on ctx.weaponClassMain
 * (which already contains the damage-type group names via deriveWeaponClasses).
 */

import { describe, it, expect } from 'vitest'
import { parseEffect, type EffectContext } from '../lib/effectParser'
import type { Effect } from '../types/ddo'

function ctx(extra: Partial<EffectContext> = {}): EffectContext {
  return {
    race: 'Human', alignment: 'True Neutral',
    classLevels: {}, baseClassLevels: {}, totalLevel: 20,
    feats: new Set(), enhancements: new Set(),
    abilityTotals: {}, stances: new Set(), bab: 20,
    // Quarterstaff → Bludgeoning, Two Handed, Melee weapon groups
    weaponTypes: new Set(['Quarterstaff']),
    weaponClassMain: new Set(['Melee', 'Two Handed', 'Bludgeoning', 'Quarterstaff']),
    ...extra,
  }
}

const mk = (e: Record<string, unknown>) => e as unknown as Effect

describe('WeaponAttackBonusDamageType', () => {
  it('emits melee.toHit when weapon damage type matches', () => {
    const eff = mk({ Type: 'WeaponAttackBonusDamageType', Bonus: 'Feat', AType: 'Simple', Amount: { '#text': 1 }, Item: ['Bludgeoning'] })
    const out = parseEffect(eff, 1, 'GreaterWeaponFocusBludgeoning', 0, 0, ctx())
    expect(out).toHaveLength(1)
    expect(out[0].statKey).toBe('melee.toHit')
    expect(out[0].value).toBe(1)
    expect(out[0].bonusType).toBe('Feat')
  })

  it('emits nothing when weapon damage type does not match', () => {
    const eff = mk({ Type: 'WeaponAttackBonusDamageType', Bonus: 'Feat', AType: 'Simple', Amount: { '#text': 1 }, Item: ['Slashing'] })
    expect(parseEffect(eff, 1, 'src', 0, 0, ctx())).toEqual([])
  })

  it('emits nothing when no weapon context provided', () => {
    const eff = mk({ Type: 'WeaponAttackBonusDamageType', Bonus: 'Feat', AType: 'Simple', Amount: { '#text': 1 }, Item: ['Bludgeoning'] })
    expect(parseEffect(eff, 1, 'src', 0, 0, undefined)).toEqual([])
  })

  it('matches Ranged damage type for ranged weapons', () => {
    const eff = mk({ Type: 'WeaponAttackBonusDamageType', Bonus: 'Feat', AType: 'Simple', Amount: { '#text': 1 }, Item: ['Ranged'] })
    const rangedCtx = ctx({ weaponTypes: new Set(['Longbow']), weaponClassMain: new Set(['Ranged', 'Longbow', 'Martial']) })
    const out = parseEffect(eff, 1, 'src', 0, 0, rangedCtx)
    expect(out).toHaveLength(1)
    expect(out[0].statKey).toBe('melee.toHit')
  })
})

describe('WeaponAttackBonusCriticalDamageType', () => {
  it('emits melee.crit.toHit when weapon damage type matches', () => {
    const eff = mk({ Type: 'WeaponAttackBonusCriticalDamageType', Bonus: 'Feat', AType: 'Simple', Amount: { '#text': 1 }, Item: ['Bludgeoning'] })
    const out = parseEffect(eff, 1, 'src', 0, 0, ctx())
    expect(out).toHaveLength(1)
    expect(out[0].statKey).toBe('melee.crit.toHit')
    expect(out[0].value).toBe(1)
  })

  it('emits nothing when damage type does not match', () => {
    const eff = mk({ Type: 'WeaponAttackBonusCriticalDamageType', Bonus: 'Feat', AType: 'Simple', Amount: { '#text': 1 }, Item: ['Piercing'] })
    expect(parseEffect(eff, 1, 'src', 0, 0, ctx())).toEqual([])
  })
})

describe('WeaponDamageBonusDamageType', () => {
  it('emits melee.damage when weapon damage type matches', () => {
    const eff = mk({ Type: 'WeaponDamageBonusDamageType', Bonus: 'Feat', AType: 'Simple', Amount: { '#text': 2 }, Item: ['Bludgeoning'] })
    const out = parseEffect(eff, 1, 'src', 0, 0, ctx())
    expect(out).toHaveLength(1)
    expect(out[0].statKey).toBe('melee.damage')
    expect(out[0].value).toBe(2)
  })

  it('emits nothing when damage type does not match', () => {
    const eff = mk({ Type: 'WeaponDamageBonusDamageType', Bonus: 'Feat', AType: 'Simple', Amount: { '#text': 2 }, Item: ['Slashing'] })
    expect(parseEffect(eff, 1, 'src', 0, 0, ctx())).toEqual([])
  })
})

describe('WeaponDamageBonusCriticalDamageType', () => {
  it('emits melee.crit.damage when weapon damage type matches', () => {
    const eff = mk({ Type: 'WeaponDamageBonusCriticalDamageType', Bonus: 'Feat', AType: 'Simple', Amount: { '#text': 3 }, Item: ['Bludgeoning'] })
    const out = parseEffect(eff, 1, 'src', 0, 0, ctx())
    expect(out).toHaveLength(1)
    expect(out[0].statKey).toBe('melee.crit.damage')
    expect(out[0].value).toBe(3)
  })

  it('emits nothing when damage type does not match', () => {
    const eff = mk({ Type: 'WeaponDamageBonusCriticalDamageType', Bonus: 'Feat', AType: 'Simple', Amount: { '#text': 3 }, Item: ['Piercing'] })
    expect(parseEffect(eff, 1, 'src', 0, 0, ctx())).toEqual([])
  })
})

describe('WeaponKeenDamageType', () => {
  it('emits weapon.keen with value=1 when weapon damage type matches (Improved Critical mechanic)', () => {
    // Amount=0 in real data — the actual crit doubling is computed from the weapon's
    // base crit range at runtime. V3 emits value=1 as a binary "Improved Critical
    // is active" flag (V2 BreakdownItemWeaponCriticalThreatRange.cpp:152-168).
    const eff = mk({ Type: 'WeaponKeenDamageType', Bonus: 'Keen', AType: 'Simple', Amount: { '#text': 0 }, Item: ['Bludgeoning'] })
    const out = parseEffect(eff, 1, 'ImprovedCriticalBludgeoning', 0, 0, ctx())
    expect(out).toHaveLength(1)
    expect(out[0].statKey).toBe('weapon.keen')
    expect(out[0].value).toBe(1)
    expect(out[0].bonusType).toBe('Keen')
  })

  it('emits nothing when damage type does not match', () => {
    const eff = mk({ Type: 'WeaponKeenDamageType', Bonus: 'Keen', AType: 'Simple', Amount: { '#text': 0 }, Item: ['Slashing'] })
    expect(parseEffect(eff, 1, 'src', 0, 0, ctx())).toEqual([])
  })

  it('emits nothing without weapon context', () => {
    const eff = mk({ Type: 'WeaponKeenDamageType', Bonus: 'Keen', AType: 'Simple', Amount: { '#text': 0 }, Item: ['Bludgeoning'] })
    expect(parseEffect(eff, 1, 'src', 0, 0, undefined)).toEqual([])
  })

  it('multi-type [WeaponAttackBonusDamageType, WeaponAttackBonusCriticalDamageType] fan-out works', () => {
    // Fighter Greater Weapon Focus feat style: grants +1 to both regular and crit attack
    const eff = mk({
      Type: ['WeaponAttackBonusDamageType', 'WeaponAttackBonusCriticalDamageType'],
      Bonus: 'Feat', AType: 'Simple', Amount: { '#text': 1 }, Item: ['Bludgeoning'],
    })
    const out = parseEffect(eff, 1, 'GreaterWeaponFocus', 0, 0, ctx())
    expect(out.map(o => o.statKey).sort()).toEqual(['melee.crit.toHit', 'melee.toHit'])
    expect(out.every(o => o.value === 1)).toBe(true)
  })
})
