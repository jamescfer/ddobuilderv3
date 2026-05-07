import { useEffect, useState, useMemo } from 'react'
import { api } from '../../api'
import { useCharacter } from '../../context/CharacterContext'
import type { EnhancementTree, EnhancementTreeItem } from '../../types/ddo'
import TreeGrid, { type TreeChoices } from './TreeGrid'
import styles from './EnhancementTreePanel.module.css'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const TOTAL_AP = 80
const TREE_AP_CAP = 20

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Parse CostPerRank and accumulate cost for a given rank count. */
function costUpToRank(item: EnhancementTreeItem, rank: number): number {
  if (rank <= 0) return 0
  const maxRanks = item.Ranks ?? 1
  const raw = (item.CostPerRank ?? '1').trim().split(/\s+/).map(Number)
  const costs = raw.length === 1
    ? Array(maxRanks).fill(raw[0])
    : Array.from({ length: maxRanks }, (_, i) => raw[i] ?? raw[raw.length - 1])
  return costs.slice(0, rank).reduce((a: number, b: number) => a + b, 0)
}

/** Compute AP spent in one tree given the choices map for that tree. */
function computeTreeSpent(tree: EnhancementTree, choices: TreeChoices): number {
  return (tree.EnhancementTreeItem ?? []).reduce((sum, item) => {
    const rank = choices[item.Name] ?? 0
    return sum + costUpToRank(item, rank)
  }, 0)
}

/** Return true if the tree name plausibly matches a class or race name.
 *  Trees are named things like "Fighter: Stalwart Defender" or "Human" etc.
 *  We do a case-insensitive substring check in both directions.
 */
function treeMatchesName(treeName: string, name: string): boolean {
  if (!name) return false
  const t = treeName.toLowerCase()
  const n = name.toLowerCase()
  return t.includes(n) || n.includes(t)
}

/** Universal trees have no class/race requirement — available to everyone. */
function isUniversalTree(tree: EnhancementTree): boolean {
  return !tree.IsRacialTree && !tree.Requirements
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function EnhancementTreePanel() {
  const { build } = useCharacter()

  const [allTrees, setAllTrees] = useState<EnhancementTree[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // treeName → itemName → ranks spent
  const [enhChoices, setEnhChoices] = useState<Record<string, TreeChoices>>({})

  // Which tree tab is currently shown
  const [activeTreeName, setActiveTreeName] = useState<string | null>(null)

  // Load all enhancement trees once
  useEffect(() => {
    setLoading(true)
    api.enhancements()
      .then(data => { setAllTrees(data); setError(null) })
      .catch(err => setError(String(err)))
      .finally(() => setLoading(false))
  }, [])

  // ── Determine visible trees based on build's race + classes ──────────────
  const visibleTrees = useMemo<EnhancementTree[]>(() => {
    if (allTrees.length === 0) return []

    const classNames = build.classes.map(c => c.name).filter(Boolean)
    const raceName = build.race

    const racial: EnhancementTree[] = []
    const classTrees: EnhancementTree[] = []
    const universal: EnhancementTree[] = []

    for (const tree of allTrees) {
      if (tree.IsEpicDestiny || tree.IsReaperTree) continue
      if (tree.IsRacialTree) {
        if (raceName && treeMatchesName(tree.Name, raceName)) {
          racial.push(tree)
        }
      } else if (isUniversalTree(tree)) {
        universal.push(tree)
      } else {
        // Class tree: check if any selected class matches
        if (classNames.some(cn => treeMatchesName(tree.Name, cn))) {
          classTrees.push(tree)
        }
      }
    }

    return [...racial, ...classTrees, ...universal]
  }, [allTrees, build.race, build.classes])

  // Auto-select first tab whenever the visible set changes
  useEffect(() => {
    if (visibleTrees.length > 0) {
      setActiveTreeName(prev => {
        const stillPresent = visibleTrees.some(t => t.Name === prev)
        return stillPresent ? prev : visibleTrees[0].Name
      })
    } else {
      setActiveTreeName(null)
    }
  }, [visibleTrees])

  // ── AP totals ─────────────────────────────────────────────────────────────
  const totalSpentAllTrees = useMemo(() => {
    return allTrees.reduce((sum, tree) => {
      const treeChoices = enhChoices[tree.Name] ?? {}
      return sum + computeTreeSpent(tree, treeChoices)
    }, 0)
  }, [allTrees, enhChoices])

  const activeTree = visibleTrees.find(t => t.Name === activeTreeName) ?? null

  const activeTreeSpent = activeTree
    ? computeTreeSpent(activeTree, enhChoices[activeTree.Name] ?? {})
    : 0

  // ── Handlers ─────────────────────────────────────────────────────────────
  function handleChoicesChange(treeName: string, updated: TreeChoices) {
    setEnhChoices(prev => ({ ...prev, [treeName]: updated }))
  }

  function handleReset() {
    if (!activeTreeName) return
    setEnhChoices(prev => ({ ...prev, [activeTreeName]: {} }))
  }

  // ── Render ────────────────────────────────────────────────────────────────
  const hasCharacter = build.race || build.classes.some(c => c.name)

  return (
    <div className="panel">
      <div className="panel-header">
        <span>Enhancement Trees</span>
        <span className={styles.apTotal}>
          {totalSpentAllTrees} / {TOTAL_AP} AP spent
        </span>
      </div>

      <div className="panel-body" style={{ padding: 0 }}>
        {loading && (
          <div className={styles.statusMsg}>Loading enhancement trees…</div>
        )}

        {error && !loading && (
          <div className={`${styles.statusMsg} ${styles.errorMsg}`}>
            Failed to load enhancements: {error}
          </div>
        )}

        {!loading && !error && !hasCharacter && (
          <div className={styles.statusMsg}>
            Select a race and class to see available enhancement trees.
          </div>
        )}

        {!loading && !error && hasCharacter && visibleTrees.length === 0 && (
          <div className={styles.statusMsg}>
            No enhancement trees found for the current race/class selection.
          </div>
        )}

        {!loading && !error && visibleTrees.length > 0 && (
          <>
            {/* Tree selector tabs */}
            <div className={styles.tabs}>
              {visibleTrees.map(tree => {
                const spent = computeTreeSpent(tree, enhChoices[tree.Name] ?? {})
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
                      <span className={styles.tabAP}>{spent}/{TREE_AP_CAP}</span>
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
                  {activeTree.IsRacialTree && (
                    <span className={styles.treeBadge}>Racial</span>
                  )}
                </div>
                <div className={styles.treeAP}>
                  <span
                    className={activeTreeSpent >= TREE_AP_CAP ? styles.apCapReached : styles.apCurrent}
                  >
                    {activeTreeSpent}
                  </span>
                  <span className={styles.apSep}>/</span>
                  <span className={styles.apCap}>{TREE_AP_CAP}</span>
                  <span className={styles.apLabel}>&nbsp;AP in tree</span>
                  <span className={styles.apRemaining}>
                    ({TOTAL_AP - totalSpentAllTrees} remaining)
                  </span>
                  {activeTreeSpent > 0 && (
                    <button
                      className={styles.resetBtn}
                      onClick={handleReset}
                      title="Reset this tree"
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
                  choices={enhChoices[activeTree.Name] ?? {}}
                  totalSpentAllTrees={totalSpentAllTrees}
                  totalAP={TOTAL_AP}
                  onChoicesChange={(updated) => handleChoicesChange(activeTree.Name, updated)}
                />
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
