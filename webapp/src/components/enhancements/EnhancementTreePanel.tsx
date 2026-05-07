import { useEffect, useState, useMemo } from 'react'
import { api } from '../../api'
import { useCharacter } from '../../context/CharacterContext'
import type { EnhancementTree, EnhancementTreeItem } from '../../types/ddo'
import TreeGrid, { type TreeChoices } from './TreeGrid'
import DdoIcon from '../DdoIcon'
import styles from './EnhancementTreePanel.module.css'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const TOTAL_AP = 80
const TREE_AP_CAP = 41
const MAX_VISIBLE_TREES = 6

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Normalize CostPerRank which may arrive as a plain value or {#text, size} object. */
function normalizeCostPerRank(raw: unknown): string {
  if (raw == null) return '1'
  if (typeof raw === 'number') return String(raw)
  if (typeof raw === 'string') return raw
  if (typeof raw === 'object' && '#text' in (raw as object)) {
    const t = (raw as Record<string, unknown>)['#text']
    return t != null ? String(t) : '1'
  }
  return '1'
}

/** Parse CostPerRank and accumulate cost for a given rank count. */
function costUpToRank(item: EnhancementTreeItem, rank: number): number {
  if (rank <= 0) return 0
  const maxRanks = item.Ranks ?? 1
  const str = normalizeCostPerRank(item.CostPerRank)
  const raw = str.trim().split(/\s+/).map(Number)
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

function treeMatchesName(treeName: string, name: string): boolean {
  if (!name) return false
  const t = treeName.toLowerCase()
  const n = name.toLowerCase()
  return t.includes(n) || n.includes(t)
}

/** Check if tree has a Requirements block that references a specific class Type. */
function treeRequiresClassType(tree: EnhancementTree, types: string[]): string | null {
  const reqs = tree.Requirements
  if (!reqs) return null
  const reqList = reqs.Requirement
    ? (Array.isArray(reqs.Requirement) ? reqs.Requirement : [reqs.Requirement])
    : []
  for (const req of reqList) {
    if (types.includes(req.Type)) {
      return Array.isArray(req.Item) ? req.Item[0] : req.Item ?? null
    }
  }
  return null
}

/** Universal trees — no class/race requirement. */
function isUniversalTree(tree: EnhancementTree): boolean {
  return !tree.IsRacialTree && !tree.Requirements
}

// ---------------------------------------------------------------------------
// Tree picker modal
// ---------------------------------------------------------------------------

interface TreePickerProps {
  allTrees: EnhancementTree[]
  selected: string[]
  build: { race: string; classes: { name: string; levels: number }[] }
  onToggle: (name: string) => void
  onClose: () => void
}

function TreePicker({ allTrees, selected, build, onToggle, onClose }: TreePickerProps) {
  const classNames = build.classes.map(c => c.name).filter(Boolean)
  const raceName = build.race

  const racial: EnhancementTree[] = []
  const classTrees: EnhancementTree[] = []
  const universal: EnhancementTree[] = []

  for (const tree of allTrees) {
    // Skip epic destiny / reaper trees
    if (tree.IsEpicDestiny !== undefined || tree.IsReaperTree !== undefined) continue
    if (tree.IsRacialTree) {
      racial.push(tree)
    } else if (isUniversalTree(tree)) {
      universal.push(tree)
    } else {
      classTrees.push(tree)
    }
  }

  function Section({ label, trees }: { label: string; trees: EnhancementTree[] }) {
    if (trees.length === 0) return null
    return (
      <div className={styles.pickerSection}>
        <div className={styles.pickerSectionLabel}>{label}</div>
        <div className={styles.pickerTreeGrid}>
          {trees.map(tree => {
            const on = selected.includes(tree.Name)
            const full = !on && selected.length >= MAX_VISIBLE_TREES
            const matchesRace = tree.IsRacialTree && treeMatchesName(tree.Name, raceName)
            const matchesClass = !tree.IsRacialTree && classNames.some(cn => treeMatchesName(tree.Name, cn))
            const baseClass = treeRequiresClassType(tree, ['BaseClass', 'Class'])
            const matchesBaseClass = baseClass ? classNames.some(cn => cn === baseClass || treeMatchesName(tree.Name, cn)) : false
            const available = matchesRace || matchesClass || matchesBaseClass || isUniversalTree(tree)
            return (
              <button
                key={tree.Name}
                className={[
                  styles.pickerTree,
                  on ? styles.pickerTreeOn : '',
                  full ? styles.pickerTreeDisabled : '',
                  !available ? styles.pickerTreeUnavailable : '',
                ].join(' ')}
                disabled={full && !on}
                onClick={() => onToggle(tree.Name)}
                title={tree.Name + (available ? '' : ' (not available for current build)')}
              >
                <DdoIcon category="EnhancementImages" name={tree.Icon ?? tree.Name} size={32} />
                <span className={styles.pickerTreeName}>{tree.Name}</span>
              </button>
            )
          })}
        </div>
      </div>
    )
  }

  return (
    <div className={styles.pickerOverlay} onClick={onClose}>
      <div className={styles.pickerModal} onClick={e => e.stopPropagation()}>
        <div className={styles.pickerModalHeader}>
          <span>Select Enhancement Trees ({selected.length}/{MAX_VISIBLE_TREES})</span>
          <button className={styles.pickerClose} onClick={onClose}>✕</button>
        </div>
        <div className={styles.pickerBody}>
          <Section label="Racial" trees={racial} />
          <Section label="Class" trees={classTrees} />
          <Section label="Universal" trees={universal} />
        </div>
      </div>
    </div>
  )
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

  // Trees currently pinned in the multi-tree view
  const [pinnedTrees, setPinnedTrees] = useState<string[]>([])

  // Whether tree picker is open
  const [pickerOpen, setPickerOpen] = useState(false)

  // Load all enhancement trees once
  useEffect(() => {
    setLoading(true)
    api.enhancements()
      .then(data => { setAllTrees(data); setError(null) })
      .catch(err => setError(String(err)))
      .finally(() => setLoading(false))
  }, [])

  // ── Determine available trees based on build ──────────────────────────────
  const availableTrees = useMemo<EnhancementTree[]>(() => {
    if (allTrees.length === 0) return []

    const classNames = build.classes.map(c => c.name).filter(Boolean)
    const raceName = build.race

    return allTrees.filter(tree => {
      // Exclude epic destiny / reaper — check !== undefined to catch empty string ""
      if (tree.IsEpicDestiny !== undefined || tree.IsReaperTree !== undefined) return false

      if (tree.IsRacialTree) {
        return raceName ? treeMatchesName(tree.Name, raceName) : false
      }

      if (isUniversalTree(tree)) return true

      // Class tree: check Class and BaseClass requirement types
      if (classNames.some(cn => treeMatchesName(tree.Name, cn))) return true

      const requiredClass = treeRequiresClassType(tree, ['Class', 'BaseClass'])
      if (requiredClass) {
        return classNames.some(cn => cn === requiredClass)
      }

      return false
    })
  }, [allTrees, build.race, build.classes])

  // Auto-pin racial tree when race is set; remove trees no longer available
  useEffect(() => {
    setPinnedTrees(prev => {
      let next = prev.filter(name => availableTrees.some(t => t.Name === name))
      // Auto-add racial tree
      const racial = availableTrees.find(t => t.IsRacialTree)
      if (racial && !next.includes(racial.Name)) {
        next = [racial.Name, ...next].slice(0, MAX_VISIBLE_TREES)
      }
      return next
    })
  }, [availableTrees])

  // ── AP totals ─────────────────────────────────────────────────────────────
  const totalSpentAllTrees = useMemo(() => {
    return allTrees.reduce((sum, tree) => {
      return sum + computeTreeSpent(tree, enhChoices[tree.Name] ?? {})
    }, 0)
  }, [allTrees, enhChoices])

  // ── Handlers ─────────────────────────────────────────────────────────────
  function handleChoicesChange(treeName: string, updated: TreeChoices) {
    setEnhChoices(prev => ({ ...prev, [treeName]: updated }))
  }

  function handleReset(treeName: string) {
    setEnhChoices(prev => ({ ...prev, [treeName]: {} }))
  }

  function handleRemoveTree(treeName: string) {
    setPinnedTrees(prev => prev.filter(n => n !== treeName))
  }

  function toggleTree(name: string) {
    setPinnedTrees(prev => {
      if (prev.includes(name)) return prev.filter(n => n !== name)
      if (prev.length >= MAX_VISIBLE_TREES) return prev
      return [...prev, name]
    })
  }

  // ── Render ────────────────────────────────────────────────────────────────
  const hasCharacter = build.race || build.classes.some(c => c.name)
  const visibleTrees = pinnedTrees
    .map(name => allTrees.find(t => t.Name === name))
    .filter(Boolean) as EnhancementTree[]

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

        {!loading && !error && hasCharacter && (
          <>
            {/* Toolbar */}
            <div className={styles.toolbar}>
              <button
                className={styles.addTreeBtn}
                onClick={() => setPickerOpen(true)}
              >
                + Add Tree ({pinnedTrees.length}/{MAX_VISIBLE_TREES})
              </button>
              <span className={styles.toolbarHint}>
                {TOTAL_AP - totalSpentAllTrees} AP remaining
              </span>
            </div>

            {/* Multi-tree display */}
            {visibleTrees.length === 0 ? (
              <div className={styles.statusMsg}>
                No trees selected. Click "Add Tree" to choose enhancement trees.
              </div>
            ) : (
              <div className={styles.multiTreeScroll}>
                <div className={styles.multiTreeRow}>
                  {visibleTrees.map(tree => {
                    const treeChoices = enhChoices[tree.Name] ?? {}
                    const spent = computeTreeSpent(tree, treeChoices)
                    return (
                      <div key={tree.Name} className={styles.treeColumn}>
                        {/* Tree header */}
                        <div className={styles.treeHeader}>
                          <DdoIcon
                            category="EnhancementImages"
                            name={tree.Icon ?? tree.Name}
                            size={24}
                            className={styles.treeHeaderIcon}
                          />
                          <span className={styles.treeHeaderName} title={tree.Name}>
                            {tree.Name}
                          </span>
                          <span className={`${styles.treeHeaderAP} ${spent >= TREE_AP_CAP ? styles.apCapReached : ''}`}>
                            {spent} AP
                          </span>
                          {spent > 0 && (
                            <button
                              className={styles.resetBtn}
                              onClick={() => handleReset(tree.Name)}
                              title="Reset this tree"
                            >↺</button>
                          )}
                          <button
                            className={styles.removeBtn}
                            onClick={() => handleRemoveTree(tree.Name)}
                            title="Remove tree"
                          >✕</button>
                        </div>

                        {/* Grid */}
                        <TreeGrid
                          tree={tree}
                          choices={treeChoices}
                          totalSpentAllTrees={totalSpentAllTrees}
                          totalAP={TOTAL_AP}
                          onChoicesChange={(updated) => handleChoicesChange(tree.Name, updated)}
                        />
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {pickerOpen && (
        <TreePicker
          allTrees={allTrees}
          selected={pinnedTrees}
          build={build}
          onToggle={toggleTree}
          onClose={() => setPickerOpen(false)}
        />
      )}
    </div>
  )
}
