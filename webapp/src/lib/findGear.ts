import type { Item, ItemBuff } from '../types/ddo'

function toArray<T>(val: T | T[] | undefined): T[] {
  if (val == null) return []
  return Array.isArray(val) ? val : [val]
}

export interface FindGearQuery {
  /** Exact match on ItemBuff.Type */
  buffType?: string
  /** Partial case-insensitive match on ItemBuff.Type */
  buffSearch?: string
  /** Minimum ItemBuff.Value1 (applied after buff type filter) */
  minValue?: number
  minLevel?: number
  maxLevel?: number
  nameSearch?: string
}

export interface FindGearResult {
  item: Item
  /** Keys from item.EquipmentSlot */
  slots: string[]
  /** The buffs that matched the query (all buffs when no buff filter is set) */
  matchedBuffs: ItemBuff[]
}

/**
 * Filter `items` by the given query and return matching results sorted by
 * MinLevel ascending then name. Implements V2 FindGearDialog cross-slot search.
 */
export function findGearByEffect(items: Item[], query: FindGearQuery): FindGearResult[] {
  const { buffType, buffSearch, minValue, minLevel, maxLevel, nameSearch } = query

  const results: FindGearResult[] = []

  for (const item of items) {
    const lvl = item.MinLevel ?? 1
    if (minLevel != null && lvl < minLevel) continue
    if (maxLevel != null && lvl > maxLevel) continue
    if (nameSearch && !item.Name.toLowerCase().includes(nameSearch.toLowerCase())) continue

    const allBuffs = toArray(item.Buff as ItemBuff | ItemBuff[] | undefined)
    let matchedBuffs: ItemBuff[]

    if (buffType) {
      matchedBuffs = allBuffs.filter(b => b.Type === buffType)
      if (matchedBuffs.length === 0) continue
    } else if (buffSearch) {
      const lower = buffSearch.toLowerCase()
      matchedBuffs = allBuffs.filter(b => b.Type?.toLowerCase().includes(lower))
      if (matchedBuffs.length === 0) continue
    } else {
      matchedBuffs = allBuffs
    }

    if (minValue != null) {
      matchedBuffs = matchedBuffs.filter(b => (b.Value1 ?? 0) >= minValue)
      if (matchedBuffs.length === 0) continue
    }

    const slots = Object.keys(item.EquipmentSlot ?? {})
    results.push({ item, slots, matchedBuffs })
  }

  return results.sort(
    (a, b) => (a.item.MinLevel ?? 0) - (b.item.MinLevel ?? 0) || a.item.Name.localeCompare(b.item.Name),
  )
}
