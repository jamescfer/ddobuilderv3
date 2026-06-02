/**
 * Section G/H parity — race-form auto-stance.
 *
 * V2 StancesPane.cpp:329-354 adds an Auto-controlled stance named after every
 * race (gated on Requirement_Race); CStanceButton::Evaluate auto-activates it
 * when the build's race matches. Effects gated on Requirement_Stance:<raceName>
 * (e.g. Bladeforged's +10 Repair/Rust spell power, Bladeforged.race.xml) never
 * fired in V3 because the race stance was not auto-activated — stances were
 * purely gear-derived or player-toggled. This pass mirrors the auto race stance.
 */

import { describe, it, expect } from 'vitest'
import { computeBuildStats, type BuildStatsInput } from '../hooks/useBuildStats'
import { emptyBuild as makeEmptyBuild } from '../types/ddo'
import type {
  DDOClass, Feat, Race, EnhancementTree, Item, OptionalBuff,
  SetBonus, Augment, FiligreeSetBonus, Filigree,
} from '../types/ddo'
import type { WeaponGroupSpec } from '../lib/weapons/groups'

const fighterClass = {
  Name: 'Fighter', HitPoints: 10, Fortitude: 'Type2', Reflex: 'Type1',
  Will: 'Type1', BAB: '1 1',
} as unknown as DDOClass

const bladeforged = { Name: 'Bladeforged' } as unknown as Race
const human = { Name: 'Human' } as unknown as Race

// PRR gated on a stance named after a race — a clean sensor for "is the race
// stance auto-active?".
function raceStanceFeat(name: string, stance: string): Feat {
  return {
    Name: name, Acquire: 'Train',
    Effect: {
      Type: 'PRR', Bonus: 'Stance', AType: 'Simple', Amount: '9',
      Requirements: { Requirement: { Type: 'Stance', Item: stance } },
    },
  } as unknown as Feat
}

function input(feats: Feat[]): BuildStatsInput {
  return {
    allRaces: [bladeforged, human],
    allClasses: [fighterClass],
    allFeats: feats,
    allTrees: [] as EnhancementTree[],
    gearItems: {} as Record<string, Item>,
    allSelfBuffs: [] as OptionalBuff[],
    allAugments: [] as Augment[],
    allSetBonuses: [] as SetBonus[],
    allFiligreeBonuses: [] as FiligreeSetBonus[],
    allFiligrees: [] as Filigree[],
    allWeaponGroups: [] as WeaponGroupSpec[],
  }
}

function build(race: string, featName: string) {
  return {
    ...makeEmptyBuild(),
    race,
    classes: [{ name: 'Fighter', levels: 2 }],
    levelClasses: ['Fighter', 'Fighter'],
    totalLevel: 2,
    baseAbilities: {
      Strength: 10, Dexterity: 10, Constitution: 10,
      Intelligence: 10, Wisdom: 10, Charisma: 10,
    },
    featChoices: { '1': featName },
  }
}

describe('race-form auto-stance', () => {
  it('the build race name is an active stance (Bladeforged effect fires)', () => {
    const stats = computeBuildStats(
      input([raceStanceFeat('BF Sensor', 'Bladeforged')]),
      build('Bladeforged', 'BF Sensor'),
    )
    expect(stats.total('prr')).toBe(9)
  })

  it('a different race does not activate the race stance', () => {
    const stats = computeBuildStats(
      input([raceStanceFeat('BF Sensor', 'Bladeforged')]),
      build('Human', 'BF Sensor'),
    )
    expect(stats.total('prr')).toBe(0)
  })
})
