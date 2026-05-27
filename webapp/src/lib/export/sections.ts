// V2-parity Forum / BBCode export sections.
//
// V2 source: DDOBuilder/ForumExportDlg.cpp:194-278 (driver) + 1454-1735 (per-section emitters).
// Each section is a pure function returning string lines so the panel can pluck
// any subset and re-order them.

import type {
  CharacterBuild, Ability, DDOClass, Race, Stance, OptionalBuff, Feat,
} from '../../types/ddo'
import type { BuildStats } from '../../hooks/useBuildStats'
import { buildAutomaticFeatGroups } from '../automaticFeats'

const ABILITY_ABBREVS: Record<Ability, string> = {
  Strength: 'STR', Dexterity: 'DEX', Constitution: 'CON',
  Intelligence: 'INT', Wisdom: 'WIS', Charisma: 'CHA',
}
const ABILITIES: Ability[] = ['Strength', 'Dexterity', 'Constitution', 'Intelligence', 'Wisdom', 'Charisma']

function sign(n: number): string { return n >= 0 ? `+${n}` : String(n) }
function abMod(score: number): number { return Math.floor((score - 10) / 2) }

export interface SectionContext {
  build: CharacterBuild
  stats: BuildStats | null
  /** Optional static catalogues — required for sections that derive data from
   *  race/class/stance/feat tables (AutomaticFeats, SelfAndPartyBuffs,
   *  PastLives split, …). */
  allClasses?: DDOClass[]
  allRaces?: Race[]
  allStances?: Stance[]
  allSelfBuffs?: OptionalBuff[]
  /** Feats with Acquire === 'EpicPastLife'. */
  epicPastLifeFeats?: Feat[]
}

export interface SectionDef {
  id: string
  label: string
  emit: (ctx: SectionContext) => string[]
}

const characterHeader: SectionDef = {
  id: 'CharacterHeader',
  label: 'Character header',
  emit: ({ build }) => {
    const lines: string[] = []
    lines.push(`[b]Character Name[/b]: ${build.name || '(unnamed)'}`)
    lines.push(`[b]Race[/b]: ${build.race || '(none)'} | [b]Alignment[/b]: ${build.alignment || '(none)'}`)
    const cls = build.classes.filter(c => c.name && c.levels > 0).map(c => `${c.name} ${c.levels}`)
    lines.push(`[b]Classes[/b]: ${cls.length > 0 ? cls.join(' / ') : '(none)'}`)
    lines.push(`[b]Total Level[/b]: ${build.totalLevel}`)
    if (build.epicLevels) lines.push(`[b]Epic Levels[/b]: ${build.epicLevels}`)
    if (build.legendaryLevels) lines.push(`[b]Legendary Levels[/b]: ${build.legendaryLevels}`)
    return lines
  },
}

const pastLives: SectionDef = {
  id: 'PastLives',
  label: 'Past lives',
  // V2 ForumExportDlg.cpp:421-435 splits past lives by category before listing.
  emit: ({ build, allClasses, allRaces, epicPastLifeFeats }) => {
    const entries = Object.entries(build.pastLives).filter(([, c]) => c > 0)
    if (entries.length === 0) return []

    const heroicNames = new Set((allClasses ?? []).filter(c => !c.NotHeroic).map(c => c.Name))
    const racialNames = new Set((allRaces ?? []).filter(r => !r.NotHeroic && !r.IsIconic).map(r => r.Name))
    const iconicNames = new Set((allRaces ?? []).filter(r => !r.NotHeroic && r.IsIconic).map(r => r.Name))
    const epicNames   = new Set((epicPastLifeFeats ?? []).map(f => f.Name))

    const buckets: Record<string, Array<[string, number]>> = {
      'Heroic Past Lives': [], 'Iconic Past Lives': [],
      'Epic Past Lives': [],   'Racial Past Lives': [],
      'Other Past Lives': [],
    }
    for (const e of entries) {
      const [src] = e
      if (heroicNames.has(src)) buckets['Heroic Past Lives'].push(e)
      else if (iconicNames.has(src)) buckets['Iconic Past Lives'].push(e)
      else if (epicNames.has(src))   buckets['Epic Past Lives'].push(e)
      else if (racialNames.has(src)) buckets['Racial Past Lives'].push(e)
      else                           buckets['Other Past Lives'].push(e)
    }

    const out = ['[b]Past Lives[/b]:']
    for (const label of Object.keys(buckets)) {
      const bucket = buckets[label]
      if (bucket.length === 0) continue
      const list = bucket.sort(([a], [b]) => a.localeCompare(b))
        .map(([s, c]) => `${s} x${c}`)
        .join(', ')
      out.push(`  ${label}: ${list}`)
    }
    // Pre-catalogue fallback: if no catalogues supplied (everything went into
    // 'Other'), keep the legacy flat output instead of an unhelpful header.
    if (out.length === 2 && buckets['Other Past Lives'].length === entries.length) {
      return [
        '[b]Past Lives[/b]:',
        '  ' + entries.sort(([a], [b]) => a.localeCompare(b)).map(([s, c]) => `${s} x${c}`).join(', '),
      ]
    }
    return out
  },
}

const abilityScores: SectionDef = {
  id: 'AbilityScores',
  label: 'Ability scores',
  emit: ({ build, stats }) => {
    const lines = ['[b]Ability Scores[/b] (Base / Tome / Total):']
    for (const ab of ABILITIES) {
      const base = build.baseAbilities[ab] ?? 8
      const tome = build.abilityTomes[ab] ?? 0
      const total = stats ? stats.total(`ability.${ab}`) : base + tome
      lines.push(`${ABILITY_ABBREVS[ab]}: ${base} / +${tome} / ${total} (${sign(abMod(total))})`)
    }
    return lines
  },
}

const saves: SectionDef = {
  id: 'Saves',
  label: 'Saving throws',
  emit: ({ stats }) => {
    if (!stats) return []
    return [
      '[b]Saving Throws[/b]:',
      `  Fortitude: ${sign(stats.total('save.Fort'))}`,
      `  Reflex: ${sign(stats.total('save.Reflex'))}`,
      `  Will: ${sign(stats.total('save.Will'))}`,
    ]
  },
}

const energyResistances: SectionDef = {
  id: 'EnergyResistances',
  label: 'Energy resistances',
  emit: ({ stats }) => {
    if (!stats) return []
    const types = ['Fire', 'Cold', 'Acid', 'Electric', 'Sonic', 'Force', 'Light', 'Negative', 'Positive', 'Poison', 'Repair']
    const rows: string[] = []
    for (const t of types) {
      const v = stats.total(`resist.${t}`)
      if (v) rows.push(`  ${t}: ${v}`)
    }
    return rows.length > 0 ? ['[b]Energy Resistances[/b]:', ...rows] : []
  },
}

const featSelections: SectionDef = {
  id: 'FeatSelections',
  label: 'Feat selections',
  emit: ({ build }) => {
    const entries = Object.entries(build.featChoices).filter(([, v]) => v)
    if (entries.length === 0) return []
    const lines = ['[b]Feats[/b]:']
    entries.sort(([a], [b]) => {
      const al = parseInt(a.match(/^(\d+)/)?.[1] ?? '0', 10)
      const bl = parseInt(b.match(/^(\d+)/)?.[1] ?? '0', 10)
      if (al !== bl) return al - bl
      return a.localeCompare(b)
    }).forEach(([k, v]) => lines.push(`  ${k}: ${v}`))
    return lines
  },
}

const skills: SectionDef = {
  id: 'Skills',
  label: 'Skills',
  emit: ({ build, stats }) => {
    const entries = Object.entries(build.skillRanks).filter(([, r]) => r > 0)
    if (entries.length === 0) return []
    const lines = ['[b]Skills[/b]:']
    entries.sort(([a], [b]) => a.localeCompare(b)).forEach(([s, r]) => {
      const total = stats ? stats.total(`skill.${s}`) : 0
      lines.push(`  ${s}: ${r} ranks (${sign(total)})`)
    })
    return lines
  },
}

const stances: SectionDef = {
  id: 'ActiveStances',
  label: 'Active stances',
  emit: ({ build, allStances }) => {
    if (build.activeBuffs.length === 0) return []
    // When stance catalogue is available, only emit names that are actually
    // stances (the rest go to SelfAndPartyBuffs). Without it, fall back to
    // emitting the full activeBuffs list to preserve prior behaviour.
    const list = allStances && allStances.length > 0
      ? build.activeBuffs.filter(n => allStances.some(s => s.Name === n))
      : build.activeBuffs
    if (list.length === 0) return []
    return ['[b]Active Stances[/b]:', '  ' + list.join(', ')]
  },
}

// V2 ForumExportDlg.cpp:1583-1610 (FES_SelfAndPartyBuffs) — lists toggled
// optional/self buffs distinct from stances.
const selfAndPartyBuffs: SectionDef = {
  id: 'SelfAndPartyBuffs',
  label: 'Self & party buffs',
  emit: ({ build, allStances, allSelfBuffs }) => {
    if (build.activeBuffs.length === 0) return []
    let list = build.activeBuffs
    if (allStances && allStances.length > 0) {
      const stanceNames = new Set(allStances.map(s => s.Name))
      list = list.filter(n => !stanceNames.has(n))
    }
    if (allSelfBuffs && allSelfBuffs.length > 0) {
      const buffNames = new Set(allSelfBuffs.map(b => b.Name))
      list = list.filter(n => buffNames.has(n))
    }
    if (list.length === 0) return []
    return ['[b]Self & Party Buffs[/b]:', '  ' + list.join(', ')]
  },
}

// V2 ForumExportDlg.cpp:1454-1530 (FES_AutomaticFeats) — auto-granted feats
// from race + class auto-feat tables + completionist gates.
const automaticFeats: SectionDef = {
  id: 'AutomaticFeats',
  label: 'Automatic feats',
  emit: ({ build, allClasses, allRaces }) => {
    if (!allClasses || !allRaces) return []
    const groups = buildAutomaticFeatGroups(build, allClasses, allRaces)
    if (groups.length === 0) return []
    const out = ['[b]Automatic Feats[/b]:']
    for (const g of groups) out.push(`  ${g.source}: ${g.feats.join(', ')}`)
    return out
  },
}

const enhancements: SectionDef = {
  id: 'Enhancements',
  label: 'Enhancements',
  emit: ({ build }) => {
    const trees = Object.entries(build.enhancementChoices).filter(([, items]) =>
      Object.values(items).some(r => r > 0))
    if (trees.length === 0) return []
    const lines = ['[b]Enhancement Trees[/b]:']
    for (const [tree, items] of trees) {
      lines.push(`  ${tree}:`)
      for (const [name, rank] of Object.entries(items)) {
        if (rank > 0) lines.push(`    ${name} (${rank})`)
      }
    }
    return lines
  },
}

const epicDestinies: SectionDef = {
  id: 'EpicDestinyTree',
  label: 'Epic destinies',
  emit: ({ build }) => {
    const trees = Object.entries(build.destinyChoices).filter(([, items]) =>
      Object.values(items).some(r => r > 0))
    if (trees.length === 0) return []
    const lines: string[] = []
    if (build.activeEpicDestiny) lines.push(`[b]Active Destiny[/b]: ${build.activeEpicDestiny}`)
    lines.push('[b]Epic Destiny Trees[/b]:')
    for (const [tree, items] of trees) {
      lines.push(`  ${tree}:`)
      for (const [name, rank] of Object.entries(items)) {
        if (rank > 0) lines.push(`    ${name} (${rank})`)
      }
    }
    if (build.twistChoices.some(t => t)) {
      lines.push(`[b]Twists of Fate[/b]: ${build.twistChoices.filter(Boolean).join(', ')}`)
    }
    return lines
  },
}

const reaperTrees: SectionDef = {
  id: 'ReaperTrees',
  label: 'Reaper trees',
  emit: ({ build }) => {
    const trees = Object.entries(build.reaperChoices).filter(([, items]) =>
      Object.values(items).some(r => r > 0))
    if (trees.length === 0) return []
    const lines = ['[b]Reaper Trees[/b]:']
    for (const [tree, items] of trees) {
      lines.push(`  ${tree}:`)
      for (const [name, rank] of Object.entries(items)) {
        if (rank > 0) lines.push(`    ${name} (${rank})`)
      }
    }
    return lines
  },
}

const spellPowers: SectionDef = {
  id: 'SpellPowers',
  label: 'Spell powers',
  emit: ({ stats }) => {
    if (!stats) return []
    const SCHOOLS = ['Fire', 'Cold', 'Acid', 'Electric', 'Sonic', 'Force',
      'Light', 'Alignment', 'Negative', 'Positive', 'Repair', 'Rust', 'Universal']
    const rows: string[] = []
    for (const s of SCHOOLS) {
      const power = stats.total(`sp.${s}`)
      const crit = stats.total(`sp.crit.${s}`)
      const mult = stats.total(`sp.critMult.${s}`)
      if (power || crit || mult) {
        rows.push(`  ${s}: ${power} / crit ${crit}% × ${mult || 0}`)
      }
    }
    return rows.length > 0 ? ['[b]Spell Powers[/b]:', ...rows] : []
  },
}

const spells: SectionDef = {
  id: 'Spells',
  label: 'Trained spells',
  emit: ({ build }) => {
    const classes = Object.keys(build.trainedSpells).filter(c =>
      Object.values(build.trainedSpells[c] ?? {}).some(arr => arr.length > 0))
    if (classes.length === 0) return []
    const lines = ['[b]Spells[/b]:']
    for (const c of classes) {
      lines.push(`  ${c}:`)
      const byLevel = build.trainedSpells[c]
      for (const lvl of Object.keys(byLevel).map(Number).sort((a, b) => a - b)) {
        const list = byLevel[lvl] ?? []
        if (list.length === 0) continue
        lines.push(`    Level ${lvl}: ${list.join(', ')}`)
      }
    }
    return lines
  },
}

const weaponDamage: SectionDef = {
  id: 'WeaponDamage',
  label: 'Weapon damage',
  emit: ({ stats }) => {
    if (!stats || !stats.weapon) return []
    const w = stats.weapon
    return [
      '[b]Weapon[/b]:',
      `  ${w.name}: ${w.diceNum}d${w.diceSides} crit ${21 - w.critThreatRange}-20 ×${w.critMultiplier}`,
      `  To-hit ${sign(stats.total('melee.toHit') + stats.total('melee.attack'))} ` +
      `Damage ${sign(stats.total('melee.damage'))} ` +
      `Doublestrike ${stats.total('melee.doublestrike')}%`,
    ]
  },
}

const tacticalDCs: SectionDef = {
  id: 'TacticalDCs',
  label: 'Tactical DCs',
  emit: ({ stats }) => {
    if (!stats) return []
    const total = stats.total('tacticalDC')
    if (total === 0) return []
    return [`[b]Tactical DC[/b]: ${total}`]
  },
}

const gear: SectionDef = {
  id: 'Gear',
  label: 'Gear',
  emit: ({ build }) => {
    const entries = Object.entries(build.gear).filter(([, v]) => v)
    if (entries.length === 0) return []
    const lines = ['[b]Gear[/b]:']
    entries.sort(([a], [b]) => a.localeCompare(b)).forEach(([slot, item]) => {
      lines.push(`  ${slot}: ${item}`)
    })
    return lines
  },
}

const notes: SectionDef = {
  id: 'Notes',
  label: 'Notes',
  emit: ({ build }) => {
    if (!build.notes || !build.notes.trim()) return []
    return ['[b]Notes[/b]:', build.notes.trim()]
  },
}

const slas: SectionDef = {
  id: 'SLAs',
  label: 'Spell-Like Abilities',
  emit: ({ build }) => {
    const entries = Object.entries(build.slaCharges).filter(([, c]) => c > 0)
    if (entries.length === 0) return []
    const out = ['[b]SLAs[/b]:']
    for (const [name, charges] of entries) out.push(`  ${name}: ${charges} charges`)
    return out
  },
}

const grantedFeats: SectionDef = {
  id: 'GrantedFeats',
  label: 'Granted feats',
  emit: ({ build }) => {
    // Heuristic: any feat slot whose key starts with "granted:" represents an
    // auto-grant. (V2's GrantedFeat list is derived from feat/race/enhancement
    // GrantFeat effects; v3's UI does not yet flag these explicitly, so we
    // surface a reminder placeholder.)
    const grants = Object.entries(build.featChoices).filter(([k]) => k.startsWith('granted:'))
    if (grants.length === 0) return []
    return ['[b]Granted Feats[/b]:', ...grants.map(([k, v]) => `  ${k.slice(8)}: ${v}`)]
  },
}

const consolidatedFeats: SectionDef = {
  id: 'ConsolidatedFeats',
  label: 'Consolidated feats',
  emit: ({ build }) => {
    const counts = new Map<string, number>()
    for (const v of Object.values(build.featChoices)) {
      if (!v) continue
      counts.set(v, (counts.get(v) ?? 0) + 1)
    }
    if (counts.size === 0) return []
    const out = ['[b]Consolidated Feats[/b]:']
    Array.from(counts.entries()).sort(([a], [b]) => a.localeCompare(b)).forEach(([n, c]) => {
      out.push(`  ${n}${c > 1 ? ` x${c}` : ''}`)
    })
    return out
  },
}

// V2 canonical slot order mirrors InventorySlotTypes.h enum
// (Inventory_Arrows..Inventory_Weapon2, per ForumExportDlg.cpp:1779).
const V2_SLOT_ORDER = [
  'Arrow', 'Armor', 'Belt', 'Boots', 'Bracers', 'Cloak',
  'Gloves', 'Goggles', 'Helmet', 'Necklace', 'Quiver',
  'Ring', 'Ring2', 'Trinket', 'Main Hand', 'Off Hand',
]

function slotSortKey(slot: string): number {
  const idx = V2_SLOT_ORDER.indexOf(slot)
  return idx === -1 ? V2_SLOT_ORDER.length : idx
}

const simpleGear: SectionDef = {
  id: 'SimpleGear',
  label: 'Gear (simple)',
  emit: ({ build }) => {
    const entries = Object.entries(build.gear).filter(([, v]) => v)
    if (entries.length === 0) return []
    const lines: string[] = ['[b]Gear (simple)[/b]:']
    const sorted = [...entries].sort(([a], [b]) => slotSortKey(a) - slotSortKey(b))
    for (const [slot, item] of sorted) {
      lines.push(`  ${slot}: ${item}`)
      // V2 ForumExportDlg.cpp:1816-1857: emit augment choices per item
      const augPrefix = `${slot}:`
      const augEntries = Object.entries(build.augmentChoices)
        .filter(([k]) => k.startsWith(augPrefix))
      for (const [key, augName] of augEntries) {
        const parts = key.split(':')
        const augType = parts[1] ?? ''
        lines.push(`    ${augType}: ${augName}`)
      }
    }
    return lines
  },
}

/**
 * V2 ForumExportDlg.cpp FES_SpecialFeats — feats acquired through past lives,
 * favor, etc. (V2 stores them on Life::specialFeats). V3 keeps them in
 * `Life.specialFeats`; for backwards compatibility this section also reads
 * the legacy build-level `specialFeats` field if it ever existed.
 */
const specialFeats: SectionDef = {
  id: 'SpecialFeats',
  label: 'Special feats',
  emit: ({ build }) => {
    const list = (build as unknown as { specialFeats?: string[] }).specialFeats ?? []
    if (list.length === 0) return []
    return [
      '[b]Special Feats[/b]:',
      ...list.sort().map(f => `  ${f}`),
    ]
  },
}

/**
 * V2 ForumExportDlg.cpp FES_FeatSelectionsNoSkills — same as FES_FeatSelections
 * but with skill-feat slots filtered out. We reuse `featSelections` and drop
 * any slot whose feat name starts with "Skill:".
 */
const featSelectionsNoSkills: SectionDef = {
  id: 'FeatSelectionsNoSkills',
  label: 'Feat selections (no skills)',
  emit: ({ build }) => {
    const entries = Object.entries(build.featChoices)
      .filter(([, v]) => v && !/^Skill:|^Skill /i.test(v))
    if (entries.length === 0) return []
    const lines = ['[b]Feats (no skills)[/b]:']
    entries.sort(([a], [b]) => {
      const al = parseInt(a.match(/^(\d+)/)?.[1] ?? '0', 10)
      const bl = parseInt(b.match(/^(\d+)/)?.[1] ?? '0', 10)
      return al - bl
    })
    for (const [slot, feat] of entries) lines.push(`  ${slot}: ${feat}`)
    return lines
  },
}

/**
 * V2 ForumExportDlg.cpp FES_Bonuses — dump every accumulated stat with a
 * non-zero total. Useful as a "what's contributing to my numbers" debug
 * export.
 */
const bonusesDump: SectionDef = {
  id: 'Bonuses',
  label: 'Bonuses',
  emit: ({ stats }) => {
    if (!stats) return []
    const keys = stats.keys().sort()
    const rows: string[] = []
    for (const k of keys) {
      const total = stats.total(k)
      if (total === 0) continue
      rows.push(`  ${k}: ${total >= 0 ? '+' : ''}${total}`)
    }
    return rows.length > 0 ? ['[b]Accumulated Bonuses[/b]:', ...rows] : []
  },
}

const alternateGearLayouts: SectionDef = {
  id: 'AlternateGearLayouts',
  label: 'Alternate gear layouts',
  emit: ({ build }) => {
    const sets = Object.entries(build.namedGearSets ?? {})
    if (sets.length === 0) return []
    const out = ['[b]Alternate Gear Layouts[/b]:']
    const setAugments = build.namedGearAugments ?? {}
    for (const [name, slots] of sets) {
      out.push(`  ${name}:`)
      const sorted = Object.entries(slots).sort(([a], [b]) => slotSortKey(a) - slotSortKey(b))
      for (const [slot, item] of sorted) {
        if (!item) continue
        out.push(`    ${slot}: ${item}`)
        // V2 ForumExportDlg.cpp:1816-1857: emit augment choices per item
        const augPrefix = `${slot}:`
        const augEntries = Object.entries(setAugments[name] ?? {})
          .filter(([k]) => k.startsWith(augPrefix))
        for (const [key, augName] of augEntries) {
          const parts = key.split(':')
          const augType = parts[1] ?? ''
          out.push(`      ${augType}: ${augName}`)
        }
      }
    }
    return out
  },
}

/**
 * V2 SectionOrder default. Mirrors ForumExportDlg.cpp:194-278.
 */
export const DEFAULT_SECTIONS: SectionDef[] = [
  characterHeader,
  pastLives,
  specialFeats,            // V2 FES_SpecialFeats parity
  abilityScores,
  saves,
  energyResistances,
  featSelections,
  featSelectionsNoSkills,  // V2 FES_FeatSelectionsNoSkills parity
  grantedFeats,
  automaticFeats,
  consolidatedFeats,
  skills,
  bonusesDump,             // V2 FES_Bonuses parity
  stances,
  selfAndPartyBuffs,
  enhancements,
  epicDestinies,
  reaperTrees,
  spellPowers,
  spells,
  slas,
  weaponDamage,
  tacticalDCs,
  gear,
  simpleGear,
  alternateGearLayouts,
  notes,
]

export function emitForumExport(
  ctx: SectionContext,
  sections: SectionDef[] = DEFAULT_SECTIONS,
): string {
  const out: string[] = ['[font=courier]']
  for (const s of sections) {
    const lines = s.emit(ctx)
    if (lines.length === 0) continue
    out.push(...lines)
    out.push('')
  }
  out.push('Built with DDO Builder v3')
  out.push('[/font]')
  return out.join('\n')
}
