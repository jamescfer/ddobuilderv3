import { describe, it, expect } from 'vitest'
import { availableTwistItems } from '../lib/twists'
import type { EnhancementTree } from '../types/ddo'

function makeTree(name: string, items: Array<{ name: string; tier5?: boolean }>): EnhancementTree {
  return {
    Name: name,
    IsEpicDestiny: true,
    EnhancementTreeItem: items.map(i => ({
      Name: i.name,
      InternalName: i.name,
      Ranks: 1,
      CostPerRank: '1',
      ...(i.tier5 ? { Tier5: true } : {}),
    })),
  } as EnhancementTree
}

describe('availableTwistItems (U2 — Twists of Fate)', () => {
  it('returns an empty array when no trees are provided', () => {
    expect(availableTwistItems([])).toEqual([])
  })

  it('excludes Tier5 items — they cannot be twisted', () => {
    const t = makeTree('Fatesinger', [
      { name: 'Song of Heroism' },
      { name: 'Fatesinger Capstone', tier5: true },
    ])
    const result = availableTwistItems([t])
    expect(result).toHaveLength(1)
    expect(result[0].key).toBe('Song of Heroism')
    expect(result[0].treeName).toBe('Fatesinger')
  })

  it('includes non-Tier5 items from all provided trees', () => {
    const trees = [
      makeTree('Fatesinger', [{ name: 'SongA' }, { name: 'FSCap', tier5: true }]),
      makeTree('Fury of the Wild', [{ name: 'FuryA' }, { name: 'FuryCap', tier5: true }]),
    ]
    const result = availableTwistItems(trees)
    expect(result).toHaveLength(2)
    expect(result.map(r => r.treeName)).toContain('Fatesinger')
    expect(result.map(r => r.treeName)).toContain('Fury of the Wild')
    expect(result.map(r => r.key)).toContain('SongA')
    expect(result.map(r => r.key)).toContain('FuryA')
  })

  it('uses InternalName as the key (falls back to Name when absent)', () => {
    const tree: EnhancementTree = {
      Name: 'Primal Avatar',
      IsEpicDestiny: true,
      EnhancementTreeItem: [
        { Name: 'Strength of the Beast', InternalName: 'PAStrengthOfTheBeast', Ranks: 1 },
        { Name: 'Item Without Internal Name', Ranks: 1 },
      ],
    } as EnhancementTree
    const result = availableTwistItems([tree])
    expect(result).toHaveLength(2)
    expect(result[0].key).toBe('PAStrengthOfTheBeast')
    expect(result[1].key).toBe('Item Without Internal Name')
  })

  it('returns empty list when all items in every tree are Tier5', () => {
    const t = makeTree('Magister', [
      { name: 'Cap A', tier5: true },
      { name: 'Cap B', tier5: true },
    ])
    expect(availableTwistItems([t])).toEqual([])
  })
})
