/**
 * Parity pass 37 — player-toggled stances in effect-context stances
 *
 * V2 parity: Build::IsStanceActive is called inside Effect::IsActive() /
 * Requirements::Met() whenever an Effect has a <Requirements><Requirement>
 * <Type>Stance</Type> ... element.  V2 tracks ALL active stances (armor-
 * derived AND player-toggled) in the same IsStanceActive map.
 *
 * V3 bug: buildStatMap built ctx.stances only from deriveArmorStances()
 * (Cloth/Light/Medium/Heavy Armor + shield types + Centered).  Player-
 * toggled stances stored in build.activeBuffs (e.g. "Mountain Stance",
 * "Favored Weapon", "Power Attack") were never added, so every Effect with
 * a non-armor Stance requirement evaluated to false and contributed 0.
 *
 * There are 1 000+ enhancement effects in the live XML data gated on
 * player-toggled stances (Mountain Stance, Action Boost, Favored Weapon,
 * Rage, Two Handed Fighting, …).  The Paladin Knight of the Chalice
 * "Blessed Purpose" enhancement is a concrete example: its Melee/Ranged
 * Power SliderValue effect requires Stance: Favored Weapon.
 *
 * Fix: after deriveArmorStances() in buildStatMap, merge build.activeBuffs
 * into ctxStances so that toggleable stances are visible to requirementsMet.
 */

import { describe, it, expect } from 'vitest'
import { computeBuildStats, type BuildStatsInput } from '../hooks/useBuildStats'
import { emptyBuild as makeEmptyBuild } from '../types/ddo'
import type {
  DDOClass, Feat, EnhancementTree, Item, OptionalBuff,
  SetBonus, Augment, FiligreeSetBonus, Filigree,
} from '../types/ddo'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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

const fighterClass: DDOClass = {
  Name: 'Fighter',
  HitPoints: 10,
  Fortitude: 'Type2',
  Reflex: 'Type1',
  Will: 'Type1',
  BAB: '1',
} as unknown as DDOClass

function minimalBuild(
  activeBuffs: string[] = [],
  sliderValues: Record<string, number> = {},
  featChoices: Record<string, string> = {},
) {
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
      Strength: 10, Dexterity: 10, Constitution: 10,
      Intelligence: 10, Wisdom: 10, Charisma: 10,
    },
    activeBuffs,
    sliderValues,
    featChoices,
  }
}

// ---------------------------------------------------------------------------
// Synthetic feat that models the Blessed Purpose pattern:
//   CreateSlider "Stacks" (0–5), then SliderValue PRR gated on a stance.
// ---------------------------------------------------------------------------
const stanceGatedSliderFeat: Feat = {
  Name: 'Stance Gated Slider',
  Acquire: 'Train',
  Effect: [
    {
      Type: 'CreateSlider',
      Bonus: 'Enhancement',
      Item: 'Stacks',
      AType: 'Slider',
      Amount: '0 0 5',
    },
    {
      // +10 PRR per stack, active only while "Mountain Stance" is on
      Type: 'PRR',
      Bonus: 'Enhancement',
      AType: 'SliderValue',
      Item: 'Stacks',
      Amount: '10',
      Requirements: {
        Requirement: { Type: 'Stance', Item: 'Mountain Stance' },
      },
    },
  ],
} as unknown as Feat

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Stance-gated SliderValue effects — V2 Build::IsStanceActive parity', () => {
  it('gives 0 PRR when the required stance is not in activeBuffs', () => {
    const build = minimalBuild(
      [],             // Mountain Stance NOT active
      { Stacks: 3 }, // slider at 3
      { '1': 'Stance Gated Slider' },
    )
    const stats = computeBuildStats(
      { ...emptyInput(), allClasses: [fighterClass], allFeats: [stanceGatedSliderFeat] },
      build,
    )
    // Effect requires Stance: Mountain Stance which is not active → 0
    expect(stats.total('prr')).toBe(0)
  })

  it('gives 30 PRR when Mountain Stance is active and slider is at 3', () => {
    const build = minimalBuild(
      ['Mountain Stance'], // stance toggled on
      { Stacks: 3 },      // slider at 3
      { '1': 'Stance Gated Slider' },
    )
    const stats = computeBuildStats(
      { ...emptyInput(), allClasses: [fighterClass], allFeats: [stanceGatedSliderFeat] },
      build,
    )
    // 10 PRR/stack × 3 stacks = 30
    expect(stats.total('prr')).toBe(30)
  })

  it('gives 0 PRR when stance is active but slider is at 0', () => {
    const build = minimalBuild(
      ['Mountain Stance'],
      { Stacks: 0 },
      { '1': 'Stance Gated Slider' },
    )
    const stats = computeBuildStats(
      { ...emptyInput(), allClasses: [fighterClass], allFeats: [stanceGatedSliderFeat] },
      build,
    )
    // Stance active, slider 0 → 10 × 0 = 0
    expect(stats.total('prr')).toBe(0)
  })

  it('switching stances changes the bonus — two different stances exclusive', () => {
    // Same feat but second stance check: "Ocean Stance" should give 0 when only Mountain is on
    const oceanGatedFeat: Feat = {
      Name: 'Ocean Stance Slider',
      Acquire: 'Train',
      Effect: {
        Type: 'PRR',
        Bonus: 'Enhancement',
        AType: 'SliderValue',
        Item: 'Stacks',
        Amount: '5',
        Requirements: {
          Requirement: { Type: 'Stance', Item: 'Ocean Stance' },
        },
      },
    } as unknown as Feat

    const buildMountain = minimalBuild(
      ['Mountain Stance'],
      { Stacks: 4 },
      { '1': 'Stance Gated Slider', '2': 'Ocean Stance Slider' },
    )
    const statsMountain = computeBuildStats(
      {
        ...emptyInput(),
        allClasses: [fighterClass],
        allFeats: [stanceGatedSliderFeat, oceanGatedFeat],
      },
      buildMountain,
    )
    // Mountain: 10×4=40, Ocean: 5×4=0 (inactive) → total 40
    expect(statsMountain.total('prr')).toBe(40)

    const buildOcean = minimalBuild(
      ['Ocean Stance'],
      { Stacks: 4 },
      { '1': 'Stance Gated Slider', '2': 'Ocean Stance Slider' },
    )
    const statsOcean = computeBuildStats(
      {
        ...emptyInput(),
        allClasses: [fighterClass],
        allFeats: [stanceGatedSliderFeat, oceanGatedFeat],
      },
      buildOcean,
    )
    // Mountain: 10×4=0 (inactive), Ocean: 5×4=20 → total 20
    expect(statsOcean.total('prr')).toBe(20)
  })
})
