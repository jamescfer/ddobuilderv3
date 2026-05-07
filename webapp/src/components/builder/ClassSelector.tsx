import { useEffect, useState } from 'react'
import { api } from '../../api'
import { useCharacter } from '../../context/CharacterContext'
import type { DDOClass } from '../../types/ddo'
import styles from './ClassSelector.module.css'

const MAX_LEVEL = 40
const SLOTS = [0, 1, 2] as const

export default function ClassSelector() {
  const { build, dispatch } = useCharacter()
  const [classes, setClasses] = useState<DDOClass[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.classes()
      .then(data => setClasses(data.filter(c => !c.NotHeroic)))
      .finally(() => setLoading(false))
  }, [])

  const heroicClasses = classes.filter(c => !c.NotHeroic)
  const totalLevels = build.classes.reduce((s, c) => s + c.levels, 0)
  const remaining = MAX_LEVEL - totalLevels

  function setClass(index: 0 | 1 | 2, name: string) {
    dispatch({ type: 'SET_CLASS', index, name })
    if (!name) dispatch({ type: 'SET_CLASS_LEVELS', index, levels: 0 })
  }

  function setLevels(index: 0 | 1 | 2, levels: number) {
    const clamped = Math.max(0, Math.min(levels, levels + remaining))
    dispatch({ type: 'SET_CLASS_LEVELS', index, levels: clamped })
  }

  return (
    <div className="panel">
      <div className="panel-header">
        Classes
        <span className={styles.levelTotal}>{totalLevels} / {MAX_LEVEL}</span>
      </div>
      <div className="panel-body">
        {loading ? (
          <span className={styles.loading}>Loading classes…</span>
        ) : (
          <div className={styles.slots}>
            {SLOTS.map(i => (
              <div key={i} className={styles.slot}>
                <label>Class {i + 1}</label>
                <select
                  value={build.classes[i].name}
                  onChange={e => setClass(i, e.target.value)}
                >
                  <option value="">— None —</option>
                  {heroicClasses.map(c => (
                    <option key={c.Name} value={c.Name}>{c.Name}</option>
                  ))}
                </select>
                <div className={styles.levelRow}>
                  <button
                    onClick={() => setLevels(i, build.classes[i].levels - 1)}
                    disabled={!build.classes[i].name || build.classes[i].levels <= 0}
                  >−</button>
                  <span className={styles.levelValue}>{build.classes[i].levels}</span>
                  <button
                    onClick={() => setLevels(i, build.classes[i].levels + 1)}
                    disabled={!build.classes[i].name || remaining <= 0}
                  >+</button>
                </div>
              </div>
            ))}
          </div>
        )}
        {remaining < 0 && (
          <p className={styles.overLimit}>Over level cap by {Math.abs(remaining)}</p>
        )}
      </div>
    </div>
  )
}
