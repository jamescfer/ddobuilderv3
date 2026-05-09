import { describe, expect, it } from 'vitest'
import { collectSliders } from '../lib/effects/sliders'
import type { CharacterBuild, OptionalBuff, Feat, EnhancementTree } from '../types/ddo'
import { emptyBuild } from '../types/ddo'

function makeBuild(overrides: Partial<CharacterBuild> = {}): CharacterBuild {
  return { ...emptyBuild(), ...overrides }
}

describe('collectSliders', () => {
  it('extracts a slider declaration from an active self-buff', () => {
    const buffs: OptionalBuff[] = [
      {
        Name: 'Frenzied Berserker',
        Effect: [
          {
            Type: 'CreateSlider',
            Item: 'Frenzy Stacks',
            Amount: '0 0 6',
          } as never,
        ],
      } as unknown as OptionalBuff,
    ]
    const build = makeBuild({ activeBuffs: ['Frenzied Berserker'] })
    const out = collectSliders(build, buffs, [], [])
    expect(out).toHaveLength(1)
    expect(out[0].name).toBe('Frenzy Stacks')
    expect(out[0].min).toBe(0)
    expect(out[0].max).toBe(6)
  })

  it('does not collect sliders from inactive self-buffs', () => {
    const buffs: OptionalBuff[] = [
      {
        Name: 'Inactive Buff',
        Effect: [{ Type: 'CreateSlider', Item: 'X', Amount: '0 0 5' } as never],
      } as unknown as OptionalBuff,
    ]
    const build = makeBuild({ activeBuffs: [] })
    const out = collectSliders(build, buffs, [], [])
    expect(out).toEqual([])
  })

  it('extracts sliders from trained feats', () => {
    const feats: Feat[] = [
      {
        Name: 'Some Feat',
        Effect: [{ Type: 'CreateSlider', Item: 'Stuff', Amount: '1 0 3' } as never],
      } as unknown as Feat,
    ]
    const build = makeBuild({ featChoices: { 'slot-1': 'Some Feat' } })
    const out = collectSliders(build, [], feats, [])
    expect(out).toHaveLength(1)
    expect(out[0].initial).toBe(1)
  })

  it('records stance gating via activeWhen', () => {
    const buffs: OptionalBuff[] = [
      {
        Name: 'Sneaky',
        Effect: [
          {
            Type: 'CreateSlider',
            Item: 'Hide Stacks',
            Amount: '0 0 5',
            Requirements: { Requirement: { Type: 'Stance', Item: 'Sneak Stance' } },
          } as never,
        ],
      } as unknown as OptionalBuff,
    ]
    const build = makeBuild({ activeBuffs: ['Sneaky'] })
    const out = collectSliders(build, buffs, [], [])
    expect(out[0].activeWhen).toEqual({ kind: 'stance', name: 'Sneak Stance' })
  })

  it('deduplicates by slider name', () => {
    const buffs: OptionalBuff[] = [
      { Name: 'A', Effect: [{ Type: 'CreateSlider', Item: 'X', Amount: '0 0 5' } as never] } as unknown as OptionalBuff,
      { Name: 'B', Effect: [{ Type: 'CreateSlider', Item: 'X', Amount: '0 0 9' } as never] } as unknown as OptionalBuff,
    ]
    const build = makeBuild({ activeBuffs: ['A', 'B'] })
    const out = collectSliders(build, buffs, [], [])
    expect(out).toHaveLength(1)
  })

  it('extracts from active enhancement trees', () => {
    const trees: EnhancementTree[] = [
      {
        Name: 'Frenzied Berserker',
        EnhancementTreeItem: [
          {
            Name: 'Rage Stack',
            Effect: [{ Type: 'CreateSlider', Item: 'Rage Stacks', Amount: '0 0 6' } as never],
          } as never,
        ],
      } as unknown as EnhancementTree,
    ]
    const build = makeBuild({
      enhancementChoices: { 'Frenzied Berserker': { 'Rage Stack': 1 } },
    })
    const out = collectSliders(build, [], [], trees)
    expect(out[0].name).toBe('Rage Stacks')
  })
})
