import { useEffect, useMemo, useState } from 'react'
import { api } from '../../api'
import { useCharacter } from '../../context/CharacterContext'
import type { Item, ItemBuff } from '../../types/ddo'
import styles from './ClickiesPanel.module.css'

interface ClickieDef {
  key: string                 // slot:itemName:effectIndex
  slot: string
  itemName: string
  effectName: string          // Buff Type or item-supplied label
  description: string
  /** Best-effort max charges if discoverable; -1 = unknown. */
  maxCharges: number
}

function toArray<T>(v: T | T[] | undefined): T[] {
  if (v === undefined || v === null) return []
  return Array.isArray(v) ? v : [v]
}

/**
 * Walks an item's Buff list looking for entries flagged as ItemClickie.
 * Each clickie effect becomes a tracking entry. V2 stores per-clickie
 * remaining charges; we surface the same.
 */
function clickiesFromItem(slot: string, item: Item): ClickieDef[] {
  const out: ClickieDef[] = []
  const buffs = toArray(item.Buff as ItemBuff | ItemBuff[] | undefined)
  let idx = 0
  for (const b of buffs) {
    if ((b.Type ?? '') === 'ItemClickie') {
      out.push({
        key: `${slot}:${item.Name}:${idx}`,
        slot,
        itemName: item.Name,
        effectName: (b as { Item1?: string }).Item1 ?? b.Type ?? 'Clickie',
        description: (b as { Description?: string }).Description ?? '',
        maxCharges: typeof (b as { Value1?: unknown }).Value1 === 'number' ? Number((b as { Value1?: number }).Value1) : -1,
      })
    }
    idx++
  }
  return out
}

export default function ClickiesPanel() {
  const { build, dispatch } = useCharacter()
  const [gearItems, setGearItems] = useState<Record<string, Item>>({})

  useEffect(() => {
    const slots = Object.entries(build.gear).filter(([, name]) => name)
    if (slots.length === 0) { setGearItems({}); return }
    let cancelled = false
    Promise.all(
      slots.map(([slot, name]) =>
        api.item(name).then(item => item ? [slot, item] as [string, Item] : null)
      )
    ).then(results => {
      if (cancelled) return
      const map: Record<string, Item> = {}
      for (const r of results) { if (r) map[r[0]] = r[1] }
      setGearItems(map)
    })
    return () => { cancelled = true }
  }, [build.gear])

  const clickies = useMemo<ClickieDef[]>(() => {
    const out: ClickieDef[] = []
    for (const [slot, item] of Object.entries(gearItems)) {
      out.push(...clickiesFromItem(slot, item))
    }
    return out
  }, [gearItems])

  return (
    <div className="panel">
      <div className="panel-header">Item Clickies</div>
      <div className="panel-body">
        {clickies.length === 0 ? (
          <p className={styles.empty}>No clickie effects detected on equipped gear.</p>
        ) : (
          <>
            <div className={styles.actions}>
              <button onClick={() => dispatch({ type: 'RESET_ALL_CLICKIES' })}>Reset all charges</button>
            </div>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Slot</th>
                  <th>Item</th>
                  <th>Effect</th>
                  <th>Charges</th>
                </tr>
              </thead>
              <tbody>
                {clickies.map(c => {
                  const remaining = build.clickieCharges[c.key] ?? c.maxCharges
                  return (
                    <tr key={c.key}>
                      <td>{c.slot}</td>
                      <td>{c.itemName}</td>
                      <td title={c.description}>{c.effectName}</td>
                      <td>
                        <input
                          type="number"
                          value={remaining < 0 ? '' : remaining}
                          placeholder={c.maxCharges < 0 ? '∞' : String(c.maxCharges)}
                          onChange={e => {
                            const v = e.target.value === '' ? -1 : Number(e.target.value)
                            dispatch({ type: 'SET_CLICKIE_CHARGES', key: c.key, remaining: v })
                          }}
                          className={styles.chargeInput}
                        />
                        {c.maxCharges > 0 && <span className={styles.maxHint}> / {c.maxCharges}</span>}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </>
        )}
      </div>
    </div>
  )
}
