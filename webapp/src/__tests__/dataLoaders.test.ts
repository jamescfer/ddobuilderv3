// V2-parity loaders for the new XML files added to V3 (AttackRates,
// BonusTypes, Challenges, ItemBuffs, ItemClickies). The test asserts the
// loader returns sensible structured data when the real V2 DataFiles/
// directory is present, and gracefully returns [] otherwise.
//
// V2 sources:
//   AttackRates.xml      attacks-per-minute by combat style
//   BonusTypes.xml       bonus-type stacking rules
//   Challenges.xml       Update 79 patron-affiliated challenges
//   ItemBuffs.xml        item-buff catalogue (Type → display text)
//   ItemClickies.xml     clickie spell catalogue (Name → description)

import { describe, expect, it } from 'vitest'
import { existsSync } from 'fs'
import { join } from 'path'
import {
  loadAttackRates, loadBonusTypes, loadChallenges, loadItemBuffs, loadItemClickies,
  loadAllCatalogues,
} from '../server/dataLoaders'

const DATA_DIR = join(__dirname, '..', '..', '..', 'Output', 'DataFiles')
const haveData = existsSync(DATA_DIR)
const maybeDescribe = haveData ? describe : describe.skip

maybeDescribe('V2 data loaders — new XML formats', () => {
  it('loadAttackRates returns at least Two Weapon Fighting and Two Handed Fighting', () => {
    const rates = loadAttackRates(DATA_DIR)
    expect(rates.length).toBeGreaterThan(2)
    const styles = rates.map(r => r.Style)
    expect(styles).toContain('Two Weapon Fighting')
    expect(styles).toContain('Two Handed Fighting')
  })

  it('loadBonusTypes returns the Action Boost and Enhancement bonus rules', () => {
    const types = loadBonusTypes(DATA_DIR)
    expect(types.length).toBeGreaterThan(20)
    const names = types.map(t => t.Name)
    expect(names).toContain('Action Boost')
    expect(names).toContain('Enhancement')
    // Action Boost is "Highest Only" stacking
    const ab = types.find(t => t.Name === 'Action Boost')
    expect(ab?.Stacking).toBe('Highest Only')
  })

  it('loadChallenges returns the Cannith challenges added in Update 79', () => {
    const ch = loadChallenges(DATA_DIR)
    expect(ch.length).toBeGreaterThan(5)
    const names = ch.map(c => c.Name)
    expect(names.some(n => n.includes('Rushmore'))).toBe(true)
  })

  it('loadItemBuffs returns the V2 buff display-text catalogue', () => {
    const buffs = loadItemBuffs(DATA_DIR)
    expect(buffs.length).toBeGreaterThan(100)
    expect(buffs.find(b => b.Type === 'BuffNotFound')).toBeDefined()
  })

  it('loadItemClickies returns clickie spell metadata', () => {
    const clickies = loadItemClickies(DATA_DIR)
    expect(clickies.length).toBeGreaterThan(50)
    expect(clickies.every(c => typeof c.Name === 'string')).toBe(true)
  })

  it('loadAllCatalogues exposes every new V2-parity collection', () => {
    const all = loadAllCatalogues(DATA_DIR)
    expect(all.allAttackRates.length).toBeGreaterThan(2)
    expect(all.allBonusTypes.length).toBeGreaterThan(20)
    expect(all.allChallenges.length).toBeGreaterThan(5)
    expect(all.allItemBuffs.length).toBeGreaterThan(100)
    expect(all.allItemClickies.length).toBeGreaterThan(50)
  })
})

describe('V2 data loaders — graceful fallback when DataFiles missing', () => {
  // Always-on tests; uses an obviously-bogus path.
  const NO_DIR = join(__dirname, '__definitely_does_not_exist__')

  it('AttackRates / BonusTypes / etc. return [] for a missing dir', () => {
    expect(loadAttackRates(NO_DIR)).toEqual([])
    expect(loadBonusTypes(NO_DIR)).toEqual([])
    expect(loadChallenges(NO_DIR)).toEqual([])
    expect(loadItemBuffs(NO_DIR)).toEqual([])
    expect(loadItemClickies(NO_DIR)).toEqual([])
  })
})
