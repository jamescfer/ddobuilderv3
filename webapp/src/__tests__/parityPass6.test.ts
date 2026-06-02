/**
 * Parity pass 6 — Ki / Turn Undead / Song breakdowns
 *
 * Covers three related bugs:
 *  1. BaseClassLevel / ClassLevel AType: V2 uses Amount[classLevel] (array index),
 *     not Amount[0] * classLevel (multiply). V3 was using the wrong formula,
 *     causing SongCount, SongDuration, Ki Maximum, etc. to resolve to 0.
 *  2. "Centered" stance not derived for Monk characters with cloth/no armor,
 *     which blocked all Centered-gated Ki effects.
 *  3. Turn Undead base level not computed from class levels; a Cleric/Paladin
 *     must have a non-zero base turn level.
 */

import { describe, it, expect } from 'vitest'
import { parseEffect, type EffectContext } from '../lib/effectParser'
import type { Effect } from '../types/ddo'

// ---------------------------------------------------------------------------
// Shared test helpers
// ---------------------------------------------------------------------------

function makeCtx(classLevels: Record<string, number>, baseClassLevels: Record<string, number>, stances: string[] = []): EffectContext {
  return {
    race: 'Human',
    alignment: 'True Neutral',
    classLevels,
    baseClassLevels,
    totalLevel: Object.values(classLevels).reduce((s, v) => s + v, 0),
    feats: new Set(),
    enhancements: new Set(),
    abilityTotals: { Strength: 10, Dexterity: 10, Constitution: 10, Intelligence: 10, Wisdom: 10, Charisma: 10 },
    stances: new Set(stances),
    bab: 0,
    weaponTypes: new Set(),
  }
}

function makeEffect(overrides: Partial<Effect>): Effect {
  return {
    Type: 'AbilityBonus',
    Bonus: 'Feat',
    AType: 'Simple',
    Amount: 1,
    ...overrides,
  } as Effect
}

// ---------------------------------------------------------------------------
// 1. ClassLevel / BaseClassLevel AType — array-index formula
// ---------------------------------------------------------------------------

describe('ClassLevel AType — uses Amount[classLevel] not Amount[0]*classLevel', () => {
  it('SongDuration at Bard 10 → Amount[10] = 300 seconds', () => {
    // Bard.class.xml: SongDuration ClassLevel Amount=[0,30,60,…,600]
    const amounts = Array.from({ length: 21 }, (_, i) => i * 30)
    const eff = makeEffect({
      Type: 'SongDuration',
      AType: 'ClassLevel',
      StackSource: 'Bard',
      Amount: amounts as unknown as number,
    })
    const ctx = makeCtx({ Bard: 10 }, { Bard: 10 })
    const out = parseEffect(eff, 1, 'Bard: Bardic Music', 10, 0, ctx)
    expect(out).toHaveLength(1)
    // Amount[10] = 300, NOT Amount[0]*10 = 0
    expect(out[0].value).toBe(300)
  })

  it('SongCount at Bard 7 → Amount[7] = 7 songs', () => {
    // Bard.class.xml: SongCount ClassLevel Amount=[0,1,2,…,20]
    const amounts = Array.from({ length: 21 }, (_, i) => i)
    const eff = makeEffect({
      Type: 'SongCount',
      AType: 'ClassLevel',
      StackSource: 'Bard',
      Amount: amounts as unknown as number,
    })
    const ctx = makeCtx({ Bard: 7 }, { Bard: 7 })
    const out = parseEffect(eff, 1, 'Bard: Bardic Music', 7, 0, ctx)
    expect(out).toHaveLength(1)
    expect(out[0].value).toBe(7)
  })

  it('SongDuration at Bard 0 (not a bard) → 0', () => {
    const amounts = Array.from({ length: 21 }, (_, i) => i * 30)
    const eff = makeEffect({
      Type: 'SongDuration',
      AType: 'ClassLevel',
      StackSource: 'Bard',
      Amount: amounts as unknown as number,
    })
    const ctx = makeCtx({ Fighter: 10 }, { Fighter: 10 })
    const out = parseEffect(eff, 1, 'Bard: Bardic Music', 0, 0, ctx)
    // Amount[0] = 0
    expect(out[0]?.value ?? 0).toBe(0)
  })
})

describe('BaseClassLevel AType — uses Amount[baseClassLevel] indexed by StackSource', () => {
  it('KiMaximum at Monk 10 with Centered → Amount[10] = 100', () => {
    // Monk.class.xml: KiMaximum BaseClassLevel Amount=[0,10,20,…,200] req Centered
    const amounts = Array.from({ length: 21 }, (_, i) => i * 10)
    const eff = makeEffect({
      Type: 'KiMaximum',
      AType: 'BaseClassLevel',
      StackSource: 'Monk',
      Amount: amounts as unknown as number,
      Requirements: {
        Requirement: { Type: 'Stance', Item: 'Centered' },
      },
    })
    const ctx = makeCtx({ Monk: 10 }, { Monk: 10 }, ['Centered'])
    const out = parseEffect(eff, 1, 'Monk: Flurry of Blows', 10, 0, ctx)
    expect(out).toHaveLength(1)
    // Amount[10] = 100
    expect(out[0].value).toBe(100)
  })

  it('KiMaximum at Monk 20 with Centered → Amount[20] = 200', () => {
    const amounts = Array.from({ length: 21 }, (_, i) => i * 10)
    const eff = makeEffect({
      Type: 'KiMaximum',
      AType: 'BaseClassLevel',
      StackSource: 'Monk',
      Amount: amounts as unknown as number,
      Requirements: {
        Requirement: { Type: 'Stance', Item: 'Centered' },
      },
    })
    const ctx = makeCtx({ Monk: 20 }, { Monk: 20 }, ['Centered'])
    const out = parseEffect(eff, 1, 'Monk: Flurry of Blows', 20, 0, ctx)
    expect(out).toHaveLength(1)
    expect(out[0].value).toBe(200)
  })

  it('KiMaximum without Centered → 0 (gated out by requirement)', () => {
    const amounts = Array.from({ length: 21 }, (_, i) => i * 10)
    const eff = makeEffect({
      Type: 'KiMaximum',
      AType: 'BaseClassLevel',
      StackSource: 'Monk',
      Amount: amounts as unknown as number,
      Requirements: {
        Requirement: { Type: 'Stance', Item: 'Centered' },
      },
    })
    const ctx = makeCtx({ Monk: 10 }, { Monk: 10 }, []) // no Centered
    const out = parseEffect(eff, 1, 'Monk: Flurry of Blows', 10, 0, ctx)
    expect(out).toHaveLength(0)
  })
})

// ---------------------------------------------------------------------------
// 2. Centered stance derived for cloth/no-armor Monk
// ---------------------------------------------------------------------------

import { computeBuildStats, type BuildStatsInput } from '../hooks/useBuildStats'
import { emptyBuild as makeEmptyBuild } from '../types/ddo'
import type { DDOClass, EnhancementTree, FiligreeSetBonus, Filigree, Item, OptionalBuff, SetBonus, Augment } from '../types/ddo'

function emptyInput(): BuildStatsInput {
  return {
    allRaces: [],
    allClasses: [] as DDOClass[],
    allFeats: [],
    allTrees: [] as EnhancementTree[],
    gearItems: {} as Record<string, Item>,
    allSelfBuffs: [] as OptionalBuff[],
    allAugments: [] as Augment[],
    allSetBonuses: [] as SetBonus[],
    allFiligreeBonuses: [] as FiligreeSetBonus[],
    allFiligrees: [] as Filigree[],
  }
}

/** Build a minimal CharacterBuild with the given class (heroic levels only, no epic/legendary). */
function minimalBuild(className: string, levels: number) {
  const base = makeEmptyBuild()
  return {
    ...base,
    classes: [{ name: className, levels }],
    levelClasses: Array.from({ length: levels }, () => className),
    totalLevel: levels,
    epicLevels: 0,
    legendaryLevels: 0,
    gear: {},
  }
}

function minimalMulticlassBuild(pairs: Array<[string, number]>) {
  const base = makeEmptyBuild()
  const levelClasses: string[] = []
  let total = 0
  for (const [cls, lvl] of pairs) {
    for (let i = 0; i < lvl; i++) levelClasses.push(cls)
    total += lvl
  }
  return {
    ...base,
    classes: pairs.map(([name, levels]) => ({ name, levels })),
    levelClasses,
    totalLevel: total,
    epicLevels: 0,
    legendaryLevels: 0,
    gear: {},
  }
}

describe('Centered stance — derived for cloth-armor Monk', () => {
  it('Monk with no armor (default cloth) gets Centered in ctx stances', () => {
    // We verify Centered is set by wiring a KiMaximum effect that requires Centered
    // through a minimal Monk class definition with an automatic feat.
    //
    // If Centered is NOT in ctx.stances, the effect is filtered and ki.max stays 0.
    const amounts = Array.from({ length: 21 }, (_, i) => i * 10)
    const sentinelFeat = {
      Name: 'Monk Ki Test',
      Acquire: 'Automatic',
      Effect: [{
        Type: 'KiMaximum',
        Bonus: 'Feat',
        AType: 'BaseClassLevel',
        StackSource: 'Monk',
        Amount: amounts,
        Requirements: { Requirement: { Type: 'Stance', Item: 'Centered' } },
      }],
    }
    // Minimal Monk class with a single automatic feat at level 1
    const monkClass = {
      Name: 'Monk',
      HitPoints: 8,
      Fortitude: 'Type2',
      Reflex: 'Type2',
      Will: 'Type2',
      AutomaticFeats: [{ Level: 1, Feats: 'Monk Ki Test' }],
    }
    const build = minimalBuild('Monk', 10)
    const input = {
      ...emptyInput(),
      allClasses: [monkClass as never],
      allFeats: [sentinelFeat as never],
    }
    const stats = computeBuildStats(input, build)
    // If Centered is set AND the formula is correct, the KiMaximum effect
    // contributes Amount[10] = 100 on top of the V2 base Max Ki
    // (BreakdownItemMaximumKi: 40 + WIS mod × 5; default WIS 8 → mod −1 → 35).
    // Total = 35 + 100 = 135. (If Centered were NOT derived, the effect would be
    // filtered and ki.max would be just the 35 base.)
    expect(stats.total('ki.max')).toBe(135)
  })
})

// ---------------------------------------------------------------------------
// 3. Turn Undead base level computed from Cleric/Paladin class levels
// ---------------------------------------------------------------------------

describe('Turn Undead base level from class levels', () => {
  it('Cleric 10 gets turnUndead.levelBonus base of 10', () => {
    const build = minimalBuild('Cleric', 10)
    const stats = computeBuildStats(emptyInput(), build)
    // With no feats/enhancements wired, the base turn level should be
    // the Cleric level = 10, contributed as a 'Base' type bonus.
    const levelBonusTotal = stats.total('turnUndead.levelBonus')
    expect(levelBonusTotal).toBe(10)
  })

  it('Paladin 8 gets turnUndead.levelBonus base of max(0, 8-3) = 5', () => {
    // V2 BreakdownItemTurnUndeadLevel.cpp:68: paladinLevels - 3
    const build = minimalBuild('Paladin', 8)
    const stats = computeBuildStats(emptyInput(), build)
    const levelBonusTotal = stats.total('turnUndead.levelBonus')
    expect(levelBonusTotal).toBe(5)
  })

  it('Cleric 10 / Paladin 10 multiclass → max(clericLevels, paladinLevels-3) = max(10, 7) = 10', () => {
    const build = minimalMulticlassBuild([['Cleric', 10], ['Paladin', 10]])
    const stats = computeBuildStats(emptyInput(), build)
    const levelBonusTotal = stats.total('turnUndead.levelBonus')
    expect(levelBonusTotal).toBe(10)
  })

  it('Paladin 3 → paladinLevels-3 = 0, no base turn level', () => {
    // Paladin 3 → 3 - 3 = 0, so no base turn level
    const build = minimalBuild('Paladin', 3)
    const stats = computeBuildStats(emptyInput(), build)
    const levelBonusTotal = stats.total('turnUndead.levelBonus')
    expect(levelBonusTotal).toBe(0)
  })

  it('Fighter 20 → no Turn Undead, base turn level = 0', () => {
    const build = minimalBuild('Fighter', 20)
    const stats = computeBuildStats(emptyInput(), build)
    const levelBonusTotal = stats.total('turnUndead.levelBonus')
    expect(levelBonusTotal).toBe(0)
  })
})
