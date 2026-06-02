/**
 * Parity pass 41 — ability-driven AType resolution (Effect.cpp:1316-1416).
 *
 * V2 reads the ability for AbilityValue / AbilityTotal / AbilityMod /
 * HalfAbilityMod / ThirdAbilityMod from the effect's `StackSource`
 * (e.g. "Charisma" or "SnapshotCharisma"), NOT from `Item` — which for these
 * effects holds the target list (Trip/Sunder/…). V2 returns the ability total
 * or mod directly and ignores the `Amount` field entirely.
 *
 * V3 previously read `Item[0]` as the ability and multiplied by `Amount[0]`, so
 * effects with no `Amount` and a `StackSource` ability (e.g. Warpriest's Divine
 * Might → CHA mod / 2 to tactical DCs and attack/damage) resolved to 0.
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

// Charisma 20 → mod +5; half = 2; third = 1.
function chaBuild(activeBuffs: string[], featName: string) {
  return {
    ...makeEmptyBuild(),
    classes: [{ name: 'Fighter', levels: 1 }],
    levelClasses: ['Fighter'],
    totalLevel: 1,
    baseAbilities: {
      Strength: 10, Dexterity: 10, Constitution: 10,
      Intelligence: 10, Wisdom: 10, Charisma: 20,
    },
    activeBuffs,
    featChoices: { '1': featName },
  }
}

// Models Warpriest Divine Might: HalfAbilityMod from SnapshotCharisma, targets
// in Item, gated on the "Divine Might" stance.
const divineMightFeat = {
  Name: 'Divine Might Test', Acquire: 'Train',
  Effect: {
    Type: 'TacticalDC',
    Bonus: 'Insightful',
    AType: 'HalfAbilityMod',
    StackSource: 'SnapshotCharisma',
    Item: ['Trip', 'Sunder', 'Stun'],
    Requirements: { Requirement: { Type: 'Stance', Item: 'Divine Might' } },
  },
} as unknown as Feat

describe('HalfAbilityMod reads StackSource ability, ignores Amount', () => {
  it('gives 0 when the gating stance is inactive', () => {
    const stats = computeBuildStats(
      { ...emptyInput(), allClasses: [fighterClass], allFeats: [divineMightFeat] },
      chaBuild([], 'Divine Might Test'),
    )
    expect(stats.total('tacticalDC.Trip')).toBe(0)
  })

  it('gives CHA mod / 2 to each targeted tactical DC when the stance is active', () => {
    const stats = computeBuildStats(
      { ...emptyInput(), allClasses: [fighterClass], allFeats: [divineMightFeat] },
      chaBuild(['Divine Might'], 'Divine Might Test'),
    )
    // CHA 20 → mod +5 → half = floor(5/2) = 2 for each listed target
    expect(stats.total('tacticalDC.Trip')).toBe(2)
    expect(stats.total('tacticalDC.Sunder')).toBe(2)
    expect(stats.total('tacticalDC.Stun')).toBe(2)
  })

  it('AbilityMod returns the full mod (no Amount multiplier)', () => {
    const fullModFeat = {
      Name: 'Full Cha Mod', Acquire: 'Train',
      Effect: { Type: 'TacticalDC', Bonus: 'Profane', AType: 'AbilityMod', StackSource: 'Charisma', Item: 'General' },
    } as unknown as Feat
    const stats = computeBuildStats(
      { ...emptyInput(), allClasses: [fighterClass], allFeats: [fullModFeat] },
      chaBuild([], 'Full Cha Mod'),
    )
    // CHA 20 → mod +5 (not 0, and not Amount[0]×5)
    expect(stats.total('tacticalDC.General')).toBe(5)
  })
})
