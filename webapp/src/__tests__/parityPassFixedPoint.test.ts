/**
 * Fixed-point ability resolution (closes the tracker's "known approximation").
 *
 * V2's BreakdownItems observe the ability breakdowns, so ability-mod ATypes
 * (Divine Might etc.) and ability-gated Requirements evaluate against the
 * LIVE ability total — including tomes, gear, and enhancement bonuses. V3
 * previously fed them the inherent chargen total (base + race + level-ups)
 * only. buildStatMap now iterates to a fixed point.
 */

import { describe, it, expect } from 'vitest'
import { computeBuildStats, type BuildStatsInput } from '../hooks/useBuildStats'
import { emptyBuild as makeEmptyBuild } from '../types/ddo'
import type {
  DDOClass, Feat, EnhancementTree, Item, OptionalBuff,
  SetBonus, Augment, FiligreeSetBonus, Filigree,
} from '../types/ddo'

function emptyInput(): BuildStatsInput {
  return {
    allRaces: [],
    allClasses: [] as DDOClass[],
    allFeats: [] as Feat[],
    allTrees: [] as EnhancementTree[],
    gearItems: {} as Record<string, Item>,
    allSelfBuffs: [] as OptionalBuff[],
    allAugments: [] as Augment[],
    allSetBonuses: [] as SetBonus[],
    allFiligreeBonuses: [] as FiligreeSetBonus[],
    allFiligrees: [] as Filigree[],
  }
}

const fighterClass = {
  Name: 'Fighter', HitPoints: 10, Fortitude: 'Type2', Reflex: 'Type1',
  Will: 'Type1', BAB: '1 1',
} as unknown as DDOClass

const fullChaModFeat = {
  Name: 'Full Cha Mod', Acquire: 'Train',
  Effect: { Type: 'TacticalDC', Bonus: 'Profane', AType: 'AbilityMod', StackSource: 'Charisma', Item: 'General' },
} as unknown as Feat

function build(cha: number, chaTome = 0) {
  return {
    ...makeEmptyBuild(),
    classes: [{ name: 'Fighter', levels: 20 }],
    levelClasses: Array(20).fill('Fighter'),
    totalLevel: 20,
    baseAbilities: {
      Strength: 10, Dexterity: 10, Constitution: 10,
      Intelligence: 10, Wisdom: 10, Charisma: cha,
    },
    abilityTomes: chaTome ? { Charisma: chaTome } : {},
    featChoices: { '1': 'Full Cha Mod' },
  }
}

describe('ability-mod ATypes see tome/gear ability bonuses (V2 live totals)', () => {
  it('a +2 CHA tome raises the AbilityMod effect value', () => {
    const input = { ...emptyInput(), allClasses: [fighterClass], allFeats: [fullChaModFeat] }
    // CHA 17, no tome → mod +3.
    expect(computeBuildStats(input, build(17)).total('tacticalDC.General')).toBe(3)
    // CHA 17 + tome +2 = 19 → mod +4 (was still +3 before the fixed point).
    expect(computeBuildStats(input, build(17, 2)).total('tacticalDC.General')).toBe(4)
  })

  it('an ability-granting feat effect feeds back into the mod (one iteration)', () => {
    const chaBoostFeat = {
      Name: 'Cha Boost', Acquire: 'Train',
      Effect: [
        { Type: 'AbilityBonus', Bonus: 'Profane', AType: 'Simple', Amount: '2', Item: 'Charisma' },
        { Type: 'TacticalDC', Bonus: 'Insightful', AType: 'AbilityMod', StackSource: 'Charisma', Item: 'General' },
      ],
    } as unknown as Feat
    const input = { ...emptyInput(), allClasses: [fighterClass], allFeats: [chaBoostFeat] }
    const b = { ...build(17), featChoices: { '1': 'Cha Boost' } }
    // CHA 17 + 2 (own effect) = 19 → mod +4; pre-fix the mod ignored the +2.
    expect(computeBuildStats(input, b).total('tacticalDC.General')).toBe(4)
    expect(computeBuildStats(input, b).total('ability.Charisma')).toBe(19)
  })

  it('ability-gated requirements see the boosted total', () => {
    const gatedFeat = {
      Name: 'Gated', Acquire: 'Train',
      Effect: {
        Type: 'TacticalDC', Bonus: 'Luck', AType: 'Simple', Amount: '7', Item: 'General',
        Requirements: { Requirement: { Type: 'Ability', Item: 'Charisma', Value: 19 } },
      },
    } as unknown as Feat
    const input = { ...emptyInput(), allClasses: [fighterClass], allFeats: [gatedFeat] }
    // 17 inherent fails the CHA 19 gate…
    expect(computeBuildStats(input, { ...build(17), featChoices: { '1': 'Gated' } }).total('tacticalDC.General')).toBe(0)
    // …but a +2 tome satisfies it (V2 Requirements::Met with includeTomes).
    expect(computeBuildStats(input, { ...build(17, 2), featChoices: { '1': 'Gated' } }).total('tacticalDC.General')).toBe(7)
  })
})
