import { useEffect, useState } from 'react'
import { api } from '../../api'
import { useCharacter } from '../../context/CharacterContext'
import type { DDOClass } from '../../types/ddo'
import styles from './ClassSelector.module.css'

const HEROIC_LEVELS = 20
const CLASS_COLORS = ['#c88a2a', '#6ab0de', '#8acd6a']

// Map from class name → class color index for consistent chip coloring
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

  // Current class assignments per level (index 0 = level 1)
  const levelClasses: string[] = build.classes.reduce<string[]>((acc, bc) => {
    if (!bc.name) return acc
    return [...acc, ...Array(bc.levels).fill(bc.name)]
  }, [])
  // Pad to 20
  while (levelClasses.length < HEROIC_LEVELS) levelClasses.push('')

  // The three class names in use
  const usedClassNames = build.classes
    .map(c => c.name)
    .filter(Boolean) as string[]

  // Compute totals per class from levelClasses
  const totals: Record<string, number> = {}
  for (const cls of levelClasses) {
    if (cls) totals[cls] = (totals[cls] ?? 0) + 1
  }

  function setLevelClass(levelIndex: number, className: string) {
    // Build new levelClasses array
    const next = [...levelClasses]
    next[levelIndex] = className

    // Compute new class distributions
    const counts: Record<string, number> = {}
    for (const cls of next) {
      if (cls) counts[cls] = (counts[cls] ?? 0) + 1
    }

    // Determine up to 3 classes in order of first appearance
    const seen: string[] = []
    for (const cls of next) {
      if (cls && !seen.includes(cls) && seen.length < 3) seen.push(cls)
    }

    // Dispatch each class slot
    const newClasses: { name: string; levels: number }[] = [
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
    for (let i = 0; i < HEROIC_LEVELS; i++) {
      setLevelClass(i, className)
    }
    // Simpler: directly dispatch all 20 to class 0
    dispatch({ type: 'SET_CLASS', index: 0, name: className })
    dispatch({ type: 'SET_CLASS_LEVELS', index: 0, levels: HEROIC_LEVELS })
    dispatch({ type: 'SET_CLASS', index: 1, name: '' })
    dispatch({ type: 'SET_CLASS_LEVELS', index: 1, levels: 0 })
    dispatch({ type: 'SET_CLASS', index: 2, name: '' })
    dispatch({ type: 'SET_CLASS_LEVELS', index: 2, levels: 0 })
  }

  function fillEmpty(className: string) {
    // Fill all currently empty levels with this class
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
      if (cls && !seen.includes(cls)) seen.push(cls)
    }
    for (let i = 0; i < 3; i++) {
      dispatch({ type: 'SET_CLASS', index: i as 0 | 1 | 2, name: seen[i] ?? '' })
      dispatch({ type: 'SET_CLASS_LEVELS', index: i as 0 | 1 | 2, levels: counts[seen[i]] ?? 0 })
    }
  }

  const heroicClasses = classes.filter(c => !c.NotHeroic)
  const totalAssigned = levelClasses.filter(Boolean).length

  return (
    <div className="panel">
      <div className="panel-header">
        Classes
        <span className={styles.levelTotal}>{totalAssigned} / {HEROIC_LEVELS}</span>
      </div>
      <div className="panel-body">
        {loading ? (
          <span className={styles.loading}>Loading classes…</span>
        ) : (
          <>
            {/* Summary chips */}
            {usedClassNames.length > 0 && (
              <div className={styles.chips}>
                {usedClassNames.map((name, i) => (
                  <span
                    key={name}
                    className={styles.chip}
                    style={{ borderColor: CLASS_COLORS[i], color: CLASS_COLORS[i] }}
                  >
                    {name} {totals[name] ?? 0}
                  </span>
                ))}
              </div>
            )}

            {/* Quick-fill row */}
            <div className={styles.quickFill}>
              <span className={styles.quickFillLabel}>Fill:</span>
              {heroicClasses.slice(0, 12).map(c => (
                <button
                  key={c.Name}
                  className={styles.quickFillBtn}
                  onClick={() => fillAll(c.Name)}
                  title={`Set all 20 levels to ${c.Name}`}
                >
                  {c.Name.slice(0, 3)}
                </button>
              ))}
            </div>

            {/* Per-level grid */}
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
                      title={`Level ${lvl}`}
                    >
                      <option value="">—</option>
                      {heroicClasses.map(c => (
                        <option key={c.Name} value={c.Name}>{c.Name}</option>
                      ))}
                    </select>
                  </div>
                )
              })}
            </div>

            {/* Fill-empty helpers */}
            {totalAssigned < HEROIC_LEVELS && usedClassNames.length > 0 && (
              <div className={styles.fillEmpty}>
                <span className={styles.quickFillLabel}>Fill empty with:</span>
                {usedClassNames.map(name => (
                  <button
                    key={name}
                    className={styles.quickFillBtn}
                    onClick={() => fillEmpty(name)}
                  >
                    {name.slice(0, 3)}
                  </button>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
