// DDO bonus stacking engine
//
// Rules:
//   EXCLUSIVE types: only the highest positive and lowest (most negative) value
//   per bonus type are "active". All other contributions from that type are
//   suppressed.
//
//   STACKING types: every bonus in the group contributes to the total
//   regardless of magnitude.

// ---------------------------------------------------------------------------
// Public interfaces
// ---------------------------------------------------------------------------

export interface RawBonus {
  value: number
  type: string    // 'Enhancement', 'Dodge', 'Feat', 'Racial', etc.
  source: string  // human-readable source name
}

export interface ResolvedBonus extends RawBonus {
  active: boolean  // false = suppressed by a higher exclusive-type bonus
}

export interface ResolvedStat {
  total: number
  bonuses: ResolvedBonus[]
}

// ---------------------------------------------------------------------------
// Exclusive (non-stacking) bonus types
// Only the single highest positive value and single lowest (most negative)
// negative value per type contribute to the total.
// ---------------------------------------------------------------------------
const EXCLUSIVE = new Set([
  'Action Boost',
  'Alchemical',
  'Armor',
  'Artifact',
  'Base',
  'Centered',
  'Circumstance',
  'Class',
  'Combat Style',
  'Competence',
  'Deflection',
  'Determination',
  'Divine',
  'Elemental Energy',
  'Elemental Spell Power',
  'Enchantment',
  'Enhancement',
  'Epic',
  'Equipment',
  'Eternal Faith',
  'Exceptional',
  'False Life',
  'Feat',
  'Festive',
  'Fortune',
  'Greater Elemental Energy',
  'Greater Elemental Spell Power',
  'Guild',
  'Implement',
  'Improved Elemental Energy',
  'Improved Elemental Spell Power',
  'Inherent',
  'Insightful',
  'Inspiration',
  'Keen',
  'Legendary',
  'Legendary Elemental Energy',
  'Legendary Elemental Spell Power',
  'Level Up',
  'Luck',
  'Morale',
  'Music',
  'Natural Armor',
  'Not Set',
  'Orb',
  'Pirate',
  'Primal',
  'Profane',
  'Psionic',
  'Quality',
  'Racial',
  'Rage',
  'Resistance',
  'Sacred',
  'Shield',
  'Silver Flame',
  'Size',
  'Special',
  'Spooky',
  'Universal',
  'Vitality',
  'Weapon Enchantment',
])

// ---------------------------------------------------------------------------
// Core resolver
// ---------------------------------------------------------------------------

/**
 * Groups bonuses by type, applies DDO stacking rules, and returns the total
 * plus each bonus annotated with whether it is active or suppressed.
 */
export function resolveBonus(bonuses: RawBonus[]): ResolvedStat {
  if (bonuses.length === 0) {
    return { total: 0, bonuses: [] }
  }

  // Group by normalised type (case-sensitive to match DDO data exactly)
  const byType = new Map<string, RawBonus[]>()
  for (const b of bonuses) {
    const group = byType.get(b.type)
    if (group) {
      group.push(b)
    } else {
      byType.set(b.type, [b])
    }
  }

  const resolved: ResolvedBonus[] = []
  let total = 0

  for (const [type, group] of byType) {
    if (EXCLUSIVE.has(type)) {
      // -----------------------------------------------------------------------
      // Exclusive type: only highest positive and lowest (most negative)
      // value are active. Treat positives and negatives independently.
      // -----------------------------------------------------------------------

      // Separate into positives and negatives (zero counts as positive)
      const positives = group.filter(b => b.value >= 0)
      const negatives = group.filter(b => b.value < 0)

      // Find the single winning positive bonus (highest value)
      let bestPositive: RawBonus | undefined
      for (const b of positives) {
        if (bestPositive === undefined || b.value > bestPositive.value) {
          bestPositive = b
        }
      }

      // Find the single winning negative bonus (most negative = lowest value)
      let bestNegative: RawBonus | undefined
      for (const b of negatives) {
        if (bestNegative === undefined || b.value < bestNegative.value) {
          bestNegative = b
        }
      }

      for (const b of group) {
        const isActive =
          (b.value >= 0 && b === bestPositive) ||
          (b.value < 0 && b === bestNegative)

        resolved.push({ ...b, active: isActive })
        if (isActive) {
          total += b.value
        }
      }
    } else {
      // -----------------------------------------------------------------------
      // Stacking type: every bonus is active.
      // -----------------------------------------------------------------------
      for (const b of group) {
        resolved.push({ ...b, active: true })
        total += b.value
      }
    }
  }

  return { total, bonuses: resolved }
}

// ---------------------------------------------------------------------------
// Convenience helper
// ---------------------------------------------------------------------------

/** Returns a resolved stat with no bonuses and a total of zero. */
export function emptyResolvedStat(): ResolvedStat {
  return { total: 0, bonuses: [] }
}
