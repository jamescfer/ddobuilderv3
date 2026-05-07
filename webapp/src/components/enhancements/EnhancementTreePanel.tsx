import { useEffect, useState, useMemo } from 'react'
import { api } from '../../api'
import { useCharacter } from '../../context/CharacterContext'
import type { EnhancementTree, EnhancementTreeItem } from '../../types/ddo'
import TreeGrid, { type TreeChoices, type TreeSelections } from './TreeGrid'
import DdoIcon from '../DdoIcon'
import styles from './EnhancementTreePanel.module.css'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const ENH_AP = 80
const MAX_VISIBLE = 6

type Tab = 'enhancements' | 'destiny' | 'reaper'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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

function computeTreeSpent(tree: EnhancementTree, choices: TreeChoices): number {
  return (tree.EnhancementTreeItem ?? []).reduce((sum, item) => {
    return sum + costUpToRank(item, choices[item.Name] ?? 0)
  }, 0)
}

function treeMatchesName(treeName: string, name: string): boolean {
  if (!name) return false
  const t = treeName.toLowerCase()
  const n = name.toLowerCase()
  return t.includes(n) || n.includes(t)
}

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

function isUniversalTree(tree: EnhancementTree): boolean {
  return !tree.IsRacialTree && !tree.Requirements
}

function treeCategory(tree: EnhancementTree): Tab {
  if (tree.IsReaperTree === true) return 'reaper'
  if (tree.IsEpicDestiny === true) return 'destiny'
  return 'enhancements'
}

// ---------------------------------------------------------------------------
// Tree picker modal
// ---------------------------------------------------------------------------

interface TreePickerProps {
  allTrees: EnhancementTree[]
  selected: string[]
  tab: Tab
  build: { race: string; classes: { name: string; levels: number }[] }
  onToggle: (name: string) => void
  onClose: () => void
}

function TreePicker({ allTrees, selected, tab, build, onToggle, onClose }: TreePickerProps) {
  const classNames = build.classes.map(c => c.name).filter(Boolean)
  const raceName = build.race

  const tabTrees = allTrees.filter(t => treeCategory(t) === tab)

  const racial: EnhancementTree[] = []
  const classTrees: EnhancementTree[] = []
  const universal: EnhancementTree[] = []

  for (const tree of tabTrees) {
    if (tab === 'reaper' || tab === 'destiny') {
      universal.push(tree)
    } else if (tree.IsRacialTree) {
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
            const full = !on && selected.length >= MAX_VISIBLE
            const matchesRace = tree.IsRacialTree && treeMatchesName(tree.Name, raceName)
            const matchesClass = !tree.IsRacialTree && classNames.some(cn => treeMatchesName(tree.Name, cn))
            const baseClass = treeRequiresClassType(tree, ['BaseClass', 'Class'])
            const matchesBaseClass = baseClass ? classNames.some(cn => cn === baseClass || treeMatchesName(tree.Name, cn)) : false
            const available = tab !== 'enhancements' || matchesRace || matchesClass || matchesBaseClass || isUniversalTree(tree)
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

  const tabLabel = tab === 'destiny' ? 'Epic Destiny' : tab === 'reaper' ? 'Reaper' : 'Enhancement'

  return (
    <div className={styles.pickerOverlay} onClick={onClose}>
      <div className={styles.pickerModal} onClick={e => e.stopPropagation()}>
        <div className={styles.pickerModalHeader}>
          <span>Select {tabLabel} Trees ({selected.length}/{MAX_VISIBLE})</span>
          <button className={styles.pickerClose} onClick={onClose}>✕</button>
        </div>
        <div className={styles.pickerBody}>
          <Section label="Racial" trees={racial} />
          <Section label="Class" trees={classTrees} />
          <Section label={tab === 'enhancements' ? 'Universal' : tabLabel} trees={universal} />
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

  const [activeTab, setActiveTab] = useState<Tab>('enhancements')

  // Per-tab pinned trees
  const [pinnedEnh, setPinnedEnh] = useState<string[]>([])
  const [pinnedDst, setPinnedDst] = useState<string[]>([])
  const [pinnedRpr, setPinnedRpr] = useState<string[]>([])

  // Shared choices + selections for ALL trees (keyed by tree name)
  const [enhChoices, setEnhChoices] = useState<Record<string, TreeChoices>>({})
  const [enhSelections, setEnhSelections] = useState<Record<string, TreeSelections>>({})

  const [pickerOpen, setPickerOpen] = useState(false)

  useEffect(() => {
    setLoading(true)
    api.enhancements()
      .then(data => { setAllTrees(data); setError(null) })
      .catch(err => setError(String(err)))
      .finally(() => setLoading(false))
  }, [])

  // Available heroic enhancement trees for current build
  const availableEnhTrees = useMemo<EnhancementTree[]>(() => {
    const classNames = build.classes.map(c => c.name).filter(Boolean)
    const raceName = build.race
    return allTrees.filter(tree => {
      if (treeCategory(tree) !== 'enhancements') return false
      if (tree.IsRacialTree) return raceName ? treeMatchesName(tree.Name, raceName) : false
      if (isUniversalTree(tree)) return true
      if (classNames.some(cn => treeMatchesName(tree.Name, cn))) return true
      const req = treeRequiresClassType(tree, ['Class', 'BaseClass'])
      if (req) return classNames.some(cn => cn === req)
      return false
    })
  }, [allTrees, build.race, build.classes])

  // Auto-pin racial tree
  useEffect(() => {
    setPinnedEnh(prev => {
      let next = prev.filter(name => availableEnhTrees.some(t => t.Name === name))
      const racial = availableEnhTrees.find(t => t.IsRacialTree)
      if (racial && !next.includes(racial.Name)) {
        next = [racial.Name, ...next].slice(0, MAX_VISIBLE)
      }
      return next
    })
  }, [availableEnhTrees])

  // AP totals per category
  const totalSpentEnh = useMemo(() => allTrees
    .filter(t => treeCategory(t) === 'enhancements')
    .reduce((s, t) => s + computeTreeSpent(t, enhChoices[t.Name] ?? {}), 0),
    [allTrees, enhChoices])

  const totalSpentDst = useMemo(() => allTrees
    .filter(t => treeCategory(t) === 'destiny')
    .reduce((s, t) => s + computeTreeSpent(t, enhChoices[t.Name] ?? {}), 0),
    [allTrees, enhChoices])

  const totalSpentRpr = useMemo(() => allTrees
    .filter(t => treeCategory(t) === 'reaper')
    .reduce((s, t) => s + computeTreeSpent(t, enhChoices[t.Name] ?? {}), 0),
    [allTrees, enhChoices])

  const totalSpentAll = totalSpentEnh + totalSpentDst + totalSpentRpr

  function handleChoicesChange(treeName: string, updated: TreeChoices) {
    setEnhChoices(prev => ({ ...prev, [treeName]: updated }))
  }

  function handleSelectionsChange(treeName: string, updated: TreeSelections) {
    setEnhSelections(prev => ({ ...prev, [treeName]: updated }))
  }

  function handleReset(treeName: string) {
    setEnhChoices(prev => ({ ...prev, [treeName]: {} }))
    setEnhSelections(prev => ({ ...prev, [treeName]: {} }))
  }

  // Tab-specific pinned/toggle helpers
  const pinned = activeTab === 'enhancements' ? pinnedEnh
    : activeTab === 'destiny' ? pinnedDst : pinnedRpr
  const setPinned = activeTab === 'enhancements' ? setPinnedEnh
    : activeTab === 'destiny' ? setPinnedDst : setPinnedRpr

  function toggleTree(name: string) {
    setPinned(prev => {
      if (prev.includes(name)) return prev.filter(n => n !== name)
      if (prev.length >= MAX_VISIBLE) return prev
      return [...prev, name]
    })
  }

  function removeTree(name: string) {
    setPinned(prev => prev.filter(n => n !== name))
  }

  const tabTrees = allTrees.filter(t => treeCategory(t) === activeTab)

  const visibleTrees = pinned
    .map(name => tabTrees.find(t => t.Name === name))
    .filter(Boolean) as EnhancementTree[]

  const totalSpentTab = activeTab === 'enhancements' ? totalSpentEnh
    : activeTab === 'destiny' ? totalSpentDst : totalSpentRpr

  const hasCharacter = build.race || build.classes.some(c => c.name)

  // For destiny/reaper, no AP cap; for enhancements use ENH_AP
  const tabAP = activeTab === 'enhancements' ? ENH_AP : 9999

  return (
    <div className="panel">
      <div className="panel-header">
        <span>Enhancements</span>
        <span className={styles.apTotal}>
          {activeTab === 'enhancements'
            ? `${totalSpentEnh} / ${ENH_AP} AP`
            : activeTab === 'destiny'
            ? `${totalSpentDst} Fate pts`
            : `${totalSpentRpr} Reaper pts`}
        </span>
      </div>

      {/* Tabs */}
      <div className={styles.tabs}>
        {(['enhancements', 'destiny', 'reaper'] as Tab[]).map(tab => (
          <button
            key={tab}
            className={`${styles.tab} ${activeTab === tab ? styles.tabActive : ''}`}
            onClick={() => setActiveTab(tab)}
          >
            {tab === 'enhancements' ? 'Enhancements' : tab === 'destiny' ? 'Epic Destiny' : 'Reaper'}
          </button>
        ))}
      </div>

      <div className="panel-body" style={{ padding: 0 }}>
        {loading && <div className={styles.statusMsg}>Loading enhancement trees…</div>}
        {error && !loading && (
          <div className={`${styles.statusMsg} ${styles.errorMsg}`}>
            Failed to load: {error}
          </div>
        )}

        {!loading && !error && !hasCharacter && activeTab === 'enhancements' && (
          <div className={styles.statusMsg}>Select a race and class to see enhancement trees.</div>
        )}

        {!loading && !error && (hasCharacter || activeTab !== 'enhancements') && (
          <>
            <div className={styles.toolbar}>
              <button className={styles.addTreeBtn} onClick={() => setPickerOpen(true)}>
                + Add Tree ({pinned.length}/{MAX_VISIBLE})
              </button>
              <span className={styles.toolbarHint}>
                {activeTab === 'enhancements'
                  ? `${ENH_AP - totalSpentEnh} AP remaining`
                  : activeTab === 'destiny'
                  ? `${totalSpentDst} pts spent`
                  : `${totalSpentRpr} pts spent`}
              </span>
            </div>

            {visibleTrees.length === 0 ? (
              <div className={styles.statusMsg}>
                No trees selected. Click "Add Tree" to add enhancement trees.
              </div>
            ) : (
              <div className={styles.multiTreeScroll}>
                <div className={styles.multiTreeRow}>
                  {visibleTrees.map(tree => {
                    const treeChoices = enhChoices[tree.Name] ?? {}
                    const treeSelections = enhSelections[tree.Name] ?? {}
                    const spent = computeTreeSpent(tree, treeChoices)
                    return (
                      <div key={tree.Name} className={styles.treeColumn}>
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
                          <span className={styles.treeHeaderAP}>
                            {spent} {activeTab === 'enhancements' ? 'AP' : 'pts'}
                          </span>
                          {spent > 0 && (
                            <button className={styles.resetBtn}
                              onClick={() => handleReset(tree.Name)} title="Reset">↺</button>
                          )}
                          <button className={styles.removeBtn}
                            onClick={() => removeTree(tree.Name)} title="Remove">✕</button>
                        </div>
                        <TreeGrid
                          tree={tree}
                          choices={treeChoices}
                          selections={treeSelections}
                          totalSpentAllTrees={totalSpentAll}
                          totalAP={tabAP}
                          onChoicesChange={u => handleChoicesChange(tree.Name, u)}
                          onSelectionsChange={u => handleSelectionsChange(tree.Name, u)}
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
          selected={pinned}
          tab={activeTab}
          build={build}
          onToggle={toggleTree}
          onClose={() => setPickerOpen(false)}
        />
      )}
    </div>
  )
}
