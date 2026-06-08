import { useEffect, useMemo, useState } from 'react'
import { api } from '../../api'
import { useCharacter } from '../../context/CharacterContext'
import { buildAutomaticFeatGroups } from '../../lib/automaticFeats'
import { useBuildStats } from '../../hooks/useBuildStats'
import type {
  DDOClass, Race, Feat, EnhancementTree, Item,
  Augment, SetBonus, FiligreeSetBonus, Filigree, OptionalBuff,
} from '../../types/ddo'
import styles from './AutomaticFeats.module.css'

export default function AutomaticFeats() {
  const { build } = useCharacter()
  const [allClasses,         setAllClasses]         = useState<DDOClass[]>([])
  const [allRaces,           setAllRaces]            = useState<Race[]>([])
  const [allFeats,           setAllFeats]            = useState<Feat[]>([])
  const [allTrees,           setAllTrees]            = useState<EnhancementTree[]>([])
  const [allSelfBuffs,       setAllSelfBuffs]        = useState<OptionalBuff[]>([])
  const [allAugments,        setAllAugments]         = useState<Augment[]>([])
  const [allSetBonuses,      setAllSetBonuses]       = useState<SetBonus[]>([])
  const [allFiligreeBonuses, setAllFiligreeBonuses]  = useState<FiligreeSetBonus[]>([])
  const [allFiligrees,       setAllFiligrees]        = useState<Filigree[]>([])
  const [gearItems,          setGearItems]           = useState<Record<string, Item>>({})

  useEffect(() => {
    api.classes().then(setAllClasses)
    api.races().then(setAllRaces)
    api.feats().then(setAllFeats)
    api.enhancements().then(setAllTrees)
    api.selfbuffs().then(setAllSelfBuffs)
    api.augments().then(setAllAugments)
    api.setbonuses().then(setAllSetBonuses)
    api.filigreeSetBonuses().then(setAllFiligreeBonuses)
    api.filigree().then(setAllFiligrees)
  }, [])

  useEffect(() => {
    const slots = Object.entries(build.gear).filter(([, name]) => name)
    if (slots.length === 0) { setGearItems({}); return }
    let cancelled = false
    Promise.all(
      slots.map(([slot, name]) =>
        api.item(name).then(item => item ? [slot, item] as [string, Item] : null)
      )
    ).then(results => {
      if (cancelled) return
      const map: Record<string, Item> = {}
      for (const r of results) { if (r) map[r[0]] = r[1] }
      setGearItems(map)
    })
    return () => { cancelled = true }
  }, [build.gear])

  const statsInput = useMemo(() => ({
    allClasses, allRaces, allFeats, allTrees, gearItems,
    allSelfBuffs, allAugments, allSetBonuses, allFiligreeBonuses, allFiligrees,
  }), [allClasses, allRaces, allFeats, allTrees, gearItems,
      allSelfBuffs, allAugments, allSetBonuses, allFiligreeBonuses, allFiligrees])

  const stats = useBuildStats(statsInput)

  const groups = buildAutomaticFeatGroups(build, allClasses, allRaces)
  const grantedFeats = stats.grantedFeatsList
  const hasSelection = build.race || build.classes.some(c => c.name && c.levels > 0)

  return (
    <div className="panel">
      <div className="panel-header">Automatic Feats</div>
      <div className="panel-body">
        {!hasSelection ? (
          <p className={styles.empty}>Select a race and classes to see automatic feats.</p>
        ) : groups.length === 0 && grantedFeats.length === 0 ? (
          <p className={styles.empty}>No automatic feats granted at current levels.</p>
        ) : (
          <div className={styles.groups}>
            {groups.length > 0 && (
              <>
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
              </>
            )}
            {grantedFeats.length > 0 && (
              <div className={styles.group}>
                <div className={styles.groupHeader}>Granted Feats</div>
                <ul className={styles.featList}>
                  {grantedFeats.map(feat => (
                    <li key={feat} className={styles.featRow}>
                      <span className={styles.featName}>{feat}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
