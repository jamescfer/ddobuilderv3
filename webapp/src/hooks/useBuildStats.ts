// useBuildStats — full V2-style stat aggregation hook
//
// Collects bonuses from every source (race, class, feats, enhancements,
// epic destiny, reaper, gear, augments, set bonuses, filigrees, self-buffs,
// tomes, skill ranks) into a StatMap, then exposes a resolve(statKey) function
// that applies DDO stacking rules.
//
// Two-phase approach:
//   Phase 1 – accumulate raw bonuses into a Map<statKey, RawBonus[]>
//   Phase 2 – resolve ability scores, then add ability-mod-derived bonuses

import { useMemo } from 'react'
import { useCharacter } from '../context/CharacterContext'
import { SKILLS } from '../lib/gamedata'
import type {
  Race, DDOClass, Feat, EnhancementTree, EnhancementTreeItem, Item,
  Effect, EnhancementSelection, Augment, SetBonus, FiligreeSetBonus, Filigree,
  OptionalBuff, FiligreeSlot, Buff, GuildBuff,
} from '../types/ddo'
import { parseEffect, resolveItemBuff, buildBuffIndex } from '../lib/effectParser'
import type { EffectContext } from '../lib/effectParser'
import { resolveBonus, emptyResolvedStat } from '../lib/bonus'
import type { RawBonus, ResolvedStat } from '../lib/bonus'

// ---------------------------------------------------------------------------
// Public interface
// ---------------------------------------------------------------------------

export interface BuildStats {
  /** Resolve a stat key to its stacked total + annotated bonus list */
  resolve: (key: string) => ResolvedStat
  /** Shortcut: total value for a stat key */
  total: (key: string) => number
  /** All accumulated stat keys (useful for iteration) */
  keys: () => string[]
  /** Equipped weapon info (null if no weapon equipped) */
  weapon: WeaponInfo | null
  /** Armor max-DEX cap (null = no cap) */
  armorMaxDex: number | null
  /** True iff the active armor stance is Cloth Armor (drives V2 MDB no-limit) */
  inClothArmor: boolean
  /** True iff a tower shield is equipped (drives V2 tower-shield MDB cap) */
  inTowerShield: boolean
}

export interface WeaponInfo {
  name: string
  slot: string
  diceNum: number
  diceSides: number
  critThreatRange: number   // number of threat faces, e.g. 2 = threatens on 19-20
  critMultiplier: number
  attackModifier: string    // 'Strength' | 'Dexterity'
}

// ---------------------------------------------------------------------------
// External data the hook consumers must supply
// ---------------------------------------------------------------------------

export interface BuildStatsInput {
  allClasses: DDOClass[]
  allRaces: Race[]
  allFeats: Feat[]
  allTrees: EnhancementTree[]        // enhancement + destiny + reaper trees
  allSelfBuffs: OptionalBuff[]
  allAugments: Augment[]
  allSetBonuses: SetBonus[]
  allFiligreeBonuses: FiligreeSetBonus[]
  allFiligrees: Filigree[]
  gearItems: Record<string, Item>    // slot → resolved Item object
  // ItemBuffs.xml database; optional so callers that haven't been wired
  // yet still work. Without it, parseItemBuff falls back to the legacy
  // direct-Type mapping.
  allItemBuffs?: Buff[]
  /** GuildBuffs.xml — applied based on build.guildLevel. Optional. */
  allGuildBuffs?: GuildBuff[]
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type StatMap = Map<string, RawBonus[]>

function add(map: StatMap, key: string, bonus: RawBonus): void {
  const list = map.get(key)
  if (list) list.push(bonus)
  else map.set(key, [bonus])
}

function addParsed(map: StatMap, bonuses: ReturnType<typeof parseEffect>): void {
  for (const pb of bonuses) {
    add(map, pb.statKey, { value: pb.value, type: pb.bonusType, source: pb.source })
  }
}

function toArray<T>(val: T | T[] | undefined): T[] {
  if (val === undefined || val === null) return []
  return Array.isArray(val) ? val : [val]
}

function abMod(score: number): number {
  return Math.floor((score - 10) / 2)
}

/** V2 Life::TomeAtLevel — caps tome value by character level. */
function tomeCapAtLevel(level: number): number {
  if (level <= 2) return 2
  if (level <= 6) return 3
  if (level <= 10) return 4
  if (level <= 14) return 5
  if (level <= 18) return 6
  if (level <= 21) return 7
  return 999
}

const MAX_BAB = 25

// ---------------------------------------------------------------------------
// Save / BAB / SP helpers
// ---------------------------------------------------------------------------

function saveBase(saveType: unknown, levels: number): number {
  const s = String(saveType ?? '')
  if (s === 'Strong' || s === 'Type2') return 2 + Math.floor(levels / 2)
  return Math.floor(levels / 3)
}

/** V2 BAB: per-class fraction is truncated, then summed across classes. */
function classBAB(cls: DDOClass, levels: number): number {
  const arr = String(cls.BAB ?? '').trim().split(/\s+/).map(Number).filter(n => !isNaN(n))
  let raw = 0
  if (arr.length > levels) raw = arr[levels]
  else if (arr.length > 0) raw = arr[arr.length - 1]
  return Math.trunc(raw)
}

/** V2 SpellPointsPerLevel is a 21-entry table indexed by class levels (0..20). */
function spellPointsAtLevel(perLevel: unknown, levels: number): number {
  if (perLevel == null) return 0
  const arr = String(perLevel).trim().split(/\s+/).map(Number).filter(n => !isNaN(n))
  if (arr.length === 0) return 0
  const idx = Math.min(Math.max(levels, 0), arr.length - 1)
  return arr[idx] | 0
}

/** Pick the highest-value casting stat for multi-stat classes (e.g. Favored Soul). */
function pickCastingStat(
  cs: string | string[] | undefined,
  abilModMap: Record<string, number>,
): string | null {
  if (!cs) return null
  const list = Array.isArray(cs) ? cs : [cs]
  if (list.length === 0) return null
  return list.reduce((best, ab) =>
    (abilModMap[ab] ?? -Infinity) > (abilModMap[best] ?? -Infinity) ? ab : best,
  )
}

// ---------------------------------------------------------------------------
// Enhancement tree AP and effect helpers
// ---------------------------------------------------------------------------

function normalizeCostPerRank(raw: unknown): string {
  if (raw == null) return '1'
  if (typeof raw === 'number' && isFinite(raw)) return String(raw)
  if (typeof raw === 'string') return raw || '1'
  if (typeof raw === 'object' && !Array.isArray(raw) && '#text' in (raw as object)) {
    const t = (raw as Record<string, unknown>)['#text']
    if (t != null) return String(t) || '1'
  }
  return '1'
}

function costUpToRank(item: EnhancementTreeItem, rank: number): number {
  if (rank <= 0) return 0
  const maxRanks = typeof item.Ranks === 'number' ? item.Ranks : 1
  const str = normalizeCostPerRank(item.CostPerRank)
  const parts = str.trim().split(/\s+/).map(Number).filter(isFinite)
  const costs =
    parts.length === 0 ? Array(maxRanks).fill(1) :
    parts.length === 1 ? Array(maxRanks).fill(parts[0]) :
    Array.from({ length: maxRanks }, (_, i) => parts[i] ?? parts[parts.length - 1])
  return (costs as number[]).slice(0, rank).reduce((a: number, b: number) => a + b, 0)
}

function computeTreeAP(items: EnhancementTreeItem[], choices: Record<string, number>): number {
  return items.reduce((sum, item) => sum + costUpToRank(item, choices[item.Name] ?? 0), 0)
}

function getSelectorOptions(item: EnhancementTreeItem): EnhancementSelection[] {
  if (!item.Selector || item.Selector.length === 0) return []
  const group = item.Selector[0]
  const raw = group.EnhancementSelection
  return Array.isArray(raw) ? raw : raw ? [raw] : []
}

// ---------------------------------------------------------------------------
// Phase 1 accumulators
// ---------------------------------------------------------------------------

function accumulateRace(map: StatMap, race: Race): void {
  const ABILITY_FIELDS = ['Strength', 'Dexterity', 'Constitution', 'Intelligence', 'Wisdom', 'Charisma'] as const
  for (const ab of ABILITY_FIELDS) {
    const val = (race as unknown as Record<string, unknown>)[ab]
    if (typeof val === 'number' && val !== 0) {
      add(map, `ability.${ab}`, { value: val, type: 'Racial', source: `${race.Name} racial` })
    }
  }
}

function accumulateClass(
  map: StatMap,
  cls: DDOClass,
  levels: number,
  isFirst: boolean,
  conMod: number,
): void {
  const label = `${cls.Name} (${levels} lv)`

  // V2: per-class BAB is truncated, then summed — must NOT use the EXCLUSIVE 'Base' type
  add(map, 'bab', { value: classBAB(cls, levels), type: 'Stacking', source: label })
  add(map, 'save.Fort',   { value: saveBase(cls.Fortitude, levels), type: 'Base', source: label })
  add(map, 'save.Reflex', { value: saveBase(cls.Reflex,    levels), type: 'Base', source: label })
  add(map, 'save.Will',   { value: saveBase(cls.Will,      levels), type: 'Base', source: label })

  const hpPerLv = (cls.HitPoints ?? 6) + conMod
  add(map, 'hp', { value: levels * hpPerLv, type: 'Base', source: `${label} (d${cls.HitPoints ?? 6}+CON)` })

  // V2: SpellPointsPerLevel is a 21-entry table indexed by class level
  const sp = spellPointsAtLevel(cls.SpellPointsPerLevel, levels)
  if (sp > 0) add(map, 'spellPoints', { value: sp, type: 'Base', source: label })

  const spp = Math.max(1, cls.SkillPoints ?? 2)
  const skillPts = isFirst ? spp * 4 + spp * (levels - 1) : spp * levels
  if (skillPts > 0) add(map, 'skillPoints', { value: skillPts, type: 'Base', source: label })
}

function accumulateFeat(map: StatMap, feat: Feat, rank: number, source: string, totalLevel = 0, ctx?: EffectContext): void {
  for (const eff of toArray(feat.Effect)) {
    // For AType=TotalLevel / ClassLevel etc. effects in feats, pass totalLevel as the level arg
    addParsed(map, parseEffect(eff, rank, source, totalLevel, 0, ctx))
  }
}

function accumulateEnhancementTree(
  map: StatMap,
  tree: EnhancementTree,
  choices: Record<string, number>,
  selections: Record<string, string>,
  classLevels: number,
  ctx?: EffectContext,
): void {
  const items = tree.EnhancementTreeItem ?? []
  const treeAP = computeTreeAP(items, choices)

  for (const item of items) {
    const rank = choices[item.Name] ?? 0
    if (rank <= 0) continue

    const source = `${tree.Name}: ${item.Name}`
    const selectedOption = selections[item.Name]

    if (selectedOption) {
      const options = getSelectorOptions(item)
      const opt = options.find(o => o.Name === selectedOption)
      if (opt) {
        for (const eff of toArray(opt.Effect as Effect | Effect[] | undefined)) {
          addParsed(map, parseEffect(eff, rank, `${source} (${selectedOption})`, classLevels, treeAP, ctx))
        }
        continue
      }
    }

    for (const eff of toArray(item.Effect)) {
      addParsed(map, parseEffect(eff, rank, source, classLevels, treeAP, ctx))
    }
  }
}

function accumulateGear(
  map: StatMap,
  gearItems: Record<string, Item>,
  buffIndex: Map<string, Buff> | undefined,
  ctx?: EffectContext,
): void {
  for (const [slot, item] of Object.entries(gearItems)) {
    const source = `${item.Name} (${slot})`
    for (const buff of toArray(item.Buff)) {
      addParsed(map, resolveItemBuff(buff, buffIndex, source, ctx))
    }
    // Armor bonus from armor/shield items — treated as Armor bonus type
    if (item.ArmorBonus) {
      add(map, 'ac', { value: item.ArmorBonus, type: 'Armor', source })
    }
    if (item.ShieldBonus) {
      add(map, 'ac', { value: item.ShieldBonus, type: 'Shield', source })
    }
    // V2 armor check penalty: armor and shield clamped to ≤0, accumulated separately.
    if (item.ArmorCheckPenalty != null && item.ArmorCheckPenalty < 0) {
      const slotLower = slot.toLowerCase()
      const isShield = slotLower.includes('shield') || (item.Armor === 'Shield' || item.Armor === 'TowerShield')
      const key = isShield ? 'armorCheckPenaltyShield' : 'armorCheckPenalty'
      add(map, key, {
        value: item.ArmorCheckPenalty,
        type: 'Penalty',
        source: `${item.Name} ACP`,
      })
    }
  }
}

/**
 * V2 armor stance detection: returns the active armor stance from the equipped
 * armor item (Cloth/Light/Medium/Heavy) plus shield-type stances.
 */
function deriveArmorStances(gearItems: Record<string, Item>): Set<string> {
  const stances = new Set<string>()
  const armor = gearItems['Armor'] ?? gearItems['Body']
  if (armor) {
    const t = armor.Armor
    if (t === 'Cloth' || t == null) stances.add('Cloth Armor')
    else if (t === 'Light')  stances.add('Light Armor')
    else if (t === 'Medium') stances.add('Medium Armor')
    else if (t === 'Heavy')  stances.add('Heavy Armor')
    // Docent (warforged): treat per item.Material? Default to Cloth Armor.
  } else {
    stances.add('Cloth Armor')
  }
  // Shield stance from off-hand
  const shield = gearItems['OffHand'] ?? gearItems['Shield']
  if (shield) {
    const t = shield.Armor
    if (t === 'Tower Shield' || t === 'TowerShield') stances.add('Tower Shield')
    else if (t === 'Heavy Shield' || t === 'HeavyShield') stances.add('Heavy Shield')
    else if (t === 'Light Shield' || t === 'LightShield') stances.add('Light Shield')
    else if (t === 'Buckler') stances.add('Buckler')
  }
  return stances
}

function accumulateAugments(
  map: StatMap,
  augmentChoices: Record<string, string>,
  allAugments: Augment[],
  ctx?: EffectContext,
): void {
  for (const augName of Object.values(augmentChoices)) {
    if (!augName) continue
    const aug = allAugments.find(a => a.Name === augName)
    if (!aug) continue
    const source = `Augment: ${aug.Name}`
    for (const eff of toArray(aug.Effect)) {
      addParsed(map, parseEffect(eff, 1, source, 0, 0, ctx))
    }
  }
}

function accumulateSetBonuses(
  map: StatMap,
  gearItems: Record<string, Item>,
  allSetBonuses: SetBonus[],
  ctx?: EffectContext,
): void {
  // Count equipped items per set bonus name
  const counts = new Map<string, number>()
  for (const item of Object.values(gearItems)) {
    for (const name of toArray(item.SetBonus)) {
      counts.set(name, (counts.get(name) ?? 0) + 1)
    }
  }
  for (const [bonusName, count] of counts) {
    const sb = allSetBonuses.find(s => s.Type === bonusName)
    if (!sb) continue
    for (const buff of toArray(sb.Buff)) {
      if (count < buff.EquippedCount) continue
      const source = `${bonusName} set (${buff.EquippedCount}pc)`
      for (const eff of toArray(buff.Effect)) {
        addParsed(map, parseEffect(eff, 1, source, 0, 0, ctx))
      }
    }
  }
}

function accumulateFiligreeSlots(
  map: StatMap,
  slots: FiligreeSlot[],
  allFiligrees: Filigree[],
  sourcePrefix: string,
  setCounts: Map<string, number>,
  ctx?: EffectContext,
): void {
  const byName = new Map<string, Filigree>(allFiligrees.map(f => [f.Name, f]))
  for (const slot of slots) {
    if (!slot.name) continue
    const fil = byName.get(slot.name)
    if (!fil) continue
    const source = `${sourcePrefix}: ${fil.Name}`
    for (const eff of toArray(fil.Effect)) {
      if (eff.Rare && !slot.rare) continue  // rare effects only apply when slot is marked rare
      addParsed(map, parseEffect(eff, 1, source, 0, 0, ctx))
    }
    if (fil.SetBonus) {
      setCounts.set(fil.SetBonus, (setCounts.get(fil.SetBonus) ?? 0) + 1)
    }
  }
}

function accumulateFiligrees(
  map: StatMap,
  filigreeSlots: FiligreeSlot[],
  artifactFiligreeSlots: FiligreeSlot[],
  allFiligrees: Filigree[],
  allFiligreeBonuses: FiligreeSetBonus[],
  ctx?: EffectContext,
): void {
  const setCounts = new Map<string, number>()

  accumulateFiligreeSlots(map, filigreeSlots, allFiligrees, 'Filigree', setCounts, ctx)
  accumulateFiligreeSlots(map, artifactFiligreeSlots, allFiligrees, 'Artifact Filigree', setCounts, ctx)

  for (const [bonusName, count] of setCounts) {
    const fsb = allFiligreeBonuses.find(s => s.Type === bonusName)
    if (!fsb) continue
    for (const buff of toArray(fsb.Buff)) {
      if (count < buff.EquippedCount) continue
      const source = `${bonusName} filigree set (${buff.EquippedCount}pc)`
      for (const eff of toArray(buff.Effect)) {
        addParsed(map, parseEffect(eff, 1, source, 0, 0, ctx))
      }
    }
  }
}

function accumulateSelfBuffs(
  map: StatMap,
  activeBuffNames: string[],
  allSelfBuffs: OptionalBuff[],
  ctx?: EffectContext,
): void {
  for (const buffName of activeBuffNames) {
    const buff = allSelfBuffs.find(b => b.Name === buffName)
    if (!buff) continue
    const source = `Buff: ${buff.Name}`
    for (const eff of toArray(buff.Effect)) {
      addParsed(map, parseEffect(eff, 1, source, 0, 0, ctx))
    }
  }
}

// ---------------------------------------------------------------------------
// V2 Build::ApplyGuildBuffs port — apply every guild buff whose Level
// requirement is met by the build's guild level. Effects use AType=TotalLevel
// so we pass totalLevel as the level arg.
// ---------------------------------------------------------------------------

function accumulateGuildBuffs(
  map: StatMap,
  guildLevel: number,
  allGuildBuffs: GuildBuff[],
  totalLevel: number,
  ctx?: EffectContext,
): void {
  if (guildLevel <= 0) return
  for (const gb of allGuildBuffs) {
    if ((gb.Level ?? 0) > guildLevel) continue
    const source = `Guild Buff: ${gb.Name}`
    for (const eff of toArray(gb.Effect)) {
      addParsed(map, parseEffect(eff, 1, source, totalLevel, 0, ctx))
    }
  }
}

// ---------------------------------------------------------------------------
// V2 Build::ApplyTwistsOfFate port — each twist is the *internal name* of an
// enhancement item from one of the unlocked destiny trees. Apply the
// corresponding tree item's Effects at rank 1 (twists grant rank 1 access).
// ---------------------------------------------------------------------------

function accumulateTwists(
  map: StatMap,
  twistChoices: string[],
  unlockedDestinyTrees: string[],
  allTrees: EnhancementTree[],
  ctx?: EffectContext,
): void {
  if (!twistChoices?.length) return
  // Build a lookup of (treeName → itemName → item) once across unlocked trees.
  const itemsByName = new Map<string, EnhancementTreeItem>()
  for (const treeName of unlockedDestinyTrees) {
    const tree = allTrees.find(t => t.Name === treeName)
    if (!tree?.EnhancementTreeItem) continue
    for (const item of tree.EnhancementTreeItem) {
      if (item.Name) itemsByName.set(item.Name, item)
      // V2 also matches on InternalName when present.
      const intl = (item as unknown as { InternalName?: string }).InternalName
      if (intl) itemsByName.set(intl, item)
    }
  }
  for (const twistName of twistChoices) {
    if (!twistName) continue
    const item = itemsByName.get(twistName)
    if (!item) continue
    const source = `Twist of Fate: ${item.Name}`
    for (const eff of toArray(item.Effect)) {
      addParsed(map, parseEffect(eff, 1, source, 0, 0, ctx))
    }
  }
}

// ---------------------------------------------------------------------------
// Weapon info extractor
// ---------------------------------------------------------------------------

function extractWeaponInfo(gearItems: Record<string, Item>): WeaponInfo | null {
  for (const slot of ['Weapon1', 'MainHand', 'Weapon']) {
    const item = gearItems[slot]
    if (item?.Weapon) {
      const attackMod = (() => {
        const am = toArray(item.AttackModifier as string | string[] | undefined)
        return am.length > 0 ? am[0] : 'Strength'
      })()
      return {
        name: item.Name,
        slot,
        diceNum: item.BaseDice?.Number ?? 1,
        diceSides: item.BaseDice?.Sides ?? 6,
        critThreatRange: item.CriticalThreatRange ?? 1,
        critMultiplier: item.CriticalMultiplier ?? 2,
        attackModifier: attackMod,
      }
    }
  }
  return null
}

function extractArmorMaxDex(gearItems: Record<string, Item>): number | null {
  const armor = gearItems['Armor'] ?? gearItems['Body']
  if (armor?.MaximumDexterityBonus != null) return armor.MaximumDexterityBonus
  return null
}

// ---------------------------------------------------------------------------
// Main hook
// ---------------------------------------------------------------------------

export function useBuildStats(input: BuildStatsInput): BuildStats {
  const { build } = useCharacter()

  const statMap = useMemo<StatMap>(() => {
    const map: StatMap = new Map()

    const {
      allClasses, allRaces, allFeats, allTrees, gearItems,
      allSelfBuffs, allAugments, allSetBonuses, allFiligreeBonuses, allFiligrees,
      allItemBuffs,
    } = input
    const buffIndex = allItemBuffs ? buildBuffIndex(allItemBuffs) : undefined

    // ──────────────────────────────────────────────────────────────────────
    // Build the EffectContext used to gate effects via Requirements::Met.
    // Uses a chargen-time snapshot of the build (ability scores from base+
    // race+levelup only — no gear/enhancement bonuses) to avoid cycles.
    // ──────────────────────────────────────────────────────────────────────
    const ctxRace = allRaces.find(r => r.Name === build.race)
    const ctxClassLevels: Record<string, number> = {}
    const ctxBaseClassLevels: Record<string, number> = {}
    for (const bc of build.classes) {
      if (!bc.name || bc.levels <= 0) continue
      ctxClassLevels[bc.name] = (ctxClassLevels[bc.name] ?? 0) + bc.levels
      const cls = allClasses.find(c => c.Name === bc.name)
      const baseClass = cls?.BaseClass ?? bc.name
      ctxBaseClassLevels[baseClass] = (ctxBaseClassLevels[baseClass] ?? 0) + bc.levels
      // The class itself counts as its own base
      if (baseClass !== bc.name) {
        ctxBaseClassLevels[bc.name] = (ctxBaseClassLevels[bc.name] ?? 0) + bc.levels
      }
    }
    const ctxFeats = new Set<string>()
    for (const f of Object.values(build.featChoices)) if (f) ctxFeats.add(f)
    if (ctxRace) for (const f of toArray(ctxRace.GrantedFeat)) ctxFeats.add(f)
    for (const bc of build.classes) {
      if (!bc.name || bc.levels <= 0) continue
      const cls = allClasses.find(c => c.Name === bc.name)
      for (const af of toArray(cls?.AutomaticFeats)) {
        const lvl = af.Level ?? 0
        if (lvl > bc.levels) continue
        const names = af.Feats
        if (typeof names === 'string') ctxFeats.add(names)
        else if (Array.isArray(names)) for (const n of names) ctxFeats.add(n)
      }
    }
    const ctxEnhancements = new Set<string>()
    for (const choices of Object.values(build.enhancementChoices)) {
      for (const [name, rank] of Object.entries(choices)) {
        if (rank > 0) ctxEnhancements.add(name)
      }
    }
    for (const choices of Object.values(build.destinyChoices)) {
      for (const [name, rank] of Object.entries(choices)) {
        if (rank > 0) ctxEnhancements.add(name)
      }
    }
    for (const choices of Object.values(build.reaperChoices ?? {})) {
      for (const [name, rank] of Object.entries(choices)) {
        if (rank > 0) ctxEnhancements.add(name)
      }
    }
    // Inherent-only ability totals (base + race + levelup, no tome at ctx time)
    const ctxAbilityTotals: Record<string, number> = {}
    const ABILITIES_C = ['Strength', 'Dexterity', 'Constitution', 'Intelligence', 'Wisdom', 'Charisma'] as const
    for (const ab of ABILITIES_C) {
      const base = build.baseAbilities[ab] ?? 8
      const racial = ctxRace ? Number((ctxRace as unknown as Record<string, number>)[ab]) || 0 : 0
      const lv = Object.values(build.abilityLevelUps).filter(v => v === ab).length
      ctxAbilityTotals[ab] = base + racial + lv
    }
    const ctxStances = deriveArmorStances(gearItems)
    // Approximate BAB from class progressions (heroic only). Avoids cycles.
    let ctxBAB = 0
    for (const bc of build.classes) {
      if (!bc.name || bc.levels <= 0) continue
      const cls = allClasses.find(c => c.Name === bc.name)
      if (cls) ctxBAB += classBAB(cls, bc.levels)
    }
    ctxBAB = Math.min(MAX_BAB, ctxBAB)
    const ctxWeaponTypes = new Set<string>()
    for (const item of Object.values(gearItems)) {
      if (item.Weapon) ctxWeaponTypes.add(item.Weapon)
    }

    // V2 AType=FeatCount uses the number of times a feat has been trained.
    // Feat slots can repeat (e.g. Improved Critical for different weapon
    // groups). featChoices is a flat map of slotKey → featName, so we count
    // duplicates by walking the values.
    const ctxFeatCounts: Record<string, number> = {}
    for (const f of Object.values(build.featChoices)) {
      if (!f) continue
      ctxFeatCounts[f] = (ctxFeatCounts[f] ?? 0) + 1
    }
    // Past lives also stack as feat counts in V2.
    for (const [src, count] of Object.entries(build.pastLives)) {
      if (!count) continue
      ctxFeatCounts[`Past Life: ${src}`] = (ctxFeatCounts[`Past Life: ${src}`] ?? 0) + count
      ctxFeatCounts[src] = (ctxFeatCounts[src] ?? 0) + count
    }

    // V2 AType=SetBonusCount needs the equipped count per set bonus name.
    const ctxSetBonusCounts: Record<string, number> = {}
    for (const item of Object.values(gearItems)) {
      for (const name of toArray(item.SetBonus)) {
        ctxSetBonusCounts[name] = (ctxSetBonusCounts[name] ?? 0) + 1
      }
    }

    const ctx: EffectContext = {
      race: build.race,
      alignment: build.alignment,
      classLevels: ctxClassLevels,
      baseClassLevels: ctxBaseClassLevels,
      totalLevel: build.totalLevel,
      feats: ctxFeats,
      enhancements: ctxEnhancements,
      abilityTotals: ctxAbilityTotals,
      stances: ctxStances,
      bab: ctxBAB,
      weaponTypes: ctxWeaponTypes,
      featCounts: ctxFeatCounts,
      setBonusCounts: ctxSetBonusCounts,
    }

    // ── Ability base scores ───────────────────────────────────────────────
    const ABILITIES = ['Strength', 'Dexterity', 'Constitution', 'Intelligence', 'Wisdom', 'Charisma'] as const
    const tomeCap = tomeCapAtLevel(Math.max(1, build.totalLevel))
    for (const ab of ABILITIES) {
      const base = build.baseAbilities[ab]
      if (base) add(map, `ability.${ab}`, { value: base, type: 'Base', source: 'Point buy' })
      // V2: tomes are Inherent type (capped by character level)
      const rawTome = build.abilityTomes[ab] ?? 0
      const tome = Math.min(rawTome, tomeCap)
      if (tome) add(map, `ability.${ab}`, {
        value: tome, type: 'Inherent',
        source: rawTome > tome ? `Ability tome (+${rawTome}, capped at +${tome})` : 'Ability tome',
      })
      // V2: level-up bonuses are 'Level Up' type
      const lvlUps = Object.values(build.abilityLevelUps).filter(v => v === ab).length
      if (lvlUps) add(map, `ability.${ab}`, { value: lvlUps, type: 'Level Up', source: 'Level-up bonuses' })
    }

    // ── Race ─────────────────────────────────────────────────────────────
    const race = allRaces.find(r => r.Name === build.race)
    if (race) {
      accumulateRace(map, race)
      for (const featName of toArray(race.GrantedFeat)) {
        const feat = allFeats.find(f => f.Name === featName)
        if (feat) accumulateFeat(map, feat, 1, `${build.race}: ${featName}`, build.totalLevel, ctx)
      }
    }

    // ── Phase 1.5: quick ability resolve for CON-mod HP ──────────────────
    function quickResolve(key: string): number {
      return resolveBonus(map.get(key) ?? []).total
    }
    const conMod = abMod(quickResolve('ability.Constitution'))

    // ── Classes ───────────────────────────────────────────────────────────
    let isFirst = true
    for (const bc of build.classes) {
      if (!bc.name || bc.levels <= 0) continue
      const cls = allClasses.find(c => c.Name === bc.name)
      if (!cls) continue
      accumulateClass(map, cls, bc.levels, isFirst, conMod)
      isFirst = false

      for (const autoFeat of toArray(cls.AutomaticFeats)) {
        const names = toArray(
          typeof autoFeat.Feats === 'string' ? autoFeat.Feats :
          Array.isArray(autoFeat.Feats) ? autoFeat.Feats : undefined
        )
        for (const featName of names) {
          const feat = allFeats.find(f => f.Name === featName)
          if (feat) accumulateFeat(map, feat, 1, `${bc.name}: ${featName}`, build.totalLevel, ctx)
        }
      }
    }

    // ── Chosen feats ──────────────────────────────────────────────────────
    for (const [slotKey, featName] of Object.entries(build.featChoices)) {
      if (!featName) continue
      const feat = allFeats.find(f => f.Name === featName)
      if (feat) accumulateFeat(map, feat, 1, `Feat: ${featName} (${slotKey})`, build.totalLevel, ctx)
    }

    // ── Past lives ────────────────────────────────────────────────────────
    for (const [source, count] of Object.entries(build.pastLives)) {
      if (!count) continue
      const feat = allFeats.find(f => f.Name === source || f.Name === `Past Life: ${source}`)
      if (feat) accumulateFeat(map, feat, count, `Past life: ${source} ×${count}`, build.totalLevel, ctx)
    }

    // ── Heroic enhancements ───────────────────────────────────────────────
    for (const [treeName, choices] of Object.entries(build.enhancementChoices)) {
      const tree = allTrees.find(t => t.Name === treeName)
      if (!tree) continue
      const selections = build.enhancementSelections[treeName] ?? {}
      const matchedClass = build.classes.find(bc =>
        bc.name && treeName.toLowerCase().includes(bc.name.toLowerCase())
      )
      accumulateEnhancementTree(map, tree, choices, selections, matchedClass?.levels ?? build.totalLevel, ctx)
    }

    // ── Epic destiny ──────────────────────────────────────────────────────
    for (const [treeName, choices] of Object.entries(build.destinyChoices)) {
      const tree = allTrees.find(t => t.Name === treeName)
      if (!tree) continue
      accumulateEnhancementTree(map, tree, choices, {}, build.totalLevel, ctx)
    }

    // ── Reaper ────────────────────────────────────────────────────────────
    for (const [treeName, choices] of Object.entries(build.reaperChoices)) {
      const tree = allTrees.find(t => t.Name === treeName)
      if (!tree) continue
      accumulateEnhancementTree(map, tree, choices, {}, build.totalLevel, ctx)
    }

    // ── Gear item buffs ───────────────────────────────────────────────────
    accumulateGear(map, gearItems, buffIndex, ctx)

    // ── Augments ─────────────────────────────────────────────────────────
    accumulateAugments(map, build.augmentChoices, allAugments, ctx)

    // ── Gear set bonuses ──────────────────────────────────────────────────
    accumulateSetBonuses(map, gearItems, allSetBonuses, ctx)

    // ── Filigrees + filigree set bonuses ──────────────────────────────────
    accumulateFiligrees(map, build.filigreeSlots, build.artifactFiligreeSlots ?? [], allFiligrees, allFiligreeBonuses, ctx)

    // ── Self / party buffs ────────────────────────────────────────────────
    accumulateSelfBuffs(map, build.activeBuffs, allSelfBuffs, ctx)

    // ── Guild buffs ───────────────────────────────────────────────────────
    if (input.allGuildBuffs && (build.guildLevel ?? 0) > 0) {
      accumulateGuildBuffs(map, build.guildLevel ?? 0, input.allGuildBuffs, build.totalLevel, ctx)
    }

    // ── Twists of Fate ───────────────────────────────────────────────────
    accumulateTwists(map, build.twistChoices ?? [], build.unlockedDestinyTrees ?? [], allTrees, ctx)

    // ── Skill tomes ───────────────────────────────────────────────────────
    for (const [skill, bonus] of Object.entries(build.skillTomes ?? {})) {
      if (!bonus) continue
      add(map, `skill.${skill}`, { value: bonus, type: 'Tome', source: `${skill} tome` })
    }

    // ── Armor stance derivation ──────────────────────────────────────────
    // V2 derives the armor stance from the equipped armor's <Armor> field.
    // Used for: PRR derivation (BAB×multiplier), MRR cap (Cloth=50, Light=100),
    // dodge cap (Cloth = no MDB cap), AC stacking-armor%, etc.
    const armorStances = deriveArmorStances(gearItems)

    // V2 BreakdownItemMRRCap: Cloth Armor → 50, Light Armor → 100, Medium/Heavy → none.
    if (armorStances.has('Cloth Armor')) {
      add(map, 'mrrCap', { value: 50,  type: 'Stance', source: 'Cloth Armor' })
    } else if (armorStances.has('Light Armor')) {
      add(map, 'mrrCap', { value: 100, type: 'Stance', source: 'Light Armor' })
    }

    // V2 BreakdownItemMDB intrinsic input: equipped armor's MaximumDexterityBonus
    // contributes to the unified 'mdb' breakdown as a Base bonus, on top of any
    // MaxDexBonus effect contributions already accumulated. Cloth Armor + no
    // tower shield is "no limit" (handled by effectiveMDB() at display time).
    {
      const armor = gearItems['Armor'] ?? gearItems['Body']
      if (armor?.MaximumDexterityBonus != null) {
        add(map, 'mdb', {
          value: armor.MaximumDexterityBonus,
          type: 'Base',
          source: `${armor.Name} (Armor MaxDex)`,
        })
      }
      // V2 BreakdownItemMaxDexBonusShields: tower shield intrinsic MaxDex.
      const shield = gearItems['OffHand'] ?? gearItems['Shield']
      const isTowerShield = shield?.Armor === 'Tower Shield' || shield?.Armor === 'TowerShield'
      if (isTowerShield && shield?.MaximumDexterityBonus != null) {
        add(map, 'mdb.tower', {
          value: shield.MaximumDexterityBonus,
          type: 'Base',
          source: `${shield.Name} (Shield MaxDex)`,
        })
      }
    }

    // =========================================================================
    // Phase 2: resolve ability scores fully, add ability-mod-derived bonuses
    // =========================================================================

    function resolveAbility(ab: string): number {
      return resolveBonus(map.get(`ability.${ab}`) ?? []).total
    }

    const strMod     = abMod(resolveAbility('Strength'))
    const dexMod     = abMod(resolveAbility('Dexterity'))
    const conModFull = abMod(resolveAbility('Constitution'))
    const intModFull = abMod(resolveAbility('Intelligence'))
    const wisMod     = abMod(resolveAbility('Wisdom'))
    const chaMod     = abMod(resolveAbility('Charisma'))

    // Saves
    if (conModFull !== 0) add(map, 'save.Fort',   { value: conModFull, type: 'Ability mod', source: 'Constitution' })
    if (dexMod !== 0)     add(map, 'save.Reflex', { value: dexMod,     type: 'Ability mod', source: 'Dexterity' })
    if (wisMod !== 0)     add(map, 'save.Will',   { value: wisMod,     type: 'Ability mod', source: 'Wisdom' })

    // V2 Divine Grace: Paladin (auto at level 2) and Sacred Fist add CHA mod to all saves,
    // capped at 2 + 3*levels of the relevant class.
    {
      const palLevels = build.classes.filter(c => c.name === 'Paladin').reduce((s, c) => s + c.levels, 0)
      const sfLevels  = build.classes.filter(c => c.name === 'Sacred Fist').reduce((s, c) => s + c.levels, 0)
      if (chaMod > 0 && (palLevels >= 2 || sfLevels >= 2)) {
        const cap = Math.max(
          palLevels >= 2 ? 2 + 3 * palLevels : 0,
          sfLevels  >= 2 ? 2 + 3 * sfLevels  : 0,
        )
        const bonus = Math.min(chaMod, cap)
        if (bonus > 0) {
          const src = `Divine Grace (Charisma, capped @ ${cap})`
          add(map, 'save.Fort',   { value: bonus, type: 'Divine', source: src })
          add(map, 'save.Reflex', { value: bonus, type: 'Divine', source: src })
          add(map, 'save.Will',   { value: bonus, type: 'Divine', source: src })
        }
      }
    }

    // Melee (weapon attack modifier checked — could be DEX for finesse weapons)
    const weaponInfo = extractWeaponInfo(gearItems)
    const meleeAtkMod = weaponInfo?.attackModifier === 'Dexterity' ? dexMod : strMod
    const meleeAtkAbName = weaponInfo?.attackModifier === 'Dexterity' ? 'Dexterity' : 'Strength'
    if (meleeAtkMod !== 0) add(map, 'melee.toHit', { value: meleeAtkMod, type: 'Ability mod', source: meleeAtkAbName })
    if (strMod !== 0)      add(map, 'melee.damage', { value: strMod, type: 'Ability mod', source: 'Strength' })

    // Ranged
    if (dexMod !== 0) add(map, 'ranged.toHit', { value: dexMod, type: 'Ability mod', source: 'Dexterity' })

    // Initiative
    if (dexMod !== 0) add(map, 'initiative', { value: dexMod, type: 'Ability mod', source: 'Dexterity' })

    // AC: base 10 + DEX mod (capped by V2 BreakdownItemMDB total when not in
    // cloth armor; cloth armor has no MDB cap by V2 BreakdownItemMDB::CreateOtherEffects).
    add(map, 'ac', { value: 10, type: 'Base', source: 'Base AC' })
    {
      const isCloth = armorStances.has('Cloth Armor')
      const isTowerShield = armorStances.has('Tower Shield')
      const mdbTotal = resolveBonus(map.get('mdb') ?? []).total
      const mdbTowerTotal = resolveBonus(map.get('mdb.tower') ?? []).total
      const armorCapApplies = !isCloth || isTowerShield
      const towerCapApplies = isTowerShield && (map.get('mdb.tower')?.length ?? 0) > 0

      let cap: number | null = null
      let capSrc: string | null = null
      if (armorCapApplies) { cap = mdbTotal; capSrc = `Armor MDB ${mdbTotal}` }
      if (towerCapApplies && (cap == null || mdbTowerTotal < cap)) {
        cap = mdbTowerTotal
        capSrc = `Tower Shield MDB ${mdbTowerTotal}`
      }
      const effectiveDexForAC = cap != null ? Math.min(dexMod, cap) : dexMod
      if (effectiveDexForAC !== 0) {
        add(map, 'ac', {
          value: effectiveDexForAC,
          type: 'Ability mod',
          source: cap != null && dexMod > cap ? `Dexterity (capped: ${capSrc})` : 'Dexterity',
        })
      }
    }

    // HP: CON mod correction if gear changed CON
    if (conModFull !== conMod && build.totalLevel > 0) {
      const delta = (conModFull - conMod) * build.totalLevel
      if (delta !== 0) {
        add(map, 'hp', { value: delta, type: 'Ability mod', source: 'Constitution (gear/enhancement adjustment)' })
      }
    }

    // Speed base
    add(map, 'speed', { value: 100, type: 'Base', source: 'Base movement speed' })

    // ── Skill points ──────────────────────────────────────────────────────
    // V2 Class::SkillPoints: max(1, classBase + raceSkillBonus + intModForLevel),
    // ×4 at character level 1. INT-for-level uses base+race+levelup only (no
    // tomes at L1, no gear/enhancements ever — gear isn't equipped at chargen).
    {
      const intInherent = (build.baseAbilities.Intelligence ?? 8)
        + (race ? Number((race as unknown as Record<string, number>).Intelligence) || 0 : 0)
      const intLvlUps = Object.values(build.abilityLevelUps).filter(v => v === 'Intelligence').length
      const intModL1 = abMod(intInherent)
      const intModL2 = abMod(intInherent + intLvlUps)
      const raceSP = (race as unknown as Record<string, unknown>)?.SkillPoints
      const raceSkillBonus = typeof raceSP === 'number' ? raceSP : 0

      // Replace the per-class 'Base' skillPoints with a precise V2 sum.
      // (accumulateClass already added a 'Base' entry; we replace that path
      // with a single corrective term tagged differently to avoid double-counting.)
      // Simpler: zero out the existing Base entries and re-add per-level.
      const existing = map.get('skillPoints')
      if (existing) map.set('skillPoints', existing.filter(b => b.type !== 'Base'))

      let classIdx = 0  // 0-based char level
      for (const bc of build.classes) {
        if (!bc.name || bc.levels <= 0) continue
        const cls = allClasses.find(c => c.Name === bc.name)
        const baseSpp = cls?.SkillPoints ?? 2
        for (let i = 0; i < bc.levels && classIdx < 20; i++, classIdx++) {
          const mod = classIdx === 0 ? intModL1 : intModL2
          const pts = Math.max(1, baseSpp + raceSkillBonus + mod)
          const total = classIdx === 0 ? pts * 4 : pts
          add(map, 'skillPoints', {
            value: total,
            type: 'Stacking',
            source: `${bc.name} L${classIdx + 1}: max(1, ${baseSpp}+${raceSkillBonus}+${mod})${classIdx === 0 ? '×4' : ''}`,
          })
        }
      }
    }

    // ── Skills ────────────────────────────────────────────────────────────
    const classSkillSet = new Set<string>()
    for (const bc of build.classes) {
      if (!bc.name || bc.levels <= 0) continue
      const cls = allClasses.find(c => c.Name === bc.name)
      if (!cls?.ClassSkill) continue
      for (const s of toArray(cls.ClassSkill)) classSkillSet.add(s)
    }

    const abilModMap: Record<string, number> = {
      Strength: strMod, Dexterity: dexMod, Constitution: conModFull,
      Intelligence: intModFull, Wisdom: wisMod, Charisma: chaMod,
    }

    // V2 ACP-affected skills (multiplier 1 unless noted)
    const ACP_SKILLS: Record<string, number> = {
      Balance: 1, Hide: 1, Jump: 1, 'Move Silently': 1, Tumble: 1, Swim: 2,
    }
    const armorACP  = Math.min(0, resolveBonus(map.get('armorCheckPenalty') ?? []).total)
    const shieldACP = Math.min(0, resolveBonus(map.get('armorCheckPenaltyShield') ?? []).total)

    for (const { name: skill, ability } of SKILLS) {
      const abilMod = abilModMap[ability] ?? 0
      if (abilMod !== 0) {
        add(map, `skill.${skill}`, {
          value: abilMod,
          type: 'Ability mod',
          source: `${ability} mod`,
        })
      }
      // V2 stores trained levels; rank = trained for class skill, trained/2 for cross-class.
      const trained = build.skillRanks?.[skill] ?? 0
      if (trained > 0) {
        const ranksValue = classSkillSet.has(skill) ? trained : trained / 2
        add(map, `skill.${skill}`, { value: ranksValue, type: 'Ranks', source: 'Skill ranks' })
      }

      // V2 Armor Check Penalty: stacks separately from armor and shield.
      const acpMult = ACP_SKILLS[skill]
      if (acpMult) {
        if (armorACP < 0) {
          add(map, `skill.${skill}`, {
            value: armorACP * acpMult,
            type: 'Penalty',
            source: acpMult > 1 ? `Armor check penalty ×${acpMult}` : 'Armor check penalty',
          })
        }
        if (shieldACP < 0) {
          add(map, `skill.${skill}`, {
            value: shieldACP * acpMult,
            type: 'Penalty',
            source: acpMult > 1 ? `Armor check penalty (Shield) ×${acpMult}` : 'Armor check penalty (Shield)',
          })
        }
      }
    }

    // ── Armor PRR (BAB × armor multiplier) ───────────────────────────────
    // V2 BreakdownItemPRR::CreateOtherEffects (BreakdownItemPRR.cpp:43-122):
    //   Light Armor + Light Armor Proficiency: BAB × 1
    //   Mithral Body feat: BAB × 1
    //   Medium Armor + Medium Armor Proficiency: round(BAB × 1.5)
    //   Heavy Armor + Heavy Armor Proficiency: BAB × 2
    //   Adamantine Body feat: BAB × 2
    {
      const babTotal = Math.min(MAX_BAB, resolveBonus(map.get('bab') ?? []).total)
      if (babTotal > 0) {
        const trainedFeats = new Set<string>(Object.values(build.featChoices).filter(Boolean))
        // Auto-feats from classes & race
        for (const bc of build.classes) {
          if (!bc.name || bc.levels <= 0) continue
          const cls = allClasses.find(c => c.Name === bc.name)
          for (const af of toArray(cls?.AutomaticFeats)) {
            const names = af.Feats
            if (typeof names === 'string') trainedFeats.add(names)
            else if (Array.isArray(names)) names.forEach(n => trainedFeats.add(n))
          }
        }
        if (race) {
          for (const f of toArray(race.GrantedFeat)) trainedFeats.add(f)
        }
        const has = (f: string) => trainedFeats.has(f)

        if (armorStances.has('Light Armor') && has('Light Armor Proficiency')) {
          add(map, 'prr', { value: babTotal, type: 'Stance', source: 'Light Armor PRR (BAB×1)' })
        }
        if (has('Mithral Body')) {
          add(map, 'prr', { value: babTotal, type: 'Feat', source: 'Mithral Body PRR (BAB×1)' })
        }
        if (armorStances.has('Medium Armor') && has('Medium Armor Proficiency')) {
          add(map, 'prr', { value: Math.round(babTotal * 1.5), type: 'Stance', source: 'Medium Armor PRR (BAB×1.5)' })
        }
        if (armorStances.has('Heavy Armor') && has('Heavy Armor Proficiency')) {
          add(map, 'prr', { value: babTotal * 2, type: 'Stance', source: 'Heavy Armor PRR (BAB×2)' })
        }
        if (has('Adamantine Body')) {
          add(map, 'prr', { value: babTotal * 2, type: 'Feat', source: 'Adamantine Body PRR (BAB×2)' })
        }
      }
    }

    // V2 SpellPoints: per-casting-class bonus = (classLevels + 9) * BaseStatToBonus(castingStat).
    // Class::ClassCastingStat picks the highest-mod stat for multi-stat classes (FavoredSoul).
    for (const bc of build.classes) {
      if (!bc.name || bc.levels <= 0) continue
      const cls = allClasses.find(c => c.Name === bc.name)
      if (!cls) continue
      if (spellPointsAtLevel(cls.SpellPointsPerLevel, bc.levels) <= 0) continue
      const stat = pickCastingStat(cls.CastingStat as string | string[] | undefined, abilModMap)
      if (!stat) continue
      const mod = abilModMap[stat] ?? 0
      const bonus = (bc.levels + 9) * mod
      if (bonus !== 0) {
        add(map, 'spellPoints', {
          value: bonus,
          type: 'Ability mod',
          source: `${bc.name} (${stat}) bonus SP`,
        })
      }
    }

    // V2 Favored Soul / Sorcerer SP multiplier = 1 + (FvS+Sorc levels) / min(buildLevel, 20).
    // Pure FvS/Sorc 20 → 2x SP; multiclass → partial multiplier.
    {
      const fvsLv  = build.classes.filter(c => c.name === 'Favored Soul').reduce((s, c) => s + c.levels, 0)
      const sorcLv = build.classes.filter(c => c.name === 'Sorcerer').reduce((s, c) => s + c.levels, 0)
      const total = fvsLv + sorcLv
      if (total > 0) {
        const lvCap = Math.min(build.totalLevel, 20)
        if (lvCap > 0) {
          const factor = total / lvCap
          const baseSP = resolveBonus(map.get('spellPoints') ?? []).total
          const bonus = Math.round(baseSP * factor)
          if (bonus !== 0) {
            add(map, 'spellPoints', {
              value: bonus,
              type: 'Multiplier',
              source: `Favored Soul/Sorcerer SP multiplier (×${(1 + factor).toFixed(2)})`,
            })
          }
        }
      }
    }

    return map
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    build,
    input.allClasses, input.allRaces, input.allFeats, input.allTrees,
    input.allSelfBuffs, input.allAugments, input.allSetBonuses,
    input.allFiligreeBonuses, input.allFiligrees, input.gearItems,
  ])

  const weaponInfo = useMemo(() => extractWeaponInfo(input.gearItems), [input.gearItems])
  const armorMaxDex = useMemo(() => extractArmorMaxDex(input.gearItems), [input.gearItems])
  const armorStances = useMemo(() => deriveArmorStances(input.gearItems), [input.gearItems])
  const inClothArmor = armorStances.has('Cloth Armor')
  const inTowerShield = armorStances.has('Tower Shield')

  return useMemo<BuildStats>(() => ({
    resolve: (key: string): ResolvedStat => {
      const bonuses = statMap.get(key)
      return bonuses?.length ? resolveBonus(bonuses) : emptyResolvedStat()
    },
    total: (key: string): number => {
      const bonuses = statMap.get(key)
      return bonuses?.length ? resolveBonus(bonuses).total : 0
    },
    keys: () => Array.from(statMap.keys()),
    weapon: weaponInfo,
    armorMaxDex,
    inClothArmor,
    inTowerShield,
  }), [statMap, weaponInfo, armorMaxDex, inClothArmor, inTowerShield])
}

// ---------------------------------------------------------------------------
// Skill → ability name lookup
