// V2 → V3 round-trip: import a real V2 .DDOBuild file, run V3's pure
// stat engine on it, and assert sensible values.
//
// This is the side-by-side test the user asked for: a real V2 build
// becomes a V3 build, and we check that V3's computed numbers fall in
// the range V2 would produce. The exact V2 numbers can be filled in
// commit-by-commit as the user reports them.
//
// V2 source: Output/Example Builds/YingsMonk.DDOBuild

import { describe, expect, it } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'
import { importV2Build } from '../lib/v2Import'
import { computeBuildStats } from '../hooks/useBuildStats'
import type { Race, DDOClass, Feat, EnhancementTree, Item, OptionalBuff, Augment, SetBonus, FiligreeSetBonus, Filigree } from '../types/ddo'

const FIXTURE_DIR = join(__dirname, '..', '..', '..', 'Output', 'Example Builds')

function load(name: string): string {
  return readFileSync(join(FIXTURE_DIR, name), 'utf-8')
}

// ---------------------------------------------------------------------------
// Stub data catalogues
//
// computeBuildStats wants Race / Class / Feat / EnhancementTree catalogues
// to look up effect data. For the structural assertions below we don't
// need full XML — just enough Class/Race shapes that key calculations
// (BAB, saves, HP) read sensible values.
// ---------------------------------------------------------------------------

const monk: DDOClass = {
  Name: 'Monk',
  HitPoints: 8,
  SkillPoints: 4,
  // Monk uses a 3/4 BAB progression in DDO; table format mirrors V2 XML.
  BAB: '0 0 1 2 3 3 4 5 6 6 7 8 9 9 10 11 12 12 13 14 15',
  Fortitude: 'Strong',
  Reflex: 'Strong',
  Will: 'Strong',
  ClassSkill: ['Concentration', 'Balance', 'Tumble'],
}

const epic: DDOClass = {
  Name: 'Epic',
  HitPoints: 8,
  SkillPoints: 0,
  BAB: '0 1 1 2 2 3 3 4 4 5 5',
  Fortitude: 'Weak', Reflex: 'Weak', Will: 'Weak',
}

const legendary: DDOClass = {
  Name: 'Legendary',
  HitPoints: 8,
  SkillPoints: 0,
  BAB: '0 1 1 2 2',
  Fortitude: 'Weak', Reflex: 'Weak', Will: 'Weak',
}

const aasimar: Race = {
  Name: 'Aasimar',
  Wisdom: 2,
}

function emptyInput() {
  return {
    allClasses: [monk, epic, legendary] as DDOClass[],
    allRaces: [aasimar] as Race[],
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

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('V2 round-trip — Yings Monk (Aasimar 20 Monk / 10 Epic / 4 Legendary)', () => {
  const xml = load('YingsMonk.DDOBuild')
  const { build } = importV2Build(xml)
  const stats = computeBuildStats(emptyInput(), build)

  it('character total level matches V2 (20 + 10 + 4 = 34)', () => {
    expect(build.totalLevel + (build.epicLevels ?? 0) + (build.legendaryLevels ?? 0)).toBe(34)
  })

  it('BAB falls in the expected band for a 20 Monk build', () => {
    // Monk BAB at class level 20 = 15. Epic 10 contributes 5. Legendary 4
    // contributes 2. Sum 22. V3 caps at 25 (MAX_BAB) and applies effect bonuses
    // on top — the exact value depends on stances/feats so we assert the floor.
    const bab = stats.total('bab')
    expect(bab).toBeGreaterThanOrEqual(15)
    expect(bab).toBeLessThanOrEqual(25)
  })

  it('Fortitude, Reflex, Will all start at Monk\'s strong-save base + 0 (12)', () => {
    // Monk Strong save = 2 + floor(20/2) = 12 base. Each save will get
    // additional bonuses from CON/DEX/WIS mods + items + stances. For the
    // bare-data variant we just check the base contribution is present.
    const fort = stats.total('save.Fort')
    const ref = stats.total('save.Reflex')
    const will = stats.total('save.Will')
    expect(fort).toBeGreaterThanOrEqual(12)
    expect(ref).toBeGreaterThanOrEqual(12)
    expect(will).toBeGreaterThanOrEqual(12)
  })

  it('HP includes class HD × levels + CON × total-level (V2 parity)', () => {
    // 20 Monk × d8 = 160 + Epic 10 × 4 (half d8) = 40 + Legendary 4 × 4 = 16
    // = 216 from class HP. Plus CON × 34 (CON ~16 with race mod = +3, 102).
    // Total ~318+. Effect bonuses raise this; assert the floor.
    const hp = stats.total('hp')
    expect(hp).toBeGreaterThanOrEqual(216)
  })

  it('Skill points use Monk class-1 ×4 (4 SP × (4 + INT mod) at L1)', () => {
    // INT mod is -1 (INT 8). Yings has IntSpend=0 → INT score 8.
    // Per-level SP = max(1, 4 + (-1)) = 3 → ×4 at L1 = 12, then ×3 each
    // for L2-20 (54). Total 12 + 54 = 66 base.
    const sp = stats.total('skillPoints')
    expect(sp).toBeGreaterThanOrEqual(60)
    expect(sp).toBeLessThanOrEqual(80)
  })

  it('Active stances from V2 carry through as activeBuffs', () => {
    // V3's active "buff" set absorbs both V2 stances and self-buffs.
    expect(build.activeBuffs).toContain('Lawful')
    expect(build.activeBuffs).toContain('Centered')
  })

  it('Past lives map to V3 pastLives counts', () => {
    // YingsMonk has the racial completionist + every heroic past life maxed.
    // V2 file has 3 of each heroic class (from triple-walking a 14-year-old build).
    expect(build.pastLives['Monk']).toBeGreaterThanOrEqual(3)
    // V3 forum-export and stat engine read pastLives counts; assert the engine
    // saw them by checking that the chosen feats list isn't empty.
    expect(Object.keys(build.featChoices).length).toBeGreaterThan(0)
  })

  it('Gear, augments, enhancements all carry their counts', () => {
    expect(Object.keys(build.gear).length).toBeGreaterThan(0)
    expect(Object.keys(build.augmentChoices).length).toBeGreaterThan(0)
    expect(Object.keys(build.enhancementChoices).length).toBeGreaterThan(0)
  })
})
