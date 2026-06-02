// V3 CharacterBuild → V2 .DDOBuild XML exporter.
//
// This is the write-back counterpart to v2Import.ts. It serialises a V3
// `CharacterBuild` into the V2 <DDOBuilderCharacterData>/<Character>/<Life>/
// <Build> XML tree so that a build edited in V3 can be re-opened in the V2
// MFC application — closing the "V3 can read V2 files but never write them"
// parity gap.
//
// V2 schema authority (element names + nesting):
//   Character.h  Character_PROPERTIES  (StrTome..ChaTome, SpecialFeats, Tomes,
//                Lives, GuildLevel, ApplyGuildBuffs, ActiveLifeIndex,
//                ActiveBuildIndex, ContentIDontOwn)
//   Life.h       Life_PROPERTIES       (Name, Race, Alignment, Level4..40,
//                SpecialFeats, Builds, SelfAndPartyBuffs, …)
//   Build.h      Build_PROPERTIES      (Level, Class1..3, AbilitySpend,
//                LevelTraining, ActiveStances, *_SelectedTrees,
//                *SpendInTree, ActiveGear, EquippedGear, GearSetSnapshot,
//                Notes, Level4..40)
//
// Round-trip fidelity is guarded by v2RoundTripExport.test.ts: importV2Build
// → exportV2Build → importV2Build must reproduce every field V3 models.
// Fields V2 carries that V3 does not model (FavorFeats, full embedded item
// effect definitions) are emitted best-effort / by-name only; see the inline
// notes and PARITY_TODO.md.

import type { Ability, CharacterBuild } from '../types/ddo'
import { POINT_BUY_COSTS } from '../types/ddo'

// ---------------------------------------------------------------------------
// XML emission helpers
// ---------------------------------------------------------------------------

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/** Minimal indenting XML builder. */
class Xml {
  private parts: string[] = []
  private depth = 0

  private pad(): string {
    return '  '.repeat(this.depth)
  }

  open(tag: string, attrs?: string): this {
    this.parts.push(`${this.pad()}<${tag}${attrs ? ' ' + attrs : ''}>`)
    this.depth++
    return this
  }

  close(tag: string): this {
    this.depth--
    this.parts.push(`${this.pad()}</${tag}>`)
    return this
  }

  /** Self-closing presence marker, e.g. <IsTier5/>. */
  empty(tag: string): this {
    this.parts.push(`${this.pad()}<${tag}/>`)
    return this
  }

  /** Leaf element with text content. */
  leaf(tag: string, value: string | number): this {
    const text = typeof value === 'number' ? String(value) : esc(value)
    this.parts.push(`${this.pad()}<${tag}>${text}</${tag}>`)
    return this
  }

  raw(line: string): this {
    this.parts.push(`${this.pad()}${line}`)
    return this
  }

  toString(): string {
    return this.parts.join('\n') + '\n'
  }
}

// ---------------------------------------------------------------------------
// Reverse maps / reconstruction helpers
// ---------------------------------------------------------------------------

// Inverse of v2Import.ts V2_TO_V3_SLOT. The V2 EquippedGear node stores one
// child element per inventory slot using these V2 names.
const V3_TO_V2_SLOT: Record<string, string> = {
  Helmet: 'Helmet', Necklace: 'Necklace', Trinket: 'Trinket', Cloak: 'Cloak',
  Belt: 'Belt', Goggles: 'Goggles', Gloves: 'Gloves', Boots: 'Boots',
  Bracers: 'Bracers', Armor: 'Armor', Ring: 'Ring1', Ring2: 'Ring2',
  'Main Hand': 'MainHand', 'Off Hand': 'OffHand', Quiver: 'Quiver', Arrow: 'Arrow',
}

const ABILITIES: Ability[] = [
  'Strength', 'Dexterity', 'Constitution', 'Intelligence', 'Wisdom', 'Charisma',
]
const SPEND_KEY: Record<Ability, string> = {
  Strength: 'StrSpend', Dexterity: 'DexSpend', Constitution: 'ConSpend',
  Intelligence: 'IntSpend', Wisdom: 'WisSpend', Charisma: 'ChaSpend',
}
const TOME_KEY: Record<Ability, string> = {
  Strength: 'StrTome', Dexterity: 'DexTome', Constitution: 'ConTome',
  Intelligence: 'IntTome', Wisdom: 'WisTome', Charisma: 'ChaTome',
}

/** Known DDO base classes — used to reconstruct past-life feat Type/name. */
const HEROIC_CLASSES = new Set([
  'Alchemist', 'Artificer', 'Barbarian', 'Bard', 'Cleric', 'Druid',
  'Favored Soul', 'Fighter', 'Monk', 'Paladin', 'Ranger', 'Rogue',
  'Sorcerer', 'Warlock', 'Wizard',
])
const RACES = new Set([
  'Dwarf', 'Elf', 'Gnome', 'Halfling', 'Half-Elf', 'Half-Orc', 'Human',
  'Warforged', 'Drow', 'Aasimar', 'Tiefling', 'Tabaxi', 'Shifter',
  'Dragonborn', 'Half-Elf', 'Gnome',
])

/**
 * A trained-feat record destined for a particular character level, with the
 * V2 <Type> string. Built by inverting v2Import.ts buildFeatSlotKey.
 */
interface FeatForLevel {
  level: number   // 1-based character level
  type: string
  name: string
}

/**
 * Invert the V3 feat-slot keys back to (character level, Type) so they can be
 * emitted inside the right <LevelTraining> block. Mirrors the key formats in
 * v2Import.ts buildFeatSlotKey:
 *   heroic-${lvl}
 *   race-${lvl}-${type}-${idx}
 *   epic-${epicLvl}-${type}-${idx}
 *   legendary-${legLvl}-${type}-${idx}
 *   ${class}-${classLevel}-${type}-${idx}
 */
function featsByLevel(build: CharacterBuild): Map<number, FeatForLevel[]> {
  const byLevel = new Map<number, FeatForLevel[]>()
  const heroic = build.levelClasses ?? []

  const push = (level: number, type: string, name: string) => {
    if (level < 1) return
    const list = byLevel.get(level) ?? []
    list.push({ level, type, name })
    byLevel.set(level, list)
  }

  for (const [key, name] of Object.entries(build.featChoices)) {
    if (!name) continue
    let m: RegExpMatchArray | null

    if ((m = key.match(/^heroic-(\d+)$/))) {
      push(Number(m[1]), 'Standard', name)
      continue
    }
    if ((m = key.match(/^race-(\d+)-(.+)-(\d+)$/))) {
      push(Number(m[1]), m[2], name)
      continue
    }
    if ((m = key.match(/^epic-(\d+)-(.+)-(\d+)$/))) {
      push(20 + Number(m[1]), m[2], name)
      continue
    }
    if ((m = key.match(/^legendary-(\d+)-(.+)-(\d+)$/))) {
      push(30 + Number(m[1]), m[2], name)
      continue
    }
    // Class-granted: ${class}-${classLevel}-${type}-${idx}. Find the character
    // level at which `class` reaches `classLevel` in the heroic slice.
    if ((m = key.match(/^(.+)-(\d+)-(.+)-(\d+)$/))) {
      const className = m[1]
      const classLevel = Number(m[2])
      const type = m[3]
      let seen = 0
      let charLevel = -1
      for (let i = 0; i < heroic.length; i++) {
        if (heroic[i] === className) {
          seen++
          if (seen === classLevel) { charLevel = i + 1; break }
        }
      }
      push(charLevel, type, name)
      continue
    }
  }
  return byLevel
}

/** Class label V2 stores in <LevelTraining> for character level `charLevel`. */
function classAtLevel(build: CharacterBuild, charLevel: number): string {
  if (charLevel <= 20) {
    const c = (build.levelClasses ?? [])[charLevel - 1] ?? ''
    return c || 'Unknown'
  }
  if (charLevel <= 30) return 'Epic'
  return 'Legendary'
}

// ---------------------------------------------------------------------------
// Section emitters
// ---------------------------------------------------------------------------

function emitAbilitySpend(xml: Xml, build: CharacterBuild): void {
  let total = 0
  const spends: Record<Ability, number> = {} as Record<Ability, number>
  for (const ab of ABILITIES) {
    const score = build.baseAbilities[ab] ?? 8
    const cost = POINT_BUY_COSTS[score] ?? 0
    spends[ab] = cost
    total += cost
  }
  xml.open('AbilitySpend')
  // V3 does not track the build-point pool; emit the spent total so the V2
  // budget shows 0 remaining (import ignores AvailableSpend).
  xml.leaf('AvailableSpend', total)
  for (const ab of ABILITIES) xml.leaf(SPEND_KEY[ab], spends[ab])
  xml.close('AbilitySpend')
}

function emitLevelTraining(xml: Xml, build: CharacterBuild): void {
  const totalLevels = 20 + (build.epicLevels ?? 0) + (build.legendaryLevels ?? 0)
  const feats = featsByLevel(build)
  const skillsByLevel = build.skillRanksByLevel ?? {}

  for (let lvl = 1; lvl <= totalLevels; lvl++) {
    xml.open('LevelTraining')
    xml.leaf('Class', classAtLevel(build, lvl))
    for (const f of feats.get(lvl) ?? []) {
      xml.open('TrainedFeat')
      xml.leaf('FeatName', f.name)
      xml.leaf('Type', f.type)
      xml.leaf('LevelTrainedAt', 0)
      xml.close('TrainedFeat')
    }
    const perSkill = skillsByLevel[lvl] ?? {}
    for (const [skill, ranks] of Object.entries(perSkill)) {
      for (let r = 0; r < ranks; r++) {
        xml.open('TrainedSkill')
        xml.leaf('Skill', skill)
        xml.close('TrainedSkill')
      }
    }
    xml.close('LevelTraining')
  }
}

function emitSpendInTree(
  xml: Xml,
  tag: string,
  choices: Record<string, Record<string, number>>,
  selections: Record<string, Record<string, string>>,
): void {
  for (const [treeName, items] of Object.entries(choices)) {
    if (!treeName || Object.keys(items).length === 0) continue
    xml.open(tag)
    xml.leaf('TreeName', treeName)
    xml.leaf('TreeVersion', 1)
    const sels = selections[treeName] ?? {}
    for (const [name, ranks] of Object.entries(items)) {
      if (!ranks) continue
      xml.open('TrainedEnhancement')
      xml.leaf('EnhancementName', name)
      if (sels[name]) xml.leaf('Selection', sels[name])
      xml.leaf('Ranks', ranks)
      xml.close('TrainedEnhancement')
    }
    xml.close(tag)
  }
}

function emitSelectedTrees(
  xml: Xml, tag: string, trees: string[], tier5?: string, pad = 0,
): void {
  xml.open(tag)
  const names = [...trees]
  while (names.length < pad) names.push('No selection')
  for (const t of names) xml.leaf('TreeName', t || 'No selection')
  if (tier5) xml.leaf('Tier5Tree', tier5)
  xml.close(tag)
}

function emitGearSet(
  xml: Xml,
  setName: string,
  slots: Record<string, string>,
  augments: Record<string, string>,
): void {
  xml.open('EquippedGear')
  xml.leaf('Name', setName)
  for (const [v3Slot, v2Slot] of Object.entries(V3_TO_V2_SLOT)) {
    const itemName = slots[v3Slot]
    if (!itemName) continue
    xml.open(v2Slot)
    // V3 stores gear by name only. V2 embeds the full item definition; emitting
    // just <Name> means V2 re-opens the slot with the named item but without
    // V3-side stat effects until re-resolved. (See PARITY_TODO: gear-effect
    // embedding.)
    xml.leaf('Name', itemName)
    // Augments are keyed `slot:type:index` where `index` is the position of the
    // augment in the item's FULL <ItemAugment> list (including empty slots). The
    // importer increments its index counter for every <ItemAugment> entry, even
    // empty ones, so to round-trip the indices we rebuild a sparse array and pad
    // gaps with empty <ItemAugment/> placeholders.
    const prefix = `${v3Slot}:`
    const slotAugs: { type: string; name: string }[] = []
    for (const [k, augName] of Object.entries(augments)) {
      if (!k.startsWith(prefix)) continue
      // Key is `slot:type:index`; the augment `type` may itself contain colons
      // (e.g. "IoD: Accessory: Claw Slot"), so split on the first and last
      // colon only: slot before the first, index after the last, type between.
      const firstColon = k.indexOf(':')
      const lastColon = k.lastIndexOf(':')
      if (firstColon === lastColon) continue
      const type = k.slice(firstColon + 1, lastColon)
      const idx = Number(k.slice(lastColon + 1))
      if (!type || !augName || !Number.isInteger(idx)) continue
      slotAugs[idx] = { type, name: augName }
    }
    for (let i = 0; i < slotAugs.length; i++) {
      const a = slotAugs[i]
      if (!a) {
        // Padding slot: import skips it (no Type/SelectedAugment) but still
        // advances the index counter, keeping later indices aligned.
        xml.empty('ItemAugment')
        continue
      }
      xml.open('ItemAugment')
      xml.leaf('Type', a.type)
      xml.leaf('SelectedAugment', a.name)
      xml.leaf('SelectedLevelIndex', 0)
      xml.close('ItemAugment')
    }
    xml.close(v2Slot)
  }
  xml.close('EquippedGear')
}

/** Reconstruct Character-level <SpecialFeats> from V3 pastLives (best-effort). */
function emitSpecialFeats(xml: Xml, build: CharacterBuild): void {
  xml.open('SpecialFeats')
  for (const [key, count] of Object.entries(build.pastLives)) {
    if (!count) continue
    let type = 'EpicPastLife'
    let featName = key
    if (HEROIC_CLASSES.has(key)) { type = 'HeroicPastLife'; featName = `Past Life: ${key}` }
    else if (RACES.has(key)) { type = 'RacialPastLife'; featName = `Past Life: ${key}` }
    for (let i = 0; i < count; i++) {
      xml.open('TrainedFeat')
      xml.leaf('FeatName', featName)
      xml.leaf('Type', type)
      xml.leaf('LevelTrainedAt', 0)
      xml.close('TrainedFeat')
    }
  }
  xml.close('SpecialFeats')
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Serialise a V3 build into V2 .DDOBuild XML. The output is a complete
 * <DDOBuilderCharacterData> document with a single Life containing a single
 * Build (V3's working model). V2 will open it as a one-life, one-build
 * character.
 */
export function exportV2Build(build: CharacterBuild): string {
  const xml = new Xml()
  xml.raw('<?xml version="1.0"?>')
  xml.open('DDOBuilderCharacterData')
  xml.open('Character', 'version="1"')

  // ── Character: tomes ─────────────────────────────────────────────────────
  for (const ab of ABILITIES) {
    xml.leaf(TOME_KEY[ab], build.abilityTomes?.[ab] ?? 0)
  }

  // ── Character: SpecialFeats (past lives) ────────────────────────────────
  emitSpecialFeats(xml, build)

  // ── Character: SkillTomes ────────────────────────────────────────────────
  xml.open('SkillTomes')
  for (const [skill, val] of Object.entries(build.skillTomes ?? {})) {
    if (val) xml.leaf(skill, val)
  }
  xml.close('SkillTomes')

  // ── Life ─────────────────────────────────────────────────────────────────
  xml.open('Life', 'version="1"')
  xml.leaf('Name', build.name || 'Imported V3 Build')
  xml.leaf('Race', build.race || 'Human')
  xml.leaf('Alignment', build.alignment || 'True Neutral')

  // ── Build ──────────────────────────────────────────────────────────────
  xml.open('Build', 'version="1"')
  const totalLevels = 20 + (build.epicLevels ?? 0) + (build.legendaryLevels ?? 0)
  xml.leaf('Level', totalLevels)

  // Class1/2/3 — V2 first-seen ordering of heroic classes.
  const seen: string[] = []
  for (const c of build.levelClasses ?? []) {
    if (c && !seen.includes(c)) seen.push(c)
  }
  xml.leaf('Class1', seen[0] || 'Unknown')
  xml.leaf('Class2', seen[1] || 'Unknown')
  xml.leaf('Class3', seen[2] || 'Unknown')

  emitAbilitySpend(xml, build)
  emitLevelTraining(xml, build)

  // ── Active stances ───────────────────────────────────────────────────────
  xml.open('ActiveStances')
  for (const s of build.activeBuffs ?? []) xml.leaf('Stances', s)
  xml.close('ActiveStances')

  // ── Selected trees ───────────────────────────────────────────────────────
  emitSelectedTrees(
    xml, 'Destiny_SelectedTrees',
    (build.selectedDestinyTrees ?? []).filter(Boolean),
    build.activeEpicDestiny, 3,
  )
  emitSelectedTrees(
    xml, 'Enhancement_SelectedTrees', build.enhancementPinned ?? [], undefined, 7,
  )

  // ── Spend-in-tree blocks ────────────────────────────────────────────────
  emitSpendInTree(xml, 'EnhancementSpendInTree', build.enhancementChoices, build.enhancementSelections)
  emitSpendInTree(xml, 'ReaperSpendInTree', build.reaperChoices, {})
  emitSpendInTree(xml, 'DestinySpendInTree', build.destinyChoices, build.destinySelections)

  // ── Attack chain (V3 models only the active chain name set) ─────────────
  xml.empty('ActiveAttackChain')

  // ── Gear ─────────────────────────────────────────────────────────────────
  xml.leaf('ActiveGear', build.activeGearSetName || 'Standard')
  const named = build.namedGearSets ?? {}
  const namedAug = build.namedGearAugments ?? {}
  const setNames = Object.keys(named)
  if (setNames.length > 0) {
    for (const name of setNames) {
      emitGearSet(xml, name, named[name] ?? {}, namedAug[name] ?? {})
    }
  } else if (Object.keys(build.gear ?? {}).length > 0) {
    emitGearSet(xml, build.activeGearSetName || 'Standard', build.gear, build.augmentChoices)
  }

  // ── Notes ─────────────────────────────────────────────────────────────────
  if (build.notes) xml.leaf('Notes', build.notes)

  // ── Ability level-ups (Level4..40) ──────────────────────────────────────
  for (const lvl of [4, 8, 12, 16, 20, 24, 28, 32, 36, 40] as const) {
    const ab = build.abilityLevelUps?.[lvl]
    if (ab) xml.leaf(`Level${lvl}`, ab)
  }

  xml.close('Build')

  // ── Life-level self/party buffs ──────────────────────────────────────────
  // (V3 merges these into activeBuffs on import; they are already emitted in
  // ActiveStances above. No separate list is required for round-trip.)

  xml.close('Life')

  // ── Character footer ─────────────────────────────────────────────────────
  xml.leaf('GuildLevel', build.guildLevel ?? 0)
  xml.leaf('ApplyGuildBuffs', build.applyGuildBuffs ? 1 : 0)
  xml.leaf('ActiveLifeIndex', 0)
  xml.leaf('ActiveBuildIndex', 0)

  xml.close('Character')
  xml.close('DDOBuilderCharacterData')
  return xml.toString()
}
