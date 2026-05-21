/**
 * Parity pass 27 — SaveBonusAbility: ability substitution for saves
 *
 * V2 parity: BreakdownItemSave.cpp — FeatEffectApplied/Effect_SaveBonusAbility
 * (lines 230-252) calls AddAbility(at) to add an alternative ability to the
 * save's tracking list; CreateOtherEffects (line 133-150) then calls
 * LargestStatBonus() to pick the ability with the highest modifier.
 *
 * Feats that use this effect type in the data:
 *   - "Force of Personality"   → CHA replaces WIS for Will saves
 *   - "Insightful Reflexes"    → INT replaces DEX for Reflex saves
 *   - "Insightful Fortitude"   → INT replaces CON for Fortitude saves (Alchemist)
 *   - "Insightful Courage"     → INT replaces WIS for Will saves (Alchemist)
 *   - "Domain of Strength"     → STR replaces DEX for Reflex saves (Cleric)
 *
 * V3 bug (before this fix): resolveValue() returns null for AType=NotNeeded
 * effects, causing parseEffect() to return [] before the SaveBonusAbility case
 * is reached. The save always uses the hardcoded default ability (CON/DEX/WIS).
 */

import { describe, it, expect } from 'vitest'
import { computeBuildStats, type BuildStatsInput } from '../hooks/useBuildStats'
import { emptyBuild as makeEmptyBuild } from '../types/ddo'
import type { DDOClass, Feat, EnhancementTree, FiligreeSetBonus, Filigree, Item, OptionalBuff, SetBonus, Augment } from '../types/ddo'

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

function minimalBuild(abilityScores: Partial<Record<string, number>> = {}, featChoices: Record<string, string> = {}) {
  const base = makeEmptyBuild()
  return {
    ...base,
    classes: [{ name: 'Fighter', levels: 1 }],
    levelClasses: ['Fighter'],
    totalLevel: 1,
    epicLevels: 0,
    legendaryLevels: 0,
    gear: {},
    baseAbilities: {
      Strength: 10,
      Dexterity: 10,
      Constitution: 10,
      Intelligence: 10,
      Wisdom: 10,
      Charisma: 10,
      ...abilityScores,
    },
    featChoices,
  }
}

/** Minimal Fighter class — only used to give the build a class entry. */
const fighterClass: DDOClass = {
  Name: 'Fighter',
  HitPoints: 10,
  Fortitude: 'Type2',
  Reflex: 'Type1',
  Will: 'Type1',
  BAB: '1',
} as unknown as DDOClass

/** Force of Personality feat: use CHA modifier for Will saves instead of WIS. */
const forceOfPersonalityFeat: Feat = {
  Name: 'Force of Personality',
  Acquire: 'Train',
  Effect: {
    Type: 'SaveBonusAbility',
    Bonus: 'Feat',
    Item: ['Charisma', 'Will'],
    AType: 'NotNeeded',
  },
} as unknown as Feat

/** Insightful Reflexes feat: use INT modifier for Reflex saves instead of DEX. */
const insightfulReflexesFeat: Feat = {
  Name: 'Insightful Reflexes',
  Acquire: 'Train',
  Effect: {
    Type: 'SaveBonusAbility',
    Bonus: 'Feat',
    Item: ['Intelligence', 'Reflex'],
    AType: 'NotNeeded',
  },
} as unknown as Feat

/** Insightful Fortitude feat (Alchemist): use INT for Fortitude saves instead of CON. */
const insightfulFortitudeFeat: Feat = {
  Name: 'Insightful Fortitude',
  Acquire: 'Train',
  Effect: {
    Type: 'SaveBonusAbility',
    Bonus: 'Feat',
    Item: ['Intelligence', 'Fortitude'],
    AType: 'NotNeeded',
  },
} as unknown as Feat

// ---------------------------------------------------------------------------
// Force of Personality — CHA replaces WIS for Will saves
// ---------------------------------------------------------------------------

describe('SaveBonusAbility — Force of Personality (V2 BreakdownItemSave parity)', () => {
  it('without Force of Personality, Will save uses WIS modifier', () => {
    // WIS 14 (+2), CHA 20 (+5) — without FoP, Will should use WIS (+2)
    const build = minimalBuild({ Wisdom: 14, Charisma: 20 })
    const stats = computeBuildStats(
      { ...emptyInput(), allClasses: [fighterClass] },
      build,
    )
    // Will ability mod contribution should be +2 (WIS), not +5 (CHA)
    const willBreakdown = stats.resolve('save.Will')
    const abilityContrib = willBreakdown.bonuses.filter(b => b.type === 'Ability mod')
    expect(abilityContrib).toHaveLength(1)
    expect(abilityContrib[0].value).toBe(2)
    expect(abilityContrib[0].source).toMatch(/Wisdom/i)
  })

  it('with Force of Personality, Will save uses CHA modifier when CHA > WIS', () => {
    // WIS 14 (+2), CHA 20 (+5) — with FoP, Will should use CHA (+5)
    const build = minimalBuild(
      { Wisdom: 14, Charisma: 20 },
      { '1': 'Force of Personality' },
    )
    const stats = computeBuildStats(
      { ...emptyInput(), allClasses: [fighterClass], allFeats: [forceOfPersonalityFeat] },
      build,
    )
    const willBreakdown = stats.resolve('save.Will')
    const abilityContrib = willBreakdown.bonuses.filter(b => b.type === 'Ability mod')
    expect(abilityContrib).toHaveLength(1)
    expect(abilityContrib[0].value).toBe(5)
    expect(abilityContrib[0].source).toMatch(/Charisma/i)
  })

  it('with Force of Personality, still uses WIS if WIS > CHA', () => {
    // WIS 20 (+5), CHA 14 (+2) — FoP present but WIS is higher, so WIS wins
    const build = minimalBuild(
      { Wisdom: 20, Charisma: 14 },
      { '1': 'Force of Personality' },
    )
    const stats = computeBuildStats(
      { ...emptyInput(), allClasses: [fighterClass], allFeats: [forceOfPersonalityFeat] },
      build,
    )
    const willBreakdown = stats.resolve('save.Will')
    const abilityContrib = willBreakdown.bonuses.filter(b => b.type === 'Ability mod')
    expect(abilityContrib).toHaveLength(1)
    expect(abilityContrib[0].value).toBe(5)
    expect(abilityContrib[0].source).toMatch(/Wisdom/i)
  })
})

// ---------------------------------------------------------------------------
// Insightful Reflexes — INT replaces DEX for Reflex saves
// ---------------------------------------------------------------------------

describe('SaveBonusAbility — Insightful Reflexes (V2 BreakdownItemSave parity)', () => {
  it('with Insightful Reflexes, Reflex save uses INT modifier when INT > DEX', () => {
    // DEX 10 (+0), INT 18 (+4) — with IR, Reflex should use INT (+4)
    const build = minimalBuild(
      { Dexterity: 10, Intelligence: 18 },
      { '1': 'Insightful Reflexes' },
    )
    const stats = computeBuildStats(
      { ...emptyInput(), allClasses: [fighterClass], allFeats: [insightfulReflexesFeat] },
      build,
    )
    const reflexBreakdown = stats.resolve('save.Reflex')
    const abilityContrib = reflexBreakdown.bonuses.filter(b => b.type === 'Ability mod')
    expect(abilityContrib).toHaveLength(1)
    expect(abilityContrib[0].value).toBe(4)
    expect(abilityContrib[0].source).toMatch(/Intelligence/i)
  })

  it('Insightful Reflexes does not affect Fort or Will saves', () => {
    // Only Reflex is substituted; Fort and Will keep CON and WIS
    const build = minimalBuild(
      { Dexterity: 10, Intelligence: 18, Constitution: 14, Wisdom: 12 },
      { '1': 'Insightful Reflexes' },
    )
    const stats = computeBuildStats(
      { ...emptyInput(), allClasses: [fighterClass], allFeats: [insightfulReflexesFeat] },
      build,
    )
    const fortContrib = stats.resolve('save.Fort').bonuses.filter(b => b.type === 'Ability mod')
    const willContrib = stats.resolve('save.Will').bonuses.filter(b => b.type === 'Ability mod')
    // Fort should still use CON (+2), Will should still use WIS (+1)
    expect(fortContrib[0].value).toBe(2)
    expect(willContrib[0].value).toBe(1)
  })
})

// ---------------------------------------------------------------------------
// Insightful Fortitude — INT replaces CON for Fortitude saves
// ---------------------------------------------------------------------------

describe('SaveBonusAbility — Insightful Fortitude (V2 BreakdownItemSave parity)', () => {
  it('with Insightful Fortitude, Fort save uses INT modifier when INT > CON', () => {
    // CON 10 (+0), INT 18 (+4) — with IF, Fort should use INT (+4)
    const build = minimalBuild(
      { Constitution: 10, Intelligence: 18 },
      { '1': 'Insightful Fortitude' },
    )
    const stats = computeBuildStats(
      { ...emptyInput(), allClasses: [fighterClass], allFeats: [insightfulFortitudeFeat] },
      build,
    )
    const fortBreakdown = stats.resolve('save.Fort')
    const abilityContrib = fortBreakdown.bonuses.filter(b => b.type === 'Ability mod')
    expect(abilityContrib).toHaveLength(1)
    expect(abilityContrib[0].value).toBe(4)
    expect(abilityContrib[0].source).toMatch(/Intelligence/i)
  })
})
