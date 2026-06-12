// Gear-planner gear-set import (V2 EquippedGear::ImportFromFile /
// ImportFromClipboard / ApplyFileItemAugment / ApplyClipboardItemAugment —
// EquippedGear.cpp:632-1180).
//
// Unit tests cover both text formats and the first-fit augment placement;
// the integration test parses the real gear-planner clipboard text shipped at
// the repo root ("Example Gear PLanner Website Set.txt") against the real
// item + augment catalogues.

import { describe, expect, it } from 'vitest'
import { existsSync, readFileSync } from 'fs'
import { join } from 'path'
import {
  parseGearSetFileText,
  parseGearSetClipboardText,
  parseGearPlannerText,
  placeImportedAugments,
} from '../lib/gearPlannerImport'
import { loadItems, loadAugments } from '../server/dataLoaders'
import type { Item, Augment } from '../types/ddo'

const DATA_DIR = join(__dirname, '..', '..', '..', 'Output', 'DataFiles')
const EXAMPLE = join(__dirname, '..', '..', '..', 'Example Gear PLanner Website Set.txt')

describe('gearset FILE format (V2 ProcessFileLine)', () => {
  it('maps planner slot prefixes to V3 slots and extracts {augment} groups', () => {
    const text = [
      'Eye:Discerning Gaze{enhancement Wisdom 8}{insight Constitution 6}',
      'Body:Legendary Tourney Armor',
      'Finger1:Ring of Prowess',
      'Finger2:Second Ring',
      'Weapon:Some Handwraps',
      'Offhand:Some Orb',
    ].join('\n')
    const { entries, warnings } = parseGearSetFileText(text)
    expect(warnings).toEqual([])
    expect(entries).toEqual([
      { slot: 'Goggles', itemName: 'Discerning Gaze', augmentTexts: ['enhancement Wisdom 8', 'insight Constitution 6'] },
      { slot: 'Armor', itemName: 'Legendary Tourney Armor', augmentTexts: [] },
      { slot: 'Ring', itemName: 'Ring of Prowess', augmentTexts: [] },
      { slot: 'Ring2', itemName: 'Second Ring', augmentTexts: [] },
      { slot: 'Main Hand', itemName: 'Some Handwraps', augmentTexts: [] },
      { slot: 'Off Hand', itemName: 'Some Orb', augmentTexts: [] },
    ])
  })

  it('stops at the first empty line and warns on unknown lines', () => {
    const text = 'Junk line\nHead:A Helm\n\nFeet:Never Reached'
    const { entries, warnings } = parseGearSetFileText(text)
    expect(entries).toHaveLength(1)
    expect(entries[0].slot).toBe('Helmet')
    expect(warnings).toHaveLength(1)
    expect(warnings[0]).toContain('Junk line')
  })
})

describe('gearset CLIPBOARD format (V2 ProcessClipboardLine)', () => {
  it('parses slot lines with following " - " augment lines', () => {
    const text = [
      'Weapon: Handwraps of the Hound',
      ' - Red Augment Slot: Acid Damage [d6] +9 Enhancement (ML 32)',
      ' - Orange Augment Slot: Intimidate +20 Enhancement (ML 32)',
      'Belt: The Cornerstone Champion',
      ' - Yellow Augment Slot: Deadly +11 Competence (ML 32)',
      ' - Blue Augment Slot: ',
    ].join('\n')
    const { entries, warnings } = parseGearSetClipboardText(text)
    expect(warnings).toEqual([])
    expect(entries).toEqual([
      {
        slot: 'Main Hand',
        itemName: 'Handwraps of the Hound',
        augmentTexts: [
          'Acid Damage [d6] +9 Enhancement (ML 32)',
          'Intimidate +20 Enhancement (ML 32)',
        ],
      },
      {
        slot: 'Belt',
        itemName: 'The Cornerstone Champion',
        // The empty Blue slot is skipped (no augment text after ": ").
        augmentTexts: ['Deadly +11 Competence (ML 32)'],
      },
    ])
  })

  it('auto-detect picks the clipboard parser for " - " augment lines', () => {
    const text = 'Helm: Some Helm\n - Green Augment Slot: Wisdom +21 Enhancement (ML 32)'
    const { entries } = parseGearPlannerText(text)
    expect(entries[0].slot).toBe('Helmet')
    expect(entries[0].augmentTexts).toEqual(['Wisdom +21 Enhancement (ML 32)'])
  })
})

describe('augment placement (V2 first-fit with all-components description match)', () => {
  const item: Item = {
    Name: 'Test Item',
    MinLevel: 30,
    ItemAugment: [
      { Type: 'Red' },
      { Type: 'Yellow' },
    ],
  } as unknown as Item

  const augments: Augment[] = [
    { Name: 'Acid 9', Description: 'Acid Damage [d6] +9', Type: 'Red', MinLevel: 28 },
    // ChooseLevel augment: "+11" must value-match LevelValue, the text
    // components ("deadly", "competence") must appear in the description.
    {
      Name: 'Deadly Gem', Description: 'Deadly: Competence bonus to damage',
      Type: 'Yellow', MinLevel: 28, ChooseLevel: '',
      LevelValue: { '#text': '4 6 8 11 13' },
    },
  ] as Augment[]

  it('places clipboard augments in the first compatible unfilled slot', () => {
    const { placements, warnings } = placeImportedAugments(
      'Main Hand', item,
      ['Acid Damage [d6] +9 Enhancement (ML 32)', 'Deadly +11 Competence (ML 32)'],
      augments, 'clipboard',
    )
    expect(warnings).toEqual([])
    expect(placements).toEqual([
      { key: 'Main Hand:Red:0', augmentName: 'Acid 9' },
      { key: 'Main Hand:Yellow:1', augmentName: 'Deadly Gem' },
    ])
  })

  it('rejects a ChooseLevel match when the value is not in LevelValue', () => {
    const { placements, warnings } = placeImportedAugments(
      'Main Hand', item, ['Deadly +12 Competence (ML 34)'], augments, 'clipboard',
    )
    expect(placements).toEqual([])
    expect(warnings).toHaveLength(1)
  })

  it('respects the item MinLevel cap on compatible augments', () => {
    const lowItem = { ...item, MinLevel: 10 } as Item
    const { placements, warnings } = placeImportedAugments(
      'Main Hand', lowItem, ['Acid Damage [d6] +9 Enhancement (ML 32)'], augments, 'clipboard',
    )
    expect(placements).toEqual([])
    expect(warnings).toHaveLength(1)
  })

  it('never places two augments into the same slot', () => {
    const { placements } = placeImportedAugments(
      'Main Hand', item,
      ['Acid Damage [d6] +9 Enhancement (ML 32)', 'Acid Damage [d6] +9 Enhancement (ML 32)'],
      augments, 'clipboard',
    )
    expect(placements).toHaveLength(1)
  })
})

describe('integration — real gear-planner clipboard text + real catalogues', () => {
  const haveData = existsSync(DATA_DIR) && existsSync(EXAMPLE)
  it.skipIf(!haveData)('parses every slot line of the example set', () => {
    const text = readFileSync(EXAMPLE, 'utf-8')
    const { entries, warnings } = parseGearSetClipboardText(text)
    expect(entries.length).toBeGreaterThanOrEqual(12)
    // V2 parity: "Quiver:" is not in V2's clipboard prefix list, so that line
    // fails to process there too (ProcessClipboardLine logs the failure).
    expect(warnings).toEqual(['Failed to process import line "Quiver: Epic Purifying Quiver"'])
    const slots = entries.map(e => e.slot)
    expect(slots).toContain('Main Hand')
    expect(slots).toContain('Armor')
    expect(slots).toContain('Ring')
    expect(slots).toContain('Ring2')
  })

  it.skipIf(!haveData)('resolves items and places augments against the real catalogues', () => {
    const text = readFileSync(EXAMPLE, 'utf-8')
    const { entries } = parseGearSetClipboardText(text)
    const items = loadItems(DATA_DIR)
    const augments = loadAugments(DATA_DIR)
    const byName = new Map(items.map(i => [i.Name, i]))

    // Every item in the example set exists in the catalogue.
    for (const e of entries) {
      expect(byName.get(e.itemName), `item "${e.itemName}"`).toBeDefined()
    }

    const weapon = entries.find(e => e.slot === 'Main Hand')!
    const { placements, warnings } = placeImportedAugments(
      weapon.slot, byName.get(weapon.itemName)!, weapon.augmentTexts, augments, 'clipboard',
    )
    // V2-faithful result: "Intimidate +20" value-matches the ChooseLevel
    // Diamond of Intimidate; "Acid Damage [d6] +9" fails (its "[d6]"
    // component appears nowhere in any compatible description — V2's text
    // matcher fails it the same way and logs the line).
    expect(placements.map(p => p.augmentName)).toEqual(['Diamond of Intimidate'])
    expect(warnings).toHaveLength(1)
    expect(warnings[0]).toContain('Acid Damage')
  })
})
