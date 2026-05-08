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
  OptionalBuff, FiligreeSlot,
} from '../types/ddo'
import { parseEffect, parseItemBuff } from '../lib/effectParser'
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

function accumulateFeat(map: StatMap, feat: Feat, rank: number, source: string, totalLevel = 0): void {
  for (const eff of toArray(feat.Effect)) {
    // For AType=TotalLevel / ClassLevel etc. effects in feats, pass totalLevel as the level arg
    addParsed(map, parseEffect(eff, rank, source, totalLevel, 0))
  }
}

function accumulateEnhancementTree(
  map: StatMap,
  tree: EnhancementTree,
  choices: Record<string, number>,
  selections: Record<string, string>,
  classLevels: number,
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
          addParsed(map, parseEffect(eff, rank, `${source} (${selectedOption})`, classLevels, treeAP))
        }
        continue
      }
    }

    for (const eff of toArray(item.Effect)) {
      addParsed(map, parseEffect(eff, rank, source, classLevels, treeAP))
    }
  }
}

function accumulateGear(map: StatMap, gearItems: Record<string, Item>): void {
  for (const [slot, item] of Object.entries(gearItems)) {
    const source = `${item.Name} (${slot})`
    for (const buff of toArray(item.Buff)) {
      addParsed(map, parseItemBuff(buff, source))
    }
    // Armor bonus from armor/shield items — treated as Armor bonus type
    if (item.ArmorBonus) {
      add(map, 'ac', { value: item.ArmorBonus, type: 'Armor', source })
    }
    if (item.ShieldBonus) {
      add(map, 'ac', { value: item.ShieldBonus, type: 'Shield', source })
    }
  }
}

function accumulateAugments(
  map: StatMap,
  augmentChoices: Record<string, string>,
  allAugments: Augment[],
): void {
  for (const augName of Object.values(augmentChoices)) {
    if (!augName) continue
    const aug = allAugments.find(a => a.Name === augName)
    if (!aug) continue
    const source = `Augment: ${aug.Name}`
    for (const eff of toArray(aug.Effect)) {
      addParsed(map, parseEffect(eff, 1, source, 0, 0))
    }
  }
}

function accumulateSetBonuses(
  map: StatMap,
  gearItems: Record<string, Item>,
  allSetBonuses: SetBonus[],
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
        addParsed(map, parseEffect(eff, 1, source, 0, 0))
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
): void {
  const byName = new Map<string, Filigree>(allFiligrees.map(f => [f.Name, f]))
  for (const slot of slots) {
    if (!slot.name) continue
    const fil = byName.get(slot.name)
    if (!fil) continue
    const source = `${sourcePrefix}: ${fil.Name}`
    for (const eff of toArray(fil.Effect)) {
      if (eff.Rare && !slot.rare) continue  // rare effects only apply when slot is marked rare
      addParsed(map, parseEffect(eff, 1, source, 0, 0))
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
): void {
  const setCounts = new Map<string, number>()

  accumulateFiligreeSlots(map, filigreeSlots, allFiligrees, 'Filigree', setCounts)
  accumulateFiligreeSlots(map, artifactFiligreeSlots, allFiligrees, 'Artifact Filigree', setCounts)

  for (const [bonusName, count] of setCounts) {
    const fsb = allFiligreeBonuses.find(s => s.Type === bonusName)
    if (!fsb) continue
    for (const buff of toArray(fsb.Buff)) {
      if (count < buff.EquippedCount) continue
      const source = `${bonusName} filigree set (${buff.EquippedCount}pc)`
      for (const eff of toArray(buff.Effect)) {
        addParsed(map, parseEffect(eff, 1, source, 0, 0))
      }
    }
  }
}

function accumulateSelfBuffs(
  map: StatMap,
  activeBuffNames: string[],
  allSelfBuffs: OptionalBuff[],
): void {
  for (const buffName of activeBuffNames) {
    const buff = allSelfBuffs.find(b => b.Name === buffName)
    if (!buff) continue
    const source = `Buff: ${buff.Name}`
    for (const eff of toArray(buff.Effect)) {
      addParsed(map, parseEffect(eff, 1, source, 0, 0))
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
    } = input

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
        if (feat) accumulateFeat(map, feat, 1, `${build.race}: ${featName}`, build.totalLevel)
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
          if (feat) accumulateFeat(map, feat, 1, `${bc.name}: ${featName}`, build.totalLevel)
        }
      }
    }

    // ── Chosen feats ──────────────────────────────────────────────────────
    for (const [slotKey, featName] of Object.entries(build.featChoices)) {
      if (!featName) continue
      const feat = allFeats.find(f => f.Name === featName)
      if (feat) accumulateFeat(map, feat, 1, `Feat: ${featName} (${slotKey})`, build.totalLevel)
    }

    // ── Past lives ────────────────────────────────────────────────────────
    for (const [source, count] of Object.entries(build.pastLives)) {
      if (!count) continue
      const feat = allFeats.find(f => f.Name === source || f.Name === `Past Life: ${source}`)
      if (feat) accumulateFeat(map, feat, count, `Past life: ${source} ×${count}`, build.totalLevel)
    }

    // ── Heroic enhancements ───────────────────────────────────────────────
    for (const [treeName, choices] of Object.entries(build.enhancementChoices)) {
      const tree = allTrees.find(t => t.Name === treeName)
      if (!tree) continue
      const selections = build.enhancementSelections[treeName] ?? {}
      const matchedClass = build.classes.find(bc =>
        bc.name && treeName.toLowerCase().includes(bc.name.toLowerCase())
      )
      accumulateEnhancementTree(map, tree, choices, selections, matchedClass?.levels ?? build.totalLevel)
    }

    // ── Epic destiny ──────────────────────────────────────────────────────
    for (const [treeName, choices] of Object.entries(build.destinyChoices)) {
      const tree = allTrees.find(t => t.Name === treeName)
      if (!tree) continue
      accumulateEnhancementTree(map, tree, choices, {}, build.totalLevel)
    }

    // ── Reaper ────────────────────────────────────────────────────────────
    for (const [treeName, choices] of Object.entries(build.reaperChoices)) {
      const tree = allTrees.find(t => t.Name === treeName)
      if (!tree) continue
      accumulateEnhancementTree(map, tree, choices, {}, build.totalLevel)
    }

    // ── Gear item buffs ───────────────────────────────────────────────────
    accumulateGear(map, gearItems)

    // ── Augments ─────────────────────────────────────────────────────────
    accumulateAugments(map, build.augmentChoices, allAugments)

    // ── Gear set bonuses ──────────────────────────────────────────────────
    accumulateSetBonuses(map, gearItems, allSetBonuses)

    // ── Filigrees + filigree set bonuses ──────────────────────────────────
    accumulateFiligrees(map, build.filigreeSlots, build.artifactFiligreeSlots ?? [], allFiligrees, allFiligreeBonuses)

    // ── Self / party buffs ────────────────────────────────────────────────
    accumulateSelfBuffs(map, build.activeBuffs, allSelfBuffs)

    // ── Skill tomes ───────────────────────────────────────────────────────
    for (const [skill, bonus] of Object.entries(build.skillTomes ?? {})) {
      if (!bonus) continue
      add(map, `skill.${skill}`, { value: bonus, type: 'Tome', source: `${skill} tome` })
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

    // AC: base 10 + DEX mod (capped by armor max-dex if armor equipped)
    add(map, 'ac', { value: 10, type: 'Base', source: 'Base AC' })
    const armorMaxDex = extractArmorMaxDex(gearItems)
    const effectiveDexForAC = armorMaxDex != null ? Math.min(dexMod, armorMaxDex) : dexMod
    if (effectiveDexForAC !== 0) {
      add(map, 'ac', { value: effectiveDexForAC, type: 'Ability mod', source: armorMaxDex != null ? `Dexterity (capped at ${armorMaxDex})` : 'Dexterity' })
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

    // Skill points: INT mod × levels (first class gets ×4 at level 1)
    if (intModFull !== 0) {
      let firstClassDone = false
      for (const bc of build.classes) {
        if (!bc.name || bc.levels <= 0) continue
        const mult = !firstClassDone ? bc.levels + 3 : bc.levels
        if (mult !== 0) {
          add(map, 'skillPoints', {
            value: intModFull * mult,
            type: 'Ability mod',
            source: `Intelligence (${bc.name} ×${bc.levels} lv)`,
          })
        }
        firstClassDone = true
      }
    }

    // Skills: ability mod + ranks + class skill bonus
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
      // V2 has NO flat +1 class-skill bonus — that was a V3 mis-implementation.
      const trained = build.skillRanks?.[skill] ?? 0
      if (trained > 0) {
        const ranksValue = classSkillSet.has(skill) ? trained : trained / 2
        add(map, `skill.${skill}`, { value: ranksValue, type: 'Ranks', source: 'Skill ranks' })
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
  }), [statMap, weaponInfo, armorMaxDex])
}

// ---------------------------------------------------------------------------
// Skill → ability name lookup
