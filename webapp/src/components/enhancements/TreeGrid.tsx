import { useState } from 'react'
import type { EnhancementSelection, EnhancementTree, EnhancementTreeItem } from '../../types/ddo'
import DdoIcon from '../DdoIcon'
import styles from './TreeGrid.module.css'

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
  const out: number[] = []
  for (let i = 0; i < maxRanks; i++) {
    out.push(parts[i] ?? parts[parts.length - 1])
  }
  return out
}

function costUpToRank(item: EnhancementTreeItem, targetRank: number): number {
  const maxRanks = item.Ranks ?? 1
  const costs = parseCosts(item.CostPerRank, maxRanks)
  return costs.slice(0, targetRank).reduce((a, b) => a + b, 0)
}

function nextRankCost(item: EnhancementTreeItem, currentRank: number): number {
  const maxRanks = item.Ranks ?? 1
  const costs = parseCosts(item.CostPerRank, maxRanks)
  return costs[currentRank] ?? 1
}

/** Get all options from the first Selector on an item. */
function getSelectorOptions(item: EnhancementTreeItem): EnhancementSelection[] {
  if (!item.Selector || item.Selector.length === 0) return []
  const group = item.Selector[0]
  const raw = group.EnhancementSelection
  return Array.isArray(raw) ? raw : raw ? [raw] : []
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type TreeChoices = Record<string, number>
export type TreeSelections = Record<string, string>

// ---------------------------------------------------------------------------
// Tier / Core constants
// DDO data: YPosition=0 → Core row (sequential AP gates)
//           YPosition=1 → T1, 2→T2, 3→T3, 4→T4, 5→T5
// ---------------------------------------------------------------------------
const CORE_Y = 0
const TIER_LABELS: Record<number, string> = {
  1: 'T1', 2: 'T2', 3: 'T3', 4: 'T4', 5: 'T5',
}
const CELL_SIZE = 68

// ---------------------------------------------------------------------------
// Selector picker modal
// ---------------------------------------------------------------------------

interface SelectorPickerProps {
  options: EnhancementSelection[]
  onSelect: (name: string) => void
  onClose: () => void
}

function SelectorPicker({ options, onSelect, onClose }: SelectorPickerProps) {
  return (
    <div className={styles.selectorOverlay} onClick={onClose}>
      <div className={styles.selectorModal} onClick={e => e.stopPropagation()}>
        <div className={styles.selectorHeader}>Choose an option</div>
        <div className={styles.selectorGrid}>
          {options.map(opt => (
            <button
              key={opt.Name}
              className={styles.selectorOption}
              title={opt.Name + (opt.Description ? '\n\n' + opt.Description : '')}
              onClick={() => { onSelect(opt.Name); onClose() }}
            >
              <DdoIcon
                category="EnhancementImages"
                name={opt.Icon ?? opt.Name}
                size={32}
                className={styles.selectorIcon}
              />
              <span className={styles.selectorName}>{opt.Name}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Enhancement cell
// ---------------------------------------------------------------------------

interface CellProps {
  item: EnhancementTreeItem
  rank: number
  selectedOption: string | undefined
  treeSpent: number
  totalSpent: number
  totalAP: number
  isCore: boolean
  coreUnlocked?: boolean
  onIncrement: () => void
  onDecrement: () => void
  onShowSelector: () => void
}

function EnhancementCell({
  item, rank, selectedOption, treeSpent, totalSpent, totalAP,
  isCore, coreUnlocked = true, onIncrement, onDecrement, onShowSelector,
}: CellProps) {
  const maxRanks = item.Ranks ?? 1
  const minSpent = item.MinSpent ?? 0
  const locked = treeSpent < minSpent || (isCore && !coreUnlocked)
  const atMax = rank >= maxRanks
  const cost = nextRankCost(item, rank)
  const canAfford = (totalAP - totalSpent) >= cost
  const canBuy = !locked && !atMax && canAfford
  const canSell = rank > 0

  const options = getSelectorOptions(item)
  const hasSelector = options.length > 0
  const activeOption = hasSelector
    ? options.find(o => o.Name === selectedOption) ?? null
    : null

  const displayIcon = activeOption?.Icon ?? item.Icon ?? item.Name
  const displayName = activeOption?.Name ?? item.Name

  const totalCost = costUpToRank(item, rank)
  const tooltip = [
    displayName,
    item.Description ?? '',
    `Cost: ${cost} AP${maxRanks > 1 ? ` per rank (${totalCost} total)` : ''}`,
    minSpent > 0 ? `Requires ${minSpent} AP spent in tree` : '',
    isCore && !coreUnlocked ? 'Requires previous core enhancement' : '',
    hasSelector && !selectedOption ? 'Click to choose an option' : '',
  ].filter(Boolean).join('\n')

  let cellClass = `${styles.cell} ${isCore ? styles.coreCell : styles.tierCell}`
  if (locked) cellClass += ` ${styles.locked}`
  else if (rank > 0) cellClass += ` ${styles.active}`
  else if (canBuy || (hasSelector && !selectedOption)) cellClass += ` ${styles.available}`
  else cellClass += ` ${styles.unavailable}`

  function handleClick() {
    if (locked) return
    if (hasSelector && !selectedOption && !atMax) {
      onShowSelector()
      return
    }
    if (canBuy) onIncrement()
  }

  return (
    <div
      className={cellClass}
      title={tooltip}
      onClick={handleClick}
      onContextMenu={canSell ? (e) => { e.preventDefault(); onDecrement() } : undefined}
    >
      {item.ArrowRight && <span className={styles.arrowRight} aria-hidden>›</span>}
      {item.ArrowUp && <span className={styles.arrowUp} aria-hidden>↑</span>}

      <div className={styles.cellIconWrap}>
        <DdoIcon
          category="EnhancementImages"
          name={displayIcon}
          size={isCore ? 24 : 28}
          className={`${styles.cellIcon} ${rank > 0 ? styles.cellIconActive : ''}`}
        />
        {locked && <span className={styles.lockOverlay}>🔒</span>}
        {hasSelector && !selectedOption && !locked && (
          <span className={styles.selectorBadge}>▾</span>
        )}
      </div>

      {maxRanks > 1 && (
        <div className={styles.rankRow}>
          {Array.from({ length: maxRanks }, (_, i) => (
            <span key={i} className={i < rank ? styles.rankPipFilled : styles.rankPipEmpty} />
          ))}
        </div>
      )}

      <div className={styles.costLabel}>
        {atMax ? '✓' : `${cost} AP`}
      </div>

      {canSell && (
        <button
          className={styles.decrementBtn}
          onClick={(e) => { e.stopPropagation(); onDecrement() }}
          title="Remove rank"
          tabIndex={-1}
        >
          −
        </button>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// TreeGrid
// ---------------------------------------------------------------------------

interface TreeGridProps {
  tree: EnhancementTree
  choices: TreeChoices
  selections: TreeSelections
  totalSpentAllTrees: number
  totalAP?: number
  onChoicesChange: (updated: TreeChoices) => void
  onSelectionsChange: (updated: TreeSelections) => void
}

export default function TreeGrid({
  tree, choices, selections, totalSpentAllTrees, totalAP = 80,
  onChoicesChange, onSelectionsChange,
}: TreeGridProps) {
  const [selectorTarget, setSelectorTarget] = useState<string | null>(null)

  const items = tree.EnhancementTreeItem ?? []
  if (items.length === 0) {
    return <div className={styles.empty}>No enhancements found for this tree.</div>
  }

  const treeSpent = items.reduce((sum, item) => {
    return sum + costUpToRank(item, choices[item.Name] ?? 0)
  }, 0)

  const coreItems = items
    .filter(it => (it.YPosition ?? 0) === CORE_Y)
    .sort((a, b) => (a.XPosition ?? 0) - (b.XPosition ?? 0))
  const tierItems = items.filter(it => (it.YPosition ?? 0) !== CORE_Y)
  const tierRows = Array.from(new Set(tierItems.map(it => it.YPosition ?? 1))).sort((a, b) => b - a)
  const maxX = items.reduce((m, it) => Math.max(m, it.XPosition ?? 0), 0)
  const gridCols = maxX + 1

  function coreIsUnlocked(item: EnhancementTreeItem): boolean {
    const idx = coreItems.findIndex(c => c.Name === item.Name)
    if (idx <= 0) return true
    const prev = coreItems[idx - 1]
    return (choices[prev.Name] ?? 0) >= (prev.Ranks ?? 1)
  }

  function handleIncrement(item: EnhancementTreeItem) {
    const rank = choices[item.Name] ?? 0
    const maxRanks = item.Ranks ?? 1
    if (rank >= maxRanks) return
    const minSpent = item.MinSpent ?? 0
    if (treeSpent < minSpent) return
    const cost = nextRankCost(item, rank)
    if ((totalAP - totalSpentAllTrees) < cost) return
    const isCore = (item.YPosition ?? 0) === CORE_Y
    if (isCore && !coreIsUnlocked(item)) return

    // Selector: require a choice before first purchase
    const options = getSelectorOptions(item)
    if (options.length > 0 && !selections[item.Name]) {
      setSelectorTarget(item.Name)
      return
    }

    onChoicesChange({ ...choices, [item.Name]: rank + 1 })
  }

  function handleDecrement(item: EnhancementTreeItem) {
    const rank = choices[item.Name] ?? 0
    if (rank <= 0) return
    const isCore = (item.YPosition ?? 0) === CORE_Y
    if (isCore) {
      const idx = coreItems.findIndex(c => c.Name === item.Name)
      if (coreItems.slice(idx + 1).some(c => (choices[c.Name] ?? 0) > 0)) return
    }
    const newRank = rank - 1
    onChoicesChange({ ...choices, [item.Name]: newRank })
    // Clear selection when all ranks sold
    if (newRank === 0 && selections[item.Name]) {
      const next = { ...selections }
      delete next[item.Name]
      onSelectionsChange(next)
    }
  }

  function handleSelection(itemName: string, optionName: string) {
    const item = items.find(it => it.Name === itemName)
    if (!item) return
    // Record selection then buy rank 1
    onSelectionsChange({ ...selections, [itemName]: optionName })
    const rank = choices[itemName] ?? 0
    const cost = nextRankCost(item, rank)
    if ((totalAP - totalSpentAllTrees) >= cost) {
      onChoicesChange({ ...choices, [itemName]: rank + 1 })
    }
  }

  const selectorItem = selectorTarget ? items.find(it => it.Name === selectorTarget) : null
  const selectorOptions = selectorItem ? getSelectorOptions(selectorItem) : []

  const bgName = tree.Background
  const bgStyle = bgName && bgName !== 'NoTreeBackground'
    ? {
        backgroundImage: `linear-gradient(rgba(8,4,0,0.58), rgba(8,4,0,0.58)), url(/images/UIImages/${bgName}.png)`,
        backgroundSize: 'cover',
        backgroundPosition: 'center top',
        backgroundRepeat: 'no-repeat',
      }
    : undefined

  return (
    <div className={styles.gridWrapper} style={bgStyle}>
      {/* Tier rows T5→T1 (descending so T5 is at top, T1 just above Core) */}
      {tierRows.map(yVal => {
        const rowItems = tierItems.filter(it => (it.YPosition ?? 0) === yVal)
        const label = TIER_LABELS[yVal] ?? `T${yVal}`
        return (
          <div key={`tier-${yVal}`} className={styles.tierRow}>
            <div className={styles.tierLabel}>{label}</div>
            <div className={styles.cellRow}
              style={{ gridTemplateColumns: `repeat(${gridCols}, ${CELL_SIZE}px)` }}>
              {Array.from({ length: gridCols }, (_, col) => {
                const item = rowItems.find(it => (it.XPosition ?? 0) === col)
                if (!item) return <div key={col} className={styles.cellEmpty} />
                return (
                  <EnhancementCell
                    key={item.Name}
                    item={item}
                    rank={choices[item.Name] ?? 0}
                    selectedOption={selections[item.Name]}
                    treeSpent={treeSpent}
                    totalSpent={totalSpentAllTrees}
                    totalAP={totalAP}
                    isCore={false}
                    onIncrement={() => handleIncrement(item)}
                    onDecrement={() => handleDecrement(item)}
                    onShowSelector={() => setSelectorTarget(item.Name)}
                  />
                )
              })}
            </div>
          </div>
        )
      })}

      {/* Core row */}
      {coreItems.length > 0 && (
        <div className={styles.tierRow}>
          <div className={`${styles.tierLabel} ${styles.coreTierLabel}`}>Core</div>
          <div className={styles.cellRow}
            style={{ gridTemplateColumns: `repeat(${gridCols}, ${CELL_SIZE}px)` }}>
            {Array.from({ length: gridCols }, (_, col) => {
              const item = coreItems.find(it => (it.XPosition ?? 0) === col)
              if (!item) return <div key={col} className={styles.cellEmpty} />
              return (
                <EnhancementCell
                  key={item.Name}
                  item={item}
                  rank={choices[item.Name] ?? 0}
                  selectedOption={selections[item.Name]}
                  treeSpent={treeSpent}
                  totalSpent={totalSpentAllTrees}
                  totalAP={totalAP}
                  isCore={true}
                  coreUnlocked={coreIsUnlocked(item)}
                  onIncrement={() => handleIncrement(item)}
                  onDecrement={() => handleDecrement(item)}
                  onShowSelector={() => setSelectorTarget(item.Name)}
                />
              )
            })}
          </div>
        </div>
      )}

      {selectorTarget && selectorOptions.length > 0 && (
        <SelectorPicker
          options={selectorOptions}
          onSelect={name => handleSelection(selectorTarget, name)}
          onClose={() => setSelectorTarget(null)}
        />
      )}
    </div>
  )
}
