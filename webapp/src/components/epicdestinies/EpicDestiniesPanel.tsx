import { useEffect, useState, useMemo } from 'react'
import { api } from '../../api'
import { useCharacter } from '../../context/CharacterContext'
import type { EnhancementTree, EnhancementTreeItem } from '../../types/ddo'
import TreeGrid, { type TreeChoices, type TreeSelections } from '../enhancements/TreeGrid'
import { destinyPointPool } from '../../lib/v2Formulas'
import styles from './EpicDestiniesPanel.module.css'

// ---------------------------------------------------------------------------
// V2 Constants  (from DDOBuilder/stdafx.h)
// ---------------------------------------------------------------------------

// NOTE: Epic Destiny points are NOT a per-tree cap. They form a single shared
// pool (level- and fate-point-based) spent across all selected destiny trees.
// See destinyPointPool() in lib/v2Formulas.ts (V2 BreakdownItemDestinyAps.cpp).
const MAX_DESTINY_TREES = 3      // exactly 3 selected destiny trees

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function normalizeCostPerRank(raw: unknown): string {
  if (raw == null) return '1'
  if (typeof raw === 'number' && isFinite(raw)) return String(raw)
  if (typeof raw === 'string') return raw || '1'
  if (typeof raw === 'object' && !Array.isArray(raw) && '#text' in (raw as object)) {
    const t = (raw as Record<string, unknown>)['#text']
    if (t != null) return String(t) || '1'
  }
  return '1'
}

function parseCosts(costPerRank: unknown, maxRanks: number): number[] {
  const str = normalizeCostPerRank(costPerRank)
  const parts = str.trim().split(/\s+/).map(Number).filter(isFinite)
  if (parts.length === 0) return Array(maxRanks).fill(1)
  if (parts.length === 1) return Array(maxRanks).fill(parts[0])
  return Array.from({ length: maxRanks }, (_, i) => parts[i] ?? parts[parts.length - 1])
}

function costUpToRank(item: EnhancementTreeItem, rank: number): number {
  const maxRanks = item.Ranks ?? 1
  const costs = parseCosts(item.CostPerRank, maxRanks)
  return costs.slice(0, rank).reduce((a, b) => a + b, 0)
}

function computeTreeSpent(tree: EnhancementTree, choices: TreeChoices): number {
  return (tree.EnhancementTreeItem ?? []).reduce((sum, item) => {
    const key = item.InternalName ?? item.Name
    return sum + costUpToRank(item, choices[key] ?? choices[item.Name] ?? 0)
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
  const [viewingSlot, setViewingSlot] = useState<0 | 1 | 2>(0)
  const [destinySelections, setDestinySelections] = useState<Record<string, TreeSelections>>({})
  const [unlockedOpen, setUnlockedOpen] = useState(true)

  useEffect(() => {
    setLoading(true)
    api.enhancements()
      .then(data => {
        setAllTrees(data.filter((t: EnhancementTree) => t.IsEpicDestiny === true))
        setError(null)
      })
      .catch(err => setError(String(err)))
      .finally(() => setLoading(false))
  }, [])

  // ── Build state accessors ─────────────────────────────────────────────────

  const selectedDestinyTrees: [string, string, string] = build.selectedDestinyTrees ?? ['', '', '']
  const activeEpicDestiny = build.activeEpicDestiny ?? ''
  const unlockedDestinyTrees: string[] = build.unlockedDestinyTrees ?? []
  const destinyChoices = build.destinyChoices

  // ── Derived state ─────────────────────────────────────────────────────────

  // Trees the character has marked as unlocked in-game
  const availableForSelect = useMemo(() =>
    unlockedDestinyTrees.length > 0
      ? allTrees.filter(t => unlockedDestinyTrees.includes(t.Name))
      : allTrees,
  [allTrees, unlockedDestinyTrees])

  // Selected (non-empty) slot names
  const selectedSlots = selectedDestinyTrees.filter(n => n !== '')

  // The tree currently being viewed
  const viewedTreeName = selectedDestinyTrees[viewingSlot] ?? ''
  const viewedTree = useMemo(
    () => allTrees.find(t => t.Name === viewedTreeName) ?? null,
    [allTrees, viewedTreeName],
  )

  const viewedChoices: TreeChoices = viewedTree ? (destinyChoices[viewedTree.Name] ?? {}) : {}
  const viewedSpent = viewedTree ? computeTreeSpent(viewedTree, viewedChoices) : 0

  // Destiny points are a single shared pool spent across ALL selected trees.
  // The pool is level- (and fate-point-) based; there is no per-tree cap.
  const destinyPool = useMemo(() => destinyPointPool(build.totalLevel), [build.totalLevel])
  const totalSpentAllTrees = useMemo(
    () => selectedSlots.reduce((sum, name) => {
      const tree = allTrees.find(t => t.Name === name)
      return sum + (tree ? computeTreeSpent(tree, destinyChoices[name] ?? {}) : 0)
    }, 0),
    [selectedSlots, allTrees, destinyChoices],
  )
  const atDestinyCap = totalSpentAllTrees >= destinyPool

  // Trees with any AP spent (for AP annotations)
  const spentInTrees = useMemo(() =>
    allTrees.filter(t => Object.values(destinyChoices[t.Name] ?? {}).some(v => v > 0)).map(t => t.Name),
  [allTrees, destinyChoices])

  // ── Handlers ──────────────────────────────────────────────────────────────

  function handleSlotChange(slot: 0 | 1 | 2, name: string) {
    dispatch({ type: 'SET_SELECTED_DESTINY', slot, name })
    if (slot === viewingSlot) setViewingSlot(slot)
  }

  function handleChoicesChange(treeName: string, updated: TreeChoices) {
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

  function handleReset(treeName: string) {
    dispatch({ type: 'RESET_DESTINY_TREE', treeName })
  }

  function handleClaimCores() {
    // V2: trains Core (YPosition === 0) enhancements in ALL destiny trees, not just selected ones
    for (const tree of allTrees) {
      const choices = destinyChoices[tree.Name] ?? {}
      for (const item of tree.EnhancementTreeItem ?? []) {
        if ((item.YPosition ?? 0) === 0 && (choices[item.Name] ?? 0) === 0) {
          dispatch({ type: 'SET_DESTINY_CHOICE', treeName: tree.Name, itemName: item.Name, rank: 1 })
        }
      }
    }
  }

  function toggleActive(treeName: string) {
    dispatch({ type: 'SET_ACTIVE_DESTINY', name: activeEpicDestiny === treeName ? '' : treeName })
  }

  // ── Render guard ──────────────────────────────────────────────────────────

  const tooLow = build.totalLevel < 20

  if (loading) return <div className="panel"><div className="panel-header">Epic Destinies</div><div className="panel-body"><div className={styles.statusMsg}>Loading…</div></div></div>
  if (error)   return <div className="panel"><div className="panel-header">Epic Destinies</div><div className="panel-body"><div className={`${styles.statusMsg} ${styles.errorMsg}`}>{error}</div></div></div>
  if (tooLow)  return <div className="panel"><div className="panel-header">Epic Destinies</div><div className="panel-body"><div className={styles.statusMsg}>Epic Destinies unlock at level 20.</div></div></div>

  // ── Full panel ────────────────────────────────────────────────────────────

  return (
    <div className="panel">
      <div className="panel-header">Epic Destinies</div>
      <div className="panel-body" style={{ padding: 0 }}>

        {/* ── 1. Unlocked Destiny Trees ─────────────────────────────────── */}
        <div className={styles.unlockedSection}>
          <button
            className={styles.unlockedToggle}
            onClick={() => setUnlockedOpen(v => !v)}
          >
            <span className={styles.unlockedToggleIcon}>{unlockedOpen ? '▾' : '▸'}</span>
            Unlocked Destiny Trees
            <span className={styles.unlockedCount}>
              {unlockedDestinyTrees.length} / {allTrees.length} unlocked
            </span>
          </button>
          {unlockedOpen && (
            <div className={styles.unlockedGrid}>
              {allTrees.map(tree => {
                const isUnlocked = unlockedDestinyTrees.includes(tree.Name)
                const hasSpend = spentInTrees.includes(tree.Name)
                return (
                  <button
                    key={tree.Name}
                    className={`${styles.unlockedItem} ${isUnlocked ? styles.unlockedItemOn : ''}`}
                    onClick={() => dispatch({ type: 'TOGGLE_UNLOCKED_DESTINY', name: tree.Name })}
                    title={`Mark ${tree.Name} as unlocked in-game${hasSpend ? ` (${computeTreeSpent(allTrees.find(t => t.Name === tree.Name)!, destinyChoices[tree.Name] ?? {})} AP spent)` : ''}`}
                  >
                    {tree.Name}
                    {hasSpend && <span className={styles.unlockedSpend}> ✓</span>}
                  </button>
                )
              })}
              {allTrees.length === 0 && (
                <div className={styles.statusMsg}>No destiny trees found.</div>
              )}
              {allTrees.length > 0 && (
                <div className={styles.unlockedActions}>
                  <button
                    className={styles.unlockedActionBtn}
                    onClick={() => allTrees.forEach(t => {
                      if (!unlockedDestinyTrees.includes(t.Name))
                        dispatch({ type: 'TOGGLE_UNLOCKED_DESTINY', name: t.Name })
                    })}
                  >Unlock All</button>
                  <button
                    className={styles.unlockedActionBtn}
                    onClick={() => allTrees.forEach(t => {
                      if (unlockedDestinyTrees.includes(t.Name))
                        dispatch({ type: 'TOGGLE_UNLOCKED_DESTINY', name: t.Name })
                    })}
                  >Clear All</button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* ── 2. Destiny slot selectors ─────────────────────────────────── */}
        <div className={styles.slotSection}>
          <div className={styles.slotSectionTitle}>Select Active Destiny Trees</div>
          <div className={styles.slotRows}>
            {([0, 1, 2] as const).map(slot => {
              const currentName = selectedDestinyTrees[slot]
              const otherSelected = selectedDestinyTrees.filter((_, i) => i !== slot)
              return (
                <div key={slot} className={styles.slotRow}>
                  <span className={styles.slotLabel}>Destiny {slot + 1}</span>
                  <select
                    className={styles.slotSelect}
                    value={currentName}
                    onChange={e => handleSlotChange(slot, e.target.value)}
                  >
                    <option value="">— None —</option>
                    {availableForSelect.map(t => (
                      <option
                        key={t.Name}
                        value={t.Name}
                        disabled={otherSelected.includes(t.Name)}
                      >
                        {t.Name}
                        {spentInTrees.includes(t.Name) ? ` (${computeTreeSpent(t, destinyChoices[t.Name] ?? {})} AP)` : ''}
                      </option>
                    ))}
                  </select>
                  {currentName && (
                    <button
                      className={`${styles.activeBtn} ${activeEpicDestiny === currentName ? styles.activeBtnOn : ''}`}
                      onClick={() => toggleActive(currentName)}
                      title={activeEpicDestiny === currentName ? 'Active destiny — click to deactivate' : 'Set as active destiny'}
                    >
                      {activeEpicDestiny === currentName ? '⚡ Active' : 'Set Active'}
                    </button>
                  )}
                </div>
              )
            })}
          </div>
          <button className={styles.claimBtn} onClick={handleClaimCores} title="Train all Core enhancements (free) across all destiny trees">
            Claim Core Enhancements
          </button>
        </div>

        {/* ── 3. Tabs + Tree Grid ───────────────────────────────────────── */}
        {selectedSlots.length > 0 && (
          <>
            <div className={styles.tabs}>
              {([0, 1, 2] as const).map(slot => {
                const name = selectedDestinyTrees[slot]
                if (!name) return null
                const tree = allTrees.find(t => t.Name === name)
                const spent = tree ? computeTreeSpent(tree, destinyChoices[name] ?? {}) : 0
                const isViewing = slot === viewingSlot
                const isActive = activeEpicDestiny === name
                return (
                  <button
                    key={slot}
                    className={`${styles.tab} ${isViewing ? styles.tabActive : ''} ${isActive ? styles.tabIsActive : ''}`}
                    onClick={() => setViewingSlot(slot)}
                  >
                    <span className={styles.tabName}>{name}</span>
                    <span className={styles.tabAP}>{spent} spent{isActive ? ' ⚡' : ''}</span>
                  </button>
                )
              })}
            </div>

            {viewedTree && (
              <>
                <div className={styles.treeHeader}>
                  <div className={styles.treeTitle}>
                    {viewedTree.Name}
                    {activeEpicDestiny === viewedTree.Name && <span className={styles.activeBadge}>Active</span>}
                  </div>
                  <div className={styles.treeAP}>
                    <span className={styles.apLabel}>{viewedSpent} in this tree&nbsp;·&nbsp;</span>
                    <span className={atDestinyCap ? styles.apCapReached : styles.apCurrent}>{totalSpentAllTrees}</span>
                    <span className={styles.apSep}>/</span>
                    <span className={styles.apCap}>{destinyPool}</span>
                    <span className={styles.apLabel}>&nbsp;destiny points</span>
                    {viewedSpent > 0 && (
                      <button className={styles.resetBtn} onClick={() => handleReset(viewedTree.Name)}>
                        Reset
                      </button>
                    )}
                  </div>
                </div>
                <div className={styles.gridWrapper}>
                  <TreeGrid
                    tree={viewedTree}
                    choices={viewedChoices}
                    selections={destinySelections[viewedTree.Name] ?? {}}
                    totalSpentAllTrees={totalSpentAllTrees}
                    totalAP={destinyPool}
                    onChoicesChange={(updated) => handleChoicesChange(viewedTree.Name, updated)}
                    onSelectionsChange={(updated) => setDestinySelections(prev => ({ ...prev, [viewedTree.Name]: updated }))}
                  />
                </div>
              </>
            )}
          </>
        )}

      </div>
    </div>
  )
}
