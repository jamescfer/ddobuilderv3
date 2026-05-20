/**
 * Parity pass 26 — ExclusionGroup enforcement
 *
 * V2 parity: Build::IsExclusiveEnhancement (Build.cpp:3617-3636)
 * and the Requirement_Exclusive evaluation (Requirement.cpp:857-868).
 *
 * V2 behaviour: an enhancement with an ExclusionGroup effect "claims" a named
 * group. Once claimed, only that same enhancement (identified by its InternalName)
 * can satisfy the corresponding Exclusive requirement. Any other enhancement in
 * the same group is blocked. Groups that have not been claimed yet are open to
 * any enhancement.
 */

import { describe, it, expect } from 'vitest'
import { meetsRequirements } from '../lib/requirements'
import { computeExclusionGroups } from '../lib/exclusionGroups'
import { emptyBuild } from '../types/ddo'
import type { CharacterBuild, DDOClass, EnhancementTree, Requirements } from '../types/ddo'

const allClasses: DDOClass[] = [{ Name: 'Fighter', BAB: '0 1' }]

function buildWith(overrides: Partial<CharacterBuild>): CharacterBuild {
  return { ...emptyBuild(), epicLevels: 0, legendaryLevels: 0, ...overrides } as CharacterBuild
}

// ---------------------------------------------------------------------------
// meetsRequirements — Exclusive type
// ---------------------------------------------------------------------------

describe('Exclusive requirement — V2 IsExclusiveEnhancement parity', () => {
  it('passes conservatively when exclusionGroups not provided (backward compat)', () => {
    const build = buildWith({})
    const reqs: Requirements = {
      Requirement: [{ Type: 'Exclusive', Item: ['AMCore6', 'Capstone Enhancement'] }],
    }
    // No exclusionGroups in context → always true (conservative)
    expect(meetsRequirements(reqs, { build, allClasses })).toBe(true)
  })

  it('passes for the enhancement that owns the group', () => {
    const build = buildWith({})
    const reqs: Requirements = {
      Requirement: [{ Type: 'Exclusive', Item: ['AMCore6', 'Capstone Enhancement'] }],
    }
    const exclusionGroups = { 'Capstone Enhancement': 'AMCore6' }
    expect(meetsRequirements(reqs, { build, allClasses, exclusionGroups })).toBe(true)
  })

  it('fails for a different enhancement in the same group (group already claimed)', () => {
    const build = buildWith({})
    const reqs: Requirements = {
      Requirement: [{ Type: 'Exclusive', Item: ['DDDACore6', 'Capstone Enhancement'] }],
    }
    // AMCore6 owns the "Capstone Enhancement" group, DDDACore6 cannot claim it
    const exclusionGroups = { 'Capstone Enhancement': 'AMCore6' }
    expect(meetsRequirements(reqs, { build, allClasses, exclusionGroups })).toBe(false)
  })

  it('passes when the group has not been claimed yet (empty exclusionGroups)', () => {
    const build = buildWith({})
    const reqs: Requirements = {
      Requirement: [{ Type: 'Exclusive', Item: ['DDDACore6', 'Capstone Enhancement'] }],
    }
    expect(meetsRequirements(reqs, { build, allClasses, exclusionGroups: {} })).toBe(true)
  })

  it('passes for a single-Item Exclusive requirement (Item is a plain string)', () => {
    // Some XML has a single Item value; group name == enhancement id
    const build = buildWith({})
    const reqs: Requirements = {
      Requirement: [{ Type: 'Exclusive', Item: 'SharedSlot' }],
    }
    // Group 'SharedSlot' claimed by 'SharedSlot': should pass (isUs)
    expect(meetsRequirements(reqs, { build, allClasses, exclusionGroups: { SharedSlot: 'SharedSlot' } })).toBe(true)
    // Group 'SharedSlot' claimed by 'OtherSlot': should fail
    expect(meetsRequirements(reqs, { build, allClasses, exclusionGroups: { SharedSlot: 'OtherSlot' } })).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// computeExclusionGroups — derive map from trained enhancements
// ---------------------------------------------------------------------------

describe('computeExclusionGroups — V2 m_exclusiveEnhancements parity', () => {
  it('returns empty map when no enhancements are trained', () => {
    const build = buildWith({ enhancementChoices: {} })
    expect(computeExclusionGroups(build, [])).toEqual({})
  })

  it('maps group name to InternalName for a trained enhancement with ExclusionGroup effect', () => {
    const build = buildWith({
      enhancementChoices: { 'Wizard ArchMage': { AMCore6: 1 } },
    })
    const trees: EnhancementTree[] = [
      {
        Name: 'Wizard ArchMage',
        EnhancementTreeItem: [
          {
            Name: 'Archmage: Capstone',
            InternalName: 'AMCore6',
            Effect: { Type: 'ExclusionGroup', Item: ['AMCore6', 'Capstone Enhancement'] },
          },
        ],
      },
    ]
    const groups = computeExclusionGroups(build, trees)
    expect(groups['Capstone Enhancement']).toBe('AMCore6')
  })

  it('does not claim a group for an untrained enhancement (rank 0)', () => {
    const build = buildWith({
      enhancementChoices: { 'Wizard ArchMage': { AMCore6: 0 } },
    })
    const trees: EnhancementTree[] = [
      {
        Name: 'Wizard ArchMage',
        EnhancementTreeItem: [
          {
            Name: 'Archmage: Capstone',
            InternalName: 'AMCore6',
            Effect: { Type: 'ExclusionGroup', Item: ['AMCore6', 'Capstone Enhancement'] },
          },
        ],
      },
    ]
    const groups = computeExclusionGroups(build, trees)
    expect(groups['Capstone Enhancement']).toBeUndefined()
  })

  it('falls back to display Name when InternalName is absent', () => {
    const build = buildWith({
      enhancementChoices: { TreeX: { 'My Enhancement': 1 } },
    })
    const trees: EnhancementTree[] = [
      {
        Name: 'TreeX',
        EnhancementTreeItem: [
          {
            Name: 'My Enhancement',
            // No InternalName — key falls back to Name
            Effect: { Type: 'ExclusionGroup', Item: ['My Enhancement', 'GroupG'] },
          },
        ],
      },
    ]
    const groups = computeExclusionGroups(build, trees)
    expect(groups['GroupG']).toBe('My Enhancement')
  })

  it('first-trained enhancement wins when two trees claim the same group', () => {
    // This represents a corrupted/invalid build state; we just verify
    // we produce a deterministic result rather than crashing.
    const build = buildWith({
      enhancementChoices: {
        TreeA: { EncA: 1 },
        TreeB: { EncB: 1 },
      },
    })
    const trees: EnhancementTree[] = [
      {
        Name: 'TreeA',
        EnhancementTreeItem: [
          {
            Name: 'Enc A',
            InternalName: 'EncA',
            Effect: { Type: 'ExclusionGroup', Item: ['EncA', 'SharedGroup'] },
          },
        ],
      },
      {
        Name: 'TreeB',
        EnhancementTreeItem: [
          {
            Name: 'Enc B',
            InternalName: 'EncB',
            Effect: { Type: 'ExclusionGroup', Item: ['EncB', 'SharedGroup'] },
          },
        ],
      },
    ]
    const groups = computeExclusionGroups(build, trees)
    // Exactly one should own the group; TreeA iterates first
    expect(groups['SharedGroup']).toBe('EncA')
  })

  it('handles effect as an array — picks up ExclusionGroup among multiple effects', () => {
    const build = buildWith({
      enhancementChoices: { TreeX: { AMSubtle: 1 } },
    })
    const trees: EnhancementTree[] = [
      {
        Name: 'TreeX',
        EnhancementTreeItem: [
          {
            Name: 'Subtle Spellcasting',
            InternalName: 'AMSubtle',
            Effect: [
              { Type: 'ThreatBonusSpell', Bonus: 'Enhancement', AType: 'Stacks', Amount: -10 },
              { Type: 'ExclusionGroup', Item: ['AMSubtle', 'Magical Subtlety'] },
            ],
          },
        ],
      },
    ]
    const groups = computeExclusionGroups(build, trees)
    expect(groups['Magical Subtlety']).toBe('AMSubtle')
  })
})
