/**
 * Parity pass N6 — WeaponProficiencyClass grants class-based weapon proficiency.
 *
 * V2 source: BreakdownItemWeaponEffects.cpp / Build.cpp
 *   Effect_WeaponProficiencyClass is registered in the system and routes
 *   through AffectsThisWeapon to check group membership; the INTENDED meaning
 *   is "this feat grants proficiency with all weapons in the named class."
 *
 * Real data examples:
 *   - HalfElf.race.xml "Half-Elf Dilettante: Ranger":
 *       <Type>WeaponProficiencyClass</Type> <Item>Ranged</Item>
 *   - Spells.xml "Master's Touch":
 *       <Type>WeaponProficiencyClass</Type> <Item>Simple</Item>
 *       <Type>WeaponProficiencyClass</Type> <Item>Martial</Item>
 *
 * Fix: extractFromEffects() in buildRuntimeGroupAdds() now handles
 *   WeaponProficiencyClass by pushing a RuntimeGroupMerge
 *   { baseGroup: 'Proficiency', mergedGroup: <className> },
 *   so deriveWeaponClasses for any weapon in that class gains 'Proficiency'
 *   membership via the existing transitive-merge logic.
 */

import { describe, it, expect } from 'vitest'
import { computeBuildStats, buildRuntimeGroupAdds, type BuildStatsInput } from '../hooks/useBuildStats'
import { emptyBuild as makeEmptyBuild } from '../types/ddo'
import type {
  DDOClass, Feat, EnhancementTree, Item, OptionalBuff,
  SetBonus, Augment, FiligreeSetBonus, Filigree,
} from '../types/ddo'
import type { WeaponGroupSpec } from '../lib/weapons/groups'

// ---------------------------------------------------------------------------
// Minimal fixtures
// ---------------------------------------------------------------------------

const fighterClass: DDOClass = {
  Name: 'Fighter', HitPoints: 10, Fortitude: 'Type2', Reflex: 'Type1',
  Will: 'Type1', BAB: '1',
} as unknown as DDOClass

// Mirrors HalfElf.race.xml "Half-Elf Dilettante: Ranger"
const halfElfDilettanteRanger: Feat = {
  Name: 'Half-Elf Dilettante: Ranger',
  Effect: { Type: 'WeaponProficiencyClass', Bonus: 'Feat', AType: 'NotNeeded', Item: 'Ranged' },
} as unknown as Feat

// Mirrors Spells.xml "Master's Touch" (grants Simple + Martial)
const mastersTouchSimple: Feat = {
  Name: "Master's Touch: Simple",
  Effect: { Type: 'WeaponProficiencyClass', Bonus: 'Spell', AType: 'NotNeeded', Item: 'Simple' },
} as unknown as Feat

const mastersTouchMartial: Feat = {
  Name: "Master's Touch: Martial",
  Effect: { Type: 'WeaponProficiencyClass', Bonus: 'Spell', AType: 'NotNeeded', Item: 'Martial' },
} as unknown as Feat

// Static weapon group definitions (Ranged / Simple / Martial)
const staticGroups: WeaponGroupSpec[] = [
  { Name: 'Ranged', Weapon: ['Longbow', 'Shortbow', 'Heavy Crossbow', 'Light Crossbow'] },
  { Name: 'Simple', Weapon: ['Club', 'Dagger', 'Quarterstaff'] },
  { Name: 'Martial', Weapon: ['Longsword', 'Falchion', 'Shortsword'] },
  { Name: 'Exotic', Weapon: ['Khopesh', 'Kukri'] },
]

function input(feats: Feat[], trees: EnhancementTree[] = []): BuildStatsInput {
  return {
    allRaces: [],
    allClasses: [fighterClass],
    allFeats: feats,
    allTrees: trees,
    gearItems: {} as Record<string, Item>,
    allSelfBuffs: [] as OptionalBuff[],
    allAugments: [] as Augment[],
    allSetBonuses: [] as SetBonus[],
    allFiligreeBonuses: [] as FiligreeSetBonus[],
    allFiligrees: [] as Filigree[],
    allWeaponGroups: staticGroups,
  }
}

function buildWithFeat(featChoices: Record<string, string>, feats: Feat[]) {
  return {
    ...makeEmptyBuild(),
    classes: [{ name: 'Fighter', levels: 4 }],
    totalLevel: 4,
    featChoices,
    enhancementChoices: {},
    enhancementSelections: {},
  }
}

// ---------------------------------------------------------------------------
// buildRuntimeGroupAdds — WeaponProficiencyClass emits a RuntimeGroupMerge
// ---------------------------------------------------------------------------

describe('buildRuntimeGroupAdds — WeaponProficiencyClass', () => {
  it('emits merge Ranged→Proficiency when Half-Elf Dilettante: Ranger is trained', () => {
    const build = buildWithFeat(
      { 'Hero 1': 'Half-Elf Dilettante: Ranger' },
      [halfElfDilettanteRanger],
    )
    const inp = input([halfElfDilettanteRanger])
    const { merges } = buildRuntimeGroupAdds(inp, build)
    expect(merges.some(m => m.baseGroup === 'Proficiency' && m.mergedGroup === 'Ranged')).toBe(true)
  })

  it('emits merge Simple→Proficiency when Simple proficiency-class feat is trained', () => {
    const build = buildWithFeat({ 'Hero 1': "Master's Touch: Simple" }, [mastersTouchSimple])
    const inp = input([mastersTouchSimple])
    const { merges } = buildRuntimeGroupAdds(inp, build)
    expect(merges.some(m => m.baseGroup === 'Proficiency' && m.mergedGroup === 'Simple')).toBe(true)
  })

  it('does NOT emit a Ranged→Proficiency merge when no proficiency-class feat is trained', () => {
    const build = buildWithFeat({}, [])
    const inp = input([halfElfDilettanteRanger])
    const { merges } = buildRuntimeGroupAdds(inp, build)
    expect(merges.some(m => m.mergedGroup === 'Ranged')).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// BuildStats.isWeaponProficient — integration via WeaponProficiencyClass
// ---------------------------------------------------------------------------

describe('BuildStats.isWeaponProficient via WeaponProficiencyClass', () => {
  it('returns true for Longbow when Half-Elf Dilettante: Ranger is trained', () => {
    const build = buildWithFeat(
      { 'Hero 1': 'Half-Elf Dilettante: Ranger' },
      [halfElfDilettanteRanger],
    )
    const stats = computeBuildStats(input([halfElfDilettanteRanger]), build)
    expect(stats.isWeaponProficient('Longbow')).toBe(true)
  })

  it('returns true for Shortbow when Half-Elf Dilettante: Ranger is trained', () => {
    const build = buildWithFeat(
      { 'Hero 1': 'Half-Elf Dilettante: Ranger' },
      [halfElfDilettanteRanger],
    )
    const stats = computeBuildStats(input([halfElfDilettanteRanger]), build)
    expect(stats.isWeaponProficient('Shortbow')).toBe(true)
  })

  it('returns false for Longsword when only Ranged proficiency-class is trained', () => {
    const build = buildWithFeat(
      { 'Hero 1': 'Half-Elf Dilettante: Ranger' },
      [halfElfDilettanteRanger],
    )
    const stats = computeBuildStats(input([halfElfDilettanteRanger]), build)
    expect(stats.isWeaponProficient('Longsword')).toBe(false)
  })

  it('returns false for Longbow when no feat grants ranged proficiency', () => {
    const build = buildWithFeat({}, [])
    const stats = computeBuildStats(input([halfElfDilettanteRanger]), build)
    expect(stats.isWeaponProficient('Longbow')).toBe(false)
  })

  it('returns true for both Simple and Martial weapons when both class-proficiency feats are trained', () => {
    const build = buildWithFeat(
      { 'Hero 1': "Master's Touch: Simple", 'Hero 2': "Master's Touch: Martial" },
      [mastersTouchSimple, mastersTouchMartial],
    )
    const stats = computeBuildStats(input([mastersTouchSimple, mastersTouchMartial]), build)
    expect(stats.isWeaponProficient('Club')).toBe(true)
    expect(stats.isWeaponProficient('Longsword')).toBe(true)
    expect(stats.isWeaponProficient('Longbow')).toBe(false)
  })
})
