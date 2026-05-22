import { useEffect, useMemo, useState } from 'react'
import { api } from '../../api'
import { useCharacter } from '../../context/CharacterContext'
import type { CharacterBuild, DDOClass, Race } from '../../types/ddo'
import { SKILLS } from '../../lib/gamedata'
import { getLevelClasses } from '../../lib/levelProgression'
import { perLevelRankDisplay, perLevelRankCap, displayRankToTrained } from '../../lib/skillDisplay'
import styles from './Skills.module.css'

type SkillName = typeof SKILLS[number]['name']

// V2 skills that require class-skill status to train at all.
const RESTRICTED_SKILLS = new Set<string>(['Disable Device', 'Open Lock'])

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
 * V3 walks the per-level class array (V2 m_Levels parity) AND the per-level
 * INT progression — a build that swaps INT-low / INT-high classes around
 * gets the INT mod *as it was at that character level*, including level-up
 * bonuses awarded by then.
 */
function calcTotalSkillPoints(
  build: Pick<CharacterBuild, 'classes' | 'levelClasses' | 'totalLevel' | 'baseAbilities' | 'abilityLevelUps'>,
  allClasses: DDOClass[],
  raceIntBonus: number,
  raceSkillBonus: number,
): number {
  const lc = getLevelClasses(build)
  let total = 0
  for (let i = 0; i < lc.length && i < 20; i++) {
    const name = lc[i]
    if (!name) continue
    const cls = allClasses.find(c => c.Name === name)
    const basePoints = cls?.SkillPoints ?? 2
    const charLvl = i + 1
    const intScore = (build.baseAbilities.Intelligence ?? 8) + raceIntBonus +
      Object.entries(build.abilityLevelUps)
        .filter(([lvl, ab]) => ab === 'Intelligence' && Number(lvl) <= charLvl)
        .length
    const intMod = Math.floor((intScore - 10) / 2)
    const pts = Math.max(1, basePoints + raceSkillBonus + intMod)
    total += i === 0 ? pts * 4 : pts
  }
  return total
}

/**
 * V2 parity: skill points available *at* a single character level. ×4 at
 * level 1 (the first-level multiplier). Used by the per-level grid to draw
 * a per-row budget.
 */
function skillPointsAtLevel(
  build: Pick<CharacterBuild, 'classes' | 'levelClasses' | 'totalLevel' | 'baseAbilities' | 'abilityLevelUps'>,
  allClasses: DDOClass[],
  raceIntBonus: number,
  raceSkillBonus: number,
  charLvl: number,
): number {
  const lc = getLevelClasses(build)
  const i = charLvl - 1
  if (i < 0 || i >= lc.length || i >= 20) return 0
  const name = lc[i]
  if (!name) return 0
  const cls = allClasses.find(c => c.Name === name)
  const basePoints = cls?.SkillPoints ?? 2
  const intScore = (build.baseAbilities.Intelligence ?? 8) + raceIntBonus +
    Object.entries(build.abilityLevelUps)
      .filter(([lvl, ab]) => ab === 'Intelligence' && Number(lvl) <= charLvl)
      .length
  const intMod = Math.floor((intScore - 10) / 2)
  const pts = Math.max(1, basePoints + raceSkillBonus + intMod)
  return i === 0 ? pts * 4 : pts
}

type ViewMode = 'totals' | 'per-level'

export default function Skills() {
  const { build, dispatch } = useCharacter()
  const [allClasses, setAllClasses] = useState<DDOClass[]>([])
  const [allRaces, setAllRaces] = useState<Race[]>([])
  const [viewMode, setViewMode] = useState<ViewMode>('totals')

  useEffect(() => {
    api.classes().then(setAllClasses)
    api.races().then(setAllRaces).catch(() => setAllRaces([]))
  }, [])

  const trainedLevels = build.skillRanks
  const heroicLevel = Math.min(20, build.totalLevel)

  const race = useMemo(
    () => allRaces.find(r => r.Name === build.race),
    [allRaces, build.race],
  )
  const raceSkillBonus = race?.SkillPoints ?? 0
  const raceIntBonus = Number((race as unknown as { Intelligence?: number } | undefined)?.Intelligence ?? 0) || 0

  const classSkills = useMemo(
    () => getClassSkills(build.classes, allClasses),
    [build.classes, allClasses],
  )

  const totalAvailable = useMemo(
    () => calcTotalSkillPoints(build, allClasses, raceIntBonus, raceSkillBonus),
    [build, allClasses, raceIntBonus, raceSkillBonus],
  )

  const totalSpent = useMemo(() => {
    let spent = 0
    for (const { name } of SKILLS) {
      spent += trainedLevels[name] ?? 0
    }
    return spent
  }, [trainedLevels])

  const remaining = totalAvailable - totalSpent

  function maxTrained(skill: SkillName): number {
    const isClass = classSkills.has(skill)
    if (RESTRICTED_SKILLS.has(skill) && !isClass) return 0
    return heroicLevel + 3
  }

  function displayRank(skill: SkillName): string {
    const trained = trainedLevels[skill] ?? 0
    if (trained === 0) return '0'
    const isClass = classSkills.has(skill)
    if (isClass) return String(trained)
    return (trained / 2).toFixed(1).replace(/\.0$/, '')
  }

  function nextAllocableLevel(skill: SkillName, current: number, isClass: boolean): number | null {
    const lc = getLevelClasses(build)
    for (let i = 0; i < lc.length && i < 20; i++) {
      const charLvl = i + 1
      const capForLevel = isClass ? charLvl + 3 : (charLvl + 3)
      const trainedAtThisLevelOrEarlier = (() => {
        const byLvl = build.skillRanksByLevel ?? {}
        let n = 0
        for (let l = 1; l <= charLvl; l++) n += byLvl[l]?.[skill] ?? 0
        return n
      })()
      void current
      if (trainedAtThisLevelOrEarlier < capForLevel) return charLvl
    }
    return null
  }

  function adjust(skill: SkillName, delta: 1 | -1) {
    const current = trainedLevels[skill] ?? 0
    const next = current + delta
    if (next < 0) return
    if (next > maxTrained(skill)) return
    if (delta === 1 && remaining < 1) return
    dispatch({ type: 'SET_SKILL_RANK', skill, rank: next })

    const isClass = classSkills.has(skill)
    if (delta === 1) {
      const lvl = nextAllocableLevel(skill, current, isClass)
      if (lvl != null) {
        const ranksAtLvl = build.skillRanksByLevel?.[lvl]?.[skill] ?? 0
        dispatch({ type: 'SET_SKILL_RANK_AT_LEVEL', level: lvl, skill, rank: ranksAtLvl + 1 })
      }
    } else {
      const byLvl = build.skillRanksByLevel ?? {}
      for (let l = 20; l >= 1; l--) {
        const cur = byLvl[l]?.[skill] ?? 0
        if (cur > 0) {
          dispatch({ type: 'SET_SKILL_RANK_AT_LEVEL', level: l, skill, rank: cur - 1 })
          break
        }
      }
    }
  }

  // Per-level view -----------------------------------------------------------
  // V2 parity: each character level has its own SP budget; ranks at level N
  // for a skill cap at N + 3 (class) or (N+3)/2 (cross-class).
  function setRankAtLevel(skill: SkillName, charLvl: number, newRank: number) {
    const isClass = classSkills.has(skill)
    if (RESTRICTED_SKILLS.has(skill) && !isClass) return
    const clamped = Math.max(0, Math.min(newRank, isClass ? charLvl + 3 : charLvl + 3))
    dispatch({ type: 'SET_SKILL_RANK_AT_LEVEL', level: charLvl, skill, rank: clamped })
    // Re-derive the legacy total view so the totals tab stays in sync.
    const byLvl = build.skillRanksByLevel ?? {}
    let total = 0
    for (let l = 1; l <= 20; l++) {
      if (l === charLvl) total += clamped
      else total += byLvl[l]?.[skill] ?? 0
    }
    dispatch({ type: 'SET_SKILL_RANK', skill, rank: total })
  }

  function levelSpend(charLvl: number): number {
    const byLvl = build.skillRanksByLevel ?? {}
    let n = 0
    for (const skill of Object.keys(byLvl[charLvl] ?? {})) {
      n += byLvl[charLvl]?.[skill] ?? 0
    }
    return n
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
          <>
            <div className={styles.viewToggle}>
              <button
                type="button"
                className={`${styles.viewToggleBtn} ${viewMode === 'totals' ? styles.viewToggleBtnActive : ''}`}
                onClick={() => setViewMode('totals')}
              >Totals</button>
              <button
                type="button"
                className={`${styles.viewToggleBtn} ${viewMode === 'per-level' ? styles.viewToggleBtnActive : ''}`}
                onClick={() => setViewMode('per-level')}
                title="V2-style per-character-level allocation grid"
              >Per Level</button>
            </div>

            {viewMode === 'totals' ? (
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
                        >−</button>
                        <span className={styles.rank} data-nonzero={trained > 0}>
                          {displayRank(skill)}
                        </span>
                        <button
                          className={styles.btn}
                          onClick={() => adjust(skill, 1)}
                          disabled={!canIncrease}
                          aria-label={`Increase ${skill}`}
                        >+</button>
                      </span>
                      <span className={styles.colMax}>
                        {restricted ? '—' : (isClass ? maxRanks : maxRanks.toFixed(1).replace(/\.0$/, ''))}
                      </span>
                      <span className={styles.colCost}>1</span>
                    </div>
                  )
                })}
              </div>
            ) : (
              <PerLevelGrid
                build={build}
                allClasses={allClasses}
                raceIntBonus={raceIntBonus}
                raceSkillBonus={raceSkillBonus}
                classSkills={classSkills}
                heroicLevel={heroicLevel}
                onSet={setRankAtLevel}
                levelSpend={levelSpend}
                spAtLevel={(lvl) => skillPointsAtLevel(build, allClasses, raceIntBonus, raceSkillBonus, lvl)}
              />
            )}

            <div className={styles.legend}>
              <span className={styles.legendCs}>C</span>
              <span className={styles.legendLabel}>= Class skill (1 rank per pt)</span>
              <span className={styles.legendLabel} style={{ marginLeft: '12px' }}>
                Cross-class = ½ rank per pt (.5 increments)
              </span>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Per-character-level allocation grid (V2 SkillsPane layout)
// ---------------------------------------------------------------------------

interface PerLevelGridProps {
  build: CharacterBuild
  allClasses: DDOClass[]
  raceIntBonus: number
  raceSkillBonus: number
  classSkills: Set<string>
  heroicLevel: number
  onSet: (skill: SkillName, charLvl: number, newRank: number) => void
  levelSpend: (charLvl: number) => number
  spAtLevel: (charLvl: number) => number
}

function PerLevelGrid({
  build, classSkills, heroicLevel, onSet, levelSpend, spAtLevel,
}: PerLevelGridProps) {
  const byLvl = build.skillRanksByLevel ?? {}
  const levels = Array.from({ length: heroicLevel }, (_, i) => i + 1)

  return (
    <div>
      <div
        className={styles.perLevelGrid}
        style={{ gridTemplateColumns: `100px repeat(${levels.length}, minmax(28px, 1fr)) 36px` }}
      >
        {/* header row */}
        <div className={styles.perLevelHeader}>Skill</div>
        {levels.map(l => (
          <div key={`h-${l}`} className={styles.perLevelHeader} title={`Character level ${l}`}>{l}</div>
        ))}
        <div className={styles.perLevelHeader}>Σ</div>

        {SKILLS.map(({ name: skill }) => {
          const isClass = classSkills.has(skill)
          const restricted = RESTRICTED_SKILLS.has(skill) && !isClass
          let runningTrained = 0
          for (const l of levels) runningTrained += byLvl[l]?.[skill] ?? 0
          const totalDisplay = perLevelRankDisplay(runningTrained, isClass)
            .toFixed(isClass ? 0 : 1).replace(/\.0$/, '')
          return (
            <div key={skill} className={styles.perLevelRow}>
              <div className={styles.perLevelLabel} title={restricted ? `${skill} can only be trained as a class skill.` : skill}>
                {skill}
              </div>
              {levels.map(l => {
                const trained = byLvl[l]?.[skill] ?? 0
                const displayVal = perLevelRankDisplay(trained, isClass)
                const capDisplay = perLevelRankCap(l, isClass)
                const locked = restricted
                return (
                  <div
                    key={`${skill}-${l}`}
                    className={`${styles.perLevelCell} ${locked ? styles.perLevelCellLocked : ''}`}
                  >
                    <input
                      className={styles.perLevelInput}
                      data-zero={trained === 0}
                      type="number"
                      min={0}
                      max={capDisplay}
                      step={isClass ? 1 : 0.5}
                      value={displayVal || ''}
                      placeholder="—"
                      disabled={locked}
                      onChange={e => {
                        const n = Number(e.target.value)
                        const trainedVal = isFinite(n) ? displayRankToTrained(n, isClass) : 0
                        onSet(skill as SkillName, l, trainedVal)
                      }}
                      title={locked
                        ? `${skill} can only be trained as a class skill.`
                        : `Level ${l}: rank cap ${capDisplay}${isClass ? '' : ' (cross-class, .5 per pt)'}`}
                    />
                  </div>
                )
              })}
              <div className={styles.perLevelTotalCell}>{totalDisplay}</div>
            </div>
          )
        })}

        {/* Per-level totals footer */}
        <div className={`${styles.perLevelLabel} ${styles.perLevelTotalCell}`}>SP @ lvl</div>
        {levels.map(l => {
          const spent = levelSpend(l)
          const budget = spAtLevel(l)
          const over = spent > budget
          return (
            <div
              key={`tot-${l}`}
              className={styles.perLevelTotalCell}
              style={{ color: over ? 'var(--color-red)' : undefined }}
              title={`Spent ${spent} of ${budget} skill points at level ${l}`}
            >
              {spent}/{budget}
            </div>
          )
        })}
        <div className={styles.perLevelTotalCell}>—</div>
      </div>
      <p className={styles.perLevelOverflow} style={{ display: 'none' }}>placeholder</p>
    </div>
  )
}
