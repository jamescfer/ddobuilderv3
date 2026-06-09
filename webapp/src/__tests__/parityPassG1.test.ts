/**
 * Parity pass G1 — Real V2-golden comparison harness
 *
 * V2 source: V2 BreakdownsPane exports a readable text listing of all stat
 *   totals. V3's v2DiffReport.ts only prints V3's own numbers — no V2 column.
 *
 * V3 gap (before this fix): "parity" claims are self-referential. There is no
 *   mechanism to diff V3's output against pre-captured V2 values. Any future
 *   regression that makes V3 diverge from V2 would go undetected.
 *
 * Fix: lib/goldenCompare.ts exports compareAgainstGolden(), which accepts a
 *   BuildStats-like interface and a GoldenFile (JSON with V2 breakdown values),
 *   and returns a GoldenReport listing pass/fail per stat, missing stats, and
 *   extra V3 stats. The companion CLI scripts/v2GoldenCompare.ts wraps this for
 *   use on the command line (diff mode and --capture template mode).
 */

import { describe, it, expect } from 'vitest'
import {
  compareAgainstGolden,
  type GoldenFile,
  type GoldenReport,
} from '../lib/goldenCompare'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeTotal(totals: Record<string, number>) {
  return (key: string) => totals[key] ?? 0
}

function makeKeys(totals: Record<string, number>) {
  return Object.keys(totals)
}

// ---------------------------------------------------------------------------
// Basic comparison
// ---------------------------------------------------------------------------

describe('G1 — compareAgainstGolden: basic matching', () => {
  it('returns pass=true when V3 exactly matches golden', () => {
    const golden: GoldenFile = {
      description: 'Exact match test',
      buildFile: 'test.DDOBuild',
      stats: { hp: 1000, ac: 85 },
    }
    const report = compareAgainstGolden(
      makeKeys({ hp: 1000, ac: 85 }),
      makeTotal({ hp: 1000, ac: 85 }),
      golden,
    )
    expect(report.pass).toBe(true)
    expect(report.passingStats).toBe(2)
    expect(report.failingStats).toBe(0)
  })

  it('returns pass=false when V3 differs beyond tolerance', () => {
    const golden: GoldenFile = {
      description: 'Mismatch test',
      buildFile: 'test.DDOBuild',
      defaultTolerance: 1,
      stats: { hp: 1000 },
    }
    const report = compareAgainstGolden(
      makeKeys({ hp: 1005 }),
      makeTotal({ hp: 1005 }),
      golden,
    )
    expect(report.pass).toBe(false)
    expect(report.failingStats).toBe(1)
    const r = report.results[0]
    expect(r.statKey).toBe('hp')
    expect(r.expected).toBe(1000)
    expect(r.actual).toBe(1005)
    expect(r.diff).toBe(5)
  })

  it('passes when diff is within default tolerance', () => {
    const golden: GoldenFile = {
      description: 'Tolerance test',
      buildFile: 'test.DDOBuild',
      defaultTolerance: 1,
      stats: { hp: 1000 },
    }
    const report = compareAgainstGolden(
      makeKeys({ hp: 1001 }),
      makeTotal({ hp: 1001 }),
      golden,
    )
    expect(report.pass).toBe(true)
    expect(report.results[0].pass).toBe(true)
  })

  it('passes when diff equals tolerance exactly', () => {
    const golden: GoldenFile = {
      description: 'Exact boundary test',
      buildFile: 'test.DDOBuild',
      defaultTolerance: 2,
      stats: { prr: 100 },
    }
    const report = compareAgainstGolden(
      makeKeys({ prr: 102 }),
      makeTotal({ prr: 102 }),
      golden,
    )
    expect(report.results[0].pass).toBe(true)
  })

  it('fails when diff exceeds tolerance by 1', () => {
    const golden: GoldenFile = {
      description: 'Boundary fail test',
      buildFile: 'test.DDOBuild',
      defaultTolerance: 2,
      stats: { prr: 100 },
    }
    const report = compareAgainstGolden(
      makeKeys({ prr: 103 }),
      makeTotal({ prr: 103 }),
      golden,
    )
    expect(report.results[0].pass).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// Per-stat tolerance override
// ---------------------------------------------------------------------------

describe('G1 — compareAgainstGolden: per-stat tolerance', () => {
  it('per-stat tolerance=0 fails on any diff', () => {
    const golden: GoldenFile = {
      description: 'Per-stat tol test',
      buildFile: 'test.DDOBuild',
      defaultTolerance: 1,
      stats: {
        hp: { expected: 1000, tolerance: 0 },
        ac: 85,
      },
    }
    const report = compareAgainstGolden(
      makeKeys({ hp: 1001, ac: 86 }),
      makeTotal({ hp: 1001, ac: 86 }),
      golden,
    )
    const hpResult = report.results.find(r => r.statKey === 'hp')!
    const acResult = report.results.find(r => r.statKey === 'ac')!
    expect(hpResult.pass).toBe(false)  // tolerance=0, diff=1
    expect(acResult.pass).toBe(true)   // tolerance=1, diff=1
  })

  it('per-stat tolerance overrides default when higher', () => {
    const golden: GoldenFile = {
      description: 'Per-stat higher tol',
      buildFile: 'test.DDOBuild',
      defaultTolerance: 1,
      stats: {
        sp: { expected: 2000, tolerance: 50 },
      },
    }
    const report = compareAgainstGolden(
      makeKeys({ sp: 2040 }),
      makeTotal({ sp: 2040 }),
      golden,
    )
    expect(report.results[0].pass).toBe(true)  // |40| ≤ 50
  })
})

// ---------------------------------------------------------------------------
// Missing / extra stats
// ---------------------------------------------------------------------------

describe('G1 — compareAgainstGolden: missing and extra stats', () => {
  it('populates missingInV3 when V3 returns 0 for nonzero golden', () => {
    const golden: GoldenFile = {
      description: 'Missing test',
      buildFile: 'test.DDOBuild',
      stats: { prr: 120 },
    }
    const report = compareAgainstGolden([], (_key) => 0, golden)
    expect(report.missingInV3).toContain('prr')
  })

  it('does not flag missingInV3 when expected value is 0', () => {
    const golden: GoldenFile = {
      description: 'Zero expected',
      buildFile: 'test.DDOBuild',
      stats: { dodge: 0 },
    }
    const report = compareAgainstGolden([], (_key) => 0, golden)
    expect(report.missingInV3).not.toContain('dodge')
  })

  it('populates extraInV3 for stats computed by V3 that golden does not include', () => {
    const golden: GoldenFile = {
      description: 'Extra test',
      buildFile: 'test.DDOBuild',
      stats: {},
    }
    const report = compareAgainstGolden(
      makeKeys({ hp: 500, ac: 40 }),
      makeTotal({ hp: 500, ac: 40 }),
      golden,
    )
    expect(report.extraInV3).toContain('hp')
    expect(report.extraInV3).toContain('ac')
  })

  it('does not include zero-valued V3 stats in extraInV3', () => {
    const golden: GoldenFile = {
      description: 'Zero V3 extra',
      buildFile: 'test.DDOBuild',
      stats: {},
    }
    const report = compareAgainstGolden(
      ['hp', 'ac'],
      makeTotal({ hp: 0, ac: 0 }),
      golden,
    )
    expect(report.extraInV3).not.toContain('hp')
    expect(report.extraInV3).not.toContain('ac')
  })
})

// ---------------------------------------------------------------------------
// Totals and summary
// ---------------------------------------------------------------------------

describe('G1 — compareAgainstGolden: report totals', () => {
  it('totalStats equals the number of golden entries', () => {
    const golden: GoldenFile = {
      description: 'Totals test',
      buildFile: 'test.DDOBuild',
      stats: { hp: 1000, ac: 85, prr: 120 },
    }
    const report = compareAgainstGolden([], (_key) => 0, golden)
    expect(report.totalStats).toBe(3)
  })

  it('passingStats + failingStats equals totalStats', () => {
    const golden: GoldenFile = {
      description: 'Counts test',
      buildFile: 'test.DDOBuild',
      defaultTolerance: 0,
      stats: { hp: 1000, ac: 85, prr: 0 },
    }
    const totals = { hp: 1000, ac: 80, prr: 0 }
    const report = compareAgainstGolden(makeKeys(totals), makeTotal(totals), golden)
    expect(report.passingStats + report.failingStats).toBe(report.totalStats)
  })

  it('empty golden produces a passing report with no results', () => {
    const golden: GoldenFile = {
      description: 'Empty golden',
      buildFile: 'test.DDOBuild',
      stats: {},
    }
    const report = compareAgainstGolden([], (_key) => 0, golden)
    expect(report.pass).toBe(true)
    expect(report.totalStats).toBe(0)
    expect(report.results).toHaveLength(0)
  })
})

// ---------------------------------------------------------------------------
// Negative diffs (V3 lower than expected)
// ---------------------------------------------------------------------------

describe('G1 — compareAgainstGolden: negative diffs', () => {
  it('detects V3 being lower than expected (undershoot)', () => {
    const golden: GoldenFile = {
      description: 'Undershoot test',
      buildFile: 'test.DDOBuild',
      defaultTolerance: 1,
      stats: { hp: 1000 },
    }
    const report = compareAgainstGolden(
      makeKeys({ hp: 990 }),
      makeTotal({ hp: 990 }),
      golden,
    )
    expect(report.pass).toBe(false)
    expect(report.results[0].diff).toBe(-10)
  })

  it('passes when V3 is within tolerance in the negative direction', () => {
    const golden: GoldenFile = {
      description: 'Neg tolerance pass',
      buildFile: 'test.DDOBuild',
      defaultTolerance: 5,
      stats: { hp: 1000 },
    }
    const report = compareAgainstGolden(
      makeKeys({ hp: 996 }),
      makeTotal({ hp: 996 }),
      golden,
    )
    expect(report.results[0].pass).toBe(true)
  })
})
