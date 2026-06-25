// Parity pass X5 — Forum export grantedFeats section uses stats.grantedFeatsList
//
// V2 ForumExportDlg.cpp:662-735 AddGrantedFeats() iterates the list of feats
// granted by GrantFeat effects (from enhancements, items, augments) and emits
// each name under a [b]Granted Feats[/b] header.
//
// V3 sections.ts::grantedFeats previously used an old heuristic:
//   build.featChoices keys that start with "granted:" — which never matches
//   real slot-key patterns in the reducer, so the section was always empty.
//
// PR #60 (parity pass 60) added BuildStats.grantedFeatsList (parallel to
// slaList) populated from grantedFeat.* stat-map keys. The export section must
// use stats?.grantedFeatsList when stats are available.

import { describe, expect, it } from 'vitest'
import { DEFAULT_SECTIONS } from '../lib/export/sections'
import { emptyBuild } from '../types/ddo'
import type { BuildStats } from '../hooks/useBuildStats'

function mockStats(overrides: { grantedFeatsList?: string[] } = {}): BuildStats {
  return {
    total: (_key: string) => 0,
    resolve: (_key: string) => ({ total: 0, bonuses: [] }),
    keys: () => [],
    weapon: null,
    armorMaxDex: null,
    slaList: [],
    grantedFeatsList: overrides.grantedFeatsList ?? [],
    isWeaponProficient: () => false,
  } as unknown as BuildStats
}

describe('Forum export grantedFeats section — stats.grantedFeatsList parity (X5)', () => {
  const grantedFeatsSection = DEFAULT_SECTIONS.find(s => s.id === 'GrantedFeats')!

  it('emits nothing when grantedFeatsList is empty', () => {
    const lines = grantedFeatsSection.emit({ build: emptyBuild(), stats: mockStats() })
    expect(lines).toHaveLength(0)
  })

  it('emits nothing when stats is null (no stat computation available)', () => {
    const lines = grantedFeatsSection.emit({ build: emptyBuild(), stats: null })
    expect(lines).toHaveLength(0)
  })

  it('emits header and one feat name from grantedFeatsList', () => {
    const stats = mockStats({ grantedFeatsList: ['Magical Training'] })
    const lines = grantedFeatsSection.emit({ build: emptyBuild(), stats })
    expect(lines.some(l => /Granted Feats/i.test(l))).toBe(true)
    expect(lines).toContain('  Magical Training')
  })

  it('emits multiple feat names from grantedFeatsList', () => {
    const stats = mockStats({ grantedFeatsList: ['Diehard', 'Evasion', 'Magical Training'] })
    const lines = grantedFeatsSection.emit({ build: emptyBuild(), stats })
    expect(lines).toContain('  Diehard')
    expect(lines).toContain('  Evasion')
    expect(lines).toContain('  Magical Training')
  })

  it('does not emit section when stats has empty grantedFeatsList even if build.featChoices is non-empty', () => {
    const build = {
      ...emptyBuild(),
      featChoices: {
        'hero:1:Fighter Bonus Feat': 'Power Attack',
        'granted:SomeOldKey': 'SomeOldFeat',  // old heuristic key — should be ignored
      },
    }
    const stats = mockStats({ grantedFeatsList: [] })
    const lines = grantedFeatsSection.emit({ build, stats })
    expect(lines).toHaveLength(0)
  })
})
