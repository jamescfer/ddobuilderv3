import { useEffect, useState, useMemo } from 'react'
import { api } from '../../api'
import { useCharacter } from '../../context/CharacterContext'
import type { EnhancementTree, EnhancementTreeItem } from '../../types/ddo'
import TreeGrid, { type TreeChoices, type TreeSelections } from '../enhancements/TreeGrid'
import styles from './EpicDestiniesPanel.module.css'

// ---------------------------------------------------------------------------
// V2 Constants  (from DDOBuilder/stdafx.h)
// ---------------------------------------------------------------------------

const DESTINY_AP_CAP = 24        // per-tree AP cap
const MAX_DESTINY_TREES = 3      // exactly 3 selected destiny trees
const MAX_TWISTS = 5             // 4 normally; 5th requires Epic Completionist
const BASE_FATE_POINTS = 3       // base fate points in DDO

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
    return sum + costUpToRank(item, choices[item.Name] ?? 0)
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
  const twistChoices: string[] = build.twistChoices ?? ['', '', '', '', '']
  const destinyChoices = build.destinyChoices

  // ── Derived state ─────────────────────────────────────────────────────────

  // Fate point total (base 3; extra fate points can come from enhancements/feats)
  const totalFatePoints = useMemo(() => {
    let pts = BASE_FATE_POINTS
    // Each unlock beyond the base 3 adds to fate points (common DDO rule: 1 FP per destiny level)
    // Simplified: just show base 3 + any extra from effects (future)
    return pts
  }, [])

  const spentFatePoints = twistChoices.filter(t => t !== '').length

  // All destiny tree names with any AP spent
  const spentInTrees = useMemo(() =>
    allTrees.filter(t => {
      const choices = destinyChoices[t.Name] ?? {}
      return Object.values(choices).some(v => v > 0)
    }).map(t => t.Name),
  [allTrees, destinyChoices])

  // Selected (non-empty) slots
  const selectedSlots = selectedDestinyTrees.filter(n => n !== '')

  // The tree currently being viewed
  const viewedTreeName = selectedDestinyTrees[viewingSlot] ?? ''
  const viewedTree = useMemo(
    () => allTrees.find(t => t.Name === viewedTreeName) ?? null,
    [allTrees, viewedTreeName],
  )

  const viewedChoices: TreeChoices = viewedTree ? (destinyChoices[viewedTree.Name] ?? {}) : {}
  const viewedSpent = viewedTree ? computeTreeSpent(viewedTree, viewedChoices) : 0
  const atDestinyCap = viewedSpent >= DESTINY_AP_CAP

  // For twist picker: all items from unlocked trees
  const twistableItems = useMemo(() => {
    const out: Array<{ treeName: string; item: EnhancementTreeItem }> = []
    for (const tree of allTrees) {
      if (!unlockedDestinyTrees.includes(tree.Name)) continue
      for (const item of tree.EnhancementTreeItem ?? []) {
        if ((item.YPosition ?? 0) > 0) out.push({ treeName: tree.Name, item })
      }
    }
    return out
  }, [allTrees, unlockedDestinyTrees])

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
    // Train all Core (YPosition === 0) enhancements in all selected destiny trees to rank 1
    for (const treeName of selectedSlots) {
      const tree = allTrees.find(t => t.Name === treeName)
      if (!tree) continue
      const choices = destinyChoices[treeName] ?? {}
      for (const item of tree.EnhancementTreeItem ?? []) {
        if ((item.YPosition ?? 0) === 0 && (choices[item.Name] ?? 0) === 0) {
          dispatch({ type: 'SET_DESTINY_CHOICE', treeName, itemName: item.Name, rank: 1 })
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

        {/* ── 1. Destiny slot selectors ─────────────────────────────────── */}
        <div className={styles.slotSection}>
          <div className={styles.slotSectionTitle}>Select 3 Destinies</div>
          <div className={styles.slotRows}>
            {([0, 1, 2] as const).map(slot => {
              const currentName = selectedDestinyTrees[slot]
              const otherSelected = selectedDestinyTrees.filter((_, i) => i !== slot)
              const options = allTrees.filter(t =>
                unlockedDestinyTrees.length === 0 || unlockedDestinyTrees.includes(t.Name)
              )
              return (
                <div key={slot} className={styles.slotRow}>
                  <span className={styles.slotLabel}>Destiny {slot + 1}</span>
                  <select
                    className={styles.slotSelect}
                    value={currentName}
                    onChange={e => handleSlotChange(slot, e.target.value)}
                  >
                    <option value="">— None —</option>
                    {options.map(t => (
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
                      title={activeEpicDestiny === currentName ? 'Active destiny — click to clear' : 'Set as active destiny'}
                    >
                      {activeEpicDestiny === currentName ? '⚡ Active' : 'Set Active'}
                    </button>
                  )}
                </div>
              )
            })}
          </div>
          {selectedSlots.length > 0 && (
            <button className={styles.claimBtn} onClick={handleClaimCores} title="Train all Core (free) enhancements in your selected destiny trees">
              Claim Core Enhancements
            </button>
          )}
        </div>

        {/* ── 2. Tabs + Tree Grid ───────────────────────────────────────── */}
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
                    <span className={styles.tabAP}>{spent}/{DESTINY_AP_CAP} AP{isActive ? ' ⚡' : ''}</span>
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
                    <span className={atDestinyCap ? styles.apCapReached : styles.apCurrent}>{viewedSpent}</span>
                    <span className={styles.apSep}>/</span>
                    <span className={styles.apCap}>{DESTINY_AP_CAP}</span>
                    <span className={styles.apLabel}>&nbsp;AP</span>
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
                    totalSpentAllTrees={viewedSpent}
                    totalAP={DESTINY_AP_CAP}
                    onChoicesChange={(updated) => handleChoicesChange(viewedTree.Name, updated)}
                    onSelectionsChange={(updated) => setDestinySelections(prev => ({ ...prev, [viewedTree.Name]: updated }))}
                  />
                </div>
              </>
            )}
          </>
        )}

        {/* ── 3. Fate Points & Twists ───────────────────────────────────── */}
        <div className={styles.twistSection}>
          <div className={styles.twistHeader}>
            <span className={styles.twistTitle}>Twists of Fate</span>
            <span className={spentFatePoints > totalFatePoints ? styles.fateOver : styles.fateCount}>
              Fate Points: {totalFatePoints - spentFatePoints} / {totalFatePoints}
            </span>
          </div>
          <div className={styles.twistNote}>
            Pick abilities from unlocked destiny trees. Unlock destinies below to enable twists.
          </div>
          {Array.from({ length: MAX_TWISTS }, (_, i) => {
            const isLast = i === MAX_TWISTS - 1
            const currentValue = twistChoices[i] ?? ''
            const currentEntry = twistableItems.find(e => e.item.Name === currentValue || e.item.InternalName === currentValue)
            return (
              <div key={i} className={`${styles.twistRow} ${isLast ? styles.twistRowCompletionist : ''}`}>
                <span className={styles.twistLabel}>Twist {i + 1}{isLast ? ' ★' : ''}</span>
                <select
                  className={styles.twistSelect}
                  value={currentValue}
                  onChange={e => dispatch({ type: 'SET_TWIST_CHOICE', slot: i, value: e.target.value })}
                >
                  <option value="">— None —</option>
                  {twistableItems.map(({ treeName, item }) => (
                    <option key={`${treeName}|${item.Name}`} value={item.Name}>
                      [{treeName.split(' ').map(w => w[0]).join('')}] {item.Name}
                    </option>
                  ))}
                </select>
                {currentEntry && (
                  <span className={styles.twistTree}>{currentEntry.treeName}</span>
                )}
                {currentValue && (
                  <button
                    className={styles.twistClear}
                    onClick={() => dispatch({ type: 'SET_TWIST_CHOICE', slot: i, value: '' })}
                    title="Clear this twist"
                  >✕</button>
                )}
              </div>
            )
          })}
        </div>

        {/* ── 4. Unlocked Destinies ─────────────────────────────────────── */}
        <div className={styles.unlockedSection}>
          <button
            className={styles.unlockedToggle}
            onClick={() => setUnlockedOpen(v => !v)}
          >
            <span className={styles.unlockedToggleIcon}>{unlockedOpen ? '▾' : '▸'}</span>
            Unlocked Destinies
            <span className={styles.unlockedCount}>
              {unlockedDestinyTrees.length} / {allTrees.length} unlocked
            </span>
          </button>
          {unlockedOpen && (
            <div className={styles.unlockedGrid}>
              {allTrees.map(tree => {
                const isUnlocked = unlockedDestinyTrees.includes(tree.Name)
                return (
                  <label
                    key={tree.Name}
                    className={`${styles.unlockedItem} ${isUnlocked ? styles.unlockedItemOn : ''}`}
                    title={`Mark ${tree.Name} as unlocked in-game`}
                  >
                    <input
                      type="checkbox"
                      checked={isUnlocked}
                      onChange={() => dispatch({ type: 'TOGGLE_UNLOCKED_DESTINY', name: tree.Name })}
                    />
                    {tree.Name}
                  </label>
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

      </div>
    </div>
  )
}
