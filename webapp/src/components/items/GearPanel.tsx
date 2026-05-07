import { useEffect, useState, useCallback } from 'react'
import { api } from '../../api'
import { useCharacter } from '../../context/CharacterContext'
import type { Item, ItemAugment, Augment } from '../../types/ddo'
import styles from './GearPanel.module.css'

// ---------------------------------------------------------------------------
// Slot definitions
// ---------------------------------------------------------------------------
const LEFT_SLOTS = ['Helmet', 'Necklace', 'Trinket', 'Armor', 'Cloak', 'Belt', 'Ring', 'Ring2']
const RIGHT_SLOTS = ['Gloves', 'Bracers', 'Boots', 'Goggles', 'Main Hand', 'Off Hand']
const ALL_SLOTS = [...LEFT_SLOTS, ...RIGHT_SLOTS]

function apiSlotName(slot: string): string {
  if (slot === 'Ring2') return 'Ring'
  return slot
}

function slotLabel(slot: string): string {
  if (slot === 'Ring') return 'Ring (1)'
  if (slot === 'Ring2') return 'Ring (2)'
  return slot
}

function itemLabel(item: Item): string {
  if (item.MinLevel && item.MinLevel > 1) return `${item.Name} (Lv ${item.MinLevel})`
  return item.Name
}

function toArray<T>(val: T | T[] | undefined): T[] {
  if (val == null) return []
  return Array.isArray(val) ? val : [val]
}

// Augment key: slot:augmentType:index
function augmentKey(slot: string, augType: string, idx: number) {
  return `${slot}:${augType}:${idx}`
}

// ---------------------------------------------------------------------------
// AugmentSlot sub-component
// ---------------------------------------------------------------------------
interface AugmentSlotProps {
  slotName: string
  augment: ItemAugment
  index: number
  choice: string
  onSet: (key: string, name: string) => void
  onClear: (key: string) => void
  maxItemLevel: number
}

function AugmentSlot({ slotName, augment, index, choice, onSet, onClear, maxItemLevel }: AugmentSlotProps) {
  const [options, setOptions] = useState<Augment[]>([])
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const key = augmentKey(slotName, augment.Type, index)

  // Pre-filled augment (crafted items)
  if (augment.Augment) {
    return (
      <div className={styles.augRow}>
        <span className={styles.augType}>{augment.Type}</span>
        <span className={styles.augFixed} title={augment.Augment.Description}>{augment.Augment.Name}</span>
      </div>
    )
  }

  function handleOpen() {
    if (!open && options.length === 0) {
      setLoading(true)
      api.augments({ type: augment.Type })
        .then(data => setOptions(data.filter(a => (a.MinLevel ?? 1) <= maxItemLevel)))
        .catch(() => setOptions([]))
        .finally(() => setLoading(false))
    }
    setOpen(v => !v)
  }

  return (
    <div className={styles.augRow}>
      <span className={styles.augType}>{augment.Type}</span>
      <button
        className={`${styles.augSelector} ${choice ? styles.augFilled : ''}`}
        onClick={handleOpen}
        type="button"
      >
        {choice || '— Empty —'}
      </button>
      {choice && (
        <button
          className={styles.augClear}
          onClick={() => { onClear(key); setOpen(false) }}
          type="button"
          title="Remove augment"
        >×</button>
      )}
      {open && (
        <div className={styles.augPicker}>
          {loading ? (
            <div className={styles.pickerLoading}>Loading…</div>
          ) : options.length === 0 ? (
            <div className={styles.pickerEmpty}>No augments available for {augment.Type}</div>
          ) : (
            <select
              size={Math.min(8, options.length + 1)}
              className={styles.pickerSelect}
              value={choice}
              onChange={e => { onSet(key, e.target.value); setOpen(false) }}
            >
              <option value="">— Empty —</option>
              {options
                .slice()
                .sort((a, b) => (a.MinLevel ?? 0) - (b.MinLevel ?? 0) || a.Name.localeCompare(b.Name))
                .map(aug => (
                  <option key={aug.Name} value={aug.Name}>
                    {aug.Name}{aug.MinLevel && aug.MinLevel > 1 ? ` (Lv ${aug.MinLevel})` : ''}
                  </option>
                ))}
            </select>
          )}
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// GearPanel
// ---------------------------------------------------------------------------
export default function GearPanel() {
  const { build, dispatch } = useCharacter()

  // slotName → items fetched (undefined = not fetched, null = loading)
  const [slotItems, setSlotItems] = useState<Record<string, Item[] | null>>({})
  // slotName → full item details (for augment display)
  const [itemDetails, setItemDetails] = useState<Record<string, Item | null>>({})
  // Which slot's item picker is open
  const [openSlot, setOpenSlot] = useState<string | null>(null)

  const gear = build.gear
  const augmentChoices = build.augmentChoices
  const maxLevel = Math.max(1, build.totalLevel)

  function ensureItemsLoaded(slot: string) {
    if (slotItems[slot] !== undefined) return
    setSlotItems(prev => ({ ...prev, [slot]: null }))
    api.items({ slot: apiSlotName(slot) })
      .then(items => setSlotItems(prev => ({ ...prev, [slot]: items })))
      .catch(() => setSlotItems(prev => ({ ...prev, [slot]: [] })))
  }

  const loadItemDetails = useCallback((slot: string, itemName: string) => {
    if (itemDetails[slot] !== undefined) return
    setItemDetails(prev => ({ ...prev, [slot]: null }))
    api.item(itemName)
      .then(item => setItemDetails(prev => ({ ...prev, [slot]: item })))
      .catch(() => setItemDetails(prev => ({ ...prev, [slot]: null })))
  }, [itemDetails])

  // When gear changes, load item details for equipped slots
  useEffect(() => {
    for (const slot of ALL_SLOTS) {
      const itemName = gear[slot]
      if (itemName && itemDetails[slot] === undefined) {
        loadItemDetails(slot, itemName)
      }
    }
  }, [gear, itemDetails, loadItemDetails])

  function handleSlotClick(slot: string) {
    if (openSlot === slot) { setOpenSlot(null); return }
    ensureItemsLoaded(slot)
    setOpenSlot(slot)
  }

  function handleSelectItem(slot: string, itemName: string) {
    if (itemName) {
      dispatch({ type: 'SET_GEAR', slot, itemName })
      setItemDetails(prev => ({ ...prev, [slot]: undefined as unknown as null }))
    } else {
      dispatch({ type: 'CLEAR_GEAR', slot })
      setItemDetails(prev => { const n = { ...prev }; delete n[slot]; return n })
    }
    setOpenSlot(null)
  }

  function handleClear(slot: string, e: React.MouseEvent) {
    e.stopPropagation()
    dispatch({ type: 'CLEAR_GEAR', slot })
    setItemDetails(prev => { const n = { ...prev }; delete n[slot]; return n })
    if (openSlot === slot) setOpenSlot(null)
  }

  useEffect(() => { setOpenSlot(null) }, [build.totalLevel])

  function renderSlot(slot: string) {
    const equipped = gear[slot]
    const rawItems = slotItems[slot]
    const loading = rawItems === null
    const availableItems = rawItems != null
      ? rawItems.filter(item => (item.MinLevel ?? 1) <= maxLevel)
      : []
    const isOpen = openSlot === slot
    const detail = equipped ? (itemDetails[slot] ?? null) : null
    const augSlots = detail ? toArray(detail.ItemAugment) : []

    return (
      <div key={slot} className={styles.slotBlock}>
        <div className={styles.slotRow}>
          <span className={styles.slotLabel}>{slotLabel(slot)}</span>

          <button
            className={`${styles.slotSelector} ${equipped ? styles.equipped : ''}`}
            onClick={() => handleSlotClick(slot)}
            title={equipped ?? 'Click to browse items'}
            type="button"
          >
            <span className={styles.slotSelectorText}>{equipped ?? '— Empty —'}</span>
            <span className={styles.slotArrow}>{isOpen ? '▲' : '▼'}</span>
          </button>

          {equipped && (
            <button
              className={styles.clearBtn}
              onClick={e => handleClear(slot, e)}
              title="Remove item"
              type="button"
            >×</button>
          )}

          {isOpen && (
            <div className={styles.picker}>
              {loading ? (
                <div className={styles.pickerLoading}>Loading…</div>
              ) : availableItems.length === 0 ? (
                <div className={styles.pickerEmpty}>No items for this slot.</div>
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
                      <option key={item.Name} value={item.Name}>{itemLabel(item)}</option>
                    ))}
                </select>
              )}
            </div>
          )}
        </div>

        {/* Augment slots for equipped item */}
        {equipped && augSlots.length > 0 && (
          <div className={styles.augments}>
            {augSlots.map((aug, idx) => (
              <AugmentSlot
                key={`${aug.Type}:${idx}`}
                slotName={slot}
                augment={aug}
                index={idx}
                choice={augmentChoices[augmentKey(slot, aug.Type, idx)] ?? ''}
                onSet={(key, name) => dispatch({ type: 'SET_AUGMENT', key, augmentName: name })}
                onClear={(key) => dispatch({ type: 'CLEAR_AUGMENT', key })}
                maxItemLevel={detail?.MinLevel ?? maxLevel}
              />
            ))}
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
