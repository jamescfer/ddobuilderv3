/**
 * Parity pass 38 — SLA list auto-derived from SpellLikeAbility effects
 *
 * V2 parity: CSLAControl (SLAControl.cpp) populates its list from
 * Effect_SpellLikeAbility effects fired by trained feats, race grants,
 * and enhancement tree items.  ForumExportDlg::AddSLAs (line 1648) then
 * lists every SLA name from that control.
 *
 * V3 bug (before this fix): parseEffect() returns [] for SpellLikeAbility
 * effects, so buildStatMap() never emits sla.* keys, and the forum export
 * slas section only shows manually-set build.slaCharges entries.
 *
 * Fix: parseEffect() now emits { statKey: 'sla.<spellName>', value: 1,
 * bonusType: 'SLA', source } for SpellLikeAbility effects, so buildStatMap
 * accumulates them and BuildStats.slaList exposes the derived names.
 */

import { describe, it, expect } from 'vitest'
import { parseEffect, type EffectContext } from '../lib/effectParser'
import { computeBuildStats, type BuildStatsInput } from '../hooks/useBuildStats'
import { emptyBuild as makeEmptyBuild } from '../types/ddo'
import type {
  DDOClass, Effect, Feat, EnhancementTree, Item, OptionalBuff,
  SetBonus, Augment, FiligreeSetBonus, Filigree, Race,
} from '../types/ddo'

// ---------------------------------------------------------------------------
// Minimal test helpers
// ---------------------------------------------------------------------------

const ctx: EffectContext = {
  race: 'Human',
  alignment: 'True Neutral',
  classLevels: { Fighter: 1 },
  baseClassLevels: { Fighter: 1 },
  totalLevel: 1,
  feats: new Set(),
  enhancements: new Set(),
  abilityTotals: { Strength: 10, Dexterity: 10, Constitution: 10, Intelligence: 10, Wisdom: 10, Charisma: 10 },
  stances: new Set(),
  bab: 1,
  weaponTypes: new Set(),
}

function emptyInput(): BuildStatsInput {
  return {
    allRaces: [] as Race[],
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

// ---------------------------------------------------------------------------
// SpellLikeAbility effect — mirrors Aasimar.race.xml "Healing Hands" effect
// ---------------------------------------------------------------------------
const healingHandsEffect: Effect = {
  Type: 'SpellLikeAbility',
  Bonus: 'Racial',
  Item: ['Healing Hands', 'None'],
  AType: 'SpellInfo',
  Amount: [0, 0, 0, 0],
}

// Feat that grants the Healing Hands SLA (simulates an Aasimar race grant)
const healingHandsFeat: Feat = {
  Name: 'Aasimar: Healing Hands',
  Acquire: 'Automatic',
  Effect: healingHandsEffect,
} as unknown as Feat

// ---------------------------------------------------------------------------
// Cure Light Wounds SLA from Least Dragonmark of Healing feat
// (mirrors Feats.xml "Least Dragonmark of Healing" entry)
// ---------------------------------------------------------------------------
const leastDragonmarkFeat: Feat = {
  Name: 'Least Dragonmark of Healing',
  Acquire: 'Train',
  Effect: {
    Type: 'SpellLikeAbility',
    Bonus: 'Feat',
    Item: ['Cure Light Wounds', 'None'],
    AType: 'SpellInfo',
    Amount: [0, 0, 0, 3],
  } as Effect,
} as unknown as Feat

// ---------------------------------------------------------------------------
// Unit tests: parseEffect for SpellLikeAbility
// ---------------------------------------------------------------------------

describe('parseEffect — SpellLikeAbility emits sla.* stat key (V2 parity)', () => {
  it('emits sla.<spellName> with value 1 for a SpellLikeAbility effect', () => {
    const result = parseEffect(healingHandsEffect, 1, 'Aasimar Race', 0, 0, ctx)
    expect(result).toHaveLength(1)
    expect(result[0].statKey).toBe('sla.Healing Hands')
    expect(result[0].value).toBe(1)
  })

  it('emits the correct spell name when Item is an array', () => {
    const eff: Effect = {
      Type: 'SpellLikeAbility',
      Bonus: 'Feat',
      Item: ['Cure Light Wounds', 'None'],
      AType: 'SpellInfo',
      Amount: [0, 0, 0, 3],
    }
    const result = parseEffect(eff, 1, 'Least Dragonmark of Healing', 0, 0, ctx)
    expect(result[0].statKey).toBe('sla.Cure Light Wounds')
  })

  it('returns [] when Item is None or missing', () => {
    const eff: Effect = {
      Type: 'SpellLikeAbility',
      Bonus: 'Racial',
      Item: 'None',
      AType: 'SpellInfo',
      Amount: [0, 0, 0, 0],
    }
    const result = parseEffect(eff, 1, 'test', 0, 0, ctx)
    expect(result).toHaveLength(0)
  })
})

// ---------------------------------------------------------------------------
// Integration tests: computeBuildStats accumulates SLAs from effects
// ---------------------------------------------------------------------------

describe('computeBuildStats — sla.* keys and slaList (V2 CSLAControl parity)', () => {
  it('stats.keys() contains sla.<spellName> when a feat with SpellLikeAbility is trained', () => {
    const build = {
      ...makeEmptyBuild(),
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
      featChoices: { '1': 'Aasimar: Healing Hands' },
    }

    const stats = computeBuildStats(
      { ...emptyInput(), allClasses: [fighterClass], allFeats: [healingHandsFeat] },
      build,
    )

    // sla.Healing Hands key must be present
    expect(stats.keys().some(k => k === 'sla.Healing Hands')).toBe(true)
    // total should be 1 (one source grants it)
    expect(stats.total('sla.Healing Hands')).toBe(1)
  })

  it('slaList exposes derived SLA names', () => {
    const build = {
      ...makeEmptyBuild(),
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
      featChoices: { '1': 'Least Dragonmark of Healing' },
    }

    const stats = computeBuildStats(
      { ...emptyInput(), allClasses: [fighterClass], allFeats: [leastDragonmarkFeat] },
      build,
    )

    // slaList must be present and contain the spell name
    expect((stats as unknown as { slaList: string[] }).slaList).toContain('Cure Light Wounds')
  })

  it('a build with no SpellLikeAbility feats produces an empty sla key set', () => {
    const build = {
      ...makeEmptyBuild(),
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
    }
    const stats = computeBuildStats(
      { ...emptyInput(), allClasses: [fighterClass] },
      build,
    )
    expect(stats.keys().filter(k => k.startsWith('sla.'))).toHaveLength(0)
  })
})
