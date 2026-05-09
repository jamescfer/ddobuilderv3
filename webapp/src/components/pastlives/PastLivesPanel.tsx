import { useEffect, useState } from 'react'
import { api } from '../../api'
import { useCharacter } from '../../context/CharacterContext'
import type { DDOClass, Race, Feat } from '../../types/ddo'
import styles from './PastLivesPanel.module.css'

const CLASS_PL_MAX = 3
const RACIAL_PL_MAX = 3
const ICONIC_PL_MAX = 1
const EPIC_PL_MAX_DEFAULT = 3

interface PLGroup {
  title: string
  entries: Array<{ name: string; max: number }>
}

export default function PastLivesPanel() {
  const { build, dispatch } = useCharacter()
  const [allClasses, setAllClasses] = useState<DDOClass[]>([])
  const [allRaces, setAllRaces] = useState<Race[]>([])
  const [epicFeats, setEpicFeats] = useState<Feat[]>([])

  useEffect(() => {
    api.classes().then(setAllClasses)
    api.races().then(setAllRaces)
    api.feats({ acquire: 'EpicPastLife' }).then(setEpicFeats).catch(() => setEpicFeats([]))
  }, [])

  const heroicClasses = allClasses.filter(c => !c.NotHeroic)
  const heroicRaces = allRaces.filter(r => !r.NotHeroic && !r.IsIconic)
  const iconicRaces = allRaces.filter(r => !r.NotHeroic && r.IsIconic)

  const groups: PLGroup[] = [
    {
      title: 'Heroic Past Lives (max 3 each)',
      entries: heroicClasses.map(c => ({ name: c.Name, max: CLASS_PL_MAX })),
    },
    {
      title: 'Racial Past Lives (max 3 each)',
      entries: heroicRaces.map(r => ({ name: r.Name, max: RACIAL_PL_MAX })),
    },
    {
      title: 'Iconic Past Lives (max 1 each)',
      entries: iconicRaces.map(r => ({ name: r.Name, max: ICONIC_PL_MAX })),
    },
  ]

  // V2 ForumExportDlg.cpp:431 emits "Epic Past Lives" via FeatAcquisition_EpicPastLife.
  // Group by Sphere so the panel mirrors V2's SpecialFeatsPane layout.
  if (epicFeats.length > 0) {
    const bySphere = new Map<string, Feat[]>()
    for (const f of epicFeats) {
      const sph = f.Sphere || 'Other'
      if (!bySphere.has(sph)) bySphere.set(sph, [])
      bySphere.get(sph)!.push(f)
    }
    for (const sph of ['Arcane', 'Divine', 'Martial', 'Primal', 'Other']) {
      const list = bySphere.get(sph)
      if (!list) continue
      groups.push({
        title: `Epic Past Lives — ${sph} (max 3 each)`,
        entries: list.map(f => ({
          name: f.Name,
          max: f.MaxTimesAcquire ?? EPIC_PL_MAX_DEFAULT,
        })),
      })
    }
  }

  const totalPLs = Object.values(build.pastLives).reduce((s, n) => s + n, 0)

  function setCount(name: string, count: number) {
    dispatch({ type: 'SET_PAST_LIFE', source: name, count })
  }

  return (
    <div className="panel">
      <div className="panel-header">
        Past Lives
        {totalPLs > 0 && (
          <span className={styles.totalBadge}>{totalPLs} total</span>
        )}
      </div>
      <div className="panel-body">
        {groups.map(group => (
          <section key={group.title} className={styles.section}>
            <div className={styles.sectionTitle}>{group.title}</div>
            <div className={styles.grid}>
              {group.entries.map(entry => {
                const count = build.pastLives[entry.name] ?? 0
                return (
                  <div key={entry.name} className={styles.entry}>
                    <span className={styles.entryName} title={entry.name}>{entry.name}</span>
                    <div className={styles.controls}>
                      <button
                        className={styles.btn}
                        onClick={() => setCount(entry.name, Math.max(0, count - 1))}
                        disabled={count === 0}
                        aria-label={`Decrease ${entry.name}`}
                      >−</button>
                      <span
                        className={styles.count}
                        data-nonzero={count > 0}
                      >{count}</span>
                      <button
                        className={styles.btn}
                        onClick={() => setCount(entry.name, Math.min(entry.max, count + 1))}
                        disabled={count >= entry.max}
                        aria-label={`Increase ${entry.name}`}
                      >+</button>
                    </div>
                    <div className={styles.pips}>
                      {Array.from({ length: entry.max }, (_, i) => (
                        <span
                          key={i}
                          className={i < count ? styles.pipFilled : styles.pipEmpty}
                        />
                      ))}
                    </div>
                  </div>
                )
              })}
            </div>
          </section>
        ))}
        <p className={styles.note}>
          Past lives affect build point totals (via racial completionist) and grant stacking passive bonuses.
        </p>
      </div>
    </div>
  )
}
