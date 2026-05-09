// V2 parity: per-level class progression tests for the helpers used by
// FeatSlots prerequisite checks, BAB, etc.
//
// V2 sources cited:
//   Build.cpp:1097-1102  Build::LevelData(level)
//   Build.cpp:1226-1231  Build::ClassAtLevel(level)
//   Build.cpp:1078-1090  per-level class summing for prereqs

import { describe, expect, it } from 'vitest'
import {
  abilityAtLevel,
  aggregateLevelClasses,
  allAbilitiesAtLevel,
  buildSnapshotAtCharacterLevel,
  characterLevelForClassLevel,
  classLevelsAtLevel,
  getLevelClasses,
  tomeCapAtLevel,
} from '../lib/levelProgression'
import { emptyBuild } from '../types/ddo'
import type { CharacterBuild, DDOClass } from '../types/ddo'

const allClasses: DDOClass[] = [
  { Name: 'Fighter' },
  { Name: 'Wizard' },
  { Name: 'Rogue' },
  { Name: 'Sacred Fist', BaseClass: 'Fighter' },
]

function buildWith(levels: string[]): CharacterBuild {
  const b = emptyBuild()
  b.levelClasses = levels
  // re-derive aggregate so consumers that look at b.classes see the right thing
  const agg = aggregateLevelClasses(levels)
  b.classes = agg
  b.totalLevel = levels.filter(Boolean).length
  return b
}

describe('getLevelClasses', () => {
  it('returns the explicit per-level array when present', () => {
    const b = buildWith(['Wizard', 'Fighter', 'Wizard', 'Fighter'])
    expect(getLevelClasses(b).slice(0, 4)).toEqual(['Wizard', 'Fighter', 'Wizard', 'Fighter'])
  })

  it('falls back to flatten of classes triple when explicit is absent', () => {
    const b = emptyBuild()
    b.classes = [{ name: 'Wizard', levels: 2 }, { name: 'Fighter', levels: 1 }, { name: '', levels: 0 }]
    b.totalLevel = 3
    delete b.levelClasses
    expect(getLevelClasses(b).slice(0, 3)).toEqual(['Wizard', 'Wizard', 'Fighter'])
  })
})

describe('characterLevelForClassLevel', () => {
  it('returns the actual character level the Nth class level is reached', () => {
    const b = buildWith(['Wizard', 'Fighter', 'Wizard', 'Fighter', 'Fighter'])
    expect(characterLevelForClassLevel(b, 'Fighter', 1)).toBe(2)
    expect(characterLevelForClassLevel(b, 'Fighter', 3)).toBe(5)
    expect(characterLevelForClassLevel(b, 'Wizard', 2)).toBe(3)
  })

  it('returns 0 if the class is not yet at that level', () => {
    const b = buildWith(['Wizard', 'Wizard'])
    expect(characterLevelForClassLevel(b, 'Fighter', 1)).toBe(0)
    expect(characterLevelForClassLevel(b, 'Wizard', 5)).toBe(0)
  })
})

describe('classLevelsAtLevel', () => {
  it('counts class levels strictly within the inclusive cap', () => {
    const b = buildWith(['Fighter', 'Fighter', 'Wizard', 'Fighter'])
    expect(classLevelsAtLevel(b, 'Fighter', 2, allClasses)).toBe(2)
    expect(classLevelsAtLevel(b, 'Fighter', 3, allClasses)).toBe(2)
    expect(classLevelsAtLevel(b, 'Fighter', 4, allClasses)).toBe(3)
  })

  it('counts BaseClass-derived classes when requested', () => {
    const b = buildWith(['Fighter', 'Sacred Fist', 'Sacred Fist'])
    expect(classLevelsAtLevel(b, 'Fighter', 3, allClasses, false)).toBe(1)
    expect(classLevelsAtLevel(b, 'Fighter', 3, allClasses, true)).toBe(3)
  })
})

describe('buildSnapshotAtCharacterLevel', () => {
  it('truncates the per-level array and re-derives totals', () => {
    const b = buildWith(['Fighter', 'Fighter', 'Wizard', 'Fighter', 'Wizard'])
    const snap = buildSnapshotAtCharacterLevel(b, 3)
    expect(snap.totalLevel).toBe(3)
    expect(snap.levelClasses).toEqual(['Fighter', 'Fighter', 'Wizard'])
    // Aggregate triple reflects only the truncated portion
    const fighter = snap.classes.find(c => c.name === 'Fighter')
    const wizard = snap.classes.find(c => c.name === 'Wizard')
    expect(fighter?.levels).toBe(2)
    expect(wizard?.levels).toBe(1)
  })

  it('snapshot at level 1 only counts the first level', () => {
    const b = buildWith(['Wizard', 'Fighter', 'Wizard'])
    const snap = buildSnapshotAtCharacterLevel(b, 1)
    expect(snap.totalLevel).toBe(1)
    expect(snap.classes.find(c => c.name === 'Wizard')?.levels).toBe(1)
    // Fighter shouldn't appear in the truncated aggregate at all
    expect(snap.classes.find(c => c.name === 'Fighter')?.levels ?? 0).toBe(0)
  })
})

describe('abilityAtLevel + tomeCapAtLevel', () => {
  it('counts only level-up bonuses awarded by the snapshot character level', () => {
    const b = emptyBuild()
    b.baseAbilities.Strength = 16
    b.abilityLevelUps = { 4: 'Strength', 8: 'Strength', 12: 'Strength' }
    expect(abilityAtLevel(b, 'Strength', 1)).toBe(16)
    expect(abilityAtLevel(b, 'Strength', 4)).toBe(17)
    expect(abilityAtLevel(b, 'Strength', 8)).toBe(18)
    expect(abilityAtLevel(b, 'Strength', 11)).toBe(18)
    expect(abilityAtLevel(b, 'Strength', 12)).toBe(19)
  })

  it('folds racial and tome bonuses into the score', () => {
    const b = emptyBuild()
    b.baseAbilities.Constitution = 14
    expect(abilityAtLevel(b, 'Constitution', 1, /* race */ 2, /* tome */ 1)).toBe(17)
  })

  it('caps tome value by character level', () => {
    expect(tomeCapAtLevel(1)).toBe(2)
    expect(tomeCapAtLevel(3)).toBe(3)
    expect(tomeCapAtLevel(7)).toBe(4)
    expect(tomeCapAtLevel(15)).toBe(6)
    expect(tomeCapAtLevel(20)).toBe(7)
    expect(tomeCapAtLevel(34)).toBeGreaterThan(7)
  })

  it('allAbilitiesAtLevel returns one entry per ability with race+tome+lvlups', () => {
    const b = emptyBuild()
    b.baseAbilities.Wisdom = 14
    b.abilityTomes = { Wisdom: 5 }
    b.abilityLevelUps = { 4: 'Wisdom' }
    const at4 = allAbilitiesAtLevel(b, 4, { Wisdom: 2 })
    // 14 base + 2 race + 1 levelup + min(5, tomeCap@4=3) = 20
    expect(at4.Wisdom).toBe(20)
  })
})

describe('aggregateLevelClasses', () => {
  it('preserves first-seen order rather than alphabetical', () => {
    const agg = aggregateLevelClasses(['Wizard', 'Fighter', 'Wizard'])
    expect(agg[0].name).toBe('Wizard')
    expect(agg[0].levels).toBe(2)
    expect(agg[1].name).toBe('Fighter')
    expect(agg[1].levels).toBe(1)
  })

  it('handles empty slots without producing phantom classes', () => {
    const agg = aggregateLevelClasses(['Fighter', '', '', 'Fighter'])
    expect(agg[0].name).toBe('Fighter')
    expect(agg[0].levels).toBe(2)
    expect(agg[1].name).toBe('')
  })
})
