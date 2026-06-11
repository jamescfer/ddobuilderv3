// N5 regression: multi-Type effects (array Type from XML) must expand to one
// ParsedBonus per type.  V2 data has 464+ such effects across enhancement trees
// (["PRR","MRR"], ["MeleePower","RangedPower"], ["DodgeBonus","DodgeCapBonus"],
// ["Doublestrike","Doubleshot"], …) plus 3 in GuildBuffs.xml (including
// Sellswords' Tavern which grants hireling PRR and MRR).  Before this fix,
// array-typed effects fell through parseEffect's switch and returned [].

import { describe, expect, it } from 'vitest'
import { parseEffect, type EffectContext } from '../lib/effectParser'
import type { Effect } from '../types/ddo'

const ctx: EffectContext = {
  race: 'Human',
  alignment: 'True Neutral',
  classLevels: {},
  baseClassLevels: {},
  totalLevel: 20,
  feats: new Set(),
  enhancements: new Set(),
  abilityTotals: {
    Strength: 10, Dexterity: 10, Constitution: 10,
    Intelligence: 10, Wisdom: 10, Charisma: 10,
  },
  stances: new Set(),
  bab: 0,
  weaponTypes: new Set(),
}

function mkMulti(types: string[], amount: number, bonus = 'Enhancement'): Effect {
  return { Type: types, Bonus: bonus, AType: 'Simple', Amount: amount } as unknown as Effect
}

describe('N5 — multi-Type effect expansion', () => {
  it('["HirelingPRR","HirelingMRR"] expands to hireling.prr and hireling.mrr', () => {
    const result = parseEffect(mkMulti(['HirelingPRR', 'HirelingMRR'], 12, 'Guild'), 1, 'Sellswords Tavern', 0, 0, ctx)
    expect(result).toHaveLength(2)
    expect(result.map(r => r.statKey).sort()).toEqual(['hireling.mrr', 'hireling.prr'])
    expect(result[0].value).toBe(12)
    expect(result[1].value).toBe(12)
  })

  it('["MeleePower","RangedPower"] expands to melee.power and ranged.power', () => {
    const result = parseEffect(mkMulti(['MeleePower', 'RangedPower'], 10), 1, 'Enhancement', 0, 0, ctx)
    expect(result).toHaveLength(2)
    expect(result.map(r => r.statKey).sort()).toEqual(['melee.power', 'ranged.power'])
    expect(result[0].value).toBe(10)
  })

  it('["DodgeBonus","DodgeCapBonus"] expands to dodge and dodge.cap', () => {
    const result = parseEffect(mkMulti(['DodgeBonus', 'DodgeCapBonus'], 5), 1, 'Enhancement', 0, 0, ctx)
    expect(result).toHaveLength(2)
    expect(result.map(r => r.statKey).sort()).toEqual(['dodge', 'dodgeCap'])
  })

  it('["PRR","MRR"] expands to prr and mrr', () => {
    const result = parseEffect(mkMulti(['PRR', 'MRR'], 8), 1, 'Enhancement', 0, 0, ctx)
    expect(result).toHaveLength(2)
    expect(result.map(r => r.statKey).sort()).toEqual(['mrr', 'prr'])
  })

  it('["Doublestrike","Doubleshot"] expands to both keys', () => {
    const result = parseEffect(mkMulti(['Doublestrike', 'Doubleshot'], 3), 1, 'Enhancement', 0, 0, ctx)
    expect(result).toHaveLength(2)
    expect(result.map(r => r.statKey).sort()).toEqual(['melee.doublestrike', 'ranged.doubleshot'])
  })

  it('single-string Type is unaffected', () => {
    const result = parseEffect({ Type: 'PRR', Bonus: 'Enhancement', AType: 'Simple', Amount: 5 } as Effect, 1, 'Test', 0, 0, ctx)
    expect(result).toHaveLength(1)
    expect(result[0].statKey).toBe('prr')
  })
})
