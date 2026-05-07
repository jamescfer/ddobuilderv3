import { useEffect, useState } from 'react'
import { api } from '../../api'
import { useCharacter } from '../../context/CharacterContext'
import type { Filigree, FiligreeSetBonus, FiligreeSetBuff, SentientGem } from '../../types/ddo'
import styles from './FiligreePanel.module.css'

const SLOT_COUNT = 6

function toArray<T>(val: T | T[] | undefined): T[] {
  if (val == null) return []
  return Array.isArray(val) ? val : [val]
}

/** Group filigrees by Menu for optgroup display */
function groupByMenu(filigrees: Filigree[]): Map<string, Filigree[]> {
  const groups = new Map<string, Filigree[]>()
  for (const f of filigrees) {
    const menu = f.Menu ?? 'Other'
    if (!groups.has(menu)) groups.set(menu, [])
    groups.get(menu)!.push(f)
  }
  return groups
}

/** Count how many of each SetBonus type are equipped */
function countSetBonuses(slots: string[], filigrees: Filigree[]): Map<string, number> {
  const filigreeByName = new Map<string, Filigree>(filigrees.map(f => [f.Name, f]))
  const counts = new Map<string, number>()
  for (const name of slots) {
    if (!name) continue
    const f = filigreeByName.get(name)
    if (!f?.SetBonus) continue
    counts.set(f.SetBonus, (counts.get(f.SetBonus) ?? 0) + 1)
  }
  return counts
}

export default function FiligreePanel() {
  const { build, dispatch } = useCharacter()
  const [filigrees, setFiligrees] = useState<Filigree[]>([])
  const [setBonuses, setSetBonuses] = useState<FiligreeSetBonus[]>([])
  const [gems, setGems] = useState<SentientGem[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    Promise.all([api.filigree(), api.filigreeSetBonuses(), api.gems()])
      .then(([fils, bonuses, gemList]) => {
        setFiligrees(Array.isArray(fils) ? fils : [])
        setSetBonuses(Array.isArray(bonuses) ? bonuses : [])
        setGems(Array.isArray(gemList) ? gemList : [])
      })
      .catch(() => {
        setFiligrees([])
        setSetBonuses([])
        setGems([])
      })
      .finally(() => setLoading(false))
  }, [])

  const slots = build.filigreeSlots ?? Array(SLOT_COUNT).fill('')
  const groups = groupByMenu(filigrees)
  const menuNames = Array.from(groups.keys()).sort()

  const equippedCounts = countSetBonuses(slots, filigrees)

  // Build a lookup for set bonus data by Type
  const setBonusByType = new Map<string, FiligreeSetBonus>(setBonuses.map(sb => [sb.Type, sb]))

  function handleChange(slotIndex: number, name: string) {
    dispatch({ type: 'SET_FILIGREE', slotIndex, name })
  }

  function handleGemChange(gem: string) {
    dispatch({ type: 'SET_SENTIENT_GEM', gem })
  }

  const selectedGem = build.sentientGem ?? ''

  return (
    <div className="panel">
      <div className="panel-header">Sentient Jewel Filigrees</div>
      <div className="panel-body">
        {loading ? (
          <p className={styles.empty}>Loading filigrees&hellip;</p>
        ) : (
          <>
            {/* Sentient Gem Selector */}
            <div className={styles.gemRow}>
              <label className={styles.gemLabel} htmlFor="sentient-gem-select">Sentient Gem:</label>
              <select
                id="sentient-gem-select"
                className={styles.gemSelect}
                value={selectedGem}
                onChange={e => handleGemChange(e.target.value)}
              >
                <option value="">— None —</option>
                {gems.map(gem => (
                  <option key={gem.Name} value={gem.Name}>{gem.Name}</option>
                ))}
              </select>
              {selectedGem && (
                <span className={styles.gemSelected}>{selectedGem}</span>
              )}
            </div>

            <div className={styles.slotsSection}>
              {Array.from({ length: SLOT_COUNT }, (_, i) => (
                <div key={i} className={styles.slotRow}>
                  <span className={styles.slotLabel}>Slot {i + 1}</span>
                  <select
                    className={styles.slotSelect}
                    value={slots[i] ?? ''}
                    onChange={e => handleChange(i, e.target.value)}
                  >
                    <option value="">— Empty —</option>
                    {menuNames.map(menu => (
                      <optgroup key={menu} label={menu}>
                        {(groups.get(menu) ?? [])
                          .slice()
                          .sort((a, b) => a.Name.localeCompare(b.Name))
                          .map(f => (
                            <option key={f.Name} value={f.Name}>
                              {f.Name}
                            </option>
                          ))}
                      </optgroup>
                    ))}
                  </select>
                </div>
              ))}
            </div>

            <div className={styles.setBonusSection}>
              <div className={styles.setBonusHeader}>Active Set Bonuses</div>
              {equippedCounts.size === 0 ? (
                <p className={styles.empty}>No set bonuses active.</p>
              ) : (
                Array.from(equippedCounts.entries())
                  .sort(([a], [b]) => a.localeCompare(b))
                  .map(([type, count]) => {
                    const sbData = setBonusByType.get(type)
                    const buffs = sbData ? toArray<FiligreeSetBuff>(sbData.Buff) : []
                    const unlockedBuffs = buffs.filter(b => b.EquippedCount <= count)
                    return (
                      <div key={type} className={styles.setBonusCard}>
                        <div className={styles.setBonusTitle}>
                          <span className={styles.setBonusName}>{type}</span>
                          <span className={styles.setBonusCount}>{count} piece{count !== 1 ? 's' : ''}</span>
                        </div>
                        {unlockedBuffs.length > 0 ? (
                          <ul className={styles.buffList}>
                            {unlockedBuffs
                              .sort((a, b) => a.EquippedCount - b.EquippedCount)
                              .map((buff, idx) => (
                                <li key={idx} className={styles.buffItem}>
                                  <span className={styles.buffTier}>({buff.EquippedCount}pc)</span>
                                  {buff.Description ?? ''}
                                </li>
                              ))}
                          </ul>
                        ) : (
                          <p className={styles.empty}>No bonuses unlocked yet.</p>
                        )}
                      </div>
                    )
                  })
              )}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
