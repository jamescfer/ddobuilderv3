// V3 → V2 → V3 round-trip: import a real V2 .DDOBuild file, export it back to
// V2 XML via exportV2Build, then re-import the result. Every field V3 models
// must survive the round trip unchanged. This is the regression guard for the
// .DDOBuild exporter (the write-back counterpart to v2Import).
//
// Unlike v2RoundTrip.test.ts (which only imports + computes stats), this test
// actually re-serialises and proves load → save → load fidelity.
//
// V2 source: Output/Example Builds/YingsMonk.DDOBuild

import { describe, expect, it } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'
import { importV2Build } from '../lib/v2Import'
import { exportV2Build } from '../lib/v2Export'

const FIXTURE_DIR = join(__dirname, '..', '..', '..', 'Output', 'Example Builds')

function load(name: string): string {
  return readFileSync(join(FIXTURE_DIR, name), 'utf-8')
}

function roundTrip(file: string) {
  const xml = load(file)
  const first = importV2Build(xml).build
  const exported = exportV2Build(first)
  const second = importV2Build(exported).build
  return { first, exported, second }
}

const FILES = ['YingsMonk.DDOBuild', 'Maetrim_EndGameHandwrapsMonk.DDOBuild']

describe('exportV2Build produces valid V2 XML', () => {
  it('emits a well-formed DDOBuilderCharacterData document', () => {
    const { exported } = roundTrip('YingsMonk.DDOBuild')
    expect(exported).toContain('<?xml version="1.0"?>')
    expect(exported).toContain('<DDOBuilderCharacterData>')
    expect(exported).toContain('<Character version="1">')
    expect(exported).toContain('<Life version="1">')
    expect(exported).toContain('<Build version="1">')
    expect(exported).toContain('</DDOBuilderCharacterData>')
  })
})

describe.each(FILES)('round-trip fidelity: %s', (file) => {
  it('preserves identity + class composition', () => {
    const { first, second } = roundTrip(file)
    expect(second.name).toBe(first.name)
    expect(second.race).toBe(first.race)
    expect(second.alignment).toBe(first.alignment)
    expect(second.levelClasses).toEqual(first.levelClasses)
    expect(second.totalLevel).toBe(first.totalLevel)
    expect(second.epicLevels).toBe(first.epicLevels)
    expect(second.legendaryLevels).toBe(first.legendaryLevels)
    expect(second.classes).toEqual(first.classes)
  })

  it('preserves abilities + tomes + level-ups', () => {
    const { first, second } = roundTrip(file)
    expect(second.baseAbilities).toEqual(first.baseAbilities)
    expect(second.abilityTomes).toEqual(first.abilityTomes)
    expect(second.skillTomes).toEqual(first.skillTomes)
    expect(second.abilityLevelUps).toEqual(first.abilityLevelUps)
  })

  it('preserves feats + per-level skills', () => {
    const { first, second } = roundTrip(file)
    expect(second.featChoices).toEqual(first.featChoices)
    expect(second.skillRanks).toEqual(first.skillRanks)
    expect(second.skillRanksByLevel).toEqual(first.skillRanksByLevel)
  })

  it('preserves enhancement / destiny / reaper spend', () => {
    const { first, second } = roundTrip(file)
    expect(second.enhancementChoices).toEqual(first.enhancementChoices)
    expect(second.enhancementSelections).toEqual(first.enhancementSelections)
    expect(second.destinyChoices).toEqual(first.destinyChoices)
    expect(second.destinySelections).toEqual(first.destinySelections)
    expect(second.reaperChoices).toEqual(first.reaperChoices)
    expect(second.selectedDestinyTrees).toEqual(first.selectedDestinyTrees)
    expect(second.activeEpicDestiny).toBe(first.activeEpicDestiny)
  })

  it('preserves gear, augments + named gear sets', () => {
    const { first, second } = roundTrip(file)
    expect(second.gear).toEqual(first.gear)
    expect(second.augmentChoices).toEqual(first.augmentChoices)
    expect(second.namedGearSets).toEqual(first.namedGearSets)
    expect(second.namedGearAugments).toEqual(first.namedGearAugments)
    expect(second.activeGearSetName).toBe(first.activeGearSetName)
  })

  it('preserves active stances + notes + guild', () => {
    const { first, second } = roundTrip(file)
    expect(new Set(second.activeBuffs)).toEqual(new Set(first.activeBuffs))
    expect(second.notes).toBe(first.notes)
    expect(second.guildLevel).toBe(first.guildLevel)
    expect(second.applyGuildBuffs).toBe(first.applyGuildBuffs)
  })

  it('preserves past-life counts', () => {
    const { first, second } = roundTrip(file)
    expect(second.pastLives).toEqual(first.pastLives)
  })
})
