#!/usr/bin/env node
// V2 vs V3 stat diff report.
//
// Usage:
//   npx tsx scripts/v2DiffReport.ts <path/to/build.DDOBuild>
//
// Loads a V2 .DDOBuild XML, runs V3's pure stat engine on the imported
// build, and prints a flat table of stat keys → totals. Pipe this output
// alongside V2's own breakdown screen to spot mismatches.
//
// The catalogue stubs are intentionally minimal — full effect resolution
// requires the live API (races/classes/feats/enhancement trees from XML).
// Run V3 in the browser and import the same file there for a richer view.

import { readFileSync } from 'fs'
import { resolve } from 'path'
import { importV2Build } from '../src/lib/v2Import'
import { computeBuildStats } from '../src/hooks/useBuildStats'
import type {
  Race, DDOClass, Feat, EnhancementTree, Item, OptionalBuff, Augment,
  SetBonus, FiligreeSetBonus, Filigree,
} from '../src/types/ddo'

function emptyInput() {
  return {
    allClasses: [] as DDOClass[],
    allRaces: [] as Race[],
    allFeats: [] as Feat[],
    allTrees: [] as EnhancementTree[],
    gearItems: {} as Record<string, Item>,
    allSelfBuffs: [] as OptionalBuff[],
    allAugments: [] as Augment[],
    allSetBonuses: [] as SetBonus[],
    allFiligreeBonuses: [] as FiligreeSetBonus[],
    allFiligrees: [] as Filigree[],
  }
}

function main(): void {
  const file = process.argv[2]
  if (!file) {
    console.error('Usage: v2DiffReport <path/to/build.DDOBuild>')
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

  const stats = computeBuildStats(emptyInput(), build)
  const keys = stats.keys().sort()
  console.log('# V3 computed stat totals (sorted)')
  for (const k of keys) {
    const total = stats.total(k)
    if (total === 0) continue
    console.log(`${k.padEnd(40)} ${total >= 0 ? '+' : ''}${total}`)
  }
}

main()
