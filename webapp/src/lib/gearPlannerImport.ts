// Gear-planner gear-set import (V2 "Import .gearset file..." / "Import gear
// set from clipboard" — EquippedGear::ImportFromFile / ImportFromClipboard,
// EquippedGear.cpp:632-1180).
//
// Two text formats exist:
//  - .gearset FILE format (ProcessFileLine): slot prefixes "Eye:", "Head:",
//    "Neck:", "Trinket:", "Body:", "Back:", "Wrist:", "Waist:", "Finger1:",
//    "Feet:", "Hand:", "Finger2:", "Weapon:", "Offhand:"; augments inline in
//    `{...}` groups after the item name.
//  - CLIPBOARD format from the gear-planner website (ProcessClipboardLine):
//    slot prefixes "Goggles: ", "Helm: ", "Necklace: ", "Trinket: ",
//    "Armor: ", "Cloak: ", "Bracers: ", "Belt: ", "Ring1: ", "Boots: ",
//    "Gloves: ", "Ring2: ", "Weapon: ", "Offhand: "; each following line
//    containing " - " is one augment ("<Slot Colour> Slot: <augment text>").
//
// Parsing stops at the first empty line (V2 ExtractLine returns "" → break).
// Unrecognised lines are reported as warnings (V2 logs "Failed to process
// import line").

import type { Item, ItemAugment, Augment } from '../types/ddo'

export interface GearImportEntry {
  /** V3 gear slot name (GearPanel slot key). */
  slot: string
  itemName: string
  /** Raw augment description texts, in encounter order. */
  augmentTexts: string[]
}

export interface GearImportParse {
  entries: GearImportEntry[]
  warnings: string[]
}

// V2 slot-prefix → V3 GearPanel slot key. Order matters: V2 tests prefixes
// in this exact if/else order with Find() (substring match anywhere).
const FILE_PREFIXES: Array<[string, string]> = [
  ['Eye:', 'Goggles'],
  ['Head:', 'Helmet'],
  ['Neck:', 'Necklace'],
  ['Trinket:', 'Trinket'],
  ['Body:', 'Armor'],
  ['Back:', 'Cloak'],
  ['Wrist:', 'Bracers'],
  ['Waist:', 'Belt'],
  ['Finger1:', 'Ring'],
  ['Feet:', 'Boots'],
  ['Hand:', 'Gloves'],
  ['Finger2:', 'Ring2'],
  ['Weapon:', 'Main Hand'],
  ['Offhand:', 'Off Hand'],
]

const CLIPBOARD_PREFIXES: Array<[string, string]> = [
  ['Goggles: ', 'Goggles'],
  ['Helm: ', 'Helmet'],
  ['Necklace: ', 'Necklace'],
  ['Trinket: ', 'Trinket'],
  ['Armor: ', 'Armor'],
  ['Cloak: ', 'Cloak'],
  ['Bracers: ', 'Bracers'],
  ['Belt: ', 'Belt'],
  ['Ring1: ', 'Ring'],
  ['Boots: ', 'Boots'],
  ['Gloves: ', 'Gloves'],
  ['Ring2: ', 'Ring2'],
  ['Weapon: ', 'Main Hand'],
  ['Offhand: ', 'Off Hand'],
]

function splitLines(text: string): string[] {
  return text.split('\n').map(l => l.replace(/\r/g, ''))
}

function matchPrefix(line: string, prefixes: Array<[string, string]>): [string, string] | null {
  for (const [prefix, slot] of prefixes) {
    if (line.includes(prefix)) return [prefix, slot]
  }
  return null
}

/** Parses the .gearset FILE format (V2 ProcessFileLine). */
export function parseGearSetFileText(text: string): GearImportParse {
  const entries: GearImportEntry[] = []
  const warnings: string[] = []
  for (const line of splitLines(text)) {
    if (line === '') break // V2: empty line ends the parse
    const m = matchPrefix(line, FILE_PREFIXES)
    if (!m) {
      warnings.push(`Failed to process import line "${line}"`)
      continue
    }
    const [prefix, slot] = m
    let rest = line.replace(prefix, '')
    // Item name runs to the first '{'.
    const brace = rest.indexOf('{')
    const itemName = (brace >= 0 ? rest.slice(0, brace) : rest).trim()
    const augmentTexts: string[] = []
    // Each {...} group is one augment description.
    let sil = rest.indexOf('{')
    while (sil >= 0) {
      const pil = rest.indexOf('}', sil)
      if (pil < 0) break
      augmentTexts.push(rest.slice(sil + 1, pil))
      sil = rest.indexOf('{', pil)
    }
    entries.push({ slot, itemName, augmentTexts })
  }
  return { entries, warnings }
}

/** Parses the gear-planner website CLIPBOARD format (V2 ProcessClipboardLine). */
export function parseGearSetClipboardText(text: string): GearImportParse {
  const entries: GearImportEntry[] = []
  const warnings: string[] = []
  const lines = splitLines(text)
  let i = 0
  while (i < lines.length) {
    const line = lines[i]
    if (line === '') break // V2: empty line ends the parse
    const m = matchPrefix(line, CLIPBOARD_PREFIXES)
    if (!m) {
      warnings.push(`Failed to process import line "${line}"`)
      i++
      continue
    }
    const [prefix, slot] = m
    const itemName = line.replace(prefix, '').trim()
    const augmentTexts: string[] = []
    // Following lines containing " - " are this item's augments; the augment
    // text is everything after the first ":" plus one space.
    i++
    while (i < lines.length && lines[i].includes(' - ')) {
      const augLine = lines[i]
      const colon = augLine.indexOf(':')
      const augText = colon >= 0 ? augLine.slice(colon + 2) : ''
      if (augText.trim() !== '') augmentTexts.push(augText)
      i++
    }
    entries.push({ slot, itemName, augmentTexts })
    continue
  }
  return { entries, warnings }
}

/**
 * Auto-detects which of the two formats `text` is in. The clipboard format
 * uses "Slot: " prefixes (with a space) and " - " augment lines; the file
 * format uses the planner's internal slot names ("Eye:", "Body:", …) and
 * inline `{...}` augments.
 */
export function parseGearPlannerText(text: string): GearImportParse {
  const looksClipboard =
    /(^|\n) - /.test(text) ||
    CLIPBOARD_PREFIXES.some(([p]) => text.includes('\n' + p) || text.startsWith(p))
  return looksClipboard ? parseGearSetClipboardText(text) : parseGearSetFileText(text)
}

// ---------------------------------------------------------------------------
// Augment placement (V2 ApplyFileItemAugment / ApplyClipboardItemAugment,
// EquippedGear.cpp:986-1180)
// ---------------------------------------------------------------------------

export interface PlacedAugment {
  /** GearPanel augmentChoices key: `${slot}:${augType}:${idx}`. */
  key: string
  augmentName: string
}

function toArray<T>(val: T | T[] | undefined): T[] {
  if (val == null) return []
  return Array.isArray(val) ? val : [val]
}

/** V2 CompatibleAugments: augments whose Type list contains the slot type and
 *  whose MinLevel fits the host item. */
function compatibleAugments(slotType: string, itemLevel: number, all: Augment[]): Augment[] {
  return all.filter(a =>
    toArray(a.Type).includes(slotType) && (a.MinLevel ?? 1) <= itemLevel,
  )
}

/** Tokenises a clipboard augment text per V2 ApplyClipboardItemAugment:
 *  lowercase space-split, "(ml" token dropped, ")" stripped, trailing level
 *  component dropped, trailing "enhancement" component dropped. */
function clipboardComponents(augText: string): string[] {
  const parts = augText
    .split(' ')
    .map(p => p.toLowerCase())
    .filter(p => p !== '' && p !== '(ml')
    .map(p => p.replace(/\)/g, ''))
  if (parts.length === 0) return []
  parts.pop() // last component is the augment level — not needed
  if (parts.length > 0 && parts[parts.length - 1] === 'enhancement') parts.pop()
  return parts
}

/** Tokenises a file-format augment text per V2 ApplyFileItemAugment:
 *  lowercase split on spaces (and the closing brace, already stripped). */
function fileComponents(augText: string): string[] {
  return augText.split(' ').map(p => p.toLowerCase()).filter(p => p !== '')
}

/** True when the augment carries the ChooseLevel flag (DL_FLAG → "" in XML). */
function hasChooseLevel(aug: Augment): boolean {
  return aug.ChooseLevel !== undefined
}

/** The augment's per-level value list (V2 Augment::LevelValue). */
function levelValues(aug: Augment): number[] {
  const lv = aug.LevelValue
  const text = typeof lv === 'string' ? lv : lv?.['#text'] ?? ''
  return String(text).split(/\s+/).filter(Boolean).map(Number)
}

/**
 * V2 component-vs-augment match (ApplyClipboardItemAugment inner loop): every
 * component must either appear in the augment description (lowercased text
 * match), or — when the component parses to a non-zero number and the augment
 * is ChooseLevel — equal one of the augment's LevelValue entries.
 */
function augmentMatches(aug: Augment, components: string[]): boolean {
  const description = (aug.Description ?? '').toLowerCase()
  for (const c of components) {
    const value = parseInt(c, 10) || 0 // C atoi semantics (handles "+11", "[d6]"→0)
    if (hasChooseLevel(aug) && value !== 0) {
      if (!levelValues(aug).includes(value)) return false
    } else {
      if (!description.includes(c)) return false
    }
  }
  return true
}

/**
 * Places one augment text into the first unfilled augment slot of `item`
 * with a matching compatible augment (V2's first-fit search). Returns the
 * chosen slot index + augment, or null.
 *
 * Note: when a ChooseLevel augment matches, V2 also stores the selected
 * level index; V3's augmentChoices model has no level-index field, so only
 * the augment name is recorded (a documented model simplification).
 */
function placeOne(
  slot: string,
  item: Item,
  components: string[],
  allAugments: Augment[],
  filled: Set<number>,
): PlacedAugment | null {
  if (components.length === 0) return null
  const slots = toArray(item.ItemAugment as ItemAugment | ItemAugment[] | undefined)
  for (let i = 0; i < slots.length; i++) {
    if (filled.has(i)) continue
    if (slots[i].Augment) continue // fixed augment — never selectable
    const compatible = compatibleAugments(slots[i].Type, item.MinLevel ?? 1, allAugments)
    for (const aug of compatible) {
      if (augmentMatches(aug, components)) {
        filled.add(i)
        return { key: `${slot}:${slots[i].Type}:${i}`, augmentName: aug.Name }
      }
    }
  }
  return null
}

/**
 * Resolves the parsed augment texts of one imported item into V3
 * `augmentChoices` placements (first-fit per V2). `format` selects the V2
 * tokeniser. Unplaceable augments come back as warnings.
 */
export function placeImportedAugments(
  slot: string,
  item: Item,
  augmentTexts: string[],
  allAugments: Augment[],
  format: 'file' | 'clipboard',
): { placements: PlacedAugment[]; warnings: string[] } {
  const placements: PlacedAugment[] = []
  const warnings: string[] = []
  const filled = new Set<number>()
  for (const text of augmentTexts) {
    const components = format === 'clipboard' ? clipboardComponents(text) : fileComponents(text)
    const placed = placeOne(slot, item, components, allAugments, filled)
    if (placed) placements.push(placed)
    else if (components.length > 0) {
      warnings.push(`Could not place augment "${text}" on "${item.Name}"`)
    }
  }
  return { placements, warnings }
}
