// V2-parity Forum / BBCode export sections.
//
// V2 source: DDOBuilder/ForumExportDlg.cpp:194-278 (driver) + 1454-1735 (per-section emitters).
// Each section is a pure function returning string lines so the panel can pluck
// any subset and re-order them.

import type { CharacterBuild, Ability } from '../../types/ddo'
import type { BuildStats } from '../../hooks/useBuildStats'

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
  emit: ({ build }) => {
    const entries = Object.entries(build.pastLives).filter(([, c]) => c > 0)
    if (entries.length === 0) return []
    const out = ['[b]Past Lives[/b]:']
    out.push('  ' + entries.sort(([a], [b]) => a.localeCompare(b)).map(([s, c]) => `${s} x${c}`).join(', '))
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
  emit: ({ build }) => {
    if (build.activeBuffs.length === 0) return []
    return ['[b]Active Stances[/b]:', '  ' + build.activeBuffs.join(', ')]
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

const simpleGear: SectionDef = {
  id: 'SimpleGear',
  label: 'Gear (simple)',
  emit: ({ build }) => {
    const entries = Object.entries(build.gear).filter(([, v]) => v)
    if (entries.length === 0) return []
    return [
      '[b]Gear (simple)[/b]:',
      ...entries.sort(([a], [b]) => a.localeCompare(b)).map(([slot, item]) => `  ${slot}: ${item}`),
    ]
  },
}

const alternateGearLayouts: SectionDef = {
  id: 'AlternateGearLayouts',
  label: 'Alternate gear layouts',
  emit: ({ build }) => {
    const sets = Object.entries(build.namedGearSets ?? {})
    if (sets.length === 0) return []
    const out = ['[b]Alternate Gear Layouts[/b]:']
    for (const [name, slots] of sets) {
      out.push(`  ${name}:`)
      Object.entries(slots).sort(([a], [b]) => a.localeCompare(b)).forEach(([s, it]) => {
        if (it) out.push(`    ${s}: ${it}`)
      })
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
  abilityScores,
  saves,
  energyResistances,
  featSelections,
  grantedFeats,
  consolidatedFeats,
  skills,
  stances,
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
