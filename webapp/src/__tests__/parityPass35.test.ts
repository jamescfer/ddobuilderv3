// Parity pass 35: Stance requirement evaluation against activeBuffs.
//
// V2 parity: Requirement.cpp:1062-1072  EvaluateStance
//   bool Requirement::EvaluateStance(...) {
//     bool met = build.IsStanceActive(m_Item.front(), Weapon_Unknown);
//     return met;
//   }
//
// V3 was always returning true for Stance requirements regardless of whether
// the build had the stance active. When RequirementContext includes
// activeBuffs, the Stance case must evaluate against that list.

import { describe, expect, it } from 'vitest'
import { meetsRequirements } from '../lib/requirements'
import { emptyBuild } from '../types/ddo'
import type { CharacterBuild, DDOClass } from '../types/ddo'

const allClasses: DDOClass[] = []

function buildWith(overrides: Partial<CharacterBuild>): CharacterBuild {
  return { ...emptyBuild(), epicLevels: 0, legendaryLevels: 0, ...overrides } as CharacterBuild
}

describe('Stance requirement evaluation (V2 Requirement.cpp:1062 parity)', () => {
  it('passes conservatively when activeBuffs is not supplied in context', () => {
    const build = buildWith({ activeBuffs: [] })
    // No activeBuffs in ctx → conservative pass (backward compat)
    expect(
      meetsRequirements(
        { Requirement: [{ Type: 'Stance', Item: 'Power Attack Stance' }] },
        { build, allClasses },
      ),
    ).toBe(true)
  })

  it('passes when activeBuffs is supplied and contains the required stance', () => {
    const build = buildWith({ activeBuffs: ['Power Attack Stance'] })
    expect(
      meetsRequirements(
        { Requirement: [{ Type: 'Stance', Item: 'Power Attack Stance' }] },
        { build, allClasses, activeBuffs: build.activeBuffs },
      ),
    ).toBe(true)
  })

  it('fails when activeBuffs is supplied but does not contain the required stance', () => {
    // This is the key parity gap: V2 would return false here (stance not active)
    const build = buildWith({ activeBuffs: [] })
    expect(
      meetsRequirements(
        { Requirement: [{ Type: 'Stance', Item: 'Power Attack Stance' }] },
        { build, allClasses, activeBuffs: build.activeBuffs },
      ),
    ).toBe(false)
  })

  it('fails with a different stance active than the required one', () => {
    const build = buildWith({ activeBuffs: ['Defensive Stance'] })
    expect(
      meetsRequirements(
        { Requirement: [{ Type: 'Stance', Item: 'Power Attack Stance' }] },
        { build, allClasses, activeBuffs: build.activeBuffs },
      ),
    ).toBe(false)
  })

  it('works inside RequiresOneOf — passes when any listed stance is active', () => {
    const build = buildWith({ activeBuffs: ['Defensive Stance'] })
    expect(
      meetsRequirements(
        {
          RequiresOneOf: [{
            Requirement: [
              { Type: 'Stance', Item: 'Power Attack Stance' },
              { Type: 'Stance', Item: 'Defensive Stance' },
            ],
          }],
        },
        { build, allClasses, activeBuffs: build.activeBuffs },
      ),
    ).toBe(true)
  })

  it('works inside RequiresNoneOf — fails when a forbidden stance is active', () => {
    const build = buildWith({ activeBuffs: ['Frenzied Berserker'] })
    expect(
      meetsRequirements(
        {
          RequiresNoneOf: [{
            Requirement: [{ Type: 'Stance', Item: 'Frenzied Berserker' }],
          }],
        },
        { build, allClasses, activeBuffs: build.activeBuffs },
      ),
    ).toBe(false)
  })
})
