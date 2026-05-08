import { useEffect, useState } from 'react'
import { api } from '../../api'
import { useCharacter } from '../../context/CharacterContext'
import type { Ability, AbilityScores, DDOClass } from '../../types/ddo'
import { SPELL_SCHOOLS } from '../../lib/gamedata'
import styles from './DCPanel.module.css'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

type SpellSchool = typeof SPELL_SCHOOLS[number]

/** Full casters — spell level cap = floor((classLevel + 1) / 2) */
const FULL_CASTERS = new Set([
  'Cleric', 'Wizard', 'Sorcerer', 'Druid', 'Favored Soul', 'Artificer',
])

/** Half casters — spell level cap = min(4, floor(classLevel / 3) + 1) */
const HALF_CASTERS = new Set(['Bard', 'Paladin', 'Ranger'])

// Warlock / Alchemist / Dragon Lord — treat as full casters for DC display
const EXTRA_CASTERS = new Set(['Warlock', 'Alchemist', 'Dragon Lord'])

function spellLevelCap(className: string, classLevel: number): number {
  if (FULL_CASTERS.has(className) || EXTRA_CASTERS.has(className)) {
    return Math.floor((classLevel + 1) / 2)
  }
  if (HALF_CASTERS.has(className)) {
    return Math.min(4, Math.floor(classLevel / 3) + 1)
  }
  return 0
}

function abilityModifier(score: number): number {
  return Math.floor((score - 10) / 2)
}

/** Compute total Spell Focus bonus (+1 per tier: Spell Focus, Greater Spell Focus) for a school */
function spellFocusBonus(
  school: SpellSchool,
  featChoices: Record<string, string>,
): number {
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
  const [allClasses, setAllClasses] = useState<DDOClass[]>([])

  useEffect(() => {
    api.classes().then(setAllClasses)
  }, [])

  // Filter to classes that can cast spells
  const spellcastingClasses = build.classes.filter(bc => {
    if (!bc.name || bc.levels === 0) return false
    return spellLevelCap(bc.name, bc.levels) > 0
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

        {activeClass && (
          <DCTable
            className={activeClass.name}
            classLevel={activeClass.levels}
            castingStat={activeClassDef?.CastingStat ?? 'Wisdom'}
            build={build}
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
  className: string
  classLevel: number
  castingStat: Ability
  build: {
    baseAbilities: AbilityScores
    featChoices: Record<string, string>
  }
}

function DCTable({ className, classLevel, castingStat, build }: DCTableProps) {
  const cap = spellLevelCap(className, classLevel)
  const spellLevels = Array.from({ length: cap }, (_, i) => i + 1)

  const ability = castingStat
  const abilityScore = (build.baseAbilities as unknown as Record<string, number>)[ability] ?? 10
  const abilityMod = abilityModifier(abilityScore)

  // Pre-compute spell focus bonuses per school
  const focusBonuses = new Map<SpellSchool, number>(
    SPELL_SCHOOLS.map(s => [s, spellFocusBonus(s, build.featChoices)])
  )

  const hasFocus = Array.from(focusBonuses.values()).some(v => v > 0)

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
          Highlighted cells include Spell Focus bonus.
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
              const bonus = focusBonuses.get(school) ?? 0
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
