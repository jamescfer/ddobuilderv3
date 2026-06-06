import { useEffect, useState, useMemo } from 'react'
import { api } from '../../api'
import { useCharacter } from '../../context/CharacterContext'
import type { EnhancementTree, EnhancementTreeItem, Item } from '../../types/ddo'
import TreeGrid, { type TreeChoices } from '../enhancements/TreeGrid'
import { useStaticBundle } from '../../hooks/useStaticBundle'
import { useBuildStats } from '../../hooks/useBuildStats'
import { destinyPointPool } from '../../lib/v2Formulas'
import { tier5LockedTree, availableDestinyTrees } from '../../lib/destiny'
import { availableTwistItems } from '../../lib/twists'
import styles from './EpicDestiniesPanel.module.css'

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

  const [viewingSlot, setViewingSlot] = useState<0 | 1 | 2>(0)
  const [gearItems, setGearItems] = useState<Record<string, Item>>({})

  // Static data + full build stats. Stats give us the aggregated fate-point and
  // destiny-AP-bonus effect totals (FatePoint / DestinyAPBonus), exactly the
  // sources V2's BreakdownItemDestinyAps feeds into the destiny point pool.
  const bundle = useStaticBundle()
  const loading = bundle.allTrees.length === 0

  // Epic destiny trees, derived from the shared bundle.
  const allTrees = useMemo(
    () => bundle.allTrees.filter((t: EnhancementTree) => t.IsEpicDestiny === true),
    [bundle.allTrees],
  )

  // Resolve equipped gear so gear-granted fate points/destiny APs are counted.
  useEffect(() => {
    const slots = Object.entries(build.gear).filter(([, name]) => name)
    if (slots.length === 0) { setGearItems({}); return }
    let cancelled = false
    Promise.all(
      slots.map(([slot, name]) =>
        api.item(name).then(item => item ? [slot, item] as [string, Item] : null),
      ),
    ).then(results => {
      if (cancelled) return
      const map: Record<string, Item> = {}
      for (const r of results) { if (r) map[r[0]] = r[1] }
      setGearItems(map)
    })
    return () => { cancelled = true }
  }, [build.gear])

  const statsInput = useMemo(() => ({
    allClasses: bundle.allClasses, allRaces: bundle.allRaces, allFeats: bundle.allFeats,
    allTrees: bundle.allTrees, gearItems,
    allSelfBuffs: bundle.allSelfBuffs, allAugments: bundle.allAugments,
    allSetBonuses: bundle.allSetBonuses, allFiligreeBonuses: bundle.allFiligreeBonuses,
    allFiligrees: bundle.allFiligrees, allWeaponGroups: bundle.allWeaponGroups,
    allSpells: bundle.allSpells, allGuildBuffs: bundle.allGuildBuffs,
    allItemBuffs: bundle.allItemBuffs,
  }), [bundle, gearItems])
  const stats = useBuildStats(statsInput)

  // ── Build state accessors ─────────────────────────────────────────────────

  const selectedDestinyTrees: [string, string, string] = build.selectedDestinyTrees ?? ['', '', '']
  const destinyChoices = build.destinyChoices

  // ── Derived state ─────────────────────────────────────────────────────────

  // V2: a destiny tree is available once the character meets its <Requirements>
  // (its same-named "claim" feat), which all epic characters have at level 20+.
  const race = useMemo(
    () => bundle.allRaces.find(r => r.Name === build.race),
    [bundle.allRaces, build.race],
  )
  const availableForSelect = useMemo(
    () => availableDestinyTrees(allTrees, build, bundle.allClasses, race),
    [allTrees, build, bundle.allClasses, race],
  )

  // V2 Tier-5 lock: only the tree holding a trained Tier-5 may train more
  // Tier-5s. This tree is also the "active"/primary destiny (V2 Tier5Tree).
  const lockedTier5Tree = useMemo(
    () => tier5LockedTree(selectedDestinyTrees, destinyChoices, allTrees),
    [selectedDestinyTrees, destinyChoices, allTrees],
  )

  // Keep build.activeEpicDestiny in sync with the Tier-5 tree (V2: Tier5Tree is
  // exported/imported as the active destiny).
  useEffect(() => {
    if ((build.activeEpicDestiny ?? '') !== lockedTier5Tree) {
      dispatch({ type: 'SET_ACTIVE_DESTINY', name: lockedTier5Tree })
    }
  }, [lockedTier5Tree, build.activeEpicDestiny, dispatch])
  const activeEpicDestiny = lockedTier5Tree

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

  // Destiny points are a single shared pool spent across ALL selected trees;
  // there is no per-tree cap. V2 BreakdownItemDestinyAps sums:
  //   level-based pool + floor(fatePoints/3) + DestinyAPBonus effects.
  const fatePoints = Math.max(0, Math.round(stats.total('fatePoint')))
  const destinyApBonus = Math.max(0, Math.round(stats.total('destinyAP')))
  const destinyPool = useMemo(
    () => destinyPointPool(build.totalLevel, fatePoints) + destinyApBonus,
    [build.totalLevel, fatePoints, destinyApBonus],
  )
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
    // V2: a slot's tree can only be changed when it has no AP spent.
    const current = selectedDestinyTrees[slot]
    if (current && (destinyChoices[current] ? computeTreeSpent(allTrees.find(t => t.Name === current)!, destinyChoices[current]) : 0) > 0) {
      return
    }
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

  function handleSelectionsChange(treeName: string, updated: Record<string, string>) {
    dispatch({ type: 'SET_DESTINY_SELECTIONS', treeName, selections: updated })
  }

  function handleReset(treeName: string) {
    dispatch({ type: 'RESET_DESTINY_TREE', treeName })
  }

  // ── Render guard ──────────────────────────────────────────────────────────

  const tooLow = build.totalLevel < 20

  if (loading) return <div className="panel"><div className="panel-header">Epic Destinies</div><div className="panel-body"><div className={styles.statusMsg}>Loading…</div></div></div>
  if (tooLow)  return <div className="panel"><div className="panel-header">Epic Destinies</div><div className="panel-body"><div className={styles.statusMsg}>Epic Destinies unlock at level 20.</div></div></div>

  // ── Full panel ────────────────────────────────────────────────────────────

  return (
    <div className="panel">
      <div className="panel-header">Epic Destinies</div>
      <div className="panel-body" style={{ padding: 0 }}>

        {/* ── Destiny slot selectors ────────────────────────────────────── */}
        <div className={styles.slotSection}>
          <div className={styles.slotSectionTitle}>Select Destiny Trees (up to 3)</div>
          <div className={styles.slotRows}>
            {([0, 1, 2] as const).map(slot => {
              const currentName = selectedDestinyTrees[slot]
              const otherSelected = selectedDestinyTrees.filter((_, i) => i !== slot)
              const slotSpent = currentName
                ? computeTreeSpent(allTrees.find(t => t.Name === currentName) ?? { EnhancementTreeItem: [] } as unknown as EnhancementTree, destinyChoices[currentName] ?? {})
                : 0
              const locked = slotSpent > 0   // V2: can't change a slot with AP spent
              return (
                <div key={slot} className={styles.slotRow}>
                  <span className={styles.slotLabel}>Destiny {slot + 1}</span>
                  <select
                    className={styles.slotSelect}
                    value={currentName}
                    disabled={locked}
                    title={locked ? 'Reset this tree before changing it' : undefined}
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
                  {currentName && activeEpicDestiny === currentName && (
                    <span className={styles.activeBtnOn} title="Primary destiny (holds Tier-5 enhancements)">⚡ Primary</span>
                  )}
                  {locked && (
                    <button className={styles.resetBtn} onClick={() => handleReset(currentName)} title="Reset this tree to change the slot">Reset</button>
                  )}
                </div>
              )
            })}
          </div>
          {lockedTier5Tree && (
            <div className={styles.slotSectionTitle} style={{ opacity: 0.8 }}>
              Tier-5 locked to <strong>{lockedTier5Tree}</strong> — other trees' Tier-5s are unavailable until it is reset.
            </div>
          )}
        </div>

        {/* ── Twists of Fate ───────────────────────────────────────────── */}
        {selectedSlots.length > 0 && (() => {
          const candidates = availableTwistItems(availableForSelect)
          const byTree = availableForSelect.map(t => ({
            treeName: t.Name,
            items: candidates.filter(c => c.treeName === t.Name),
          })).filter(g => g.items.length > 0)
          const twistChoices = build.twistChoices ?? ['', '', '', '', '']
          return (
            <div className={styles.twistsSection}>
              <div className={styles.slotSectionTitle} style={{ padding: '8px 12px 4px' }}>
                Twists of Fate (up to 5)
              </div>
              <div className={styles.slotRows} style={{ padding: '0 12px 8px' }}>
                {([0, 1, 2, 3, 4] as const).map(slot => (
                  <div key={slot} className={styles.slotRow}>
                    <span className={styles.slotLabel}>Twist {slot + 1}</span>
                    <select
                      className={styles.slotSelect}
                      value={twistChoices[slot] ?? ''}
                      onChange={e => dispatch({ type: 'SET_TWIST_CHOICE', slot, value: e.target.value })}
                    >
                      <option value="">— None —</option>
                      {byTree.map(g => (
                        <optgroup key={g.treeName} label={g.treeName}>
                          {g.items.map(c => (
                            <option key={c.key} value={c.key}>{c.item.Name}</option>
                          ))}
                        </optgroup>
                      ))}
                    </select>
                  </div>
                ))}
              </div>
            </div>
          )
        })()}

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
                    selections={build.destinySelections?.[viewedTree.Name] ?? {}}
                    totalSpentAllTrees={totalSpentAllTrees}
                    totalAP={destinyPool}
                    tier5Locked={lockedTier5Tree !== '' && lockedTier5Tree !== viewedTree.Name}
                    build={build}
                    allClasses={bundle.allClasses}
                    race={race}
                    onChoicesChange={(updated) => handleChoicesChange(viewedTree.Name, updated)}
                    onSelectionsChange={(updated) => handleSelectionsChange(viewedTree.Name, updated)}
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
