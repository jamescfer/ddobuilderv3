import type { EnhancementTree, EnhancementTreeItem } from '../../types/ddo'
import DdoIcon from '../DdoIcon'
import styles from './TreeGrid.module.css'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Normalize CostPerRank which may be a plain string/number or a {#text, size} object from fast-xml-parser. */
function normalizeCostPerRank(raw: unknown): string | undefined {
  if (raw == null) return undefined
  if (typeof raw === 'number') return String(raw)
  if (typeof raw === 'string') return raw
  if (typeof raw === 'object' && '#text' in (raw as object)) {
    const t = (raw as Record<string, unknown>)['#text']
    return t != null ? String(t) : undefined
  }
  return undefined
}

/** Parse CostPerRank into an array of per-rank costs. */
function parseCosts(costPerRank: unknown, maxRanks: number): number[] {
  const str = normalizeCostPerRank(costPerRank)
  if (!str) return Array(maxRanks).fill(1)
  const parts = str.trim().split(/\s+/).map(Number)
  if (parts.length === 1) return Array(maxRanks).fill(parts[0])
  const out: number[] = []
  for (let i = 0; i < maxRanks; i++) {
    out.push(parts[i] ?? parts[parts.length - 1])
  }
  return out
}

/** Total AP cost to reach a given number of ranks. */
function costUpToRank(item: EnhancementTreeItem, targetRank: number): number {
  const maxRanks = item.Ranks ?? 1
  const costs = parseCosts(item.CostPerRank, maxRanks)
  return costs.slice(0, targetRank).reduce((a, b) => a + b, 0)
}

/** AP cost for the next rank. */
function nextRankCost(item: EnhancementTreeItem, currentRank: number): number {
  const maxRanks = item.Ranks ?? 1
  const costs = parseCosts(item.CostPerRank, maxRanks)
  return costs[currentRank] ?? 1
}

// ---------------------------------------------------------------------------
// Sub-component: a single enhancement cell
// ---------------------------------------------------------------------------

interface CellProps {
  item: EnhancementTreeItem
  rank: number
  treeSpent: number
  totalSpent: number
  totalAP: number
  isCore: boolean
  coreUnlocked?: boolean
  onIncrement: () => void
  onDecrement: () => void
}

function EnhancementCell({ item, rank, treeSpent, totalSpent, totalAP, isCore, coreUnlocked = true, onIncrement, onDecrement }: CellProps) {
  const maxRanks = item.Ranks ?? 1
  const minSpent = item.MinSpent ?? 0
  const locked = treeSpent < minSpent || (isCore && !coreUnlocked)
  const atMax = rank >= maxRanks
  const cost = nextRankCost(item, rank)
  const apRemaining = totalAP - totalSpent
  const canAfford = apRemaining >= cost
  const canBuy = !locked && !atMax && canAfford
  const canSell = rank > 0

  const totalCost = costUpToRank(item, rank)

  // Build tooltip
  const tooltip = [
    item.Name,
    item.Description ? item.Description : '',
    `Cost: ${cost} AP${maxRanks > 1 ? ` per rank (${totalCost} total)` : ''}`,
    minSpent > 0 ? `Requires ${minSpent} AP spent in tree` : '',
    isCore && !coreUnlocked ? 'Requires previous core enhancement' : '',
  ].filter(Boolean).join('\n')

  let cellClass = `${styles.cell} ${isCore ? styles.coreCell : styles.tierCell}`
  if (locked) cellClass += ` ${styles.locked}`
  else if (rank > 0) cellClass += ` ${styles.active}`
  else if (canBuy) cellClass += ` ${styles.available}`
  else cellClass += ` ${styles.unavailable}`

  return (
    <div
      className={cellClass}
      title={tooltip}
      onClick={canBuy ? onIncrement : undefined}
      onContextMenu={canSell ? (e) => { e.preventDefault(); onDecrement() } : undefined}
    >
      {/* Arrow connectors */}
      {item.ArrowRight && <span className={styles.arrowRight} aria-hidden>›</span>}
      {item.ArrowUp && <span className={styles.arrowUp} aria-hidden>↑</span>}

      {/* Icon */}
      <div className={styles.cellIconWrap}>
        <DdoIcon
          category="EnhancementImages"
          name={item.Icon ?? item.Name}
          size={isCore ? 46 : 54}
          className={`${styles.cellIcon} ${rank > 0 ? styles.cellIconActive : ''}`}
        />
        {locked && (
          <span className={styles.lockOverlay}>🔒</span>
        )}
      </div>

      {/* Rank pips */}
      {maxRanks > 1 && (
        <div className={styles.rankRow}>
          {Array.from({ length: maxRanks }, (_, i) => (
            <span
              key={i}
              className={i < rank ? styles.rankPipFilled : styles.rankPipEmpty}
            />
          ))}
        </div>
      )}

      {/* Cost label */}
      <div className={styles.costLabel}>
        {atMax ? '✓' : `${cost} AP`}
      </div>

      {/* Decrement button */}
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

export interface TreeChoices {
  [itemName: string]: number
}

interface TreeGridProps {
  tree: EnhancementTree
  choices: TreeChoices
  totalSpentAllTrees: number
  totalAP?: number
  onChoicesChange: (updated: TreeChoices) => void
}

// DDO tier row labels (Y=0 is the highest tier in the XML → displayed at top)
// Core items sit below all tier rows.
const TIER_LABELS: Record<number, string> = {
  0: 'T5',
  1: 'T4',
  2: 'T3',
  3: 'T2',
  4: 'T1',
}

const CELL_SIZE = 90
const CORE_Y_THRESHOLD = 5 // YPosition >= this value is treated as a core row

export default function TreeGrid({ tree, choices, totalSpentAllTrees, totalAP = 80, onChoicesChange }: TreeGridProps) {
  const items = tree.EnhancementTreeItem ?? []

  const treeSpent = items.reduce((sum, item) => {
    const rank = choices[item.Name] ?? 0
    return sum + costUpToRank(item, rank)
  }, 0)

  const apRemaining = totalAP - totalSpentAllTrees

  if (items.length === 0) {
    return <div className={styles.empty}>No enhancements found for this tree.</div>
  }

  const maxY = items.reduce((m, it) => Math.max(m, it.YPosition ?? 0), 0)
  const maxX = items.reduce((m, it) => Math.max(m, it.XPosition ?? 0), 0)

  // Separate core vs tier items
  const tierItems = items.filter(it => (it.YPosition ?? 0) < CORE_Y_THRESHOLD)
  const coreItems = items
    .filter(it => (it.YPosition ?? 0) >= CORE_Y_THRESHOLD)
    .sort((a, b) => (a.XPosition ?? 0) - (b.XPosition ?? 0))

  // Unique tier Y values (ascending), used to build label rows
  const tierRows = Array.from(new Set(tierItems.map(it => it.YPosition ?? 0))).sort((a, b) => a - b)

  /** Cores require each preceding core to be fully purchased first. */
  function coreIsUnlocked(item: EnhancementTreeItem): boolean {
    const idx = coreItems.findIndex(c => c.Name === item.Name)
    if (idx <= 0) return true
    const prev = coreItems[idx - 1]
    return (choices[prev.Name] ?? 0) >= (prev.Ranks ?? 1)
  }

  function handleIncrement(item: EnhancementTreeItem) {
    const rank = choices[item.Name] ?? 0
    const maxRanks = item.Ranks ?? 1
    const minSpent = item.MinSpent ?? 0
    const cost = nextRankCost(item, rank)
    if (rank >= maxRanks) return
    if (treeSpent < minSpent) return
    if (apRemaining < cost) return
    const isCore = (item.YPosition ?? 0) >= CORE_Y_THRESHOLD
    if (isCore && !coreIsUnlocked(item)) return
    onChoicesChange({ ...choices, [item.Name]: rank + 1 })
  }

  function handleDecrement(item: EnhancementTreeItem) {
    const rank = choices[item.Name] ?? 0
    if (rank <= 0) return
    // Prevent removing a core if a later core has been purchased
    const isCore = (item.YPosition ?? 0) >= CORE_Y_THRESHOLD
    if (isCore) {
      const idx = coreItems.findIndex(c => c.Name === item.Name)
      const laterCoresBought = coreItems.slice(idx + 1).some(c => (choices[c.Name] ?? 0) > 0)
      if (laterCoresBought) return
    }
    onChoicesChange({ ...choices, [item.Name]: rank - 1 })
  }

  const gridCols = maxX + 1

  return (
    <div className={styles.gridWrapper}>
      {/* Tier rows — displayed top to bottom: highest Y-value tier first (DDO order: T5→T1) */}
      {[...tierRows].reverse().map(yVal => {
        const rowItems = tierItems.filter(it => (it.YPosition ?? 0) === yVal)
        const label = TIER_LABELS[yVal] ?? `T${5 - yVal}`
        return (
          <div key={`tier-${yVal}`} className={styles.tierRow}>
            <div className={styles.tierLabel}>{label}</div>
            <div
              className={styles.cellRow}
              style={{ gridTemplateColumns: `repeat(${gridCols}, ${CELL_SIZE}px)` }}
            >
              {Array.from({ length: gridCols }, (_, col) => {
                const item = rowItems.find(it => (it.XPosition ?? 0) === col)
                if (!item) return <div key={col} className={styles.cellEmpty} />
                return (
                  <EnhancementCell
                    key={item.Name}
                    item={item}
                    rank={choices[item.Name] ?? 0}
                    treeSpent={treeSpent}
                    totalSpent={totalSpentAllTrees}
                    totalAP={totalAP}
                    isCore={false}
                    onIncrement={() => handleIncrement(item)}
                    onDecrement={() => handleDecrement(item)}
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
          <div
            className={styles.cellRow}
            style={{ gridTemplateColumns: `repeat(${gridCols}, ${CELL_SIZE}px)` }}
          >
            {Array.from({ length: gridCols }, (_, col) => {
              const item = coreItems.find(it => (it.XPosition ?? 0) === col)
              if (!item) return <div key={col} className={styles.cellEmpty} />
              return (
                <EnhancementCell
                  key={item.Name}
                  item={item}
                  rank={choices[item.Name] ?? 0}
                  treeSpent={treeSpent}
                  totalSpent={totalSpentAllTrees}
                  totalAP={totalAP}
                  isCore={true}
                  coreUnlocked={coreIsUnlocked(item)}
                  onIncrement={() => handleIncrement(item)}
                  onDecrement={() => handleDecrement(item)}
                />
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
