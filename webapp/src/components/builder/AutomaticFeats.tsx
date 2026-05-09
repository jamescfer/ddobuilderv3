import { useEffect, useState } from 'react'
import { api } from '../../api'
import { useCharacter } from '../../context/CharacterContext'
import { buildAutomaticFeatGroups } from '../../lib/automaticFeats'
import type { DDOClass, Race } from '../../types/ddo'
import styles from './AutomaticFeats.module.css'

export default function AutomaticFeats() {
  const { build } = useCharacter()
  const [allClasses, setAllClasses] = useState<DDOClass[]>([])
  const [allRaces, setAllRaces] = useState<Race[]>([])

  useEffect(() => {
    api.classes().then(setAllClasses)
    api.races().then(setAllRaces)
  }, [])

  const groups = buildAutomaticFeatGroups(build, allClasses, allRaces)
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
