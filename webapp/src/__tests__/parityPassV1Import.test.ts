// Parity pass: V1 .ddocp importer (File → Import V1 file...).
//
// V2 reads legacy DDOBuilder-V1 .ddocp files (root <DDOCharacterData>) via
// CDDOBuilderApp::OnFileImport (DDOBuilder.cpp:294-325) + the Legacy* SAX
// classes, then converts them with ConvertToNewDataStructure
// (DDOBuilder.cpp:1793-1949). These tests exercise the V3 port
// (src/lib/v1Import.ts) against a synthetic-but-schema-accurate fixture
// (fixtures/v1Example.ddocp) built from the Legacy* headers.

import { describe, expect, it } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'
import { importV1Build, isV1CharacterXml } from '../lib/v1Import'

const xml = readFileSync(join(__dirname, 'fixtures', 'v1Example.ddocp'), 'utf-8')

function importFixture() {
  const { document, warnings } = importV1Build(xml)
  const life = document.lives[0]
  const build = life.builds[0]
  return { document, warnings, life, build }
}

describe('V1 .ddocp detection', () => {
  it('recognises the DDOCharacterData root', () => {
    expect(isV1CharacterXml(xml)).toBe(true)
    expect(isV1CharacterXml('<DDOBuilderCharacterData><Character/></DDOBuilderCharacterData>')).toBe(false)
    expect(isV1CharacterXml('{"id":"x"}')).toBe(false)
  })
})

describe('V1 importer — identity / race / alignment', () => {
  const { document, life, build } = importFixture()

  it('produces a single-life single-build document with active ids set', () => {
    expect(document.lives.length).toBe(1)
    expect(life.builds.length).toBe(1)
    expect(document.activeLifeId).toBe(life.id)
    expect(document.activeBuildId).toBe(build.id)
  })

  it('imports name, race and alignment (DDOBuilder.cpp:1802-1804)', () => {
    expect(document.name).toBe('Korvash the Reborn')
    expect(build.name).toBe('Korvash the Reborn')
    expect(build.race).toBe('Human')
    expect(build.alignment).toBe('Lawful Good')
  })

  it('keeps notes verbatim (V2 only rewrites \\n→\\r\\n for MFC)', () => {
    expect(build.notes).toContain('Imported from DDOBuilder V1.')
    expect(build.notes).toContain('Second line of notes.')
  })
})

describe('V1 importer — class levels', () => {
  const { build } = importFixture()

  it('imports the heroic per-level class array (19 Paladin / 1 Fighter)', () => {
    expect(build.totalLevel).toBe(20)
    expect(build.levelClasses?.length).toBe(20)
    expect(build.levelClasses?.[0]).toBe('Paladin')
    expect(build.levelClasses?.[2]).toBe('Fighter')
    expect(build.classes[0]).toEqual({ name: 'Paladin', levels: 19 })
    expect(build.classes[1]).toEqual({ name: 'Fighter', levels: 1 })
    expect(build.classes[2].name).toBe('')
  })

  it('imports epic levels from the "Epic" LevelTraining entries', () => {
    expect(build.epicLevels).toBe(10)
    expect(build.legendaryLevels).toBe(0)
  })
})

describe('V1 importer — ability points / tomes / level-ups', () => {
  const { document, build } = importFixture()

  it('maps the AbilitySpend point-buy to scores (DDOBuilder.cpp:1821)', () => {
    expect(build.baseAbilities.Strength).toBe(16)     // 10 pts
    expect(build.baseAbilities.Dexterity).toBe(10)    // 2 pts
    expect(build.baseAbilities.Constitution).toBe(14) // 6 pts
    expect(build.baseAbilities.Intelligence).toBe(12) // 4 pts
    expect(build.baseAbilities.Wisdom).toBe(8)        // 0 pts
    expect(build.baseAbilities.Charisma).toBe(14)     // 6 pts
  })

  it('imports ability tomes (DDOBuilder.cpp:1805-1810)', () => {
    expect(build.abilityTomes.Strength).toBe(4)
    expect(build.abilityTomes.Constitution).toBe(3)
    expect(build.abilityTomes.Wisdom).toBe(1)
    expect(document.characterTomes.Strength).toBe(4)
  })

  it('imports skill tomes (DDOBuilder.cpp:1822)', () => {
    expect(build.skillTomes.Balance).toBe(2)
    expect(build.skillTomes.UMD).toBe(3)
    expect(build.skillTomes.Intimidate).toBe(1)
  })

  it('imports Level4..Level40 ability level-ups (DDOBuilder.cpp:1811-1820)', () => {
    expect(build.abilityLevelUps[4]).toBe('Strength')
    expect(build.abilityLevelUps[16]).toBe('Constitution')
    expect(build.abilityLevelUps[28]).toBe('Strength')
    expect(build.abilityLevelUps[32]).toBeUndefined()
  })
})

describe('V1 importer — feats', () => {
  const { build, life } = importFixture()

  it('places universal standard feats in heroic-N slots', () => {
    expect(build.featChoices['heroic-1']).toBe('Power Attack')
    expect(build.featChoices['heroic-3']).toBe('Cleave')
    expect(build.featChoices['heroic-6']).toBe('Improved Critical: Slashing Weapons')
  })

  it('translates old V1 feat names (TrainedFeat::TranslateOldFeatNames)', () => {
    // "Purity of Heart" was renamed "Purity of Spirit".
    expect(build.featChoices['heroic-9']).toBe('Purity of Spirit')
  })

  it('places race / class bonus feats in their slot keys', () => {
    expect(build.featChoices['race-1-Human Bonus Feat-0']).toBe('Cleave')
    expect(build.featChoices['Fighter-1-Fighter Bonus-0']).toBe('Great Cleave')
  })

  it('places epic feats in epic-N slots', () => {
    expect(build.featChoices['epic-1-Standard-0']).toBe('Overwhelming Critical')
    expect(build.featChoices['epic-7-EpicDestinyFeat-0']).toBe('First Blood')
    expect(build.featChoices['epic-9-EpicDestinyFeat-0']).toBe('Hellball')
  })

  it('folds SpecialFeats past lives into pastLives with name translation', () => {
    expect(build.pastLives['Fighter']).toBe(2)
    expect(build.pastLifeTypes['Fighter']).toBe('HeroicPastLife')
    // "Past Life: Fighter (Dragon Lord)" → "Past Life: Fighter - Dragon Lord"
    expect(build.pastLives['Fighter - Dragon Lord']).toBe(1)
    expect(build.pastLives['Human']).toBe(1)
    expect(build.pastLifeTypes['Human']).toBe('RacialPastLife')
  })

  it('keeps non-past-life special feats on the life', () => {
    expect(life.specialFeats).toContain('Falconry Tree')
  })
})

describe('V1 importer — skills', () => {
  const { build } = importFixture()

  it('accumulates total skill ranks from TrainedSkill entries', () => {
    expect(build.skillRanks['Intimidate']).toBe(23)
    expect(build.skillRanks['UMD']).toBe(23)
    expect(build.skillRanks['Balance']).toBe(20)
    expect(build.skillRanks['Jump']).toBe(3)
  })

  it('records per-level skill spends', () => {
    expect(build.skillRanksByLevel?.[1]?.['Intimidate']).toBe(4)
    expect(build.skillRanksByLevel?.[1]?.['UMD']).toBe(4)
    expect(build.skillRanksByLevel?.[3]?.['Jump']).toBe(1)
  })
})

describe('V1 importer — enhancements / destinies / reaper', () => {
  const { build } = importFixture()

  it('imports enhancement tree spends keyed by translated tree name', () => {
    expect(build.enhancementChoices['Knight of the Chalice']).toEqual({
      KotCSlayerOfEvil: 1, KotCExtraSmite: 3, KotCDivineMight: 1,
    })
    expect(build.enhancementSelections['Knight of the Chalice']).toEqual({
      KotCDivineMight: 'Divine Might',
    })
  })

  it('applies the V1→V2 tree-name migration (SelectedTrees::TranslateNamesFromV1)', () => {
    // "Ravager (Ftr)" → "Ravager (Fighter)"; the old name must be gone.
    expect(build.enhancementChoices['Ravager (Fighter)']).toEqual({
      RavagerCore1: 1, RavagerFuryEternal: 3,
    })
    expect(build.enhancementChoices['Ravager (Ftr)']).toBeUndefined()
    expect(build.enhancementPinned).toContain('Ravager (Fighter)')
    expect(build.enhancementPinned).not.toContain('Ravager (Ftr)')
  })

  it('pins zero-spend selected trees too', () => {
    expect(build.enhancementPinned).toContain('Sacred Defender')
    expect(build.enhancementPinned).not.toContain('No selection')
  })

  it('imports destiny selection + spends and the U51 tier-5 destiny', () => {
    expect(build.selectedDestinyTrees).toEqual([
      'Legendary Dreadnought', 'Divine Crusader', 'Fury of the Wild',
    ])
    expect(build.activeEpicDestiny).toBe('Legendary Dreadnought')
    expect(build.destinyChoices['Legendary Dreadnought']).toEqual({
      LDCore1: 1, LDMomentumSwing: 3,
    })
  })

  it('imports reaper tree spends', () => {
    expect(build.reaperChoices['Dread Adversary']).toEqual({ DreadAdversaryCore1: 1 })
  })
})

describe('V1 importer — spells', () => {
  const { build } = importFixture()

  it('imports TrainedSpell entries grouped by class and level', () => {
    expect(build.trainedSpells['Paladin'][1]).toEqual(['Cure Light Wounds', 'Divine Favor'])
    expect(build.trainedSpells['Paladin'][2]).toEqual(['Resist Energy'])
  })
})

describe('V1 importer — gear', () => {
  const { build, warnings } = importFixture()

  it('imports the active gear set (ActiveGear name match)', () => {
    expect(build.activeGearSetName).toBe('Standard')
    expect(build.gear['Necklace']).toBe('Spiked Collar of Strahd')
    expect(build.gear['Armor']).toBe('Legendary Armor of the Untouchable')
    expect(build.gear['Main Hand']).toBe('Echo of the Bloodletter')
    expect(build.gear['Off Hand']).toBe('Legendary Stalwart Tower Shield')
    expect(build.gear['Ring']).toBe("Band of Diani ir'Wynarn")
  })

  it('applies the Legendary Greensteel item rename (LegacyItem.cpp:45-59)', () => {
    expect(build.gear['Helmet']).toBe('Legendary Green Steel Helm of Escalation')
  })

  it('imports item augments as slot:type:index keys', () => {
    expect(build.augmentChoices['Helmet:Blue:0']).toBe('Sapphire of Defense +11')
    expect(build.augmentChoices['Main Hand:Red:0']).toBe('Ruby Eye of Force')
  })

  it('imports every gear set into namedGearSets', () => {
    expect(Object.keys(build.namedGearSets).sort()).toEqual(['Boss Beater', 'Standard'])
    expect(build.namedGearSets['Boss Beater']['Main Hand']).toBe('Sword of the Thousand Suns')
  })

  it('warns about cosmetic items V3 cannot represent', () => {
    expect(warnings.some(w => w.includes('Cosmetic Helmet of Style'))).toBe(true)
  })

  it('imports the sentient jewel with filigree name migration', () => {
    expect(build.sentientGem.personality).toBe('The Lone Candle')
    expect(build.filigreeSlots[0]).toEqual({
      name: 'Eye of the Beholder: +6 Universal Spell Power', rare: true,
    })
    expect(build.filigreeSlots[1]).toEqual({ name: 'Prowess: +4 Melee Power', rare: false })
    expect(build.filigreeSlots[2].name).toBe('The Serpent: +9 Negative/Poison Spell Power')
    expect(build.artifactFiligreeSlots[0].name).toBe("Nystul's Mystical Defense: +1 Constitution")
  })
})

describe('V1 importer — malformed input (warnings path)', () => {
  it('reports a missing DDOCharacterData root', () => {
    const { document, warnings } = importV1Build('<SomethingElse><Character/></SomethingElse>')
    expect(document.lives).toEqual([])
    expect(warnings.length).toBe(1)
    expect(warnings[0]).toContain('DDOCharacterData')
  })

  it('reports a missing Character element', () => {
    const { document, warnings } = importV1Build('<DDOCharacterData></DDOCharacterData>')
    expect(document.lives).toEqual([])
    expect(warnings[0]).toContain('<Character>')
  })

  it('reports unparseable XML without throwing', () => {
    const { document, warnings } = importV1Build('<DDOCharacterData><Character><<<')
    expect(document.lives).toEqual([])
    expect(warnings.length).toBeGreaterThan(0)
  })
})
