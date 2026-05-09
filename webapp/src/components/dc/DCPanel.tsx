import { useEffect, useMemo, useState } from 'react'
import { api } from '../../api'
import { useCharacter } from '../../context/CharacterContext'
import type {
  Ability, DDOClass, Race, Feat, EnhancementTree, Item,
  Augment, SetBonus, FiligreeSetBonus, Filigree, OptionalBuff, Buff, GuildBuff,
} from '../../types/ddo'
import { SPELL_SCHOOLS } from '../../lib/gamedata'
import { useBuildStats } from '../../hooks/useBuildStats'
import type { BuildStats } from '../../hooks/useBuildStats'
import styles from './DCPanel.module.css'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

type SpellSchool = typeof SPELL_SCHOOLS[number]

/**
 * V2-style spell level cap: count how many non-zero columns the class has at
 * the given class level. Falls back to formulas when the data isn't loaded.
 */
function spellLevelCap(cls: DDOClass | null | undefined, classLevel: number): number {
  if (!cls) return 0
  const lvlIdx = Math.min(Math.max(classLevel, 0), 20)
  const row = (cls as unknown as Record<string, unknown>)[`Level${lvlIdx}`]
  if (typeof row === 'string') {
    const slots = row.trim().split(/\s+/).map(Number)
    let cap = 0
    for (let i = 0; i < slots.length; i++) if (slots[i] > 0) cap = i + 1
    if (cap > 0) return cap
  }
  // Fallback formulas if XML didn't expose LevelN rows
  const FULL = new Set(['Cleric', 'Wizard', 'Sorcerer', 'Druid', 'FavoredSoul', 'Favored Soul', 'Warlock', 'Alchemist'])
  const HALF = new Set(['Bard', 'Paladin', 'Ranger', 'Artificer'])
  const name = cls.Name
  if (FULL.has(name)) return Math.max(0, Math.floor((classLevel + 1) / 2))
  if (HALF.has(name)) return Math.min(4, Math.max(0, Math.floor(classLevel / 3) + 1))
  return 0
}

/** Pick the best casting stat from a single ability or array (highest mod). */
function pickCastingStat(
  cs: Ability | Ability[] | undefined,
  abilTotals: Record<Ability, number>,
): Ability {
  if (!cs) return 'Wisdom'
  const list = Array.isArray(cs) ? cs : [cs]
  if (list.length === 0) return 'Wisdom'
  return list.reduce((best, ab) =>
    (abilTotals[ab] ?? -Infinity) > (abilTotals[best] ?? -Infinity) ? ab : best,
  )
}

function abilityModifier(score: number): number {
  return Math.floor((score - 10) / 2)
}

/** Spell Focus / Greater Spell Focus from chosen feats (legacy fallback). */
function spellFocusBonus(school: SpellSchool, featChoices: Record<string, string>): number {
  let bonus = 0
  const values = Object.values(featChoices)
  if (values.includes(`Spell Focus: ${school}`)) bonus += 1
  if (values.includes(`Greater Spell Focus: ${school}`)) bonus += 1
  return bonus
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function DCPanel() {
  const { build } = useCharacter()
  const [activeTab, setActiveTab] = useState<string | null>(null)

  // Static data
  const [allClasses,         setAllClasses]         = useState<DDOClass[]>([])
  const [allRaces,           setAllRaces]           = useState<Race[]>([])
  const [allFeats,           setAllFeats]           = useState<Feat[]>([])
  const [allTrees,           setAllTrees]           = useState<EnhancementTree[]>([])
  const [allSelfBuffs,       setAllSelfBuffs]       = useState<OptionalBuff[]>([])
  const [allAugments,        setAllAugments]        = useState<Augment[]>([])
  const [allSetBonuses,      setAllSetBonuses]      = useState<SetBonus[]>([])
  const [allFiligreeBonuses, setAllFiligreeBonuses] = useState<FiligreeSetBonus[]>([])
  const [allFiligrees,       setAllFiligrees]       = useState<Filigree[]>([])
  const [allItemBuffs,       setAllItemBuffs]       = useState<Buff[]>([])
  const [allGuildBuffs,      setAllGuildBuffs]      = useState<GuildBuff[]>([])
  const [gearItems,          setGearItems]          = useState<Record<string, Item>>({})

  useEffect(() => {
    api.classes().then(setAllClasses)
    api.races().then(setAllRaces)
    api.feats().then(setAllFeats)
    api.enhancements().then(setAllTrees)
    api.selfbuffs().then(setAllSelfBuffs)
    api.augments().then(setAllAugments)
    api.setbonuses().then(setAllSetBonuses)
    api.filigreeSetBonuses().then(setAllFiligreeBonuses)
    api.filigree().then(setAllFiligrees)
    api.itemBuffs().then(setAllItemBuffs)
    api.guildbuffs().then(setAllGuildBuffs)
  }, [])

  useEffect(() => {
    const slots = Object.entries(build.gear).filter(([, name]) => name)
    if (slots.length === 0) { setGearItems({}); return }
    let cancelled = false
    Promise.all(
      slots.map(([slot, name]) =>
        api.item(name).then(item => item ? [slot, item] as [string, Item] : null)
      )
    ).then(results => {
      if (cancelled) return
      const map: Record<string, Item> = {}
      for (const r of results) { if (r) map[r[0]] = r[1] }
      setGearItems(map)
    })
    return () => { cancelled = true }
  }, [build.gear])

  const statsInput = useMemo(() => ({
    allClasses, allRaces, allFeats, allTrees, gearItems,
    allSelfBuffs, allAugments, allSetBonuses, allFiligreeBonuses, allFiligrees,
    allItemBuffs, allGuildBuffs,
  }), [allClasses, allRaces, allFeats, allTrees, gearItems,
      allSelfBuffs, allAugments, allSetBonuses, allFiligreeBonuses, allFiligrees,
      allItemBuffs, allGuildBuffs])

  const stats = useBuildStats(statsInput)

  // Filter to classes that can actually cast spells
  const spellcastingClasses = build.classes.filter(bc => {
    if (!bc.name || bc.levels === 0) return false
    const cls = allClasses.find(c => c.Name === bc.name)
    return spellLevelCap(cls, bc.levels) > 0
  })

  const tabNames = spellcastingClasses.map(bc => bc.name)
  const resolvedTab = tabNames.includes(activeTab ?? '') ? activeTab! : (tabNames[0] ?? null)

  const activeClass = spellcastingClasses.find(bc => bc.name === resolvedTab) ?? null
  const activeClassDef = allClasses.find(c => c.Name === activeClass?.name) ?? null

  if (spellcastingClasses.length === 0) {
    return (
      <div className="panel">
        <div className="panel-header">Spell DCs</div>
        <div className="panel-body">
          <p className={styles.empty}>No spellcasting classes selected.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="panel">
      <div className="panel-header">Spell DCs</div>
      <div className="panel-body">
        {tabNames.length > 1 && (
          <div className={styles.tabs}>
            {tabNames.map(name => (
              <button
                key={name}
                className={`${styles.tab} ${name === resolvedTab ? styles.tabActive : ''}`}
                onClick={() => setActiveTab(name)}
              >
                {name}
              </button>
            ))}
          </div>
        )}

        {activeClass && activeClassDef && (
          <DCTable
            cls={activeClassDef}
            classLevel={activeClass.levels}
            stats={stats}
            featChoices={build.featChoices}
          />
        )}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// DC Table
// ---------------------------------------------------------------------------

interface DCTableProps {
  cls: DDOClass
  classLevel: number
  stats: BuildStats
  featChoices: Record<string, string>
}

function DCTable({ cls, classLevel, stats, featChoices }: DCTableProps) {
  const cap = spellLevelCap(cls, classLevel)
  const spellLevels = Array.from({ length: cap }, (_, i) => i + 1)

  // Resolve every ability total via the bonus engine
  const ABS: Ability[] = ['Strength', 'Dexterity', 'Constitution', 'Intelligence', 'Wisdom', 'Charisma']
  const abilTotals = ABS.reduce<Record<Ability, number>>((acc, ab) => {
    acc[ab] = stats.total(`ability.${ab}`)
    return acc
  }, {} as Record<Ability, number>)

  const ability = pickCastingStat(cls.CastingStat, abilTotals)
  const abilityScore = abilTotals[ability] || 10
  const abilityMod = abilityModifier(abilityScore)

  // General DC bonuses (apply to every school)
  const generalDC = stats.total('dc.All') + stats.total('dc.Spell')

  // Per-school bonuses: feat focus + parsed effect bonuses
  const focusBonuses = new Map<SpellSchool, number>(
    SPELL_SCHOOLS.map(s => [s, spellFocusBonus(s, featChoices) + stats.total(`dc.${s}`)])
  )

  const hasFocus = Array.from(focusBonuses.values()).some(v => v > 0) || generalDC !== 0

  return (
    <div className={styles.tableWrapper}>
      <div className={styles.castingInfo}>
        <span className={styles.castingAbilityLabel}>Casting ability:</span>
        <span className={styles.castingAbilityValue}>{ability}</span>
        <span className={styles.castingAbilityScore}>
          {abilityScore} ({abilityMod >= 0 ? '+' : ''}{abilityMod})
        </span>
        <span className={styles.castingFormula}>DC = 10 + spell level + {abilityMod >= 0 ? '+' : ''}{abilityMod} + school bonus</span>
      </div>

      {hasFocus && (
        <div className={styles.focusNote}>
          Highlighted cells include school + general DC bonuses.
        </div>
      )}

      <div className={styles.scrollWrapper}>
        <table className={styles.dcTable}>
          <thead>
            <tr>
              <th className={styles.thSchool}>School</th>
              {spellLevels.map(lvl => (
                <th key={lvl} className={styles.thLevel}>Lv {lvl}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {SPELL_SCHOOLS.map(school => {
              const bonus = (focusBonuses.get(school) ?? 0) + generalDC
              return (
                <tr key={school} className={styles.row}>
                  <td className={styles.tdSchool}>
                    {school}
                    {bonus > 0 && (
                      <span className={styles.focusBadge}>+{bonus}</span>
                    )}
                  </td>
                  {spellLevels.map(lvl => {
                    const dc = 10 + lvl + abilityMod + bonus
                    return (
                      <td
                        key={lvl}
                        className={`${styles.tdDC} ${bonus > 0 ? styles.tdFocused : ''}`}
                      >
                        {dc}
                      </td>
                    )
                  })}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
