// V2 parity: Build::m_exclusiveEnhancements (Build.cpp:592-616, 3617-3636)
//
// An ExclusionGroup associates a named group with the one enhancement that has
// claimed it. Once claimed, only that enhancement (identified by its InternalName)
// can satisfy the corresponding Exclusive requirement. Any other enhancement in
// the same group is blocked.
//
// V2 sources cited:
//   ExclusionGroup.h/.cpp  — simple group-name + enhancement-id pair with stack count
//   Build.cpp:592-616      — NotifyFeatEffectApplied: registers claim on train
//   Build.cpp:3617-3636    — IsExclusiveEnhancement: isUs || !found

import type { CharacterBuild, EnhancementTree } from '../types/ddo'

/**
 * Build a map of group-name → claimant-InternalName from the enhancements
 * currently trained in the build.
 *
 * Used to evaluate Exclusive requirements: if a group is claimed by
 * enhancement A, then enhancement B in the same group cannot be trained.
 */
export function computeExclusionGroups(
  build: CharacterBuild,
  allTrees: EnhancementTree[],
): Record<string, string> {
  const groups: Record<string, string> = {}

  for (const tree of allTrees) {
    const choices = build.enhancementChoices?.[tree.Name]
    if (!choices) continue

    for (const item of tree.EnhancementTreeItem ?? []) {
      const key = item.InternalName ?? item.Name
      const rank = choices[key] ?? choices[item.Name] ?? 0
      if (rank <= 0) continue

      const effects = Array.isArray(item.Effect) ? item.Effect : item.Effect ? [item.Effect] : []
      for (const eff of effects) {
        if (eff.Type !== 'ExclusionGroup') continue
        const its = Array.isArray(eff.Item) ? eff.Item : eff.Item ? [eff.Item] : []
        if (its.length < 2) continue
        const enhId = its[0]
        const groupName = its[1]
        // First trained enhancement wins (matches V2 AddStack logic: only the
        // owner can keep stacking; a second claimant would have been blocked).
        if (!groups[groupName]) {
          groups[groupName] = enhId
        }
      }
    }
  }

  return groups
}
