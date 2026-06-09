#!/usr/bin/env node
// V2-golden comparison tool (G1).
//
// Usage:
//   # Compare V3 stats against a pre-captured V2 golden file:
//   npx tsx scripts/v2GoldenCompare.ts <path/to/build.DDOBuild> <path/to/golden.json> [options]
//
//   # Capture a template golden file from V3's current output (fill in V2 values):
//   npx tsx scripts/v2GoldenCompare.ts <path/to/build.DDOBuild> --capture [options]
//
// Options:
//   --data-dir <dir>   Path to V2 DataFiles/ directory (default: ../Output/DataFiles)
//   --show-passing     Show passing stats in the diff report
//   --exit-0           Always exit 0 (don't fail CI on mismatches)
//
// Workflow for creating a golden file:
//   1. Run with --capture to generate a template populated with V3 values.
//   2. Open the same .DDOBuild in V2 and note the BreakdownsPane values.
//   3. Replace the V3 values in the template with V2's actual values.
//   4. Set "capturedAt" to today's date.
//   5. Commit the .golden.json file alongside the .DDOBuild fixture.
//   6. Re-run without --capture to diff V3 against V2 golden.

import { readFileSync, writeFileSync } from 'fs'
import { resolve, basename } from 'path'
import { importV2Build } from '../src/lib/v2Import'
import { computeBuildStats } from '../src/hooks/useBuildStats'
import { loadAllCatalogues } from '../src/server/dataLoaders'
import { initBonusTypes } from '../src/lib/bonus'
import {
  compareAgainstGolden,
  captureTemplate,
  formatReport,
  type GoldenFile,
} from '../src/lib/goldenCompare'
import type { Item } from '../src/types/ddo'

function parseArgs(): {
  buildFile: string
  goldenFile: string | null
  capture: boolean
  dataDir: string
  showPassing: boolean
  exit0: boolean
} {
  const args = process.argv.slice(2)
  let buildFile = ''
  let goldenFile: string | null = null
  let capture = false
  let dataDir = resolve(__dirname, '..', '..', 'Output', 'DataFiles')
  let showPassing = false
  let exit0 = false

  for (let i = 0; i < args.length; i++) {
    const a = args[i]
    if (a === '--data-dir' && i + 1 < args.length) {
      dataDir = resolve(args[++i])
    } else if (a === '--capture') {
      capture = true
    } else if (a === '--show-passing') {
      showPassing = true
    } else if (a === '--exit-0') {
      exit0 = true
    } else if (!a.startsWith('-')) {
      if (!buildFile) buildFile = a
      else if (!goldenFile) goldenFile = a
    }
  }
  return { buildFile, goldenFile, capture, dataDir, showPassing, exit0 }
}

function main(): void {
  const { buildFile, goldenFile, capture, dataDir, showPassing, exit0 } = parseArgs()

  if (!buildFile) {
    console.error(
      'Usage: v2GoldenCompare <build.DDOBuild> [golden.json] [--capture] [--data-dir <dir>]'
    )
    process.exit(2)
  }

  if (!capture && !goldenFile) {
    console.error('Provide a golden.json file, or use --capture to generate a template.')
    process.exit(2)
  }

  // Load build
  const xml = readFileSync(resolve(buildFile), 'utf-8')
  const { build, warnings } = importV2Build(xml)
  if (warnings.length > 0) {
    for (const w of warnings) console.error('  import warning: ' + w)
  }
  console.log(`Build: ${build.name} — ${build.classes.filter(c => c.name).map(c => `${c.name} ${c.levels}`).join('/')}`)

  // Load catalogues
  const cat = loadAllCatalogues(dataDir)
  if (cat.allBonusTypes.length > 0) initBonusTypes(cat.allBonusTypes)
  console.log(
    `Data: ${cat.allClasses.length} classes, ${cat.allFeats.length} feats, ` +
    `${cat.allItems.length} items`
  )

  // Resolve gear
  const gearItems: Record<string, Item> = {}
  for (const [slot, name] of Object.entries(build.gear)) {
    if (!name) continue
    const item = cat.allItems.find(i => i.Name === name)
    if (item) gearItems[slot] = item
  }

  const stats = computeBuildStats({
    allClasses: cat.allClasses,
    allRaces: cat.allRaces,
    allFeats: cat.allFeats,
    allTrees: cat.allTrees,
    allSelfBuffs: cat.allSelfBuffs,
    allAugments: cat.allAugments,
    allSetBonuses: cat.allSetBonuses,
    allFiligreeBonuses: cat.allFiligreeBonuses,
    allFiligrees: cat.allFiligrees,
    allWeaponGroups: cat.allWeaponGroups,
    allSpells: cat.allSpells,
    allGuildBuffs: cat.allGuildBuffs,
    gearItems,
  }, build)

  if (capture) {
    const template = captureTemplate(stats.keys(), k => stats.total(k), basename(buildFile))
    const outPath = buildFile.replace(/\.DDOBuild$/i, '.golden.json')
    const json = JSON.stringify(template, null, 2) + '\n'
    writeFileSync(outPath, json, 'utf-8')
    console.log(`\nTemplate golden file written to: ${outPath}`)
    console.log('Fill in V2 BreakdownsPane values and set "capturedAt" before committing.')
    return
  }

  // Diff mode
  const goldenJson = readFileSync(resolve(goldenFile!), 'utf-8')
  const golden: GoldenFile = JSON.parse(goldenJson)

  console.log(`Golden: ${golden.description}${golden.capturedAt ? ` (captured ${golden.capturedAt})` : ''}`)
  console.log()

  const report = compareAgainstGolden(stats.keys(), k => stats.total(k), golden)
  process.stdout.write(formatReport(report, showPassing))

  if (!report.pass && !exit0) {
    process.exit(1)
  }
}

main()
