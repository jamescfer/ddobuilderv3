// useBuildStats — full V2-style stat aggregation hook
//
// Collects bonuses from every source (race, class, feats, enhancements,
// epic destiny, reaper, gear, tomes, skill ranks) into a StatMap, then
// exposes a resolve(statKey) function that applies DDO stacking rules.
//
// Two-phase approach:
//   Phase 1 – accumulate raw bonuses into a Map<statKey, RawBonus[]>
//   Phase 2 – resolve ability scores, then add ability-mod-derived bonuses

import { useMemo } from 'react'
import { useCharacter } from '../context/CharacterContext'
import type {
  Race, DDOClass, Feat, EnhancementTree, EnhancementTreeItem, Item,
  Effect, EnhancementSelection,
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
}

// ---------------------------------------------------------------------------
// External data the hook consumers must supply
// ---------------------------------------------------------------------------

export interface BuildStatsInput {
  allClasses: DDOClass[]
  allRaces: Race[]
  allFeats: Feat[]
  allTrees: EnhancementTree[]   // all enhancement + destiny + reaper trees
  gearItems: Record<string, Item>  // slot → resolved Item object
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

// ---------------------------------------------------------------------------
// Save base helpers (matches BreakdownsPanel existing logic)
// ---------------------------------------------------------------------------

function saveBase(saveType: unknown, levels: number): number {
  const s = String(saveType ?? '')
  if (s === 'Strong' || s === 'Type2') return 2 + Math.floor(levels / 2)
  return Math.floor(levels / 3)   // Weak / Type1
}

function classBAB(cls: DDOClass, levels: number): number {
  const arr = String(cls.BAB ?? '').trim().split(/\s+/).map(Number).filter(n => !isNaN(n))
  if (arr.length > levels) return arr[levels]
  if (arr.length > 0) return arr[arr.length - 1]
  return Math.floor(levels * 0.75)
}

function computeSpellPoints(formula: unknown, levels: number): number {
  if (formula == null) return 0
  const s = String(formula).trim()
  const m = s.match(/(\d+)\s*\+\s*(\d+)\s*\*/)
  if (m) return parseInt(m[1]) + parseInt(m[2]) * levels
  const p = parseInt(s)
  return isNaN(p) ? 0 : p * levels
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

function accumulateRace(
  map: StatMap,
  race: Race,
): void {
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
  conMod: number,  // passed in from phase-2; we pre-compute here using base only for a first pass
): void {
  const label = `${cls.Name} (${levels} lv)`

  // BAB
  const bab = classBAB(cls, levels)
  add(map, 'bab', { value: bab, type: 'Base', source: label })

  // Saves
  add(map, 'save.Fort',   { value: saveBase(cls.Fortitude, levels), type: 'Base', source: label })
  add(map, 'save.Reflex', { value: saveBase(cls.Reflex,    levels), type: 'Base', source: label })
  add(map, 'save.Will',   { value: saveBase(cls.Will,      levels), type: 'Base', source: label })

  // HP: hit die + CON mod per level
  const hpPerLv = (cls.HitPoints ?? 6) + conMod
  add(map, 'hp', { value: levels * hpPerLv, type: 'Base', source: `${label} (d${cls.HitPoints ?? 6}+CON)` })

  // Spell points
  const sp = computeSpellPoints(cls.SpellPointsPerLevel, levels)
  if (sp > 0) {
    add(map, 'spellPoints', { value: sp, type: 'Base', source: label })
  }

  // Skill points — INT mod added in phase 2; store raw class base here
  const spp = Math.max(1, cls.SkillPoints ?? 2)
  const skillPts = isFirst ? spp * 4 + spp * (levels - 1) : spp * levels
  if (skillPts > 0) {
    add(map, 'skillPoints', { value: skillPts, type: 'Base', source: label })
  }
}

function accumulateFeat(map: StatMap, feat: Feat, rank: number, source: string): void {
  for (const eff of toArray(feat.Effect)) {
    addParsed(map, parseEffect(eff, rank, source, 0, 0))
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

    // If this item has a selector, use effects from the selected option
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

    // Otherwise use effects from the item itself
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
  }
}

// ---------------------------------------------------------------------------
// Main hook
// ---------------------------------------------------------------------------

export function useBuildStats(input: BuildStatsInput): BuildStats {
  const { build } = useCharacter()

  const statMap = useMemo<StatMap>(() => {
    const map: StatMap = new Map()

    const { allClasses, allRaces, allFeats, allTrees, gearItems } = input

    // ── Ability base scores ───────────────────────────────────────────────
    const ABILITIES = ['Strength', 'Dexterity', 'Constitution', 'Intelligence', 'Wisdom', 'Charisma'] as const
    for (const ab of ABILITIES) {
      const base = build.baseAbilities[ab]
      if (base) add(map, `ability.${ab}`, { value: base, type: 'Base', source: 'Point buy' })

      const tome = build.abilityTomes[ab] ?? 0
      if (tome) add(map, `ability.${ab}`, { value: tome, type: 'Tome', source: 'Ability tome' })

      const lvlUps = Object.values(build.abilityLevelUps).filter(v => v === ab).length
      if (lvlUps) add(map, `ability.${ab}`, { value: lvlUps, type: 'Level-up', source: 'Level-up bonuses' })
    }

    // ── Race ─────────────────────────────────────────────────────────────
    const race = allRaces.find(r => r.Name === build.race)
    if (race) {
      accumulateRace(map, race)
      // Racial granted feats
      for (const featName of toArray(race.GrantedFeat)) {
        const feat = allFeats.find(f => f.Name === featName)
        if (feat) accumulateFeat(map, feat, 1, `${build.race}: ${featName}`)
      }
    }

    // ── Phase 1.5: quick ability score resolve for CON-mod HP ────────────
    // We need CON mod to accurately compute HP from class levels.
    // Use whatever is in the map so far (base + racial + tome + levelup).
    function quickResolve(key: string): number {
      const bonuses = map.get(key) ?? []
      return resolveBonus(bonuses).total
    }
    const conMod = abMod(quickResolve('ability.Constitution'))
    const intMod = abMod(quickResolve('ability.Intelligence'))

    // ── Classes ───────────────────────────────────────────────────────────
    let isFirst = true
    for (const bc of build.classes) {
      if (!bc.name || bc.levels <= 0) continue
      const cls = allClasses.find(c => c.Name === bc.name)
      if (!cls) continue
      accumulateClass(map, cls, bc.levels, isFirst, conMod)
      isFirst = false

      // Automatic (granted) feats
      for (const autoFeat of toArray(cls.AutomaticFeats)) {
        const names = toArray(
          typeof autoFeat.Feats === 'string' ? autoFeat.Feats :
          Array.isArray(autoFeat.Feats) ? autoFeat.Feats : undefined
        )
        for (const featName of names) {
          const feat = allFeats.find(f => f.Name === featName)
          if (feat) accumulateFeat(map, feat, 1, `${bc.name}: ${featName}`)
        }
      }

    }

    // ── Chosen feats ──────────────────────────────────────────────────────
    for (const [slotKey, featName] of Object.entries(build.featChoices)) {
      if (!featName) continue
      const feat = allFeats.find(f => f.Name === featName)
      if (feat) accumulateFeat(map, feat, 1, `Feat: ${featName} (${slotKey})`)
    }

    // ── Past lives ────────────────────────────────────────────────────────
    for (const [source, count] of Object.entries(build.pastLives)) {
      if (!count) continue
      // Past lives are stored as "ClassName" or "RaceName" keys
      // Find matching feats (DDO past life feats share the same name)
      const feat = allFeats.find(f => f.Name === source || f.Name === `Past Life: ${source}`)
      if (feat) accumulateFeat(map, feat, count, `Past life: ${source} ×${count}`)
    }

    // ── Heroic enhancements ───────────────────────────────────────────────
    for (const [treeName, choices] of Object.entries(build.enhancementChoices)) {
      const tree = allTrees.find(t => t.Name === treeName)
      if (!tree) continue
      const selections = build.enhancementSelections[treeName] ?? {}
      // Class levels for ClassLevel AType — use primary class matching tree
      const matchedClass = build.classes.find(bc => bc.name && treeName.toLowerCase().includes(bc.name.toLowerCase()))
      const classLevels = matchedClass?.levels ?? build.totalLevel
      accumulateEnhancementTree(map, tree, choices, selections, classLevels)
    }

    // ── Epic destiny ──────────────────────────────────────────────────────
    for (const [treeName, choices] of Object.entries(build.destinyChoices)) {
      const tree = allTrees.find(t => t.Name === treeName)
      if (!tree) continue
      const selections: Record<string, string> = {}
      accumulateEnhancementTree(map, tree, choices, selections, build.totalLevel)
    }

    // ── Reaper ────────────────────────────────────────────────────────────
    for (const [treeName, choices] of Object.entries(build.reaperChoices)) {
      const tree = allTrees.find(t => t.Name === treeName)
      if (!tree) continue
      accumulateEnhancementTree(map, tree, choices, {}, build.totalLevel)
    }

    // ── Gear ──────────────────────────────────────────────────────────────
    accumulateGear(map, gearItems)

    // ── Skill tomes ───────────────────────────────────────────────────────
    for (const [skill, bonus] of Object.entries(build.skillTomes ?? {})) {
      if (!bonus) continue
      add(map, `skill.${skill}`, { value: bonus, type: 'Tome', source: `${skill} tome` })
    }

    // ─────────────────────────────────────────────────────────────────────
    // Phase 2: ability-mod-derived bonuses
    // Now that gear/enhancements are in the map, resolve ability scores
    // properly and add downstream derived bonuses.
    // ─────────────────────────────────────────────────────────────────────

    function resolveAbility(ab: string): number {
      return resolveBonus(map.get(`ability.${ab}`) ?? []).total
    }

    const strMod = abMod(resolveAbility('Strength'))
    const dexMod = abMod(resolveAbility('Dexterity'))
    const conModFull = abMod(resolveAbility('Constitution'))
    const intModFull = abMod(resolveAbility('Intelligence'))
    const wisMod = abMod(resolveAbility('Wisdom'))
    const chaMod = abMod(resolveAbility('Charisma'))

    // Saves: add ability mods
    if (conModFull !== 0) add(map, 'save.Fort',   { value: conModFull, type: 'Ability mod', source: 'Constitution' })
    if (dexMod !== 0)     add(map, 'save.Reflex', { value: dexMod,     type: 'Ability mod', source: 'Dexterity' })
    if (wisMod !== 0)     add(map, 'save.Will',   { value: wisMod,     type: 'Ability mod', source: 'Wisdom' })

    // Melee: STR to hit/damage
    if (strMod !== 0) {
      add(map, 'melee.toHit',   { value: strMod, type: 'Ability mod', source: 'Strength' })
      add(map, 'melee.damage',  { value: strMod, type: 'Ability mod', source: 'Strength' })
    }

    // Ranged: DEX to hit
    if (dexMod !== 0) {
      add(map, 'ranged.toHit', { value: dexMod, type: 'Ability mod', source: 'Dexterity' })
    }

    // Initiative: DEX
    if (dexMod !== 0) {
      add(map, 'initiative', { value: dexMod, type: 'Ability mod', source: 'Dexterity' })
    }

    // AC: DEX mod + base 10
    add(map, 'ac', { value: 10, type: 'Base', source: 'Base AC' })
    if (dexMod !== 0) {
      add(map, 'ac', { value: dexMod, type: 'Ability mod', source: 'Dexterity' })
    }

    // HP: CON mod per heroic level (if full CON differs from quick estimate)
    // Re-add delta if full resolve changed the CON mod
    if (conModFull !== conMod && build.totalLevel > 0) {
      const delta = (conModFull - conMod) * build.totalLevel
      if (delta !== 0) {
        add(map, 'hp', { value: delta, type: 'Ability mod', source: 'Constitution (adjustment)' })
      }
    }

    // Speed base
    add(map, 'speed', { value: 100, type: 'Base', source: 'Base movement speed' })

    // Skill points: INT mod contribution (per level, ×4 for first class level 1)
    if (intModFull !== 0) {
      let firstClassDone = false
      for (const bc of build.classes) {
        if (!bc.name || bc.levels <= 0) continue
        const mult = !firstClassDone ? bc.levels + 3 : bc.levels   // +3 = extra ×4 at level 1 = 3 extra
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

    // Skills: ability mod + ranks + class skill bonus + tome
    const SKILL_ABILITIES: Record<string, number> = {
      Balance: dexMod, Bluff: chaMod, Concentration: conModFull, Diplomacy: chaMod,
      'Disable Device': intModFull, Haggle: chaMod, Heal: wisMod, Hide: dexMod,
      Intimidate: chaMod, Jump: strMod, Listen: wisMod, 'Move Silently': dexMod,
      'Open Lock': dexMod, Perform: chaMod, Repair: intModFull, Search: intModFull,
      Spellcraft: intModFull, Spot: wisMod, Swim: strMod, Tumble: dexMod,
      'Use Magic Device': chaMod,
    }

    // Build class skill set
    const classSkillSet = new Set<string>()
    for (const bc of build.classes) {
      if (!bc.name || bc.levels <= 0) continue
      const cls = allClasses.find(c => c.Name === bc.name)
      if (!cls?.ClassSkill) continue
      for (const s of toArray(cls.ClassSkill)) classSkillSet.add(s)
    }

    for (const [skill, abilMod] of Object.entries(SKILL_ABILITIES)) {
      const abilName = abilityNameForSkill(skill)
      if (abilMod !== 0) {
        add(map, `skill.${skill}`, { value: abilMod, type: 'Ability mod', source: `${abilName} mod` })
      }

      const ranks = build.skillRanks?.[skill] ?? 0
      if (ranks > 0) {
        add(map, `skill.${skill}`, { value: ranks, type: 'Ranks', source: 'Skill ranks' })
        if (classSkillSet.has(skill)) {
          add(map, `skill.${skill}`, { value: 1, type: 'Class', source: 'Class skill bonus' })
        }
      }
    }

    return map
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    build,
    input.allClasses,
    input.allRaces,
    input.allFeats,
    input.allTrees,
    input.gearItems,
  ])

  return useMemo<BuildStats>(() => ({
    resolve: (key: string): ResolvedStat => {
      const bonuses = statMap.get(key)
      if (!bonuses || bonuses.length === 0) return emptyResolvedStat()
      return resolveBonus(bonuses)
    },
    total: (key: string): number => {
      const bonuses = statMap.get(key)
      if (!bonuses || bonuses.length === 0) return 0
      return resolveBonus(bonuses).total
    },
    keys: () => Array.from(statMap.keys()),
  }), [statMap])
}

// ---------------------------------------------------------------------------
// Utility: map skill name → governing ability name
// ---------------------------------------------------------------------------

function abilityNameForSkill(skill: string): string {
  const map: Record<string, string> = {
    Balance: 'Dexterity', Bluff: 'Charisma', Concentration: 'Constitution',
    Diplomacy: 'Charisma', 'Disable Device': 'Intelligence', Haggle: 'Charisma',
    Heal: 'Wisdom', Hide: 'Dexterity', Intimidate: 'Charisma', Jump: 'Strength',
    Listen: 'Wisdom', 'Move Silently': 'Dexterity', 'Open Lock': 'Dexterity',
    Perform: 'Charisma', Repair: 'Intelligence', Search: 'Intelligence',
    Spellcraft: 'Intelligence', Spot: 'Wisdom', Swim: 'Strength',
    Tumble: 'Dexterity', 'Use Magic Device': 'Charisma',
  }
  return map[skill] ?? 'Unknown'
}
