// Weapon-group resolver — V2 parity for WeaponClassMainHand / WeaponClassOffHand
// requirements (effectParser.ts requirements check) plus runtime
// AddGroupWeapon / MergeGroups effects.
//
// V2 source: DDOBuilder/WeaponGroup.cpp + Output/DataFiles/WeaponGroupings.xml.

export interface WeaponGroupSpec {
  Name: string
  Weapon?: string | string[]
}

export interface RuntimeGroupAdd {
  group: string
  weaponType: string
}

export interface RuntimeGroupMerge {
  baseGroup: string     // membership in mergedGroup confers baseGroup
  mergedGroup: string
}

function toArray<T>(v: T | T[] | undefined): T[] {
  if (v === undefined || v === null) return []
  return Array.isArray(v) ? v : [v]
}

/**
 * Returns the set of weapon class / group names that the given weapon type
 * belongs to, after applying:
 *   1. Static membership from WeaponGroupings.xml.
 *   2. Effect_AddGroupWeapon — Item[0]=group, Item[1]=weaponType.
 *   3. Effect_MergeGroups — Item[0]=base, Item[1]=merged.
 *
 * Always includes the weapon type itself as a singleton class so requirements
 * that match on a specific weapon name still work.
 */
export function deriveWeaponClasses(
  weaponType: string,
  baseGroups: WeaponGroupSpec[],
  runtimeAdds: RuntimeGroupAdd[] = [],
  runtimeMerges: RuntimeGroupMerge[] = [],
): Set<string> {
  const memberships = new Set<string>()
  if (!weaponType) return memberships
  memberships.add(weaponType)

  // 1) static membership from XML
  for (const g of baseGroups) {
    if (toArray(g.Weapon).includes(weaponType)) memberships.add(g.Name)
  }

  // 2) runtime AddGroupWeapon — adds this weaponType to a group
  for (const add of runtimeAdds) {
    if (add.weaponType === weaponType) memberships.add(add.group)
  }

  // 3) runtime MergeGroups — membership in mergedGroup confers baseGroup,
  //    iterated to fixed-point for transitive merges.
  let changed = true
  let guard = 0
  while (changed && guard++ < 8) {
    changed = false
    for (const m of runtimeMerges) {
      if (memberships.has(m.mergedGroup) && !memberships.has(m.baseGroup)) {
        memberships.add(m.baseGroup)
        changed = true
      }
    }
  }

  return memberships
}
