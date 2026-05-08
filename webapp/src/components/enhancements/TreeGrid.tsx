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
// Layout constants — matches v2 DDOBuilder canvas (299×466px, scaled ~1.15×)
// Core (Y=0): smaller cells at bottom; Tiers (Y=1..5): larger cells above
// ---------------------------------------------------------------------------
const CORE_Y = 0

// Tier cell
const T_W = 52          // cell width
const T_H = 60          // cell height
const T_COL = 56        // horizontal step (cell + gap)
const T_ROW = 70        // vertical step between tier rows

// Core cell
const C_W = 44          // core cell width
const C_H = 50          // core cell height
const C_COL = 50        // horizontal step for core cells

// Canvas padding
const PAD_X = 8
const PAD_Y = 6
const CORE_GAP = 6      // gap between bottom tier row and core row

// ---------------------------------------------------------------------------
// Canvas sizing
// ---------------------------------------------------------------------------

interface CanvasLayout {
  width: number
  height: number
  maxTierY: number
  maxTierX: number
  maxCoreX: number
}

function computeLayout(items: EnhancementTreeItem[]): CanvasLayout {
  const tierItems = items.filter(it => (it.YPosition ?? 0) !== CORE_Y)
  const coreItems = items.filter(it => (it.YPosition ?? 0) === CORE_Y)

  const maxTierX = tierItems.reduce((m, it) => Math.max(m, it.XPosition ?? 0), 0)
  const maxCoreX = coreItems.reduce((m, it) => Math.max(m, it.XPosition ?? 0), 0)
  const maxTierY = tierItems.reduce((m, it) => Math.max(m, it.YPosition ?? 1), 1)

  const tierColsNeeded = Math.max(maxTierX + 1, 1)
  const coreColsNeeded = Math.max(maxCoreX + 1, 1)
  const tierWidth = PAD_X * 2 + tierColsNeeded * T_COL
  const coreWidth = PAD_X * 2 + coreColsNeeded * C_COL
  const width = Math.max(tierWidth, coreWidth)

  const tierAreaH = maxTierY * T_ROW + T_H
  const height = coreItems.length > 0
    ? PAD_Y + tierAreaH + CORE_GAP + C_H + PAD_Y
    : PAD_Y + tierAreaH + PAD_Y

  return { width, height, maxTierY, maxTierX, maxCoreX }
}

function itemPos(item: EnhancementTreeItem, layout: CanvasLayout): { left: number; top: number } {
  const y = item.YPosition ?? 0
  const x = item.XPosition ?? 0
  if (y === CORE_Y) {
    return {
      left: PAD_X + x * C_COL,
      top: PAD_Y + layout.maxTierY * T_ROW + T_H + CORE_GAP,
    }
  }
  return {
    left: PAD_X + x * T_COL,
    top: PAD_Y + (layout.maxTierY - y) * T_ROW,
  }
}

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
  pos: { left: number; top: number }
  onIncrement: () => void
  onDecrement: () => void
  onShowSelector: () => void
}

function EnhancementCell({
  item, rank, selectedOption, treeSpent, totalSpent, totalAP,
  isCore, coreUnlocked = true, pos, onIncrement, onDecrement, onShowSelector,
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

  const w = isCore ? C_W : T_W
  const h = isCore ? C_H : T_H

  let stateClass = ''
  if (locked) stateClass = styles.locked
  else if (rank > 0) stateClass = styles.active
  else if (canBuy || (hasSelector && !selectedOption)) stateClass = styles.available
  else stateClass = styles.unavailable

  const cellClass = [
    styles.cell,
    isCore ? styles.coreCell : styles.tierCell,
    stateClass,
  ].join(' ')

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
      style={{ left: pos.left, top: pos.top, width: w, height: h }}
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

  const layout = computeLayout(items)

  const treeSpent = items.reduce((sum, item) => {
    return sum + costUpToRank(item, choices[item.Name] ?? 0)
  }, 0)

  const coreItems = items
    .filter(it => (it.YPosition ?? 0) === CORE_Y)
    .sort((a, b) => (a.XPosition ?? 0) - (b.XPosition ?? 0))

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
    if (newRank === 0 && selections[item.Name]) {
      const next = { ...selections }
      delete next[item.Name]
      onSelectionsChange(next)
    }
  }

  function handleSelection(itemName: string, optionName: string) {
    const item = items.find(it => it.Name === itemName)
    if (!item) return
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
        backgroundImage: `linear-gradient(rgba(8,4,0,0.52), rgba(8,4,0,0.52)), url(/images/UIImages/${bgName}.png)`,
        backgroundSize: 'cover',
        backgroundPosition: 'center top',
        backgroundRepeat: 'no-repeat',
      }
    : undefined

  return (
    <div
      className={styles.canvas}
      style={{ width: layout.width, height: layout.height, ...bgStyle }}
    >
      {/* Tier dividers (subtle horizontal lines) */}
      {Array.from({ length: layout.maxTierY }, (_, i) => {
        const tier = layout.maxTierY - i
        const y = PAD_Y + i * T_ROW + T_H
        return (
          <div
            key={`div-${tier}`}
            className={styles.tierDivider}
            style={{ top: y, left: PAD_X, width: layout.width - PAD_X * 2 }}
          />
        )
      })}

      {/* Core separator */}
      {coreItems.length > 0 && (
        <div
          className={styles.coreSeparator}
          style={{
            top: PAD_Y + layout.maxTierY * T_ROW + T_H + CORE_GAP / 2,
            left: 0,
            width: layout.width,
          }}
        />
      )}

      {/* All items — absolutely positioned */}
      {items.map(item => {
        const isCore = (item.YPosition ?? 0) === CORE_Y
        const pos = itemPos(item, layout)
        return (
          <EnhancementCell
            key={item.Name}
            item={item}
            rank={choices[item.Name] ?? 0}
            selectedOption={selections[item.Name]}
            treeSpent={treeSpent}
            totalSpent={totalSpentAllTrees}
            totalAP={totalAP}
            isCore={isCore}
            coreUnlocked={isCore ? coreIsUnlocked(item) : true}
            pos={pos}
            onIncrement={() => handleIncrement(item)}
            onDecrement={() => handleDecrement(item)}
            onShowSelector={() => setSelectorTarget(item.Name)}
          />
        )
      })}

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
