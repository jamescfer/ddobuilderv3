/**
 * Parity pass 43 — auto-acquired feats via <AutomaticAcquisition>
 * (V2 Build::AutomaticFeats, Build.cpp:2493-2551).
 *
 * V2 grants some feats purely through each feat's <AutomaticAcquisition> entries
 * — they appear in no class AutomaticFeats list nor race GrantedFeat, so V3's
 * feat accumulation never applied their EFFECTS:
 *   • Heroic Durability — AutomaticAcquisition SpecificLevel 1 → +30 HP for every
 *     character (V3 was under-counting HP by 30 universally).
 *   • Completionist / Racial Completionist — AbilityBonus Item="All" +2 → +2 to
 *     every ability when every heroic class / race past life is at 3. V3 listed
 *     them for display but never applied the stat effect, and Item="All" was a
 *     dead key (no expansion).
 *
 * Deliberately excluded (already modeled in V3): the Attack feat (base AC 10,
 * dodge cap 25, shield PRR, damage multipliers) and Defensive Fighting (stance).
 *
 * Tests use synthetic catalogues so the assertions isolate the mechanism
 * (the live data layers on many other always-on effects).
 */

import { describe, it, expect } from 'vitest'
import { computeBuildStats, type BuildStatsInput } from '../hooks/useBuildStats'
import { emptyBuild as makeEmptyBuild } from '../types/ddo'
import type {
  DDOClass, Feat, EnhancementTree, Item, OptionalBuff,
  SetBonus, Augment, FiligreeSetBonus, Filigree,
} from '../types/ddo'

const heroicDurability = {
  Name: 'Heroic Durability', Acquire: 'Automatic',
  Effect: { Type: 'Hitpoints', Bonus: 'Feat', AType: 'Simple', Amount: '30' },
} as unknown as Feat

const completionist = {
  Name: 'Completionist', Acquire: 'Automatic',
  Effect: [
    { Type: 'AbilityBonus', Bonus: 'Feat', AType: 'Simple', Amount: '2', Item: 'All' },
  ],
} as unknown as Feat

const fighterClass = {
  Name: 'Fighter', HitPoints: 10, Fortitude: 'Type2', Reflex: 'Type1',
  Will: 'Type1', BAB: '1',
} as unknown as DDOClass

function input(feats: Feat[]): BuildStatsInput {
  return {
    allRaces: [],
    allClasses: [fighterClass],
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

function fighter(levels: number, pastLives: Record<string, number> = {}) {
  return {
    ...makeEmptyBuild(),
    classes: [{ name: 'Fighter', levels }],
    levelClasses: Array.from({ length: levels }, () => 'Fighter'),
    totalLevel: levels,
    baseAbilities: {
      Strength: 10, Dexterity: 10, Constitution: 10,
      Intelligence: 10, Wisdom: 10, Charisma: 10,
    },
    pastLives,
  }
}

describe('Heroic Durability — universal +30 HP', () => {
  it('adds +30 HP at level 1 when the feat is in the catalogue', () => {
    const stats = computeBuildStats(input([heroicDurability]), fighter(1))
    // Fighter d10 ×1 = 10 class HP + 30 Heroic Durability (CON 10 → +0)
    expect(stats.total('hp')).toBe(40)
  })

  it('is a flat +30 independent of class HP at level 10', () => {
    const stats = computeBuildStats(input([heroicDurability]), fighter(10))
    expect(stats.total('hp')).toBe(130)
  })

  it('without the feat in the catalogue, no grant (control)', () => {
    const stats = computeBuildStats(input([]), fighter(10))
    expect(stats.total('hp')).toBe(100)
  })
})

describe('Completionist — +2 to every ability when fully past-lifed', () => {
  it('does NOT apply without the past lives', () => {
    const stats = computeBuildStats(input([completionist]), fighter(20))
    expect(stats.total('ability.Strength')).toBe(10)
  })

  it('applies +2 to all abilities (Item="All" expansion) for a completionist build', () => {
    // Fighter is the only heroic class here, so 3 Fighter past lives qualifies.
    const stats = computeBuildStats(input([completionist]), fighter(20, { Fighter: 3 }))
    expect(stats.total('ability.Strength')).toBe(12)
    expect(stats.total('ability.Wisdom')).toBe(12)
    expect(stats.total('ability.Charisma')).toBe(12)
  })
})
