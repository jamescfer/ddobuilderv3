import { useEffect, useState, useMemo } from 'react'
import { api } from '../../api'
import { useCharacter } from '../../context/CharacterContext'
import type { DDOClass } from '../../types/ddo'
import styles from './Skills.module.css'

const SKILLS = [
  'Balance',
  'Bluff',
  'Concentration',
  'Diplomacy',
  'Disable Device',
  'Haggle',
  'Heal',
  'Hide',
  'Intimidate',
  'Jump',
  'Listen',
  'Move Silently',
  'Open Lock',
  'Perform',
  'Repair',
  'Search',
  'Spot',
  'Swim',
  'Tumble',
  'Use Magic Device',
] as const

type SkillName = (typeof SKILLS)[number]

function intModifier(score: number): number {
  return Math.floor((score - 10) / 2)
}

function getClassSkills(classes: { name: string; levels: number }[], allClasses: DDOClass[]): Set<string> {
  const classSkills = new Set<string>()
  for (const bc of classes) {
    if (!bc.name || bc.levels === 0) continue
    const cls = allClasses.find(c => c.Name === bc.name)
    if (!cls?.ClassSkill) continue
    const skills = Array.isArray(cls.ClassSkill) ? cls.ClassSkill : [cls.ClassSkill]
    for (const s of skills) classSkills.add(s)
  }
  return classSkills
}

function calcTotalSkillPoints(
  classes: { name: string; levels: number }[],
  allClasses: DDOClass[],
  intMod: number,
): number {
  let total = 0
  let firstClassProcessed = false

  for (const bc of classes) {
    if (!bc.name || bc.levels === 0) continue
    const cls = allClasses.find(c => c.Name === bc.name)
    const basePoints = cls?.SkillPoints ?? 2
    const pointsPerLevel = Math.max(1, basePoints + intMod)

    if (!firstClassProcessed) {
      // First level of the first class gets 4x
      total += pointsPerLevel * 4
      total += pointsPerLevel * (bc.levels - 1)
      firstClassProcessed = true
    } else {
      total += pointsPerLevel * bc.levels
    }
  }

  return total
}

export default function Skills() {
  const { build } = useCharacter()
  const [allClasses, setAllClasses] = useState<DDOClass[]>([])
  const [skillRanks, setSkillRanks] = useState<Record<string, number>>({})

  useEffect(() => {
    api.classes().then(setAllClasses)
  }, [])

  const intMod = intModifier(build.baseAbilities.Intelligence)
  const totalLevel = build.totalLevel

  const classSkills = useMemo(
    () => getClassSkills(build.classes, allClasses),
    [build.classes, allClasses],
  )

  const totalAvailable = useMemo(
    () => calcTotalSkillPoints(build.classes, allClasses, intMod),
    [build.classes, allClasses, intMod],
  )

  const totalSpent = useMemo(() => {
    let spent = 0
    for (const skill of SKILLS) {
      const ranks = skillRanks[skill] ?? 0
      const isClass = classSkills.has(skill)
      spent += isClass ? ranks : ranks * 2
    }
    return spent
  }, [skillRanks, classSkills])

  const remaining = totalAvailable - totalSpent

  function maxRanks(skill: SkillName): number {
    const isClass = classSkills.has(skill)
    if (isClass) {
      return totalLevel + 3
    }
    return Math.floor((totalLevel + 3) / 2)
  }

  function adjust(skill: SkillName, delta: 1 | -1) {
    const current = skillRanks[skill] ?? 0
    const next = current + delta
    if (next < 0) return
    if (next > maxRanks(skill)) return
    const isClass = classSkills.has(skill)
    const cost = isClass ? 1 : 2
    if (delta === 1 && cost > remaining) return
    setSkillRanks(prev => ({ ...prev, [skill]: next }))
  }

  return (
    <div className="panel">
      <div className="panel-header">
        Skills
        <span className={styles.pointsRemaining} data-over={remaining < 0}>
          {remaining} pts remaining
        </span>
      </div>
      <div className="panel-body">
        {totalLevel === 0 ? (
          <p className={styles.empty}>Select class levels to allocate skill points.</p>
        ) : (
          <div className={styles.table}>
            <div className={styles.tableHeader}>
              <span className={styles.colName}>Skill</span>
              <span className={styles.colCs}>CS</span>
              <span className={styles.colControls}>Rank</span>
              <span className={styles.colMax}>Max</span>
              <span className={styles.colCost}>Cost</span>
            </div>
            {SKILLS.map(skill => {
              const rank = skillRanks[skill] ?? 0
              const isClass = classSkills.has(skill)
              const max = maxRanks(skill)
              const cost = isClass ? 1 : 2
              const canIncrease = remaining >= cost && rank < max
              const canDecrease = rank > 0
              return (
                <div key={skill} className={styles.row} data-class-skill={isClass}>
                  <span className={styles.colName}>{skill}</span>
                  <span className={styles.colCs}>
                    {isClass && <span className={styles.csMarker} title="Class Skill">C</span>}
                  </span>
                  <span className={styles.colControls}>
                    <button
                      className={styles.btn}
                      onClick={() => adjust(skill, -1)}
                      disabled={!canDecrease}
                      aria-label={`Decrease ${skill}`}
                    >
                      −
                    </button>
                    <span className={styles.rank} data-nonzero={rank > 0}>{rank}</span>
                    <button
                      className={styles.btn}
                      onClick={() => adjust(skill, 1)}
                      disabled={!canIncrease}
                      aria-label={`Increase ${skill}`}
                    >
                      +
                    </button>
                  </span>
                  <span className={styles.colMax}>{max}</span>
                  <span className={styles.colCost}>{cost}</span>
                </div>
              )
            })}
          </div>
        )}
        <div className={styles.legend}>
          <span className={styles.legendCs}>C</span>
          <span className={styles.legendLabel}>= Class skill (1 pt/rank)</span>
          <span className={styles.legendLabel} style={{ marginLeft: '12px' }}>Cross-class = 2 pts/rank</span>
        </div>
      </div>
    </div>
  )
}
