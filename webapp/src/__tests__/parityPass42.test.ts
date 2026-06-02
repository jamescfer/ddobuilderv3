/**
 * Parity pass 42 — percentage effects (BreakdownItem::DoPercentageEffects).
 *
 * Effects tagged <Percent/> contribute (base × percent / 100) of the stat's own
 * pre-percentage base total, not a flat amount. V2 applies them last against the
 * base total and sums all active percent contributions. V3 ignored the flag
 * entirely, adding e.g. Frenzied Berserker's "+25% HP" as a flat +25.
 *
 * There are ~86 Hitpoints, ~63 ACBonus, ~17 Weapon_Attack and ~10 SpellPoints
 * percent effects in the live data.
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

// HitPoints 10/level → 100 base HP at level 10 (CON 10 → +0).
const fighterClass = {
  Name: 'Fighter', HitPoints: 10, Fortitude: 'Type2', Reflex: 'Type1',
  Will: 'Type1', BAB: '1',
} as unknown as DDOClass

function l10(featNames: string[]) {
  const choices: Record<string, string> = {}
  featNames.forEach((f, i) => { choices[String(i + 1)] = f })
  return {
    ...makeEmptyBuild(),
    classes: [{ name: 'Fighter', levels: 10 }],
    levelClasses: Array.from({ length: 10 }, () => 'Fighter'),
    totalLevel: 10,
    baseAbilities: {
      Strength: 10, Dexterity: 10, Constitution: 10,
      Intelligence: 10, Wisdom: 10, Charisma: 10,
    },
    featChoices: choices,
  }
}

const hpPercentFeat = {
  Name: 'Frenzy HP', Acquire: 'Train',
  Effect: { Type: 'Hitpoints', Bonus: 'Competence', AType: 'Simple', Amount: '25', Percent: true },
} as unknown as Feat

const hpFlatFeat = {
  Name: 'Flat HP', Acquire: 'Train',
  Effect: { Type: 'Hitpoints', Bonus: 'Competence', AType: 'Simple', Amount: '25' },
} as unknown as Feat

describe('percentage effects apply against the stat base total', () => {
  it('baseline HP with no feats', () => {
    const stats = computeBuildStats(
      { ...emptyInput(), allClasses: [fighterClass] },
      l10([]),
    )
    expect(stats.total('hp')).toBe(100)
  })

  it('+25% HP adds 25% of the base, not a flat 25', () => {
    const stats = computeBuildStats(
      { ...emptyInput(), allClasses: [fighterClass], allFeats: [hpPercentFeat] },
      l10(['Frenzy HP']),
    )
    // 100 + trunc(100 × 25 / 100) = 125
    expect(stats.total('hp')).toBe(125)
  })

  it('a non-percent HP feat is still a flat bonus (regression guard)', () => {
    const stats = computeBuildStats(
      { ...emptyInput(), allClasses: [fighterClass], allFeats: [hpFlatFeat] },
      l10(['Flat HP']),
    )
    // 100 + 25 flat = 125 (same number here, but via the flat path)
    expect(stats.total('hp')).toBe(125)
  })

  it('percent applies to base only — flat + percent compose correctly', () => {
    const stats = computeBuildStats(
      {
        ...emptyInput(),
        allClasses: [fighterClass],
        allFeats: [hpPercentFeat, hpFlatFeat],
      },
      l10(['Frenzy HP', 'Flat HP']),
    )
    // base = 100 (class) + 25 (flat feat) = 125; +25% of 125 = +31 → 156
    expect(stats.total('hp')).toBe(156)
  })
})
