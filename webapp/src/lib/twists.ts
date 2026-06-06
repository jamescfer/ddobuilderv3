import type { EnhancementTree, EnhancementTreeItem } from '../types/ddo'

/** An epic-destiny tree item that is eligible to be selected as a Twist of Fate. */
export interface TwistCandidate {
  treeName: string
  item: EnhancementTreeItem
  /** Canonical key used in twistChoices: InternalName ?? Name. */
  key: string
}

/**
 * All non-Tier5 items from the provided epic destiny trees, usable as Twists
 * of Fate. V2: Twists can be trained from any unlocked destiny tree (not just
 * the active one); Tier-5 enhancements are exclusively bound to the active
 * destiny and cannot be twisted.
 */
export function availableTwistItems(trees: EnhancementTree[]): TwistCandidate[] {
  const result: TwistCandidate[] = []
  for (const tree of trees) {
    for (const item of tree.EnhancementTreeItem ?? []) {
      if (item.Tier5) continue
      result.push({ treeName: tree.Name, item, key: item.InternalName ?? item.Name })
    }
  }
  return result
}
