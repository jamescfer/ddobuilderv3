// Section C parity regression tests for the read/write-fidelity gaps F1–F5.
//
// Covers the multi-life / multi-build document import (F1), the previously
// dropped Build fields (F3: TrainedSpells, AttackChains, FavorFeats,
// GearSetSnapshot + Snapshot*), Character/Life-level fields (F4:
// ContentIDontOwn, Life SpecialFeats) and the past-life Type round-trip (F5).
//
// Each field is checked through a full import → export → re-import cycle so
// the document layer stays byte-faithful for the fields V3 models.
//
// V2 fixtures: Output/Example Builds/*.DDOBuild

import { describe, expect, it } from 'vitest'
import { existsSync, readFileSync } from 'fs'
import { join } from 'path'
import { importV2Build, importV2Document } from '../lib/v2Import'
import { exportV2Build, exportV2DocumentModel } from '../lib/v2Export'
import { loadAllCatalogues } from '../server/dataLoaders'
import type { Item } from '../types/ddo'

const FIXTURE_DIR = join(__dirname, '..', '..', '..', 'Output', 'Example Builds')
const DATA_DIR = join(__dirname, '..', '..', '..', 'Output', 'DataFiles')
function load(name: string): string {
  return readFileSync(join(FIXTURE_DIR, name), 'utf-8')
}

describe('F1 — multi-life / multi-build document import', () => {
  it('imports every build in a multi-build life (Maetrim: 35 builds)', () => {
    const { document } = importV2Document(load('Maetrim_EndGameHandwrapsMonk.DDOBuild'))
    expect(document.lives).toHaveLength(1)
    expect(document.lives[0].builds).toHaveLength(35)
  })

  it('preserves the active life/build selection (Maetrim ActiveBuildIndex=34)', () => {
    const { document } = importV2Document(load('Maetrim_EndGameHandwrapsMonk.DDOBuild'))
    const life = document.lives.find(l => l.id === document.activeLifeId)
    expect(life).toBeDefined()
    const build = life!.builds.find(b => b.id === document.activeBuildId)
    expect(build).toBeDefined()
    // ActiveBuildIndex 34 → last of the 35 builds.
    expect(life!.builds.indexOf(build!)).toBe(34)
  })

  it('importV2Build returns the SAME active build as the document', () => {
    const xml = load('Maetrim_EndGameHandwrapsMonk.DDOBuild')
    const { build, document } = importV2Build(xml)
    const life = document.lives.find(l => l.id === document.activeLifeId)!
    const activeBuild = life.builds.find(b => b.id === document.activeBuildId)!
    expect(build.id).toBe(activeBuild.id)
    expect(build.name).toBe(activeBuild.name)
  })

  it('round-trips all builds through exportV2DocumentModel', () => {
    const { document } = importV2Document(load('Maetrim_EndGameHandwrapsMonk.DDOBuild'))
    const xml = exportV2DocumentModel(document)
    const { document: second } = importV2Document(xml)
    expect(second.lives).toHaveLength(document.lives.length)
    expect(second.lives[0].builds).toHaveLength(document.lives[0].builds.length)
    // Active selection survives.
    const firstActive = document.lives[0].builds.findIndex(b => b.id === document.activeBuildId)
    const secondActive = second.lives[0].builds.findIndex(b => b.id === second.activeBuildId)
    expect(secondActive).toBe(firstActive)
    // Per-build class composition survives for a sampling of builds. The
    // exporter always emits 20 heroic LevelTraining rows, so re-import pads
    // partial (sub-20) builds with trailing empty levels — compare only the
    // assigned (non-empty) class levels.
    const assigned = (cs?: string[]) => (cs ?? []).filter(Boolean)
    for (const i of [0, 10, 34]) {
      expect(assigned(second.lives[0].builds[i].levelClasses))
        .toEqual(assigned(document.lives[0].builds[i].levelClasses))
    }
  })
})

describe('F3 — previously dropped Build fields round-trip', () => {
  it('imports + round-trips FavorFeats (YingsMonk has House favor rewards)', () => {
    const xml = load('YingsMonk.DDOBuild')
    const first = importV2Build(xml).build
    expect(first.favorFeats?.length ?? 0).toBeGreaterThan(0)
    expect(first.favorFeats).toContain('House Deneith Favor Rewards')
    const second = importV2Build(exportV2Build(first)).build
    expect(second.favorFeats).toEqual(first.favorFeats)
  })

  it('imports + round-trips per-set ability Snapshots + GearSetSnapshot', () => {
    const xml = load('YingsMonk.DDOBuild')
    const first = importV2Build(xml).build
    expect(first.gearSetSnapshot).toBe('Trance')
    expect(Object.keys(first.gearSetSnapshots ?? {}).length).toBeGreaterThan(0)
    // Trance set snapshot values from the fixture.
    const trance = first.gearSetSnapshots!['Trance']
    expect(trance).toBeDefined()
    expect(trance.Wisdom).toBe(113)
    const second = importV2Build(exportV2Build(first)).build
    expect(second.gearSetSnapshot).toBe(first.gearSetSnapshot)
    expect(second.gearSetSnapshots).toEqual(first.gearSetSnapshots)
  })

  it('round-trips trained spells when present (synthetic caster build)', () => {
    const base = importV2Build(load('YingsMonk.DDOBuild')).build
    base.trainedSpells = {
      Wizard: { 1: ['Magic Missile', 'Shield'], 3: ['Fireball'] },
    }
    const second = importV2Build(exportV2Build(base)).build
    expect(second.trainedSpells).toEqual(base.trainedSpells)
  })

  it('round-trips attack chains + active chain (synthetic)', () => {
    const base = importV2Build(load('YingsMonk.DDOBuild')).build
    base.attackChains = { 'Boss DPS': ['Attack', 'Attack', 'Stunning Fist'] }
    base.activeAttackChain = 'Boss DPS'
    const second = importV2Build(exportV2Build(base)).build
    expect(second.attackChains).toEqual(base.attackChains)
    expect(second.activeAttackChain).toBe('Boss DPS')
  })
})

describe('F4 — ContentIDontOwn + Life SpecialFeats', () => {
  it('round-trips Life-level SpecialFeats (YingsMonk has Falconry/Vistani access)', () => {
    const { document } = importV2Document(load('YingsMonk.DDOBuild'))
    const life = document.lives[0]
    expect(life.specialFeats).toContain('Falconry Tree')
    expect(life.specialFeats).toContain('Vistani Knife Fighter Tree')
    const xml = exportV2DocumentModel(document)
    const { document: second } = importV2Document(xml)
    expect(new Set(second.lives[0].specialFeats)).toEqual(new Set(life.specialFeats))
  })

  it('round-trips Character-level ContentIDontOwn (synthetic)', () => {
    const { document } = importV2Document(load('YingsMonk.DDOBuild'))
    document.contentIDontOwn = ['Menace of the Underdark', 'Shadowfell Conspiracy']
    const xml = exportV2DocumentModel(document)
    const { document: second } = importV2Document(xml)
    expect(second.contentIDontOwn).toEqual(document.contentIDontOwn)
  })
})

const haveData = existsSync(DATA_DIR)
const maybeDescribe = haveData ? describe : describe.skip

maybeDescribe('F2 — gear-effect embedding in the exporter', () => {
  it('embeds each equipped item full <Buff> definition when a catalogue is passed', () => {
    const build = importV2Build(load('YingsMonk.DDOBuild')).build
    const cat = loadAllCatalogues(DATA_DIR)
    const byName = new Map<string, Item>()
    for (const item of cat.allItems) byName.set(item.Name, item)

    // Without a catalogue: gear is emitted by name only (no embedded Buffs).
    const nameOnly = exportV2Build(build)
    // With a catalogue: full item definitions are embedded.
    const embedded = exportV2Build(build, byName)

    expect(embedded.length).toBeGreaterThan(nameOnly.length)
    // The embedded output carries <Buff> blocks inside <EquippedGear>; the
    // name-only output (for the same gear) carries none from item definitions.
    expect((embedded.match(/<Buff>/g) ?? []).length).toBeGreaterThan(0)

    // Pick an equipped item that exists in the catalogue and assert its buff
    // metadata is present in the embedded XML.
    const equippedName = Object.values(build.gear).find(n => byName.has(n))
    expect(equippedName).toBeDefined()
    const item = byName.get(equippedName!)!
    if (item.Material) expect(embedded).toContain(`<Material>${item.Material}</Material>`)
  })

  it('embedded gear still round-trips item NAMES + augments intact', () => {
    const build = importV2Build(load('YingsMonk.DDOBuild')).build
    const cat = loadAllCatalogues(DATA_DIR)
    const byName = new Map<string, Item>()
    for (const item of cat.allItems) byName.set(item.Name, item)
    const second = importV2Build(exportV2Build(build, byName)).build
    expect(second.gear).toEqual(build.gear)
    expect(second.augmentChoices).toEqual(build.augmentChoices)
    expect(second.namedGearSets).toEqual(build.namedGearSets)
    expect(second.namedGearAugments).toEqual(build.namedGearAugments)
  })
})

describe('F5 — past-life Type round-trip', () => {
  it('reproduces the exact V2 past-life Type via captured pastLifeTypes', () => {
    const xml = load('YingsMonk.DDOBuild')
    const first = importV2Build(xml).build
    expect(Object.keys(first.pastLifeTypes ?? {}).length).toBeGreaterThan(0)
    const exported = exportV2Build(first)
    const second = importV2Build(exported).build
    expect(second.pastLives).toEqual(first.pastLives)
    expect(second.pastLifeTypes).toEqual(first.pastLifeTypes)
    // Heroic past lives keep the "Past Life: " prefix + HeroicPastLife type.
    expect(exported).toContain('<FeatName>Past Life: Alchemist</FeatName>')
    expect(exported).toContain('<Type>HeroicPastLife</Type>')
  })
})
