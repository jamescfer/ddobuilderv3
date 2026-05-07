import type { EnhancementTree, EnhancementTreeItem } from '../../types/ddo'
import styles from './TreeGrid.module.css'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Parse CostPerRank string into an array of per-rank costs.
 *  e.g. "1" → [1], "2 2 2" → [2,2,2], "1 2 3" → [1,2,3]
 */
function parseCosts(costPerRank: string | undefined, maxRanks: number): number[] {
  if (!costPerRank) return Array(maxRanks).fill(1)
  const parts = costPerRank.trim().split(/\s+/).map(Number)
  if (parts.length === 1) return Array(maxRanks).fill(parts[0])
  // Pad or truncate to maxRanks
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
  onIncrement: () => void
  onDecrement: () => void
}

function EnhancementCell({ item, rank, treeSpent, totalSpent, totalAP, onIncrement, onDecrement }: CellProps) {
  const maxRanks = item.Ranks ?? 1
  const minSpent = item.MinSpent ?? 0
  const locked = treeSpent < minSpent
  const atMax = rank >= maxRanks
  const cost = nextRankCost(item, rank)
  const apRemaining = totalAP - totalSpent
  const canAfford = apRemaining >= cost
  const canBuy = !locked && !atMax && canAfford
  const canSell = rank > 0

  // Determine CSS state
  let cellClass = styles.cell
  if (locked) cellClass += ` ${styles.locked}`
  else if (rank > 0) cellClass += ` ${styles.active}`
  else cellClass += ` ${styles.available}`

  // Truncate long names
  const displayName = item.Name.length > 18 ? item.Name.slice(0, 16) + '…' : item.Name

  // Show cost as what you'd pay for next rank (or total cost at rank 0)
  const costLabel = atMax ? '✓' : `${cost} AP`

  return (
    <div
      className={cellClass}
      style={{
        gridColumn: (item.XPosition ?? 0) + 1,
        gridRow: (item.YPosition ?? 0) + 1,
        position: 'relative',
      }}
      title={`${item.Name}${item.Description ? '\n' + item.Description : ''}${minSpent > 0 ? '\nRequires ' + minSpent + ' AP spent in tree' : ''}`}
      onClick={canBuy ? onIncrement : undefined}
      onContextMenu={canSell ? (e) => { e.preventDefault(); onDecrement() } : undefined}
    >
      {/* Arrow connectors */}
      {item.ArrowRight && <span className={styles.arrowRight} aria-hidden>›</span>}
      {item.ArrowUp && <span className={styles.arrowUp} aria-hidden>↑</span>}

      <div className={styles.cellName}>{displayName}</div>

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

      <div className={styles.cellMeta}>
        {maxRanks > 1 && <span className={styles.rankText}>{rank}/{maxRanks}</span>}
        <span className={styles.costText}>{costLabel}</span>
      </div>

      {canSell && (
        <button
          className={styles.decrementBtn}
          onClick={(e) => { e.stopPropagation(); onDecrement() }}
          title="Remove rank (right-click also works)"
          tabIndex={-1}
        >
          −
        </button>
      )}

      {locked && minSpent > 0 && (
        <div className={styles.lockBadge} title={`Requires ${minSpent} AP in tree`}>
          🔒
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// TreeGrid
// ---------------------------------------------------------------------------

export interface TreeChoices {
  /** itemName → ranks spent */
  [itemName: string]: number
}

interface TreeGridProps {
  tree: EnhancementTree
  choices: TreeChoices
  totalSpentAllTrees: number
  totalAP?: number
  onChoicesChange: (updated: TreeChoices) => void
}

export default function TreeGrid({ tree, choices, totalSpentAllTrees, totalAP = 80, onChoicesChange }: TreeGridProps) {
  const items = tree.EnhancementTreeItem ?? []

  // AP spent in this tree
  const treeSpent = items.reduce((sum, item) => {
    const rank = choices[item.Name] ?? 0
    return sum + costUpToRank(item, rank)
  }, 0)

  const apRemaining = totalAP - totalSpentAllTrees

  if (items.length === 0) {
    return <div className={styles.empty}>No enhancements found for this tree.</div>
  }

  // Determine grid dimensions from item positions
  const maxCol = items.reduce((m, it) => Math.max(m, it.XPosition ?? 0), 0)
  const maxRow = items.reduce((m, it) => Math.max(m, it.YPosition ?? 0), 0)

  function handleIncrement(item: EnhancementTreeItem) {
    const rank = choices[item.Name] ?? 0
    const maxRanks = item.Ranks ?? 1
    const minSpent = item.MinSpent ?? 0
    const cost = nextRankCost(item, rank)
    if (rank >= maxRanks) return
    if (treeSpent < minSpent) return
    if (apRemaining < cost) return
    onChoicesChange({ ...choices, [item.Name]: rank + 1 })
  }

  function handleDecrement(item: EnhancementTreeItem) {
    const rank = choices[item.Name] ?? 0
    if (rank <= 0) return
    onChoicesChange({ ...choices, [item.Name]: rank - 1 })
  }

  return (
    <div
      className={styles.grid}
      style={{
        gridTemplateColumns: `repeat(${maxCol + 1}, 100px)`,
        gridTemplateRows: `repeat(${maxRow + 1}, 70px)`,
      }}
    >
      {items.map(item => (
        <EnhancementCell
          key={item.Name}
          item={item}
          rank={choices[item.Name] ?? 0}
          treeSpent={treeSpent}
          totalSpent={totalSpentAllTrees}
          totalAP={totalAP}
          onIncrement={() => handleIncrement(item)}
          onDecrement={() => handleDecrement(item)}
        />
      ))}
    </div>
  )
}
