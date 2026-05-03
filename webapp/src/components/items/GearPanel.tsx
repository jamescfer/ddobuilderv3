import { useEffect, useState } from 'react'
import { api } from '../../api'
import { useCharacter } from '../../context/CharacterContext'
import type { Item } from '../../types/ddo'
import styles from './GearPanel.module.css'

// ---------------------------------------------------------------------------
// Slot definitions — canonical DDO equipment slots in display order
// ---------------------------------------------------------------------------
const LEFT_SLOTS = ['Helmet', 'Necklace', 'Trinket', 'Armor', 'Cloak', 'Belt', 'Ring', 'Ring2']
const RIGHT_SLOTS = ['Gloves', 'Bracers', 'Boots', 'Goggles', 'Main Hand', 'Off Hand']
const ALL_SLOTS = [...LEFT_SLOTS, ...RIGHT_SLOTS]

/** Map display slot name → API slot parameter (Ring2 uses the same slot key as Ring) */
function apiSlotName(slot: string): string {
  if (slot === 'Ring2') return 'Ring'
  return slot
}

/** Human-readable label for a slot key */
function slotLabel(slot: string): string {
  if (slot === 'Ring') return 'Ring (1)'
  if (slot === 'Ring2') return 'Ring (2)'
  return slot
}

// ---------------------------------------------------------------------------
// Item label helper
// ---------------------------------------------------------------------------
function itemLabel(item: Item): string {
  if (item.MinLevel && item.MinLevel > 1) {
    return `${item.Name} (Lv ${item.MinLevel})`
  }
  return item.Name
}

// ---------------------------------------------------------------------------
// GearPanel
// ---------------------------------------------------------------------------
export default function GearPanel() {
  const { build } = useCharacter()

  // slotName → equipped item name
  const [gear, setGear] = useState<Record<string, string>>({})

  // slotName → items fetched from API (undefined = not yet fetched, null = loading)
  const [slotItems, setSlotItems] = useState<Record<string, Item[] | null>>({})

  // Which slot's picker is currently open
  const [openSlot, setOpenSlot] = useState<string | null>(null)

  const maxLevel = Math.max(1, build.totalLevel)

  /** Fetch items for a slot if not already cached */
  function ensureItemsLoaded(slot: string) {
    if (slotItems[slot] !== undefined) return
    setSlotItems(prev => ({ ...prev, [slot]: null })) // null = loading
    api
      .items({ slot: apiSlotName(slot) })
      .then(items => {
        setSlotItems(prev => ({ ...prev, [slot]: items }))
      })
      .catch(() => {
        setSlotItems(prev => ({ ...prev, [slot]: [] }))
      })
  }

  function handleSlotClick(slot: string) {
    if (openSlot === slot) {
      setOpenSlot(null)
      return
    }
    ensureItemsLoaded(slot)
    setOpenSlot(slot)
  }

  function handleSelectItem(slot: string, itemName: string) {
    setGear(prev => ({ ...prev, [slot]: itemName }))
    setOpenSlot(null)
  }

  function handleClear(slot: string, e: React.MouseEvent) {
    e.stopPropagation()
    setGear(prev => {
      const next = { ...prev }
      delete next[slot]
      return next
    })
    if (openSlot === slot) setOpenSlot(null)
  }

  // Close open slot picker when build level changes (items may no longer qualify)
  useEffect(() => {
    setOpenSlot(null)
  }, [build.totalLevel])

  function renderSlot(slot: string) {
    const equipped = gear[slot]
    const rawItems = slotItems[slot]
    const loading = rawItems === null
    const availableItems =
      rawItems != null
        ? rawItems.filter(item => (item.MinLevel ?? 1) <= maxLevel)
        : []
    const isOpen = openSlot === slot

    return (
      <div key={slot} className={styles.slotRow}>
        <span className={styles.slotLabel}>{slotLabel(slot)}</span>

        <button
          className={`${styles.slotSelector} ${equipped ? styles.equipped : ''}`}
          onClick={() => handleSlotClick(slot)}
          title={equipped ?? 'Click to browse items'}
          type="button"
        >
          <span className={styles.slotSelectorText}>
            {equipped ?? '— Empty —'}
          </span>
          <span className={styles.slotArrow}>{isOpen ? '▲' : '▼'}</span>
        </button>

        {equipped && (
          <button
            className={styles.clearBtn}
            onClick={e => handleClear(slot, e)}
            title="Remove item"
            type="button"
          >
            ×
          </button>
        )}

        {isOpen && (
          <div className={styles.picker}>
            {loading ? (
              <div className={styles.pickerLoading}>Loading…</div>
            ) : availableItems.length === 0 ? (
              <div className={styles.pickerEmpty}>No items available for this slot.</div>
            ) : (
              <select
                size={Math.min(8, availableItems.length + 1)}
                className={styles.pickerSelect}
                value={equipped ?? ''}
                onChange={e => handleSelectItem(slot, e.target.value)}
              >
                <option value="">— Empty —</option>
                {availableItems
                  .slice()
                  .sort((a, b) => (a.MinLevel ?? 0) - (b.MinLevel ?? 0) || a.Name.localeCompare(b.Name))
                  .map(item => (
                    <option key={item.Name} value={item.Name}>
                      {itemLabel(item)}
                    </option>
                  ))}
              </select>
            )}
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="panel">
      <div className="panel-header">Gear</div>
      <div className="panel-body">
        <div className={styles.grid}>
          <div className={styles.column}>
            <div className={styles.columnHeader}>Body</div>
            {LEFT_SLOTS.map(renderSlot)}
          </div>
          <div className={styles.column}>
            <div className={styles.columnHeader}>Accessories</div>
            {RIGHT_SLOTS.map(renderSlot)}
          </div>
        </div>
        {build.totalLevel === 0 && (
          <p className={styles.hint}>Set your character level to filter items by level.</p>
        )}
      </div>
    </div>
  )
}
