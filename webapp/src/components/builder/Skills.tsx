import { useEffect, useMemo, useState } from 'react'
import { api } from '../../api'
import { useCharacter } from '../../context/CharacterContext'
import type { DDOClass, Race } from '../../types/ddo'
import { SKILLS } from '../../lib/gamedata'
import styles from './Skills.module.css'

type SkillName = typeof SKILLS[number]['name']

// V2 skills that require class-skill status to train at all.
const RESTRICTED_SKILLS = new Set<string>(['Disable Device', 'Open Lock'])

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

/**
 * V2 Class::SkillPoints — per-level skill points for a class.
 * `points = max(1, classBase + raceBonus + intModForLevel)`, ×4 at character level 1.
 *
 * V3 simplification: we use the lowest of base+race+intModBase (no tomes
 * because those don't apply at character creation per V2's
 * AbilityAtLevel(intModForLevel) which excludes tomes at level 1).
 */
function calcTotalSkillPoints(
  classes: { name: string; levels: number }[],
  allClasses: DDOClass[],
  intMod: number,
  raceSkillBonus: number,
): number {
  let total = 0
  let charLevelIdx = 0   // 0-based character level across all classes

  for (const bc of classes) {
    if (!bc.name || bc.levels === 0) continue
    const cls = allClasses.find(c => c.Name === bc.name)
    const basePoints = cls?.SkillPoints ?? 2

    for (let i = 0; i < bc.levels && charLevelIdx < 20; i++, charLevelIdx++) {
      const pts = Math.max(1, basePoints + raceSkillBonus + intMod)
      total += charLevelIdx === 0 ? pts * 4 : pts
    }
  }
  return total
}

export default function Skills() {
  const { build, dispatch } = useCharacter()
  const [allClasses, setAllClasses] = useState<DDOClass[]>([])
  const [allRaces, setAllRaces] = useState<Race[]>([])

  useEffect(() => {
    api.classes().then(setAllClasses)
    api.races().then(setAllRaces).catch(() => setAllRaces([]))
  }, [])

  // V3 stores trained levels per skill (V2 storage semantics).
  // ranks displayed = trained for class skills, trained/2 for cross-class.
  const trainedLevels = build.skillRanks
  const intMod = intModifier(build.baseAbilities.Intelligence)
  // V2 caps the rank-cap at character level 20 (heroic only)
  const heroicLevel = Math.min(20, build.totalLevel)

  const race = useMemo(
    () => allRaces.find(r => r.Name === build.race),
    [allRaces, build.race],
  )
  const raceSkillBonus = race?.SkillPoints ?? 0

  const classSkills = useMemo(
    () => getClassSkills(build.classes, allClasses),
    [build.classes, allClasses],
  )

  const totalAvailable = useMemo(
    () => calcTotalSkillPoints(build.classes, allClasses, intMod, raceSkillBonus),
    [build.classes, allClasses, intMod, raceSkillBonus],
  )

  const totalSpent = useMemo(() => {
    // V2 stores trained levels and always costs 1 SP per trained level.
    let spent = 0
    for (const { name } of SKILLS) {
      spent += trainedLevels[name] ?? 0
    }
    return spent
  }, [trainedLevels])

  const remaining = totalAvailable - totalSpent

  /** Maximum trained levels for this skill (NOT ranks). */
  function maxTrained(skill: SkillName): number {
    const isClass = classSkills.has(skill)
    if (RESTRICTED_SKILLS.has(skill) && !isClass) return 0
    // V2: tome is NOT added to the rank cap; only to the displayed total.
    // Class skill: heroic + 3 trained levels. Cross-class: 2*(heroic+3)/2 = also heroic+3
    //   because cross-class trained levels = 0.5 ranks each, capped at (heroic+3)/2 ranks
    //   = heroic+3 trained levels. So both caps share the same trained-level number.
    return heroicLevel + 3
  }

  /** Display rank (with .5 increments for cross-class). */
  function displayRank(skill: SkillName): string {
    const trained = trainedLevels[skill] ?? 0
    if (trained === 0) return '0'
    const isClass = classSkills.has(skill)
    if (isClass) return String(trained)
    return (trained / 2).toFixed(1).replace(/\.0$/, '')
  }

  function adjust(skill: SkillName, delta: 1 | -1) {
    const current = trainedLevels[skill] ?? 0
    const next = current + delta
    if (next < 0) return
    if (next > maxTrained(skill)) return
    if (delta === 1 && remaining < 1) return
    dispatch({ type: 'SET_SKILL_RANK', skill, rank: next })
  }

  return (
    <div className="panel">
      <div className="panel-header">
        Skills
        <span className={styles.pointsRemaining} data-over={remaining < 0}>
          {remaining} / {totalAvailable} pts
        </span>
      </div>
      <div className="panel-body">
        {build.totalLevel === 0 ? (
          <p className={styles.empty}>Select class levels to allocate skill points.</p>
        ) : (
          <div className={styles.table}>
            <div className={styles.tableHeader}>
              <span className={styles.colName}>Skill</span>
              <span className={styles.colCs}>CS</span>
              <span className={styles.colControls}>Ranks</span>
              <span className={styles.colMax}>Max</span>
              <span className={styles.colCost}>Cost</span>
            </div>
            {SKILLS.map(({ name: skill }) => {
              const trained = trainedLevels[skill] ?? 0
              const isClass = classSkills.has(skill)
              const max = maxTrained(skill)
              const restricted = RESTRICTED_SKILLS.has(skill) && !isClass
              const canIncrease = !restricted && remaining >= 1 && trained < max
              const canDecrease = trained > 0
              const maxRanks = isClass ? max : max / 2
              return (
                <div
                  key={skill}
                  className={styles.row}
                  data-class-skill={isClass}
                  title={restricted ? `${skill} can only be trained as a class skill.` : undefined}
                >
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
                    <span className={styles.rank} data-nonzero={trained > 0}>
                      {displayRank(skill)}
                    </span>
                    <button
                      className={styles.btn}
                      onClick={() => adjust(skill, 1)}
                      disabled={!canIncrease}
                      aria-label={`Increase ${skill}`}
                    >
                      +
                    </button>
                  </span>
                  <span className={styles.colMax}>
                    {restricted ? '—' : (isClass ? maxRanks : maxRanks.toFixed(1).replace(/\.0$/, ''))}
                  </span>
                  <span className={styles.colCost}>1</span>
                </div>
              )
            })}
          </div>
        )}
        <div className={styles.legend}>
          <span className={styles.legendCs}>C</span>
          <span className={styles.legendLabel}>= Class skill (1 rank per pt)</span>
          <span className={styles.legendLabel} style={{ marginLeft: '12px' }}>
            Cross-class = ½ rank per pt (.5 increments)
          </span>
        </div>
      </div>
    </div>
  )
}
