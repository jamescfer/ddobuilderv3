import { describe, it, expect } from 'vitest'
import { tier5LockedTree, availableDestinyTrees } from '../lib/destiny'
import { emptyBuild } from '../types/ddo'
import type { EnhancementTree } from '../types/ddo'

// Minimal destiny tree factory.
function tree(name: string, opts: { tier5Item?: string; req?: EnhancementTree['Requirements'] } = {}): EnhancementTree {
  const items = [
    { Name: `${name}-core`, InternalName: `${name}-core`, YPosition: 0, Ranks: 1, CostPerRank: '1' },
    { Name: `${name}-t1`, InternalName: `${name}-t1`, YPosition: 1, Ranks: 3, CostPerRank: '1', MinSpent: 1 },
  ]
  if (opts.tier5Item) {
    items.push({ Name: opts.tier5Item, InternalName: opts.tier5Item, YPosition: 5, Ranks: 1, CostPerRank: '2', MinSpent: 30, Tier5: true } as never)
  }
  return { Name: name, IsEpicDestiny: true, Requirements: opts.req, EnhancementTreeItem: items } as EnhancementTree
}

describe('tier5LockedTree (V2 single-tree Tier-5 lock)', () => {
  const trees = [
    tree('Fatesinger', { tier5Item: 'FS-capstone' }),
    tree('FuryOfTheWild', { tier5Item: 'Fury-capstone' }),
  ]

  it('returns empty when no Tier-5 is trained', () => {
    expect(tier5LockedTree(['Fatesinger', 'FuryOfTheWild', ''], { Fatesinger: { 'Fatesinger-t1': 3 } }, trees)).toBe('')
  })

  it('returns the tree holding a trained Tier-5', () => {
    expect(tier5LockedTree(
      ['Fatesinger', 'FuryOfTheWild', ''],
      { FuryOfTheWild: { 'Fury-capstone': 1 } },
      trees,
    )).toBe('FuryOfTheWild')
  })

  it('ignores Tier-5 spend in non-selected trees', () => {
    expect(tier5LockedTree(
      ['Fatesinger', '', ''],
      { FuryOfTheWild: { 'Fury-capstone': 1 } },
      trees,
    )).toBe('')
  })
})

describe('availableDestinyTrees (V2 requirement-based availability)', () => {
  // In real data the destiny tree Name equals its same-named claim feat.
  const trees = [
    tree('Fatesinger', { req: { Requirement: { Type: 'Feat', Item: 'Fatesinger' } } }),
    tree('Fury of the Wild', { req: { Requirement: { Type: 'Feat', Item: 'Fury of the Wild' } } }),
    tree('Dwarven Destiny', { req: { Requirement: { Type: 'Race', Item: 'Dwarf' } } }),
  ]

  it('is empty below epic levels', () => {
    const b = { ...emptyBuild(), totalLevel: 19 }
    expect(availableDestinyTrees(trees, b, [])).toEqual([])
  })

  it('offers all destinies whose claim-feat requirement is met at level 20+', () => {
    const b = { ...emptyBuild(), totalLevel: 20, race: 'Human' }
    const names = availableDestinyTrees(trees, b, []).map(t => t.Name)
    expect(names).toContain('Fatesinger')
    expect(names).toContain('Fury of the Wild')
    // Dwarven Destiny has an extra Race requirement a Human does not meet
    expect(names).not.toContain('Dwarven Destiny')
  })

  it('respects additional requirements (Dwarf gets the dwarf-only tree)', () => {
    const b = { ...emptyBuild(), totalLevel: 30, race: 'Dwarf' }
    expect(availableDestinyTrees(trees, b, []).map(t => t.Name)).toContain('Dwarven Destiny')
  })
})
