// V2-golden comparison harness (G1).
//
// A "golden file" is a JSON snapshot of stat totals captured from V2's
// BreakdownsPane for a specific .DDOBuild file. compareAgainstGolden() diffs
// V3's computed stats against those captured values so "parity" claims become
// verifiable numbers, not self-referential assertions.
//
// Golden file format:
//   {
//     "description": "YingsMonk — captured from V2 2026-01-01",
//     "buildFile": "YingsMonk.DDOBuild",
//     "capturedAt": "2026-01-01",
//     "defaultTolerance": 1,
//     "stats": {
//       "hp": 1234,
//       "ac": { "expected": 85, "tolerance": 0 }
//     }
//   }

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/** A single golden stat entry: plain number uses defaultTolerance; object form
 *  allows a per-stat tolerance override. */
export type GoldenStatEntry = number | { expected: number; tolerance?: number }

export interface GoldenFile {
  /** Human-readable description (build name, capture date, etc.). */
  description: string
  /** Name of the .DDOBuild file this golden data was captured from. */
  buildFile: string
  /** ISO date string when V2 values were captured, for audit purposes. */
  capturedAt?: string
  /** Default allowed absolute diff before a stat is considered failing.
   *  Defaults to 1 when omitted (allows for rounding differences). */
  defaultTolerance?: number
  /** Map of stat keys to expected values. Use the same keys as BuildStats.keys()
   *  (e.g. "hp", "ac", "save.Fort", "prr", "sp", "dc.Necromancy", …). */
  stats: Record<string, GoldenStatEntry>
}

export interface ComparisonResult {
  statKey: string
  expected: number
  actual: number
  /** actual − expected (negative means V3 is lower than V2) */
  diff: number
  tolerance: number
  pass: boolean
}

export interface GoldenReport {
  /** True iff every stat in the golden file is within tolerance. */
  pass: boolean
  /** Number of stats in the golden file. */
  totalStats: number
  passingStats: number
  failingStats: number
  /** Per-stat comparison results in golden file order. */
  results: ComparisonResult[]
  /**
   * Stats present in the golden file (with nonzero expected) for which V3
   * returned 0. These are likely missing computation paths.
   */
  missingInV3: string[]
  /**
   * Stats V3 computes (with nonzero value) that are absent from the golden
   * file. These may be new V3-only stats or categories V2 doesn't show in its
   * BreakdownsPane.
   */
  extraInV3: string[]
}

// ---------------------------------------------------------------------------
// Core comparison
// ---------------------------------------------------------------------------

/**
 * Compares V3 computed stats against a V2-captured golden file.
 *
 * @param v3Keys   All stat keys V3 currently has (from BuildStats.keys()).
 * @param v3Total  Function returning V3's total for a stat key (0 if missing).
 * @param golden   The loaded golden file.
 */
export function compareAgainstGolden(
  v3Keys: string[],
  v3Total: (key: string) => number,
  golden: GoldenFile,
): GoldenReport {
  const defaultTolerance = golden.defaultTolerance ?? 1
  const results: ComparisonResult[] = []
  const missingInV3: string[] = []

  for (const [statKey, entry] of Object.entries(golden.stats)) {
    const expected = typeof entry === 'number' ? entry : entry.expected
    const tolerance =
      typeof entry === 'number' ? defaultTolerance : (entry.tolerance ?? defaultTolerance)
    const actual = v3Total(statKey)
    const diff = actual - expected
    const pass = Math.abs(diff) <= tolerance

    results.push({ statKey, expected, actual, diff, tolerance, pass })
    if (actual === 0 && expected !== 0) {
      missingInV3.push(statKey)
    }
  }

  // Stats V3 computes but the golden file doesn't cover (non-zero only)
  const goldenKeys = new Set(Object.keys(golden.stats))
  const extraInV3: string[] = []
  for (const k of v3Keys) {
    if (!goldenKeys.has(k) && v3Total(k) !== 0) {
      extraInV3.push(k)
    }
  }

  const passingStats = results.filter(r => r.pass).length
  const failingStats = results.filter(r => !r.pass).length

  return {
    pass: failingStats === 0,
    totalStats: results.length,
    passingStats,
    failingStats,
    results,
    missingInV3,
    extraInV3,
  }
}

// ---------------------------------------------------------------------------
// Formatting helpers (used by the CLI script)
// ---------------------------------------------------------------------------

/**
 * Formats a GoldenReport as a human-readable text table for terminal output.
 * Passing stats are omitted unless showPassing is true.
 */
export function formatReport(report: GoldenReport, showPassing = false): string {
  const lines: string[] = []

  const statusIcon = report.pass ? '✅' : '❌'
  lines.push(`${statusIcon} ${report.passingStats}/${report.totalStats} stats pass`)
  if (report.failingStats > 0) {
    lines.push(`   ${report.failingStats} failing stat(s)`)
  }
  lines.push('')

  const toShow = showPassing ? report.results : report.results.filter(r => !r.pass)
  if (toShow.length > 0) {
    const header = `${'Stat key'.padEnd(44)} ${'Expected'.padStart(10)} ${'V3 Actual'.padStart(10)} ${'Diff'.padStart(8)} ${'Tol'.padStart(5)}`
    lines.push(header)
    lines.push('-'.repeat(header.length))
    for (const r of toShow) {
      const icon = r.pass ? '  ' : '!!'
      const e = r.expected.toFixed(r.expected % 1 !== 0 ? 2 : 0)
      const a = r.actual.toFixed(r.actual % 1 !== 0 ? 2 : 0)
      const d = (r.diff >= 0 ? '+' : '') + r.diff.toFixed(r.diff % 1 !== 0 ? 2 : 0)
      lines.push(`${icon} ${r.statKey.padEnd(42)} ${e.padStart(10)} ${a.padStart(10)} ${d.padStart(8)} ${String(r.tolerance).padStart(5)}`)
    }
    lines.push('')
  }

  if (report.missingInV3.length > 0) {
    lines.push('Stats present in V2 golden but missing (0) in V3:')
    for (const k of report.missingInV3) lines.push(`  - ${k}`)
    lines.push('')
  }

  if (report.extraInV3.length > 0) {
    lines.push(`Stats V3 computes but not in golden file (${report.extraInV3.length} total — first 20):`)
    for (const k of report.extraInV3.slice(0, 20)) lines.push(`  + ${k}`)
    if (report.extraInV3.length > 20) lines.push(`  … and ${report.extraInV3.length - 20} more`)
    lines.push('')
  }

  return lines.join('\n')
}

/**
 * Generates a GoldenFile template populated with V3's current values.
 * The "capturedAt" field is left blank — the user must replace values with
 * actual V2 BreakdownsPane numbers and fill in the date.
 */
export function captureTemplate(
  v3Keys: string[],
  v3Total: (key: string) => number,
  buildFile: string,
): GoldenFile {
  const stats: Record<string, number> = {}
  for (const k of v3Keys.sort()) {
    const t = v3Total(k)
    if (t !== 0) stats[k] = t
  }
  return {
    description: `Golden values for ${buildFile} — replace with V2 BreakdownsPane actuals`,
    buildFile,
    capturedAt: '',
    defaultTolerance: 1,
    stats,
  }
}
