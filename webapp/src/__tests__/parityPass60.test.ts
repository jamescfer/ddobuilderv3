/**
 * Parity pass 60 — grantedFeatsList exposed on BuildStats (U5 completion)
 *
 * V2 source: Build::ApplyFeatEffects / Grant Feats pane (GrantedFeatsPane.cpp)
 *   V2 maintains a separate "Granted Feats" pane showing feats granted by
 *   enhancement/item/augment GrantFeat effects, distinct from the Automatic
 *   Feats pane (race/class) and the Special Feats pane (past lives, favor).
 *
 * V3 gap (before this fix): buildStatMap accumulates grantedFeat.* stat keys
 *   so the effects ARE applied to the build, but BuildStats never exposes the
 *   list of granted feat names. AutomaticFeats.tsx therefore cannot render a
 *   separate "Granted Feats" subsection.
 *
 * Fix: BuildStats gains a grantedFeatsList: string[] field (parallel to slaList)
 *   populated from map keys with the "grantedFeat." prefix.
 */

import { describe, it, expect } from 'vitest'
import { computeBuildStats, type BuildStatsInput } from '../hooks/useBuildStats'
import { emptyBuild as makeEmptyBuild } from '../types/ddo'
import type {
  DDOClass, Feat, EnhancementTree, Item, OptionalBuff,
  SetBonus, Augment, FiligreeSetBonus, Filigree, Race,
} from '../types/ddo'

// ---------------------------------------------------------------------------
// Minimal fixtures — reuse the Bard/Magical Training setup from pass 59
// ---------------------------------------------------------------------------

const bardClass: DDOClass = {
  Name: 'Bard', HitPoints: 6, Fortitude: 'Type1', Reflex: 'Type2',
  Will: 'Type2', BAB: '0 1 1 2 2 3',
} as unknown as DDOClass

const magicalTrainingFeat: Feat = {
  Name: 'Magical Training',
  Effect: [
    { Type: 'SpellPoints', Bonus: 'Feat', AType: 'Stacks', Amount: 80 },
    { Type: 'SpellLore', Bonus: 'Feat', AType: 'Stacks', Amount: 5, Item: 'Universal' },
  ],
} as unknown as Feat

const dieHardFeat: Feat = {
  Name: 'Diehard',
  Effect: { Type: 'HitPoints', Bonus: 'Feat', AType: 'Stacks', Amount: 20 },
} as unknown as Feat

/** Spellsinger tree grants Magical Training at rank 3 */
const spellsingerTree: EnhancementTree = {
  Name: 'Bard_Spellsinger',
  EnhancementTreeItem: [
    {
      Name: 'Spellsinger: Studies',
      Ranks: 3,
      CostPerRank: '1',
      Selector: [
        {
          EnhancementSelection: [
            {
              Name: 'Magical Studies',
              Effect: [
                {
                  Type: 'SpellPoints',
                  Bonus: 'Enhancement',
                  AType: 'Stacks',
                  Amount: '30 60 100',
                },
                {
                  Type: 'GrantFeat',
                  Bonus: 'Enhancement',
                  AType: 'NotNeeded',
                  Item: 'Magical Training',
                  Rank: 3,
                },
              ],
            },
          ],
        },
      ],
    },
    {
      Name: 'Spellsinger: Frenzied',
      Ranks: 1,
      CostPerRank: '1',
      Effect: {
        Type: 'GrantFeat',
        Bonus: 'Enhancement',
        AType: 'NotNeeded',
        Item: 'Diehard',
      },
    },
  ],
} as unknown as EnhancementTree

function emptyInput(feats: Feat[] = [], trees: EnhancementTree[] = []): BuildStatsInput {
  return {
    allRaces: [] as Race[],
    allClasses: [bardClass],
    allFeats: feats,
    allTrees: trees,
    gearItems: {} as Record<string, Item>,
    allSelfBuffs: [] as OptionalBuff[],
    allAugments: [] as Augment[],
    allSetBonuses: [] as SetBonus[],
    allFiligreeBonuses: [] as FiligreeSetBonus[],
    allFiligrees: [] as Filigree[],
  }
}

function bardBuild(rank: number, grantDiehard = false) {
  return {
    ...makeEmptyBuild(),
    classes: [{ name: 'Bard', levels: 5 }],
    levelClasses: ['Bard', 'Bard', 'Bard', 'Bard', 'Bard'],
    totalLevel: 5,
    featChoices: {},
    enhancementChoices: {
      Bard_Spellsinger: {
        'Spellsinger: Studies': rank,
        ...(grantDiehard ? { 'Spellsinger: Frenzied': 1 } : {}),
      },
    },
    enhancementSelections: {
      Bard_Spellsinger: { 'Spellsinger: Studies': 'Magical Studies' },
    },
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('BuildStats.grantedFeatsList — V2 GrantedFeatsPane parity', () => {
  it('grantedFeatsList is present on the BuildStats object', () => {
    const stats = computeBuildStats(emptyInput(), makeEmptyBuild())
    expect(stats).toHaveProperty('grantedFeatsList')
    expect(Array.isArray(stats.grantedFeatsList)).toBe(true)
  })

  it('grantedFeatsList is empty when no GrantFeat effects fire', () => {
    const stats = computeBuildStats(emptyInput(), makeEmptyBuild())
    expect(stats.grantedFeatsList).toHaveLength(0)
  })

  it('grantedFeatsList contains the feat name when a rank-3 GrantFeat fires', () => {
    const stats = computeBuildStats(
      emptyInput([magicalTrainingFeat, dieHardFeat], [spellsingerTree]),
      bardBuild(3),
    )
    expect(stats.grantedFeatsList).toContain('Magical Training')
  })

  it('grantedFeatsList is empty when rank is below the GrantFeat threshold', () => {
    const stats = computeBuildStats(
      emptyInput([magicalTrainingFeat, dieHardFeat], [spellsingerTree]),
      bardBuild(2),
    )
    expect(stats.grantedFeatsList).not.toContain('Magical Training')
  })

  it('grantedFeatsList contains multiple feats when multiple GrantFeat effects fire', () => {
    const stats = computeBuildStats(
      emptyInput([magicalTrainingFeat, dieHardFeat], [spellsingerTree]),
      bardBuild(3, true),
    )
    expect(stats.grantedFeatsList).toContain('Magical Training')
    expect(stats.grantedFeatsList).toContain('Diehard')
  })

  it('grantedFeatsList is sorted alphabetically', () => {
    const stats = computeBuildStats(
      emptyInput([magicalTrainingFeat, dieHardFeat], [spellsingerTree]),
      bardBuild(3, true),
    )
    const sorted = [...stats.grantedFeatsList].sort()
    expect(stats.grantedFeatsList).toEqual(sorted)
  })

  it('grantedFeatsList includes a granted feat even when also player-trained', () => {
    // grantedFeatsList shows feats the GrantFeat effect fired for; stat deduplication
    // (ctxFeats check) is separate from display — V2 GrantedFeatsPane shows grants
    // regardless of whether the feat is also in the trained-feat list.
    const build = {
      ...bardBuild(3),
      featChoices: { 'Hero 1': 'Magical Training' },
    }
    const stats = computeBuildStats(
      emptyInput([magicalTrainingFeat, dieHardFeat], [spellsingerTree]),
      build,
    )
    expect(stats.grantedFeatsList).toContain('Magical Training')
  })
})
