/**
 * Section E parity — augment-granted set bonuses + SuppressSetBonus.
 *
 * V2 source:
 *   DDOBuilder/Item.cpp:508-548     Item::HasSetBonus — counts augment set
 *                                   bonuses AND the item's native set bonuses,
 *                                   the latter suppressed if any augment on the
 *                                   item has SuppressSetBonus.
 *   DDOBuilder/Build.cpp:4905-4922  ApplyItem applies augment set bonuses, then
 *                                   item set bonuses only when not suppressed.
 *   DDOBuilder/SetBonus.cpp:88-109  ActiveEffects — tiers activate cumulatively
 *                                   (incremental AddSetBonusStack per item).
 *
 * V3 previously counted only item.SetBonus and ignored augments entirely, so
 * set-bonus-granting augments (e.g. "Echoes of the Walking Ancestors" via an
 * IoD set-bonus slot) contributed nothing.
 */

import { describe, it, expect } from 'vitest'
import { computeBuildStats, type BuildStatsInput } from '../hooks/useBuildStats'
import { emptyBuild as makeEmptyBuild } from '../types/ddo'
import type {
  DDOClass, Feat, EnhancementTree, FiligreeSetBonus, Filigree,
  Item, OptionalBuff, SetBonus, Augment,
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

// A 2-piece set granting +10 PRR at EquippedCount 2.
const prrSet: SetBonus = {
  Type: 'Test Sheltering Set',
  Buff: [
    { EquippedCount: 2, Effect: { Type: 'PRR', Bonus: 'Artifact', AType: 'Simple', Amount: 10 } },
  ],
} as unknown as SetBonus

const setAugment: Augment = {
  Name: 'Grants Test Set',
  Type: 'Set Bonus Slot',
  SetBonus: 'Test Sheltering Set',
}

const suppressAugment: Augment = {
  Name: 'Silencer',
  Type: 'Colorless',
  SetBonus: 'Test Sheltering Set',
  SuppressSetBonus: '', // V2 DL_FLAG parses to ""
}

describe('augment-granted set bonuses (V2 Item::HasSetBonus parity)', () => {
  it('two augments granting the same set reach the 2pc tier', () => {
    const ring1: Item = { Name: 'Ring A' } as Item
    const ring2: Item = { Name: 'Ring B' } as Item
    const build = {
      ...makeEmptyBuild(),
      gear: { Ring1: 'Ring A', Ring2: 'Ring B' } as Record<string, string>,
      augmentChoices: {
        'Ring1:Set Bonus Slot:0': 'Grants Test Set',
        'Ring2:Set Bonus Slot:0': 'Grants Test Set',
      },
    }
    const stats = computeBuildStats({
      ...emptyInput(),
      gearItems: { Ring1: ring1, Ring2: ring2 },
      allAugments: [setAugment],
      allSetBonuses: [prrSet],
    }, build)
    expect(stats.total('prr')).toBe(10)
  })

  it('item native set + one augment set combine to reach the tier', () => {
    // Ring A carries the set natively; Ring B grants it via augment → count 2.
    const ringNative: Item = { Name: 'Ring A', SetBonus: 'Test Sheltering Set' } as Item
    const ringAug: Item = { Name: 'Ring B' } as Item
    const build = {
      ...makeEmptyBuild(),
      gear: { Ring1: 'Ring A', Ring2: 'Ring B' } as Record<string, string>,
      augmentChoices: { 'Ring2:Set Bonus Slot:0': 'Grants Test Set' },
    }
    const stats = computeBuildStats({
      ...emptyInput(),
      gearItems: { Ring1: ringNative, Ring2: ringAug },
      allAugments: [setAugment],
      allSetBonuses: [prrSet],
    }, build)
    expect(stats.total('prr')).toBe(10)
  })

  it('SuppressSetBonus on an augment suppresses the host item native set', () => {
    // Both rings carry the set natively (would be count 2), but Ring2 has a
    // SuppressSetBonus augment that does NOT itself grant the set → its native
    // set is suppressed, so only Ring1 counts → count 1 → no tier reached.
    const ringNativeSuppressed: Augment = {
      Name: 'Pure Silencer', Type: 'Colorless', SuppressSetBonus: '',
    }
    const ring1: Item = { Name: 'Ring A', SetBonus: 'Test Sheltering Set' } as Item
    const ring2: Item = { Name: 'Ring B', SetBonus: 'Test Sheltering Set' } as Item
    const build = {
      ...makeEmptyBuild(),
      gear: { Ring1: 'Ring A', Ring2: 'Ring B' } as Record<string, string>,
      augmentChoices: { 'Ring2:Colorless:0': 'Pure Silencer' },
    }
    const stats = computeBuildStats({
      ...emptyInput(),
      gearItems: { Ring1: ring1, Ring2: ring2 },
      allAugments: [ringNativeSuppressed],
      allSetBonuses: [prrSet],
    }, build)
    expect(stats.total('prr')).toBe(0)
  })

  it('SuppressSetBonus augment that also grants the set: its own grant still counts', () => {
    // Ring2: native set suppressed, but the suppressing augment also grants the
    // set, so Ring1 native (1) + Ring2 augment grant (1) = 2 → tier reached.
    const ring1: Item = { Name: 'Ring A', SetBonus: 'Test Sheltering Set' } as Item
    const ring2: Item = { Name: 'Ring B', SetBonus: 'Test Sheltering Set' } as Item
    const build = {
      ...makeEmptyBuild(),
      gear: { Ring1: 'Ring A', Ring2: 'Ring B' } as Record<string, string>,
      augmentChoices: { 'Ring2:Colorless:0': 'Silencer' },
    }
    const stats = computeBuildStats({
      ...emptyInput(),
      gearItems: { Ring1: ring1, Ring2: ring2 },
      allAugments: [suppressAugment],
      allSetBonuses: [prrSet],
    }, build)
    expect(stats.total('prr')).toBe(10)
  })
})
