import { useEffect, useState, useMemo } from 'react'
import { api } from '../../api'
import { useCharacter } from '../../context/CharacterContext'
import type { EnhancementTree, EnhancementTreeItem } from '../../types/ddo'
import TreeGrid, { type TreeChoices, type TreeSelections } from '../enhancements/TreeGrid'
import styles from './ReaperPanel.module.css'

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

export default function ReaperPanel() {
  const { build, dispatch } = useCharacter()

  const [allTrees, setAllTrees] = useState<EnhancementTree[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [activeTreeName, setActiveTreeName] = useState<string | null>(null)
  const [reaperSelections, setReaperSelections] = useState<Record<string, TreeSelections>>({})

  // Session-only AP budget (not persisted)
  const [reaperAP, setReaperAP] = useState(0)

  // Load all enhancement trees once and filter to reaper trees
  useEffect(() => {
    setLoading(true)
    api.enhancements()
      .then(data => {
        setAllTrees(data.filter(t => t.IsReaperTree === true))
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

  // ── Choices via context ───────────────────────────────────────────────────
  const reaperChoices = build.reaperChoices

  function handleChoicesChange(treeName: string, updated: TreeChoices) {
    const prev = reaperChoices[treeName] ?? {}
    const allKeys = new Set([...Object.keys(prev), ...Object.keys(updated)])
    for (const itemName of allKeys) {
      const oldRank = prev[itemName] ?? 0
      const newRank = updated[itemName] ?? 0
      if (oldRank !== newRank) {
        dispatch({ type: 'SET_REAPER_CHOICE', treeName, itemName, rank: newRank })
      }
    }
  }

  function handleReset() {
    if (!activeTreeName) return
    const treeChoices = reaperChoices[activeTreeName] ?? {}
    for (const itemName of Object.keys(treeChoices)) {
      dispatch({ type: 'SET_REAPER_CHOICE', treeName: activeTreeName, itemName, rank: 0 })
    }
  }

  // ── Derived values ────────────────────────────────────────────────────────
  const activeTree = useMemo(
    () => allTrees.find(t => t.Name === activeTreeName) ?? null,
    [allTrees, activeTreeName],
  )

  const activeTreeChoices: TreeChoices = activeTree
    ? (reaperChoices[activeTree.Name] ?? {})
    : {}

  const activeTreeSpent = activeTree
    ? computeTreeSpent(activeTree, activeTreeChoices)
    : 0

  const totalSpentAllTrees = useMemo(() => {
    return allTrees.reduce((sum, tree) => {
      return sum + computeTreeSpent(tree, reaperChoices[tree.Name] ?? {})
    }, 0)
  }, [allTrees, reaperChoices])

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="panel">
      <div className="panel-header">
        <span>Reaper Enhancements</span>
        <span className={styles.apTotal}>
          {totalSpentAllTrees} / {reaperAP} REP spent
        </span>
      </div>

      <div className="panel-body" style={{ padding: 0 }}>
        {loading && (
          <div className={styles.statusMsg}>Loading reaper enhancement trees…</div>
        )}

        {error && !loading && (
          <div className={`${styles.statusMsg} ${styles.errorMsg}`}>
            Failed to load reaper enhancements: {error}
          </div>
        )}

        {!loading && !error && (
          <>
            {/* AP budget control */}
            <div className={styles.budgetBar}>
              <label className={styles.budgetLabel} htmlFor="reaper-ap-slider">
                Reaper Enhancement Points available:
                <span className={styles.budgetValue}>{reaperAP}</span>
              </label>
              <input
                id="reaper-ap-slider"
                className={styles.budgetSlider}
                type="range"
                min={0}
                max={1000}
                step={1}
                value={reaperAP}
                onChange={e => setReaperAP(Number(e.target.value))}
              />
              <div className={styles.budgetNote}>
                You have {reaperAP} Reaper Enhancement Points available. Set above to plan your build.
              </div>
              <div className={styles.reaperNote}>
                Reaper points are earned by completing content on Reaper difficulty.
              </div>
            </div>

            {allTrees.length > 0 && (
              <>
                {/* Tree selector tabs */}
                <div className={styles.tabs}>
                  {allTrees.map(tree => {
                    const spent = computeTreeSpent(tree, reaperChoices[tree.Name] ?? {})
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
                          <span className={styles.tabAP}>{spent} REP</span>
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
                      <span className={styles.treeBadge}>Reaper</span>
                    </div>
                    <div className={styles.treeAP}>
                      <span className={styles.apCurrent}>{activeTreeSpent}</span>
                      <span className={styles.apLabel}>&nbsp;REP in tree</span>
                      <span className={styles.apRemaining}>
                        ({reaperAP - totalSpentAllTrees} remaining)
                      </span>
                      {activeTreeSpent > 0 && (
                        <button
                          className={styles.resetBtn}
                          onClick={handleReset}
                          title="Reset this reaper tree"
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
                      selections={reaperSelections[activeTree.Name] ?? {}}
                      totalSpentAllTrees={totalSpentAllTrees}
                      totalAP={reaperAP}
                      onChoicesChange={(updated) => handleChoicesChange(activeTree.Name, updated)}
                      onSelectionsChange={(updated) => setReaperSelections(prev => ({ ...prev, [activeTree.Name]: updated }))}
                    />
                  </div>
                )}
              </>
            )}
          </>
        )}
      </div>
    </div>
  )
}
