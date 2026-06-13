// V2 parity: shared lib/requirements.ts engine.
//
// V2 sources cited:
//   Requirement.cpp:780-836  Class / ClassMinLevel / BaseClassMinLevel
//   Requirement.cpp:858-870  SpecificLevel
//   Requirement.cpp:880-905  Ability / Skill / BAB

import { describe, expect, it } from 'vitest'
import { meetsRequirements } from '../lib/requirements'
import { emptyBuild } from '../types/ddo'
import type { CharacterBuild, DDOClass, Race, Requirements } from '../types/ddo'

const allClasses: DDOClass[] = [
  { Name: 'Fighter', BAB: '0 1 2 3 4 5 6 7 8 9 10 11 12 13 14 15 16 17 18 19 20' },
  { Name: 'Wizard', BAB: '0 0 1 1 2 2 3 3 4 4 5 5 6 6 7 7 8 8 9 9 10' },
  { Name: 'Sacred Fist', BaseClass: 'Fighter', BAB: '0 1 2 3 4 5 6 7 8 9 10 11 12 13 14 15 16 17 18 19 20' },
  { Name: 'Epic', BAB: '0 0 1 1 2 2 3 3 4 4 5' },
  { Name: 'Legendary', BAB: '0 0 1 1 2' },
]

const human: Race = { Name: 'Human', Strength: 0 } as Race
const dwarf = { Name: 'Dwarf', Strength: 0, Constitution: 2 } as unknown as Race

function buildWith(overrides: Partial<CharacterBuild>): CharacterBuild {
  // emptyBuild() returns epicLevels=10/legendaryLevels=4 by default; reset
  // them so tests focused on heroic state don't pick up phantom BAB.
  return { ...emptyBuild(), epicLevels: 0, legendaryLevels: 0, ...overrides } as CharacterBuild
}

describe('shared requirements engine — V2 Requirement.cpp parity', () => {
  it('Class returns true when the class is taken at level >= Value', () => {
    const build = buildWith({
      classes: [{ name: 'Fighter', levels: 5 }, { name: '', levels: 0 }, { name: '', levels: 0 }],
      levelClasses: Array.from({ length: 5 }, () => 'Fighter'),
      totalLevel: 5,
    })
    const reqs: Requirements = { Requirement: [{ Type: 'Class', Item: 'Fighter', Value: 3 }] }
    expect(meetsRequirements(reqs, { build, allClasses, race: human })).toBe(true)
  })

  it('ClassMinLevel rejects a build that does not have enough levels in that class', () => {
    const build = buildWith({
      classes: [{ name: 'Wizard', levels: 1 }, { name: '', levels: 0 }, { name: '', levels: 0 }],
      levelClasses: ['Wizard'],
      totalLevel: 1,
    })
    const reqs: Requirements = { Requirement: [{ Type: 'ClassMinLevel', Item: 'Fighter', Value: 4 }] }
    expect(meetsRequirements(reqs, { build, allClasses })).toBe(false)
  })

  it('BaseClassMinLevel counts derived classes (Sacred Fist → Fighter)', () => {
    const build = buildWith({
      classes: [{ name: 'Sacred Fist', levels: 4 }, { name: '', levels: 0 }, { name: '', levels: 0 }],
      levelClasses: Array.from({ length: 4 }, () => 'Sacred Fist'),
      totalLevel: 4,
    })
    const reqs: Requirements = { Requirement: [{ Type: 'BaseClassMinLevel', Item: 'Fighter', Value: 4 }] }
    expect(meetsRequirements(reqs, { build, allClasses })).toBe(true)
  })

  it('Ability uses base + race + level-ups + capped tome', () => {
    const build = buildWith({
      baseAbilities: { Strength: 14, Dexterity: 8, Constitution: 14, Intelligence: 8, Wisdom: 8, Charisma: 8 },
      abilityLevelUps: { 4: 'Constitution' },
      abilityTomes: { Constitution: 5 },
      classes: [{ name: 'Fighter', levels: 7 }, { name: '', levels: 0 }, { name: '', levels: 0 }],
      levelClasses: Array.from({ length: 7 }, () => 'Fighter'),
      totalLevel: 7,
    })
    const reqs: Requirements = { Requirement: [{ Type: 'Ability', Item: 'Constitution', Value: 18 }] }
    // 14 base + 2 race + 1 levelup + min(5, tomeCap@7=4) = 21 >= 18
    expect(meetsRequirements(reqs, { build, allClasses, race: dwarf })).toBe(true)
  })

  it('BAB sums per-class tables (Fighter 5 / Wizard 5 → 5 + 2 = 7)', () => {
    const build = buildWith({
      classes: [{ name: 'Fighter', levels: 5 }, { name: 'Wizard', levels: 5 }, { name: '', levels: 0 }],
      levelClasses: ['Fighter', 'Wizard', 'Fighter', 'Wizard', 'Fighter', 'Wizard', 'Fighter', 'Wizard', 'Fighter', 'Wizard'],
      totalLevel: 10,
    })
    const reqs: Requirements = { Requirement: [{ Type: 'BAB', Value: 7 }] }
    expect(meetsRequirements(reqs, { build, allClasses })).toBe(true)
    const tooHigh: Requirements = { Requirement: [{ Type: 'BAB', Value: 8 }] }
    expect(meetsRequirements(tooHigh, { build, allClasses })).toBe(false)
  })

  it('SpecificLevel + Level both check against totalLevel', () => {
    const build = buildWith({ totalLevel: 5 })
    expect(meetsRequirements({ Requirement: [{ Type: 'Level', Value: 4 }] }, { build, allClasses })).toBe(true)
    expect(meetsRequirements({ Requirement: [{ Type: 'SpecificLevel', Value: 6 }] }, { build, allClasses })).toBe(false)
  })

  it('RequiresOneOf passes when any one inner requirement matches', () => {
    const build = buildWith({
      classes: [{ name: 'Wizard', levels: 5 }, { name: '', levels: 0 }, { name: '', levels: 0 }],
      levelClasses: Array.from({ length: 5 }, () => 'Wizard'),
      totalLevel: 5,
    })
    const reqs: Requirements = {
      RequiresOneOf: [{
        Requirement: [
          { Type: 'Class', Item: 'Fighter' },
          { Type: 'Class', Item: 'Wizard' },
        ],
      }],
    }
    expect(meetsRequirements(reqs, { build, allClasses })).toBe(true)
  })

  it('RequiresNoneOf fails the check when any inner requirement matches', () => {
    const build = buildWith({
      classes: [{ name: 'Wizard', levels: 5 }, { name: '', levels: 0 }, { name: '', levels: 0 }],
      levelClasses: Array.from({ length: 5 }, () => 'Wizard'),
      totalLevel: 5,
    })
    const reqs: Requirements = {
      RequiresNoneOf: [{
        Requirement: [{ Type: 'Class', Item: 'Wizard' }],
      }],
    }
    expect(meetsRequirements(reqs, { build, allClasses })).toBe(false)
  })

  it('Skill / Stance stay permissive without context; EnemyType hard-fails (V2 :467/:513)', () => {
    const build = buildWith({})
    expect(meetsRequirements({ Requirement: [{ Type: 'Skill', Item: 'Spot', Value: 10 }] }, { build, allClasses })).toBe(true)
    expect(meetsRequirements({ Requirement: [{ Type: 'Stance', Item: 'Shield Mastery' }] }, { build, allClasses })).toBe(true)
    // V2 parity: both Requirements::Met and CanTrainEnhancement use
    // `case Requirement_EnemyType: met = false` — never met in the planner.
    expect(meetsRequirements({ Requirement: [{ Type: 'EnemyType', Item: 'Undead' }] }, { build, allClasses })).toBe(false)
  })
})
