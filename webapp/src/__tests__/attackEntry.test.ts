import { describe, expect, it } from 'vitest'
import { buildAttackEntry } from '../lib/combat/attackEntry'
import type { BuildStats, WeaponInfo } from '../hooks/useBuildStats'
import type { ResolvedStat } from '../lib/bonus'

function makeStats(map: Record<string, number>): BuildStats {
  return {
    resolve: (k: string): ResolvedStat => ({ total: map[k] ?? 0, bonuses: [] }),
    total: (k: string) => map[k] ?? 0,
    keys: () => Object.keys(map),
    weapon: null,
    armorMaxDex: null,
  }
}

const falchion: WeaponInfo = {
  name: 'Falchion',
  slot: 'Weapon1',
  diceNum: 2,
  diceSides: 4,
  critThreatRange: 3,         // 18-20 threat
  critMultiplier: 2,
  attackModifier: 'Strength',
}

describe('buildAttackEntry', () => {
  it('produces a deterministic positive DPR for a basic Fighter swing', () => {
    const stats = makeStats({
      'melee.toHit': 3,
      'melee.damage': 5,
      'melee.power': 50,
    })
    // STR 22 (mod +6) + BAB 20 + melee.toHit +3 = +29. Against an easier AC.
    const r = buildAttackEntry(stats, falchion, 22, 20, {
      foeAC: 25,
      twoHanded: true,
    })
    expect(r.totalDPR).toBeGreaterThan(0)
    expect(r.dps).toBeGreaterThan(0)
    expect(r.hitChance).toBeCloseTo(0.95, 2) // bonus +29 vs AC 25 → caps at 0.95
    expect(r.critChance).toBeGreaterThan(0)
  })

  it('hit chance saturates at 0.95 for very high attack bonuses', () => {
    const stats = makeStats({})
    const r = buildAttackEntry(stats, falchion, 30, 30, { foeAC: 0 })
    expect(r.hitChance).toBeCloseTo(0.95, 2)
  })

  it('hit chance bottoms out at 0.05 for impossible attacks', () => {
    const stats = makeStats({})
    const r = buildAttackEntry(stats, falchion, 8, 0, { foeAC: 999 })
    expect(r.hitChance).toBeCloseTo(0.05, 2)
  })

  it('helpless damage multiplier applies when helpless flag set', () => {
    const stats = makeStats({ helpless: 50 })
    const a = buildAttackEntry(stats, falchion, 18, 10, { foeAC: 25 })
    const b = buildAttackEntry(stats, falchion, 18, 10, { foeAC: 25, helpless: true })
    expect(b.totalDPR).toBeGreaterThan(a.totalDPR * 1.4) // ~×1.5 factor
  })

  it('PRR mitigation reduces total DPR', () => {
    const stats = makeStats({})
    const a = buildAttackEntry(stats, falchion, 18, 10, { foeAC: 25 })
    const b = buildAttackEntry(stats, falchion, 18, 10, { foeAC: 25, foePRR: 100 })
    expect(b.totalDPR).toBeLessThan(a.totalDPR)
    expect(b.totalDPR).toBeCloseTo(a.totalDPR * 0.5, 1)
  })

  it('doublestrike adds expected damage proportionally', () => {
    const a = buildAttackEntry(makeStats({}), falchion, 18, 10, { foeAC: 25 })
    const b = buildAttackEntry(
      makeStats({ 'melee.doublestrike': 50 }), falchion, 18, 10, { foeAC: 25 },
    )
    expect(b.totalDPR).toBeGreaterThan(a.totalDPR * 1.4)
  })
})
