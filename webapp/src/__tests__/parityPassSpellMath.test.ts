// V2-exact spell math (Spell.cpp):
//  - TotalCost (:354-448) = base cost + active metamagic surcharges ONLY.
//    Effect_SpellCostReduction feeds a display-only breakdown
//    (BreakdownsPane.cpp:1689) that TotalCost never consumes.
//  - ActualMaxCasterLevel (:199-228) has NO class-level floor.

import { describe, it, expect } from 'vitest'
import { computeSpellCost, computeMaxCasterLevel, computeCasterLevel } from '../lib/spells/spellMath'
import type { Spell, DDOClass } from '../types/ddo'
import type { BuildStats } from '../hooks/useBuildStats'

function statsWith(totals: Record<string, number>): BuildStats {
  return {
    total: (k: string) => totals[k] ?? 0,
    resolve: (k: string) => ({ key: k, total: totals[k] ?? 0, contributions: [] }),
    keys: () => Object.keys(totals),
  } as unknown as BuildStats
}

const wizard = { Name: 'Wizard' } as DDOClass

describe('computeSpellCost — V2 TotalCost parity', () => {
  const spell = { Name: 'Fireball', Cost: 15, Level: { Wizard: 3 } } as unknown as Spell

  it('ignores spell-cost reductions (display-only in V2)', () => {
    const stats = statsWith({ 'spellCost.Wizard': -5, 'spellCost.All': -3, spellCostPct: 25 })
    expect(computeSpellCost(spell, wizard, 20, stats, [])).toBe(15)
  })

  it('adds active metamagic surcharges', () => {
    const stats = statsWith({ 'metamagic.cost.Maximize': 25 })
    expect(computeSpellCost(spell, wizard, 20, stats, ['Maximize'])).toBe(40)
  })
})

describe('computeMaxCasterLevel — no class-level floor (V2 :199-228)', () => {
  it('keeps the printed MaxCasterLevel even when class level exceeds it', () => {
    const spell = { Name: 'Snowball Swarm', MaxCasterLevel: 10, School: [] } as unknown as Spell
    const stats = statsWith({})
    expect(computeMaxCasterLevel(spell, wizard, 17, stats)).toBe(10)
    // and caster level is capped by it
    expect(computeCasterLevel(spell, wizard, 17, stats)).toBe(10)
  })

  it('still applies maxCl effect bonuses', () => {
    const spell = { Name: 'Snowball Swarm', MaxCasterLevel: 10, School: [] } as unknown as Spell
    const stats = statsWith({ 'maxCl.Wizard': 2, 'maxCl.All': 1 })
    expect(computeMaxCasterLevel(spell, wizard, 17, stats)).toBe(13)
  })
})
