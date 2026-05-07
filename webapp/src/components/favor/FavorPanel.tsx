import { useEffect, useState } from 'react'
import { api } from '../../api'
import { useCharacter } from '../../context/CharacterContext'
import type { Patron, Quest } from '../../types/ddo'
import styles from './FavorPanel.module.css'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function parseFavorTiers(raw: unknown): number[] {
  if (raw == null) return []
  if (typeof raw === 'string') return raw.split(' ').map(Number).filter(n => !isNaN(n))
  if (typeof raw === 'number') return [raw]
  if (typeof raw === 'object' && raw !== null) {
    const obj = raw as Record<string, unknown>
    const text = obj['#text']
    if (typeof text === 'string') return text.split(' ').map(Number).filter(n => !isNaN(n))
    if (typeof text === 'number') return [text]
  }
  return []
}

function questFavor(q: Quest): number {
  return typeof q.Favor === 'number' ? q.Favor : 0
}

// ---------------------------------------------------------------------------
// PatronRow sub-component
// ---------------------------------------------------------------------------

interface PatronRowProps {
  patron: Patron
  quests: Quest[]
  completedQuests: Record<string, boolean>
  onToggle: (questName: string) => void
}

function PatronRow({ patron, quests, completedQuests, onToggle }: PatronRowProps) {
  const [collapsed, setCollapsed] = useState(true)

  const tiers = parseFavorTiers(patron.FavorTiers)
  const totalAvailable = quests.reduce((sum, q) => sum + questFavor(q), 0)
  const currentFavor = quests
    .filter(q => completedQuests[q.Name])
    .reduce((sum, q) => sum + questFavor(q), 0)

  // Find which tier is currently achieved (highest tier <= currentFavor)
  const achievedTierIdx = tiers.reduce((best, tier, idx) => (currentFavor >= tier ? idx : best), -1)
  // Next tier to achieve
  const nextTierIdx = achievedTierIdx + 1 < tiers.length ? achievedTierIdx + 1 : -1

  const completedCount = quests.filter(q => completedQuests[q.Name]).length

  return (
    <div className={styles.patronCard}>
      <div className={styles.patronHeader} onClick={() => setCollapsed(v => !v)}>
        <div className={styles.patronLeft}>
          <span className={styles.patronCollapse}>{collapsed ? '▶' : '▼'}</span>
          <span className={styles.patronName}>{patron.Name}</span>
          {patron.AssociatedFavorFeat && (
            <span className={styles.patronFeat}>{patron.AssociatedFavorFeat}</span>
          )}
        </div>
        <div className={styles.patronRight}>
          <span className={styles.patronProgress}>
            {completedCount}/{quests.length} quests
          </span>
          <span className={styles.patronFavorVal}>
            {currentFavor} / {totalAvailable} favor
          </span>
        </div>
      </div>

      {/* Tier progress bar */}
      {tiers.length > 0 && (
        <div className={styles.tierRow}>
          {tiers.map((tier, idx) => {
            const achieved = idx <= achievedTierIdx
            const isNext = idx === nextTierIdx
            return (
              <span
                key={idx}
                className={`${styles.tier} ${achieved ? styles.tierAchieved : ''} ${isNext ? styles.tierNext : ''}`}
                title={`Tier ${idx + 1}: ${tier} favor`}
              >
                {tier}
              </span>
            )
          })}
        </div>
      )}

      {/* Quest list */}
      {!collapsed && (
        <div className={styles.questList}>
          {quests.length === 0 ? (
            <p className={styles.noQuests}>No quests for this patron.</p>
          ) : (
            quests
              .slice()
              .sort((a, b) => a.Name.localeCompare(b.Name))
              .map(quest => (
                <label key={quest.Name} className={styles.questRow}>
                  <input
                    type="checkbox"
                    className={styles.questCheck}
                    checked={!!completedQuests[quest.Name]}
                    onChange={() => onToggle(quest.Name)}
                  />
                  <span className={`${styles.questName} ${completedQuests[quest.Name] ? styles.questDone : ''}`}>
                    {quest.Name}
                  </span>
                  {quest.AdventurePack && (
                    <span className={styles.questPack}>{quest.AdventurePack}</span>
                  )}
                  <span className={styles.questFavor}>{questFavor(quest)} favor</span>
                </label>
              ))
          )}
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// FavorPanel
// ---------------------------------------------------------------------------

export default function FavorPanel() {
  const { build, dispatch } = useCharacter()
  const [patrons, setPatrons] = useState<Patron[]>([])
  const [quests, setQuests] = useState<Quest[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    Promise.all([api.patrons(), api.quests()])
      .then(([p, q]) => {
        setPatrons(Array.isArray(p) ? p : [])
        // Filter out DoNotShow quests
        setQuests(Array.isArray(q) ? q.filter(quest => !quest.DoNotShow) : [])
      })
      .catch(() => {
        setPatrons([])
        setQuests([])
      })
      .finally(() => setLoading(false))
  }, [])

  function handleToggle(questName: string) {
    dispatch({ type: 'TOGGLE_QUEST', questName })
  }

  // Group quests by patron name
  const questsByPatron = new Map<string, Quest[]>()
  for (const quest of quests) {
    const patronName = quest.Patron ?? 'None'
    if (!questsByPatron.has(patronName)) questsByPatron.set(patronName, [])
    questsByPatron.get(patronName)!.push(quest)
  }

  // Total favor across all completed quests
  const totalFavor = quests
    .filter(q => build.completedQuests[q.Name])
    .reduce((sum, q) => sum + questFavor(q), 0)

  const totalAvailable = quests.reduce((sum, q) => sum + questFavor(q), 0)

  return (
    <div className="panel">
      <div className="panel-header">Favor</div>
      <div className="panel-body">
        {loading ? (
          <p className={styles.empty}>Loading favor data&hellip;</p>
        ) : (
          <>
            <div className={styles.totalRow}>
              <span className={styles.totalLabel}>Total Favor</span>
              <span className={styles.totalValue}>{totalFavor} / {totalAvailable}</span>
            </div>
            <div className={styles.patronList}>
              {patrons.map(patron => {
                const patronQuests = questsByPatron.get(patron.Name) ?? []
                return (
                  <PatronRow
                    key={patron.Name}
                    patron={patron}
                    quests={patronQuests}
                    completedQuests={build.completedQuests}
                    onToggle={handleToggle}
                  />
                )
              })}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
