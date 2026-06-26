// Parity pass X4 — Forum export tacticalDCs section broken
//
// V2 ForumExportDlg.cpp:1735-1757 emits per-type tactical DC rows for all 13
// types defined in TacticalTypes.h. V3 sections.ts had a tacticalDCs section
// that called stats.total('tacticalDC') which is always 0 — parseEffect routes
// to 'tacticalDC.All' or 'tacticalDC.{Type}', never to bare 'tacticalDC'.

import { describe, expect, it } from 'vitest'
import { DEFAULT_SECTIONS } from '../lib/export/sections'
import { emptyBuild } from '../types/ddo'
import type { BuildStats } from '../hooks/useBuildStats'

function mockStats(overrides: Record<string, number>): BuildStats {
  return {
    total: (key: string) => overrides[key] ?? 0,
    resolve: (key: string) => ({ total: overrides[key] ?? 0, bonuses: [] }),
    keys: () => Object.keys(overrides),
    weapon: null,
    armorMaxDex: null,
    slaList: [],
    grantedFeatsList: [],
    isWeaponProficient: () => false,
  } as unknown as BuildStats
}

describe('Forum export tacticalDCs section — parity pass X4', () => {
  const tacticalSection = DEFAULT_SECTIONS.find(s => s.id === 'TacticalDCs')!
  const build = emptyBuild()

  it('returns empty array when no tactical DC bonuses are set', () => {
    const stats = mockStats({})
    expect(tacticalSection.emit({ build, stats })).toEqual([])
  })

  it('emits a Trip row when tacticalDC.Trip is non-zero', () => {
    const stats = mockStats({ 'tacticalDC.Trip': 4 })
    const lines = tacticalSection.emit({ build, stats })
    expect(lines.length).toBeGreaterThan(0)
    expect(lines.some(l => l.includes('Trip') && l.includes('+4'))).toBe(true)
  })

  it('emits a Stun row when tacticalDC.Stun is non-zero', () => {
    const stats = mockStats({ 'tacticalDC.Stun': 6 })
    const lines = tacticalSection.emit({ build, stats })
    expect(lines.some(l => l.includes('Stun') && l.includes('+6'))).toBe(true)
  })

  it('emits multiple rows for multiple non-zero types', () => {
    const stats = mockStats({
      'tacticalDC.Trip': 3,
      'tacticalDC.Stun': 5,
      'tacticalDC.Sunder': 2,
      'tacticalDC.Assassinate': 7,
    })
    const lines = tacticalSection.emit({ build, stats })
    expect(lines.some(l => l.includes('Trip'))).toBe(true)
    expect(lines.some(l => l.includes('Stun'))).toBe(true)
    expect(lines.some(l => l.includes('Sunder'))).toBe(true)
    expect(lines.some(l => l.includes('Assassinate'))).toBe(true)
  })

  it('omits types where the bonus is zero', () => {
    const stats = mockStats({ 'tacticalDC.Stun': 4 })
    const lines = tacticalSection.emit({ build, stats })
    expect(lines.some(l => l.includes('Trip'))).toBe(false)
    expect(lines.some(l => l.includes('Assassinate'))).toBe(false)
    expect(lines.some(l => l.includes('Sunder'))).toBe(false)
  })

  it('emits a header line when any type is non-zero', () => {
    const stats = mockStats({ 'tacticalDC.Stun': 5 })
    const lines = tacticalSection.emit({ build, stats })
    expect(lines[0]).toMatch(/Tactical DC/i)
  })

  it('adds tacticalDC.All to each specific type total', () => {
    const stats = mockStats({
      'tacticalDC.All': 2,
      'tacticalDC.Trip': 4,
    })
    const lines = tacticalSection.emit({ build, stats })
    expect(lines.some(l => l.includes('Trip') && l.includes('+6'))).toBe(true)
    expect(lines.some(l => l.includes('Stun') && l.includes('+2'))).toBe(true)
  })

  it('supports all 13 V2 tactical types by their canonical display names', () => {
    const stats = mockStats({
      'tacticalDC.Assassinate': 1,
      'tacticalDC.Trap': 2,
      'tacticalDC.Trip': 3,
      'tacticalDC.Stun': 4,
      'tacticalDC.Sunder': 5,
      'tacticalDC.StunningShield': 6,
      'tacticalDC.General': 7,
      'tacticalDC.Wands': 8,
      'tacticalDC.Fear': 9,
      'tacticalDC.InnateAttack': 10,
      'tacticalDC.BreathWeapon': 11,
      'tacticalDC.Poison': 12,
      'tacticalDC.RuneArm': 13,
    })
    const lines = tacticalSection.emit({ build, stats })
    expect(lines.some(l => l.includes('Assassinate'))).toBe(true)
    expect(lines.some(l => l.includes('Trap'))).toBe(true)
    expect(lines.some(l => l.includes('Trip'))).toBe(true)
    expect(lines.some(l => l.includes('Stun'))).toBe(true)
    expect(lines.some(l => l.includes('Sunder'))).toBe(true)
    expect(lines.some(l => l.includes('Stunning Shield'))).toBe(true)
    expect(lines.some(l => l.includes('General'))).toBe(true)
    expect(lines.some(l => l.includes('Wands'))).toBe(true)
    expect(lines.some(l => l.includes('Fear'))).toBe(true)
    expect(lines.some(l => l.includes('Innate Attack'))).toBe(true)
    expect(lines.some(l => l.includes('Breath Weapon'))).toBe(true)
    expect(lines.some(l => l.includes('Poison'))).toBe(true)
    expect(lines.some(l => l.includes('Rune Arm'))).toBe(true)
  })

  it('handles negative tactical DC bonuses (debuffs)', () => {
    const stats = mockStats({ 'tacticalDC.Trip': -2 })
    const lines = tacticalSection.emit({ build, stats })
    expect(lines.some(l => l.includes('Trip') && l.includes('-2'))).toBe(true)
  })
})
