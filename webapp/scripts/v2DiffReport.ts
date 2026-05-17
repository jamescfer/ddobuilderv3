#!/usr/bin/env node
// V2 vs V3 stat diff report.
//
// Usage:
//   npx tsx scripts/v2DiffReport.ts <path/to/build.DDOBuild> [--data-dir <dir>]
//
// Loads a V2 .DDOBuild XML, runs V3's full stat engine on the imported
// build using the same XML data catalogues the live webapp uses, and
// prints a flat stat-key → total table. Pipe alongside V2's breakdown
// screen to spot mismatches.

import { readFileSync } from 'fs'
import { resolve } from 'path'
import { importV2Build } from '../src/lib/v2Import'
import { computeBuildStats } from '../src/hooks/useBuildStats'
import { loadAllCatalogues } from '../src/server/dataLoaders'
import { initBonusTypes } from '../src/lib/bonus'
import type { Item } from '../src/types/ddo'

function parseArgs(): { file: string; dataDir: string } {
  const args = process.argv.slice(2)
  let file = ''
  let dataDir = resolve(__dirname, '..', '..', 'Output', 'DataFiles')
  for (let i = 0; i < args.length; i++) {
    const a = args[i]
    if (a === '--data-dir' && i + 1 < args.length) {
      dataDir = resolve(args[++i])
    } else if (!a.startsWith('-')) {
      file = a
    }
  }
  return { file, dataDir }
}

function main(): void {
  const { file, dataDir } = parseArgs()
  if (!file) {
    console.error('Usage: v2DiffReport <path/to/build.DDOBuild> [--data-dir <dir>]')
    process.exit(2)
  }
  const xml = readFileSync(resolve(file), 'utf-8')
  const { build, warnings } = importV2Build(xml)

  if (warnings.length > 0) {
    console.error('Warnings:')
    for (const w of warnings) console.error('  ' + w)
  }

  console.log('# Imported V2 build summary')
  console.log(`Name:           ${build.name}`)
  console.log(`Race:           ${build.race}`)
  console.log(`Alignment:      ${build.alignment}`)
  console.log(`Heroic level:   ${build.totalLevel}`)
  console.log(`Epic levels:    ${build.epicLevels}`)
  console.log(`Legendary lvl:  ${build.legendaryLevels}`)
  console.log(`Classes:        ${build.classes.filter(c => c.name).map(c => `${c.name} ${c.levels}`).join(' / ')}`)
  console.log(`Active stances: ${build.activeBuffs.length}`)
  console.log(`Trained feats:  ${Object.keys(build.featChoices).length}`)
  console.log(`Gear slots:     ${Object.keys(build.gear).length}`)
  console.log(`Augments:       ${Object.keys(build.augmentChoices).length}`)
  console.log(`Enhanc. trees:  ${Object.keys(build.enhancementChoices).length}`)
  console.log(`Past lives:     ${Object.values(build.pastLives).reduce((s, n) => s + n, 0)}`)
  console.log()

  console.log(`# Loading XML catalogues from ${dataDir}…`)
  const cat = loadAllCatalogues(dataDir)
  if (cat.allBonusTypes.length > 0) {
    initBonusTypes(cat.allBonusTypes)
  }
  console.log(`  ${cat.allRaces.length} races, ${cat.allClasses.length} classes, ` +
    `${cat.allFeats.length} feats, ${cat.allTrees.length} trees, ` +
    `${cat.allItems.length} items, ${cat.allAugments.length} augments, ` +
    `${cat.allBonusTypes.length} bonus types`)

  // Resolve gear slot names → item objects
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

  const keys = stats.keys().sort()
  console.log()
  console.log('# V3 computed stat totals (sorted)')
  for (const k of keys) {
    const total = stats.total(k)
    if (total === 0) continue
    const formatted = Number.isInteger(total) ? total.toString() : total.toFixed(2)
    console.log(`${k.padEnd(42)} ${total >= 0 ? '+' : ''}${formatted}`)
  }
}

main()
