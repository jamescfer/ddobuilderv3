/**
 * Parity pass 30 — Spell DC multi-source stacking
 *
 * V2 parity source: DDOBuilder/SpellDC.cpp:119-128
 *   School DC bonuses come exclusively from the breakdown total for each
 *   school (pBI->Total()). The breakdown aggregates contributions from
 *   items, feats, enhancements, and set bonuses using DDO stacking rules.
 *
 * V3 bugs addressed in this pass:
 *
 * 1. parseItemBuff silently dropped `SchoolFocusNumber` and `SpellFocusNumber`
 *    item-buff types (they fell through to `default: return []`). Items such
 *    as "Admiral's Gloves" (+2 Equipment Illusion DC) and "Legendary Circlet
 *    of Shar" (+2 Profane universal DC) contributed nothing to the stat map.
 *
 * 2. DCPanel.tsx double-counted Spell Focus / Greater Spell Focus feats: once
 *    via a manual feat-name lookup (spellFocusBonus) and once via
 *    stats.total('dc.School') which already contains the parsed feat effect.
 *    Fix: remove spellFocusBonus; rely solely on stats.total('dc.School').
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

// ---------------------------------------------------------------------------
// SchoolFocusNumber — school-specific DC from items
// ---------------------------------------------------------------------------

describe('SchoolFocusNumber item buff (V2 SpellDC parity)', () => {
  it('wires to dc.<School> with the item BonusType', () => {
    // Mirrors "Legendary Solid Sound": SchoolFocusNumber +3 Insightful Enchantment
    const item: Item = {
      Name: 'Test Helm',
      Buff: [{ Type: 'SchoolFocusNumber', Value1: 3, BonusType: 'Insightful', Item: 'Enchantment' }],
    } as Item

    const stats = computeBuildStats({ ...emptyInput(), gearItems: { Head: item } }, makeEmptyBuild())

    // V2 parity: the +3 Insightful bonus should appear in dc.Enchantment
    // Before the fix, parseItemBuff dropped SchoolFocusNumber → stats.total = 0
    expect(stats.total('dc.Enchantment')).toBe(3)
  })

  it('two school-specific items with different bonus types both count', () => {
    // Mirrors "Adversion": Equipment +3 AND Insightful +2 to Abjuration DC
    const item: Item = {
      Name: 'Adversion',
      Buff: [
        { Type: 'SchoolFocusNumber', Value1: 3, BonusType: 'Equipment', Item: 'Abjuration' },
        { Type: 'SchoolFocusNumber', Value1: 2, BonusType: 'Insightful', Item: 'Abjuration' },
      ],
    } as Item

    const stats = computeBuildStats({ ...emptyInput(), gearItems: { Ring1: item } }, makeEmptyBuild())

    // Equipment and Insightful are both Highest-Only types but different types —
    // they each stack with each other, giving 3 + 2 = 5 total.
    expect(stats.total('dc.Abjuration')).toBe(5)
  })

  it('same bonus type from two items takes highest only (stacking rules apply)', () => {
    // Two items each providing Equipment bonus to Illusion DC — only highest counts
    const item1: Item = {
      Name: 'Item A',
      Buff: [{ Type: 'SchoolFocusNumber', Value1: 2, BonusType: 'Equipment', Item: 'Illusion' }],
    } as Item
    const item2: Item = {
      Name: 'Item B',
      Buff: [{ Type: 'SchoolFocusNumber', Value1: 4, BonusType: 'Equipment', Item: 'Illusion' }],
    } as Item

    const stats = computeBuildStats(
      { ...emptyInput(), gearItems: { Ring1: item1, Ring2: item2 } },
      makeEmptyBuild(),
    )

    // Equipment is Highest-Only: only the +4 should be active
    expect(stats.total('dc.Illusion')).toBe(4)
  })
})

// ---------------------------------------------------------------------------
// SpellFocusNumber — universal DC bonus from items
// ---------------------------------------------------------------------------

describe('SpellFocusNumber item buff (V2 SpellDC parity)', () => {
  it('wires to dc.All (universal DC) with the item BonusType', () => {
    // Mirrors "Doctor Gustav's Warped Lenses": SpellFocusNumber +1 Profane
    const item: Item = {
      Name: 'Test Lenses',
      Buff: [{ Type: 'SpellFocusNumber', Value1: 1, BonusType: 'Profane' }],
    } as Item

    const stats = computeBuildStats({ ...emptyInput(), gearItems: { Head: item } }, makeEmptyBuild())

    // V2 parity: SpellFocusNumber should wire to dc.All
    expect(stats.total('dc.All')).toBe(1)
  })
})

// ---------------------------------------------------------------------------
// Spell Focus feat + item school bonus — no double-count, correct stacking
// ---------------------------------------------------------------------------

describe('Spell Focus feat stat accumulation (V2 SpellDC parity)', () => {
  it('Spell Focus feat contributes exactly +1 Feat bonus to dc.School', () => {
    const spellFocusFeat: Feat = {
      Name: 'Spell Focus: Evocation',
      Effect: {
        Type: 'SpellDC',
        Bonus: 'Feat',
        Item: 'Evocation',
        AType: 'Simple',
        Amount: '1',
      },
    } as unknown as Feat

    const build = {
      ...makeEmptyBuild(),
      featChoices: { H1: 'Spell Focus: Evocation' },
    }

    const stats = computeBuildStats({ ...emptyInput(), allFeats: [spellFocusFeat] }, build)

    // The stat system should hold exactly +1 (Feat type) for dc.Evocation
    const breakdown = stats.resolve('dc.Evocation')
    expect(breakdown.total).toBe(1)
    const activeBonuses = breakdown.bonuses.filter(b => b.active)
    expect(activeBonuses).toHaveLength(1)
    expect(activeBonuses[0].type).toBe('Feat')
    expect(activeBonuses[0].value).toBe(1)
  })

  it('item SchoolFocusNumber + Spell Focus feat stack correctly (different types)', () => {
    // Item gives Equipment +2, feat gives Feat +1 — different types, both count
    const spellFocusFeat: Feat = {
      Name: 'Spell Focus: Evocation',
      Effect: {
        Type: 'SpellDC',
        Bonus: 'Feat',
        Item: 'Evocation',
        AType: 'Simple',
        Amount: '1',
      },
    } as unknown as Feat

    const item: Item = {
      Name: 'Evocation Helm',
      Buff: [{ Type: 'SchoolFocusNumber', Value1: 2, BonusType: 'Equipment', Item: 'Evocation' }],
    } as Item

    const build = {
      ...makeEmptyBuild(),
      featChoices: { H1: 'Spell Focus: Evocation' },
    }

    const stats = computeBuildStats(
      { ...emptyInput(), allFeats: [spellFocusFeat], gearItems: { Head: item } },
      build,
    )

    // Feat (+1) + Equipment (+2) — different types, so both are active: 1 + 2 = 3
    expect(stats.total('dc.Evocation')).toBe(3)
  })
})
