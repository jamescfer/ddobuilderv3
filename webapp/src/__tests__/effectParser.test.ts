import { describe, expect, it } from 'vitest'
import { parseEffect, type EffectContext } from '../lib/effectParser'
import type { Effect } from '../types/ddo'

const ctx: EffectContext = {
  race: 'Human',
  alignment: 'True Neutral',
  classLevels: { Fighter: 20 },
  baseClassLevels: { Fighter: 20 },
  totalLevel: 20,
  feats: new Set(),
  enhancements: new Set(),
  abilityTotals: { Strength: 18, Dexterity: 14, Constitution: 14, Intelligence: 10, Wisdom: 10, Charisma: 8 },
  stances: new Set(),
  bab: 20,
  weaponTypes: new Set(),
}

const mk = (Type: string, extra: Partial<Effect> = {}): Effect => ({
  Type,
  Amount: 1,
  Bonus: 'Enhancement',
  ...extra,
}) as Effect

describe('parseEffect — niche V2 effects', () => {
  it('Regeneration emits regeneration stat', () => {
    const out = parseEffect(mk('Regeneration', { Amount: 5 }), 1, 'Test', 0, 0, ctx)
    expect(out).toHaveLength(1)
    expect(out[0].statKey).toBe('regeneration')
    expect(out[0].value).toBe(5)
  })

  it('Guard with Item emits guard.<item>', () => {
    const out = parseEffect(mk('Guard', { Amount: 10, Item: 'Fire' }), 1, 'Test', 0, 0, ctx)
    expect(out[0].statKey).toBe('guard.Fire')
    expect(out[0].value).toBe(10)
  })

  it('Guard without Item emits bare guard', () => {
    const out = parseEffect(mk('Guard', { Amount: 5 }), 1, 'Test', 0, 0, ctx)
    expect(out[0].statKey).toBe('guard')
  })

  it('GhostTouch emits ghostTouch stat', () => {
    const out = parseEffect(mk('GhostTouch', { Amount: 1 }), 1, 'Test', 0, 0, ctx)
    expect(out[0].statKey).toBe('ghostTouch')
  })

  it('FortificationBase aliases to fortification', () => {
    const out = parseEffect(mk('FortificationBase', { Amount: 100 }), 1, 'Test', 0, 0, ctx)
    expect(out[0].statKey).toBe('fortification')
    expect(out[0].value).toBe(100)
  })

  it('Incorporeality emits incorporeality stat', () => {
    const out = parseEffect(mk('Incorporeality', { Amount: 25 }), 1, 'Test', 0, 0, ctx)
    expect(out[0].statKey).toBe('incorporeality')
  })

  it('ImplementInYourHands maps to implementInHands.<item>', () => {
    const out = parseEffect(mk('ImplementInYourHands', { Amount: 1, Item: 'Orb' }), 1, 'Test', 0, 0, ctx)
    expect(out[0].statKey).toBe('implementInHands.Orb')
  })

  it('SpellPowerReplacement maps element via normalizer', () => {
    const out = parseEffect(mk('SpellPowerReplacement', { Amount: 1, Item: 'Fire' }), 1, 'Test', 0, 0, ctx)
    expect(out[0].statKey).toBe('spellPowerReplacement.Fire')
  })
})

describe('parseEffect — stat aggregation basics', () => {
  it('AbilityBonus emits one entry per Item', () => {
    const out = parseEffect(mk('AbilityBonus', { Amount: 2, Item: ['Strength', 'Dexterity'] as unknown as string }), 1, 'Test', 0, 0, ctx)
    expect(out.map(b => b.statKey).sort()).toEqual(['ability.Dexterity', 'ability.Strength'])
    expect(out.every(b => b.value === 2)).toBe(true)
  })

  it('SkillBonus emits skill.<item>', () => {
    const out = parseEffect(mk('SkillBonus', { Amount: 5, Item: 'Heal' }), 1, 'Test', 0, 0, ctx)
    expect(out[0].statKey).toBe('skill.Heal')
    expect(out[0].value).toBe(5)
  })

  it('Hitpoints emits hp', () => {
    const out = parseEffect(mk('Hitpoints', { Amount: 20 }), 1, 'Test', 0, 0, ctx)
    expect(out[0].statKey).toBe('hp')
    expect(out[0].value).toBe(20)
  })

  it('respects Stance requirement gating', () => {
    const eff = mk('PRR', {
      Amount: 10,
      Requirements: { Requirement: { Type: 'Stance', Item: 'Defensive Fighting' } },
    })
    const noStance = parseEffect(eff, 1, 'Test', 0, 0, ctx)
    expect(noStance).toEqual([])
    const ctxWith = { ...ctx, stances: new Set(['Defensive Fighting']) }
    const withStance = parseEffect(eff, 1, 'Test', 0, 0, ctxWith)
    expect(withStance).toHaveLength(1)
    expect(withStance[0].statKey).toBe('prr')
  })
})
