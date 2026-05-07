import { useEffect, useState, useMemo } from 'react'
import { api } from '../../api'
import { useCharacter } from '../../context/CharacterContext'
import type { EnhancementTree, EnhancementTreeItem } from '../../types/ddo'
import TreeGrid, { type TreeChoices } from '../enhancements/TreeGrid'
import styles from './EpicDestiniesPanel.module.css'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DESTINY_AP_CAP = 24

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function parseCosts(costPerRank: string | undefined, maxRanks: number): number[] {
  if (!costPerRank) return Array(maxRanks).fill(1)
  const parts = costPerRank.trim().split(/\s+/).map(Number)
  if (parts.length === 1) return Array(maxRanks).fill(parts[0])
  const out: number[] = []
  for (let i = 0; i < maxRanks; i++) {
    out.push(parts[i] ?? parts[parts.length - 1])
  }
  return out
}

function costUpToRank(item: EnhancementTreeItem, rank: number): number {
  const maxRanks = item.Ranks ?? 1
  const costs = parseCosts(item.CostPerRank, maxRanks)
  return costs.slice(0, rank).reduce((a, b) => a + b, 0)
}

function computeTreeSpent(tree: EnhancementTree, choices: TreeChoices): number {
  return (tree.EnhancementTreeItem ?? []).reduce((sum, item) => {
    const rank = choices[item.Name] ?? 0
    return sum + costUpToRank(item, rank)
  }, 0)
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function EpicDestiniesPanel() {
  const { build, dispatch } = useCharacter()

  const [allTrees, setAllTrees] = useState<EnhancementTree[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [activeTreeName, setActiveTreeName] = useState<string | null>(null)

  // Load all enhancement trees once and filter to epic destinies
  useEffect(() => {
    setLoading(true)
    api.enhancements()
      .then(data => {
        setAllTrees(data.filter(t => t.IsEpicDestiny === true))
        setError(null)
      })
      .catch(err => setError(String(err)))
      .finally(() => setLoading(false))
  }, [])

  // Auto-select first tab when trees load
  useEffect(() => {
    if (allTrees.length > 0) {
      setActiveTreeName(prev => {
        const stillPresent = allTrees.some(t => t.Name === prev)
        return stillPresent ? prev : allTrees[0].Name
      })
    } else {
      setActiveTreeName(null)
    }
  }, [allTrees])

  // ── Choices ───────────────────────────────────────────────────────────────
  // Each destiny tree has its own independent AP budget (DESTINY_AP_CAP)
  // We read/write through context so choices are persisted with the build.
  const destinyChoices = build.destinyChoices

  function handleChoicesChange(treeName: string, updated: TreeChoices) {
    // Dispatch individual rank changes by diffing
    const prev = destinyChoices[treeName] ?? {}
    const allKeys = new Set([...Object.keys(prev), ...Object.keys(updated)])
    for (const itemName of allKeys) {
      const oldRank = prev[itemName] ?? 0
      const newRank = updated[itemName] ?? 0
      if (oldRank !== newRank) {
        dispatch({ type: 'SET_DESTINY_CHOICE', treeName, itemName, rank: newRank })
      }
    }
  }

  function handleReset() {
    if (!activeTreeName) return
    const treeChoices = destinyChoices[activeTreeName] ?? {}
    for (const itemName of Object.keys(treeChoices)) {
      dispatch({ type: 'SET_DESTINY_CHOICE', treeName: activeTreeName, itemName, rank: 0 })
    }
  }

  // ── Derived values ────────────────────────────────────────────────────────
  const activeTree = useMemo(
    () => allTrees.find(t => t.Name === activeTreeName) ?? null,
    [allTrees, activeTreeName],
  )

  const activeTreeChoices: TreeChoices = activeTree
    ? (destinyChoices[activeTree.Name] ?? {})
    : {}

  const activeTreeSpent = activeTree
    ? computeTreeSpent(activeTree, activeTreeChoices)
    : 0

  // For TreeGrid: totalSpentAllTrees = spent in just this destiny tree
  // (each destiny has its own independent AP pool)
  const atDestinyCap = activeTreeSpent >= DESTINY_AP_CAP

  // ── Render ────────────────────────────────────────────────────────────────
  const tooLow = build.totalLevel < 20

  return (
    <div className="panel">
      <div className="panel-header">
        <span>Epic Destinies</span>
      </div>

      <div className="panel-body" style={{ padding: 0 }}>
        {loading && (
          <div className={styles.statusMsg}>Loading epic destiny trees…</div>
        )}

        {error && !loading && (
          <div className={`${styles.statusMsg} ${styles.errorMsg}`}>
            Failed to load epic destinies: {error}
          </div>
        )}

        {!loading && !error && tooLow && (
          <div className={styles.statusMsg}>
            Epic Destinies unlock at level 20.
          </div>
        )}

        {!loading && !error && !tooLow && allTrees.length > 0 && (
          <>
            {/* Tree selector tabs */}
            <div className={styles.tabs}>
              {allTrees.map(tree => {
                const spent = computeTreeSpent(tree, destinyChoices[tree.Name] ?? {})
                const isActive = tree.Name === activeTreeName
                return (
                  <button
                    key={tree.Name}
                    className={`${styles.tab} ${isActive ? styles.tabActive : ''}`}
                    onClick={() => setActiveTreeName(tree.Name)}
                    title={tree.Name}
                  >
                    <span className={styles.tabName}>{tree.Name}</span>
                    {spent > 0 && (
                      <span className={styles.tabAP}>{spent}/{DESTINY_AP_CAP}</span>
                    )}
                  </button>
                )
              })}
            </div>

            {/* Active tree header bar */}
            {activeTree && (
              <div className={styles.treeHeader}>
                <div className={styles.treeTitle}>
                  {activeTree.Name}
                  <span className={styles.treeBadge}>Epic</span>
                </div>
                <div className={styles.treeAP}>
                  <span className={atDestinyCap ? styles.apCapReached : styles.apCurrent}>
                    {activeTreeSpent}
                  </span>
                  <span className={styles.apSep}>/</span>
                  <span className={styles.apCap}>{DESTINY_AP_CAP}</span>
                  <span className={styles.apLabel}>&nbsp;AP in destiny</span>
                  {activeTreeSpent > 0 && (
                    <button
                      className={styles.resetBtn}
                      onClick={handleReset}
                      title="Reset this destiny tree"
                    >
                      Reset
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* Grid */}
            {activeTree && (
              <div className={styles.gridWrapper}>
                <TreeGrid
                  tree={activeTree}
                  choices={activeTreeChoices}
                  totalSpentAllTrees={activeTreeSpent}
                  totalAP={DESTINY_AP_CAP}
                  onChoicesChange={(updated) => handleChoicesChange(activeTree.Name, updated)}
                />
              </div>
            )}

            {/* Fate Points section */}
            <div className={styles.fatePoints}>
              <div className={styles.fatePointsTitle}>Fate Points</div>
              <div className={styles.fatePointsNote}>
                3 Fate Point slots — select abilities from unlocked destinies
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
