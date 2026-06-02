/**
 * Parity pass 46 — spell power governing-skill bonus
 * (V2 BreakdownItemSpellPower.cpp:81-150, SpellPowerBreakdown()).
 *
 * In V2 each element's spell power adds the *total* of a governing skill into
 * its own breakdown (m_otherEffects):
 *   Heal      → Positive & Negative spell power
 *   Perform   → Sonic spell power
 *   Repair    → Repair & Rust spell power
 *   Spellcraft→ every other element
 * (Plus the Universal spell power, which V3 already adds at the display layer.)
 *
 * V3 previously computed sp.<element> from spell-power effects only and never
 * folded the governing skill in, so e.g. Heal ranks gave no Positive/Negative
 * spell power. buildStatMap now adds the governing-skill total to each
 * sp.<element> key.
 *
 * Synthetic catalogue so the assertions isolate the mechanism.
 */

import { describe, it, expect } from 'vitest'
import { computeBuildStats, type BuildStatsInput } from '../hooks/useBuildStats'
import { emptyBuild as makeEmptyBuild } from '../types/ddo'
import type {
  DDOClass, Feat, EnhancementTree, Item, OptionalBuff,
  SetBonus, Augment, FiligreeSetBonus, Filigree,
} from '../types/ddo'

// A feat that grants +10 Heal, +6 Perform, +7 Spellcraft, +4 Repair skill, plus
// a flat +25 Fire spell power.
const skillsFeat = {
  Name: 'Test Lore', Acquire: 'Train',
  Effect: [
    { Type: 'SkillBonus', Bonus: 'Feat', AType: 'Simple', Amount: '10', Item: 'Heal' },
    { Type: 'SkillBonus', Bonus: 'Feat', AType: 'Simple', Amount: '6',  Item: 'Perform' },
    { Type: 'SkillBonus', Bonus: 'Feat', AType: 'Simple', Amount: '7',  Item: 'Spellcraft' },
    { Type: 'SkillBonus', Bonus: 'Feat', AType: 'Simple', Amount: '4',  Item: 'Repair' },
    { Type: 'SpellPower', Bonus: 'Feat', AType: 'Simple', Amount: '25', Item: 'Fire' },
  ],
} as unknown as Feat

const wizardClass = {
  Name: 'Wizard', HitPoints: 6, Fortitude: 'Type1', Reflex: 'Type1',
  Will: 'Type2', BAB: '0',
} as unknown as DDOClass

function input(feats: Feat[]): BuildStatsInput {
  return {
    allRaces: [],
    allClasses: [wizardClass],
    allFeats: feats,
    allTrees: [] as EnhancementTree[],
    gearItems: {} as Record<string, Item>,
    allSelfBuffs: [] as OptionalBuff[],
    allAugments: [] as Augment[],
    allSetBonuses: [] as SetBonus[],
    allFiligreeBonuses: [] as FiligreeSetBonus[],
    allFiligrees: [] as Filigree[],
  }
}

function wizard(): ReturnType<typeof makeEmptyBuild> {
  return {
    ...makeEmptyBuild(),
    classes: [{ name: 'Wizard', levels: 5 }],
    levelClasses: Array.from({ length: 5 }, () => 'Wizard'),
    totalLevel: 5,
    // All abilities 10 → +0 mod, so skill totals are purely the feat bonus.
    baseAbilities: {
      Strength: 10, Dexterity: 10, Constitution: 10,
      Intelligence: 10, Wisdom: 10, Charisma: 10,
    },
    featChoices: { f1: 'Test Lore' },
  }
}

describe('Spell power governing-skill bonus (V2 BreakdownItemSpellPower parity)', () => {
  it('Heal total feeds Positive and Negative spell power', () => {
    const stats = computeBuildStats(input([skillsFeat]), wizard())
    // Heal skill = +10 feat (mod 0). Positive/Negative governed by Heal.
    expect(stats.total('sp.Positive')).toBe(10)
    expect(stats.total('sp.Negative')).toBe(10)
  })

  it('Perform total feeds Sonic spell power', () => {
    const stats = computeBuildStats(input([skillsFeat]), wizard())
    expect(stats.total('sp.Sonic')).toBe(6)
  })

  it('Repair total feeds Repair and Rust spell power', () => {
    const stats = computeBuildStats(input([skillsFeat]), wizard())
    expect(stats.total('sp.Repair')).toBe(4)
    expect(stats.total('sp.Rust')).toBe(4)
  })

  it('Spellcraft total feeds every other element, stacking with flat power', () => {
    const stats = computeBuildStats(input([skillsFeat]), wizard())
    // Fire = +25 flat power + 7 Spellcraft skill bonus = 32.
    expect(stats.total('sp.Fire')).toBe(32)
    // Acid has no flat power, just the Spellcraft governing-skill bonus.
    expect(stats.total('sp.Acid')).toBe(7)
    expect(stats.total('sp.Cold')).toBe(7)
  })
})
