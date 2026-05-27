import { describe, expect, it } from 'vitest'
import { emitForumExport, DEFAULT_SECTIONS } from '../lib/export/sections'
import { emptyBuild } from '../types/ddo'

// V2 parity: Parity pass 29 — SimpleGear slot order + augments
// V2 ForumExportDlg.cpp ExportGear iterates Inventory_Arrows..Inventory_Count
// (enum order: Arrow, Armor, Belt, Boots, Bracers, Cloak, Gloves, Goggles,
//  Helmet, Necklace, Quiver, Ring, Ring2, Trinket, Main Hand, Off Hand).
// V3's prior implementation sorted alphabetically instead.
// V2 also emits augment choices per item slot.

describe('SimpleGear export (parity pass 29)', () => {
  it('sorts slots in V2 canonical inventory order, not alphabetically', () => {
    const build = {
      ...emptyBuild(),
      gear: {
        Helmet: 'Helm of Knowledge',
        Armor: 'Flawless Blue Dragonscale Robe',
        Belt: 'Belt of Braided Ivy',
      },
    }
    const section = DEFAULT_SECTIONS.find(s => s.id === 'SimpleGear')!
    const lines = section.emit({ build, stats: null })
    const slotLines = lines.filter(l => l.startsWith('  '))
    const slots = slotLines.map(l => l.split(':')[0].trim())
    // V2 order: Armor (index 2) before Belt (index 3) before Helmet (index 9)
    // Alphabetical order would put Armor, Belt, Helmet in the same order by
    // coincidence, so use a slot pair that differs: Helmet vs Armor
    expect(slots.indexOf('Armor')).toBeLessThan(slots.indexOf('Helmet'))
  })

  it('places Weapon slots (Main Hand, Off Hand) after Ring2 and Trinket', () => {
    const build = {
      ...emptyBuild(),
      gear: {
        'Main Hand': 'Falchion of the Claw',
        Helmet: 'Helm of Knowledge',
        Ring: 'Ring of the Stalker',
        Trinket: 'Mysterious Bauble',
      },
    }
    const section = DEFAULT_SECTIONS.find(s => s.id === 'SimpleGear')!
    const lines = section.emit({ build, stats: null })
    const slotLines = lines.filter(l => l.startsWith('  ') && !l.startsWith('    '))
    const slots = slotLines.map(l => l.split(':')[0].trim())
    // V2: Ring before Trinket before Main Hand
    expect(slots.indexOf('Ring')).toBeLessThan(slots.indexOf('Trinket'))
    expect(slots.indexOf('Trinket')).toBeLessThan(slots.indexOf('Main Hand'))
  })

  it('emits augment choices for items after each item line', () => {
    const build = {
      ...emptyBuild(),
      gear: { Ring: 'Ring of the Stalker' },
      augmentChoices: {
        'Ring:Yellow:0': 'Topaz of Greater Acid Spell Lore',
        'Ring:Green:0': 'Emerald of Constitution +8',
      },
    }
    const section = DEFAULT_SECTIONS.find(s => s.id === 'SimpleGear')!
    const lines = section.emit({ build, stats: null })
    const augmentLines = lines.filter(l => l.startsWith('    '))
    expect(augmentLines.length).toBe(2)
    expect(augmentLines).toContain('    Yellow: Topaz of Greater Acid Spell Lore')
    expect(augmentLines).toContain('    Green: Emerald of Constitution +8')
  })

  it('does not emit augment lines when slot has no augment choices', () => {
    const build = {
      ...emptyBuild(),
      gear: { Armor: 'Plain Robe' },
      augmentChoices: {},
    }
    const section = DEFAULT_SECTIONS.find(s => s.id === 'SimpleGear')!
    const lines = section.emit({ build, stats: null })
    const augmentLines = lines.filter(l => l.startsWith('    '))
    expect(augmentLines.length).toBe(0)
  })
})

// V2 parity: Parity pass 33 — AlternateGearLayouts slot order + augments
// V2 AddAlternateGear calls ExportGear for each non-active gear setup, which
// iterates slots in Inventory_Arrows..Inventory_Count enum order and emits
// augment choices per item (ForumExportDlg.cpp:1779-1857).
// V3 sorted slots alphabetically and had no augment data per named gear set.
describe('AlternateGearLayouts export (parity pass 33)', () => {
  it('sorts slots in V2 canonical inventory order, not alphabetically', () => {
    const build = {
      ...emptyBuild(),
      namedGearSets: {
        Raiding: {
          'Main Hand': 'Falchion of the Claw',
          Necklace: 'Necklace of Mystic Eidolons',
        },
      },
    }
    const section = DEFAULT_SECTIONS.find(s => s.id === 'AlternateGearLayouts')!
    const lines = section.emit({ build, stats: null })
    const itemLines = lines.filter(l => l.startsWith('    ') && !l.startsWith('      '))
    const slots = itemLines.map(l => l.trim().split(':')[0].trim())
    // Alphabetical order puts "Main Hand" (M) before "Necklace" (N).
    // V2 canonical order: Necklace (index 9) before Main Hand (index 14).
    expect(slots.indexOf('Necklace')).toBeLessThan(slots.indexOf('Main Hand'))
  })

  it('emits augment choices per item slot for each named gear set', () => {
    const build = {
      ...emptyBuild(),
      namedGearSets: {
        Raiding: { Ring: 'Ring of the Stalker' },
      },
      namedGearAugments: {
        Raiding: {
          'Ring:Yellow:0': 'Topaz of Greater Acid Spell Lore',
          'Ring:Green:0': 'Emerald of Constitution +8',
        },
      },
    }
    const section = DEFAULT_SECTIONS.find(s => s.id === 'AlternateGearLayouts')!
    const lines = section.emit({ build, stats: null })
    const augLines = lines.filter(l => l.startsWith('      '))
    expect(augLines.length).toBe(2)
    expect(augLines).toContain('      Yellow: Topaz of Greater Acid Spell Lore')
    expect(augLines).toContain('      Green: Emerald of Constitution +8')
  })

  it('does not emit augment lines when no augments stored for the set', () => {
    const build = {
      ...emptyBuild(),
      namedGearSets: { Raiding: { Armor: 'Plain Robe' } },
    }
    const section = DEFAULT_SECTIONS.find(s => s.id === 'AlternateGearLayouts')!
    const lines = section.emit({ build, stats: null })
    const augLines = lines.filter(l => l.startsWith('      '))
    expect(augLines.length).toBe(0)
  })
})

describe('emitForumExport', () => {
  it('wraps output in BBCode courier font tags (V2 ForumExportDlg.cpp:195)', () => {
    const text = emitForumExport({ build: emptyBuild(), stats: null })
    expect(text.startsWith('[font=courier]')).toBe(true)
    expect(text.endsWith('[/font]')).toBe(true)
  })

  it('includes character header by default', () => {
    const build = { ...emptyBuild(), name: 'Test Hero', race: 'Dwarf' }
    const text = emitForumExport({ build, stats: null })
    expect(text).toMatch(/Character Name.*Test Hero/)
    expect(text).toMatch(/Race.*Dwarf/)
  })

  it('lists past lives when present', () => {
    const build = { ...emptyBuild(), pastLives: { Fighter: 3, Wizard: 1 } }
    const text = emitForumExport({ build, stats: null })
    expect(text).toMatch(/Past Lives/)
    expect(text).toMatch(/Fighter x3/)
  })

  it('omits empty sections', () => {
    const build = emptyBuild()
    const text = emitForumExport({ build, stats: null })
    // Default empty build has no past lives, no notes, no spells
    expect(text).not.toMatch(/\[b\]Past Lives\[\/b\]/)
    expect(text).not.toMatch(/\[b\]Notes\[\/b\]/)
  })

  it('user can disable a section by filtering DEFAULT_SECTIONS', () => {
    const build = { ...emptyBuild(), name: 'Hero', notes: 'My build' }
    const noNotes = DEFAULT_SECTIONS.filter(s => s.id !== 'Notes')
    const text = emitForumExport({ build, stats: null }, noNotes)
    expect(text).not.toMatch(/My build/)
  })

  it('includes trained spells when populated', () => {
    const build = {
      ...emptyBuild(),
      trainedSpells: { Wizard: { 3: ['Fireball'] } },
    }
    const text = emitForumExport({ build, stats: null })
    expect(text).toMatch(/Spells/)
    expect(text).toMatch(/Fireball/)
  })
})
