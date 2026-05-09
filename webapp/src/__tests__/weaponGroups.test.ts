import { describe, expect, it } from 'vitest'
import { deriveWeaponClasses, type WeaponGroupSpec } from '../lib/weapons/groups'

const groups: WeaponGroupSpec[] = [
  { Name: 'Martial', Weapon: ['Falchion', 'Longsword', 'Bastard Sword'] },
  { Name: 'Slashing', Weapon: ['Falchion', 'Longsword', 'Scimitar'] },
  { Name: 'Centering Weapons', Weapon: ['Handwraps', 'Kama'] },
]

describe('deriveWeaponClasses', () => {
  it('includes the weapon type itself as a singleton class', () => {
    const out = deriveWeaponClasses('Falchion', groups)
    expect(out.has('Falchion')).toBe(true)
  })

  it('matches all static groups containing the weapon type', () => {
    const out = deriveWeaponClasses('Falchion', groups)
    expect(out.has('Martial')).toBe(true)
    expect(out.has('Slashing')).toBe(true)
    expect(out.has('Centering Weapons')).toBe(false)
  })

  it('handwraps land in Centering Weapons but not Martial/Slashing', () => {
    const out = deriveWeaponClasses('Handwraps', groups)
    expect(out.has('Centering Weapons')).toBe(true)
    expect(out.has('Martial')).toBe(false)
  })

  it('runtime AddGroupWeapon adds dynamic membership', () => {
    const out = deriveWeaponClasses('Khopesh', groups, [
      { group: 'Slashing', weaponType: 'Khopesh' },
    ])
    expect(out.has('Slashing')).toBe(true)
  })

  it('MergeGroups confers base group membership transitively', () => {
    const out = deriveWeaponClasses('Falchion', groups, [], [
      { baseGroup: 'TwoHanded', mergedGroup: 'Slashing' },
    ])
    expect(out.has('TwoHanded')).toBe(true)
  })

  it('returns empty set when no weapon equipped', () => {
    const out = deriveWeaponClasses('', groups)
    expect(out.size).toBe(0)
  })
})
