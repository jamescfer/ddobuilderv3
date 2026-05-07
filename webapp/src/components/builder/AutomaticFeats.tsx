import { useEffect, useState } from 'react'
import { api } from '../../api'
import { useCharacter } from '../../context/CharacterContext'
import type { DDOClass, Race } from '../../types/ddo'
import styles from './AutomaticFeats.module.css'

interface FeatGroup {
  source: string
  feats: string[]
}

function toArray<T>(val: T | T[] | undefined): T[] {
  if (val === undefined || val === null) return []
  return Array.isArray(val) ? val : [val]
}

function buildFeatGroups(
  build: { race: string; classes: { name: string; levels: number }[]; totalLevel: number; pastLives: Record<string, number> },
  allClasses: DDOClass[],
  allRaces: Race[],
): FeatGroup[] {
  const groups: FeatGroup[] = []

  // Race granted feats
  if (build.race) {
    const race = allRaces.find(r => r.Name === build.race)
    if (race) {
      const feats = toArray(race.GrantedFeat).filter(Boolean)
      if (feats.length > 0) {
        groups.push({ source: build.race, feats })
      }
    }
  }

  // Class automatic feats
  for (const bc of build.classes) {
    if (!bc.name || bc.levels === 0) continue
    const cls = allClasses.find(c => c.Name === bc.name)
    if (!cls?.AutomaticFeats) continue

    for (const autoFeat of cls.AutomaticFeats) {
      if ((autoFeat.Level ?? 1) > bc.levels) continue
      const featNames = toArray(autoFeat.Feats).filter(Boolean)
      if (featNames.length === 0) continue
      groups.push({
        source: `${bc.name} Lv ${autoFeat.Level}`,
        feats: featNames,
      })
    }
  }

  // Completionist check
  const heroicClassNames = allClasses.filter(c => !c.NotHeroic).map(c => c.Name)
  const hasCompletionist = heroicClassNames.length > 0 && heroicClassNames.every(cn => (build.pastLives[cn] ?? 0) >= 3)
  if (hasCompletionist) {
    groups.push({ source: 'Completionist', feats: ['Completionist'] })
  }

  // Racial Completionist check
  const heroicRaceNames = allRaces.filter(r => !r.NotHeroic && !r.IsIconic).map(r => r.Name)
  const hasRacialCompletionist = heroicRaceNames.length > 0 && heroicRaceNames.every(rn => (build.pastLives[rn] ?? 0) >= 3)
  if (hasRacialCompletionist) {
    groups.push({ source: 'Racial Completionist', feats: ['Racial Completionist'] })
  }

  return groups
}

export default function AutomaticFeats() {
  const { build } = useCharacter()
  const [allClasses, setAllClasses] = useState<DDOClass[]>([])
  const [allRaces, setAllRaces] = useState<Race[]>([])

  useEffect(() => {
    api.classes().then(setAllClasses)
    api.races().then(setAllRaces)
  }, [])

  const groups = buildFeatGroups(build, allClasses, allRaces)
  const hasSelection = build.race || build.classes.some(c => c.name && c.levels > 0)

  return (
    <div className="panel">
      <div className="panel-header">Automatic Feats</div>
      <div className="panel-body">
        {!hasSelection ? (
          <p className={styles.empty}>Select a race and classes to see automatic feats.</p>
        ) : groups.length === 0 ? (
          <p className={styles.empty}>No automatic feats granted at current levels.</p>
        ) : (
          <div className={styles.groups}>
            {groups.map(group => (
              <div key={group.source} className={styles.group}>
                <div className={styles.groupHeader}>{group.source}</div>
                <ul className={styles.featList}>
                  {group.feats.map(feat => (
                    <li key={feat} className={styles.featRow}>
                      <span className={styles.featName}>{feat}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
