import { useEffect, useState } from 'react'
import { api } from '../../api'
import { useCharacter } from '../../context/CharacterContext'
import type { DDOClass } from '../../types/ddo'
import { HEROIC_MAX_LEVEL, EPIC_MAX_LEVELS, LEGENDARY_MAX_LEVELS } from '../../lib/gamedata'
import styles from './ClassSelector.module.css'

const HEROIC_LEVELS = HEROIC_MAX_LEVEL
const EPIC_MAX = EPIC_MAX_LEVELS
const LEGENDARY_MAX = LEGENDARY_MAX_LEVELS
const CLASS_COLORS = ['#c88a2a', '#6ab0de', '#8acd6a']

function classIndex(name: string, assigned: string[]): number {
  const idx = assigned.indexOf(name)
  return idx >= 0 ? idx : 0
}

export default function ClassSelector() {
  const { build, dispatch } = useCharacter()
  const [classes, setClasses] = useState<DDOClass[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.classes()
      .then(data => setClasses(data.filter(c => !c.NotHeroic)))
      .finally(() => setLoading(false))
  }, [])

  // Flatten class assignments into a per-heroic-level array
  const levelClasses: string[] = build.classes.reduce<string[]>((acc, bc) => {
    if (!bc.name) return acc
    return [...acc, ...Array(bc.levels).fill(bc.name)]
  }, [])
  while (levelClasses.length < HEROIC_LEVELS) levelClasses.push('')

  const usedClassNames = build.classes.map(c => c.name).filter(Boolean) as string[]

  const totals: Record<string, number> = {}
  for (const cls of levelClasses) {
    if (cls) totals[cls] = (totals[cls] ?? 0) + 1
  }

  const epicLevels = build.epicLevels ?? 10
  const legendaryLevels = build.legendaryLevels ?? 4
  const grandTotal = levelClasses.filter(Boolean).length + epicLevels + legendaryLevels

  function setLevelClass(levelIndex: number, className: string) {
    const next = [...levelClasses]
    next[levelIndex] = className
    const counts: Record<string, number> = {}
    for (const cls of next) {
      if (cls) counts[cls] = (counts[cls] ?? 0) + 1
    }
    const seen: string[] = []
    for (const cls of next) {
      if (cls && !seen.includes(cls) && seen.length < 3) seen.push(cls)
    }
    const newClasses = [
      { name: seen[0] ?? '', levels: counts[seen[0]] ?? 0 },
      { name: seen[1] ?? '', levels: counts[seen[1]] ?? 0 },
      { name: seen[2] ?? '', levels: counts[seen[2]] ?? 0 },
    ]
    for (let i = 0; i < 3; i++) {
      dispatch({ type: 'SET_CLASS', index: i as 0 | 1 | 2, name: newClasses[i].name })
      dispatch({ type: 'SET_CLASS_LEVELS', index: i as 0 | 1 | 2, levels: newClasses[i].levels })
    }
  }

  function fillAll(className: string) {
    dispatch({ type: 'SET_CLASS', index: 0, name: className })
    dispatch({ type: 'SET_CLASS_LEVELS', index: 0, levels: HEROIC_LEVELS })
    dispatch({ type: 'SET_CLASS', index: 1, name: '' })
    dispatch({ type: 'SET_CLASS_LEVELS', index: 1, levels: 0 })
    dispatch({ type: 'SET_CLASS', index: 2, name: '' })
    dispatch({ type: 'SET_CLASS_LEVELS', index: 2, levels: 0 })
  }

  function fillEmpty(className: string) {
    const next = [...levelClasses]
    for (let i = 0; i < HEROIC_LEVELS; i++) {
      if (!next[i]) next[i] = className
    }
    const counts: Record<string, number> = {}
    for (const cls of next) {
      if (cls) counts[cls] = (counts[cls] ?? 0) + 1
    }
    const seen: string[] = []
    for (const cls of next) {
      if (cls && !seen.includes(cls) && seen.length < 3) seen.push(cls)
    }
    for (let i = 0; i < 3; i++) {
      dispatch({ type: 'SET_CLASS', index: i as 0 | 1 | 2, name: seen[i] ?? '' })
      dispatch({ type: 'SET_CLASS_LEVELS', index: i as 0 | 1 | 2, levels: counts[seen[i]] ?? 0 })
    }
  }

  const heroicClasses = classes.filter(c => !c.NotHeroic)
  const heroicAssigned = levelClasses.filter(Boolean).length
  const classCountFull = usedClassNames.length >= 3

  return (
    <div className="panel">
      <div className="panel-header">
        Classes
        <span className={styles.levelTotal}>Lv {grandTotal}</span>
      </div>
      <div className="panel-body">
        {loading ? (
          <span className={styles.loading}>Loading classes…</span>
        ) : (
          <>
            {/* Summary chips + class count */}
            <div className={styles.chips}>
              {usedClassNames.map((name, i) => (
                <span key={name} className={styles.chip}
                  style={{ borderColor: CLASS_COLORS[i], color: CLASS_COLORS[i] }}>
                  {name} {totals[name] ?? 0}
                </span>
              ))}
              <span className={`${styles.classCountBadge} ${classCountFull ? styles.classCountFull : ''}`}>
                {usedClassNames.length}/3 classes
              </span>
            </div>

            {/* Quick-fill */}
            <div className={styles.quickFill}>
              <span className={styles.quickFillLabel}>Fill all:</span>
              {heroicClasses.slice(0, 14).map(c => (
                <button key={c.Name} className={styles.quickFillBtn}
                  onClick={() => fillAll(c.Name)} title={`Set all 20 heroic levels to ${c.Name}`}>
                  {c.Name.slice(0, 3)}
                </button>
              ))}
            </div>

            {/* ── Heroic levels 1–20 ── */}
            <div className={styles.sectionHeader}>
              <span>Heroic</span>
              <span className={styles.sectionCount}>{heroicAssigned}/20</span>
            </div>
            <div className={styles.levelGrid}>
              {Array.from({ length: HEROIC_LEVELS }, (_, i) => {
                const lvl = i + 1
                const cls = levelClasses[i] ?? ''
                const clsIdx = classIndex(cls, usedClassNames)
                return (
                  <div key={lvl} className={styles.levelCell}>
                    <span className={styles.levelNum}>{lvl}</span>
                    <select
                      className={styles.levelSelect}
                      value={cls}
                      onChange={e => setLevelClass(i, e.target.value)}
                      style={cls ? { borderColor: CLASS_COLORS[clsIdx], color: CLASS_COLORS[clsIdx] } : {}}
                    >
                      <option value="">—</option>
                      {heroicClasses
                        .filter(c => usedClassNames.includes(c.Name) || !classCountFull || c.Name === cls)
                        .map(c => (
                          <option key={c.Name} value={c.Name}>{c.Name}</option>
                        ))}
                    </select>
                  </div>
                )
              })}
            </div>

            {/* Fill-empty */}
            {heroicAssigned < HEROIC_LEVELS && usedClassNames.length > 0 && (
              <div className={styles.fillEmpty}>
                <span className={styles.quickFillLabel}>Fill empty:</span>
                {usedClassNames.map(name => (
                  <button key={name} className={styles.quickFillBtn} onClick={() => fillEmpty(name)}>
                    {name.slice(0, 3)}
                  </button>
                ))}
              </div>
            )}

            {/* ── Epic levels 21–30 ── */}
            <div className={styles.sectionHeader}>
              <span>Epic <span className={styles.sectionRange}>(Lv 21–30)</span></span>
              <span className={styles.sectionCount}>{epicLevels}/10</span>
            </div>
            <div className={styles.progressionRow}>
              <button className={styles.adjBtn}
                disabled={epicLevels <= 0}
                onClick={() => dispatch({ type: 'SET_EPIC_LEVELS', levels: epicLevels - 1 })}>−</button>
              <div className={styles.progressPips}>
                {Array.from({ length: EPIC_MAX }, (_, i) => (
                  <button
                    key={i}
                    className={`${styles.pip} ${i < epicLevels ? styles.pipFilled : ''}`}
                    onClick={() => dispatch({ type: 'SET_EPIC_LEVELS', levels: i + 1 })}
                    title={`Epic level ${i + 1} (character level ${21 + i})`}
                  />
                ))}
              </div>
              <button className={styles.adjBtn}
                disabled={epicLevels >= EPIC_MAX}
                onClick={() => dispatch({ type: 'SET_EPIC_LEVELS', levels: epicLevels + 1 })}>+</button>
            </div>

            {/* ── Legendary levels 31–34 ── */}
            <div className={styles.sectionHeader}>
              <span>Legendary <span className={styles.sectionRange}>(Lv 31–34)</span></span>
              <span className={styles.sectionCount}>{legendaryLevels}/4</span>
            </div>
            <div className={styles.progressionRow}>
              <button className={styles.adjBtn}
                disabled={legendaryLevels <= 0}
                onClick={() => dispatch({ type: 'SET_LEGENDARY_LEVELS', levels: legendaryLevels - 1 })}>−</button>
              <div className={styles.progressPips}>
                {Array.from({ length: LEGENDARY_MAX }, (_, i) => (
                  <button
                    key={i}
                    className={`${styles.pip} ${i < legendaryLevels ? styles.pipFilled : ''}`}
                    onClick={() => dispatch({ type: 'SET_LEGENDARY_LEVELS', levels: i + 1 })}
                    title={`Legendary level ${i + 1} (character level ${31 + i})`}
                  />
                ))}
              </div>
              <button className={styles.adjBtn}
                disabled={legendaryLevels >= LEGENDARY_MAX}
                onClick={() => dispatch({ type: 'SET_LEGENDARY_LEVELS', levels: legendaryLevels + 1 })}>+</button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
