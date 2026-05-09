// Spell <-> class mapping helpers.
//
// V2 ports the class-knows-spell relationship from each ClassXxx.class.xml's
// <ClassSpell> entries. The breakdowns panel needs this mapping so that the
// per-spell "effective caster level" can be computed from the *casting class's*
// CL — not just the build's total character level. (A 10 Wizard / 10 Fighter
// casts Magic Missile at CL 10, not CL 20.)

import type { DDOClass, ClassSpell } from '../types/ddo'

function toArray<T>(val: T | T[] | undefined): T[] {
  if (val === undefined || val === null) return []
  return Array.isArray(val) ? val : [val]
}

/**
 * Build a `spellName -> class names` index across every class. Returns a Map
 * whose values are arrays — a single spell can belong to multiple classes
 * (e.g. Magic Missile is on both the Wizard and Sorcerer lists; many cleric
 * spells are also on the favored-soul list).
 *
 * The lookup is case-sensitive on the spell name to match V2 directly; spell
 * XML names and class-spell-list names are kept consistent in the source data.
 */
export function buildSpellClassIndex(allClasses: DDOClass[]): Map<string, string[]> {
  const index = new Map<string, string[]>()
  for (const cls of allClasses) {
    if (!cls?.Name) continue
    for (const cs of toArray<ClassSpell>(cls.ClassSpell)) {
      const name = cs?.Name
      if (!name) continue
      const list = index.get(name)
      if (list) {
        if (!list.includes(cls.Name)) list.push(cls.Name)
      } else {
        index.set(name, [cls.Name])
      }
    }
  }
  return index
}

/**
 * Given a spell name and the build's casting classes (name + level), return
 * the class entry whose effective caster level is highest among classes that
 * actually know the spell. Returns `null` when no casting class in the build
 * can cast the spell.
 *
 * The caller passes a `casterLevelOf(name)` lookup so this helper stays pure
 * (no React hook coupling).
 */
export function pickBestCastingClassForSpell(
  spellName: string,
  spellClassIndex: Map<string, string[]>,
  buildClassNames: string[],
  casterLevelOf: (className: string) => { total: number },
): { className: string; cl: number } | null {
  const knownBy = spellClassIndex.get(spellName)
  if (!knownBy || knownBy.length === 0) return null
  let best: { className: string; cl: number } | null = null
  for (const c of knownBy) {
    if (!buildClassNames.includes(c)) continue
    const cl = casterLevelOf(c).total
    if (!best || cl > best.cl) best = { className: c, cl }
  }
  return best
}
