// V2 game-data loaders, extracted from server.ts so the CLI can use them too.
//
// V3 reads the same XML data the V2 application ships in
// `Output/DataFiles/`. The webapp's Express server exposes them via
// /api/* endpoints, but pure tooling (parity diff CLI, regression tests)
// also wants direct access. This module is the single source of truth
// for "load X from XML on disk".

import path from 'path'
import fs from 'fs'
import { XMLParser } from 'fast-xml-parser'
import type {
  Race, DDOClass, Feat, EnhancementTree, Item, Augment, SetBonus,
  FiligreeSetBonus, Filigree, OptionalBuff, GuildBuff, Stance, Spell,
  Patron, Quest, SentientGem,
} from '../types/ddo'
import type { WeaponGroupSpec } from '../lib/weapons/groups'

// ---------------------------------------------------------------------------
// XML parser
// ---------------------------------------------------------------------------

export const xmlParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '',
  textNodeName: '#text',
  allowBooleanAttributes: true,
  parseAttributeValue: true,
  parseTagValue: true,
  trimValues: true,
  isArray: (name) => [
    'Race', 'Class', 'Feat', 'Effect', 'Requirement', 'RequiresOneOf',
    'RequiresNoneOf', 'Group', 'Item', 'EnhancementTree', 'EnhancementTreeItem',
    'EnhancementSelection', 'Selector', 'FeatSlot', 'AutomaticFeats',
    'ClassSkill', 'Alignment', 'Augment', 'Buff', 'ItemAugment',
    'SetBonus', 'Gem', 'Stance', 'Spell', 'Patron', 'Quest', 'GuildBuff',
    'GrantedFeat', 'ClassFeat', 'RacialFeat', 'WeaponGroup', 'Weapon',
    'OptionalBuff', 'Filigree', 'SpellDC', 'SpellDamage',
  ].includes(name),
})

function readXml(filePath: string): unknown {
  const xml = fs.readFileSync(filePath, 'utf-8')
  return xmlParser.parse(xml)
}

// ---------------------------------------------------------------------------
// Loaders
// ---------------------------------------------------------------------------

export function loadRaces(dataDir: string): Race[] {
  const dir = path.join(dataDir, 'Races')
  if (!fs.existsSync(dir)) return []
  // Case-insensitive — V2 ships these on case-insensitive Windows file systems.
  const files = fs.readdirSync(dir).filter(f => /\.race\.xml$/i.test(f))
  return files.flatMap(f => {
    try {
      const parsed = readXml(path.join(dir, f)) as { Races?: { Race?: unknown[] } }
      const races = (parsed?.Races?.Race ?? []) as Race[]
      // V2 Race::IsIconic() == HasIconicClass() (Race.cpp:84-87): there is no
      // <IsIconic> XML tag — a race is iconic iff it declares an <IconicClass>.
      // Derive it here so consumers (past-life gating, race pickers, exporter)
      // can test r.IsIconic the way V2 does.
      return races.map(r => ({ ...r, IsIconic: r.IconicClass != null && r.IconicClass !== '' }))
    } catch { return [] }
  })
}

export function loadClasses(dataDir: string): DDOClass[] {
  const dir = path.join(dataDir, 'Classes')
  if (!fs.existsSync(dir)) return []
  const files = fs.readdirSync(dir).filter(f => /\.class\.xml$/i.test(f))
  return files.flatMap(f => {
    try {
      const parsed = readXml(path.join(dir, f)) as { Classes?: { Class?: unknown[] } }
      const classes = (parsed?.Classes?.Class ?? []) as DDOClass[]
      // <NotHeroic /> is a presence-only flag (Class.h DL_FLAG); the XML parser
      // delivers it as "" which is falsy, so `!c.NotHeroic` wrongly treated
      // Epic/Legendary as heroic. Normalise to an explicit boolean (matches the
      // tree-flag normalisation below).
      return classes.map(c => ({ ...c, NotHeroic: 'NotHeroic' in (c as object) ? true : undefined }))
    } catch { return [] }
  })
}

export function loadFeats(dataDir: string): Feat[] {
  const out: Feat[] = []
  // Standard feats
  try {
    const parsed = readXml(path.join(dataDir, 'Feats.xml')) as { Feats?: { Feat?: unknown[] } }
    const feats = parsed?.Feats?.Feat ?? []
    out.push(...((Array.isArray(feats) ? feats : [feats]) as Feat[]))
  } catch { /* no Feats.xml */ }
  // Class-defined inline feats (Epic destinies, Monk bonus feats, etc.).
  // V2 folds these into the global feat catalogue (Class.h ClassFeats list,
  // referenced by name from <AutomaticFeats>).
  const classDir = path.join(dataDir, 'Classes')
  if (fs.existsSync(classDir)) {
    try {
      const classFiles = fs.readdirSync(classDir).filter(f => /\.class\.xml$/i.test(f))
      for (const f of classFiles) {
        try {
          const parsed = readXml(path.join(classDir, f)) as { Classes?: { Class?: unknown } }
          const classes = parsed?.Classes?.Class
          const classList = Array.isArray(classes) ? classes : classes ? [classes] : []
          for (const cls of classList) {
            const classFeats = (cls as Record<string, unknown>)?.Feat
            if (!classFeats) continue
            const list = Array.isArray(classFeats) ? classFeats : [classFeats]
            out.push(...(list as Feat[]))
          }
        } catch { /* skip bad file */ }
      }
    } catch { /* no Classes dir */ }
  }
  // Race-defined inline feats. V2 parses these into Race::RacialFeats and they
  // resolve against the global feat catalogue when a race grants them by name
  // (e.g. Drow <GrantedFeat>Drow Spell Resistance</GrantedFeat> + matching
  // <Feat> in Drow.race.xml:15-36). V3 previously folded only class-inline
  // feats, so the *effects* of race-granted inline feats were silently missing.
  const raceDir = path.join(dataDir, 'Races')
  if (fs.existsSync(raceDir)) {
    try {
      const raceFiles = fs.readdirSync(raceDir).filter(f => /\.race\.xml$/i.test(f))
      for (const f of raceFiles) {
        try {
          const parsed = readXml(path.join(raceDir, f)) as { Races?: { Race?: unknown } }
          const races = parsed?.Races?.Race
          const raceList = Array.isArray(races) ? races : races ? [races] : []
          for (const race of raceList) {
            const raceFeats = (race as Record<string, unknown>)?.Feat
            if (!raceFeats) continue
            const list = Array.isArray(raceFeats) ? raceFeats : [raceFeats]
            out.push(...(list as Feat[]))
          }
        } catch { /* skip bad file */ }
      }
    } catch { /* no Races dir */ }
  }
  return out
}

export function loadEnhancementTrees(dataDir: string): EnhancementTree[] {
  const dir = path.join(dataDir, 'EnhancementTrees')
  if (!fs.existsSync(dir)) return []
  const files = fs.readdirSync(dir).filter(f => /\.tree\.xml$/i.test(f))
  return files.flatMap(f => {
    try {
      const parsed = readXml(path.join(dir, f)) as { Enhancements?: { EnhancementTree?: unknown[] } }
      const trees = (parsed?.Enhancements?.EnhancementTree ?? []) as Record<string, unknown>[]
      return trees.map(tree => {
        // self-closing item flags (<Tier5/>, <Clickie/>) arrive as "" — normalise
        // to explicit booleans so consumers can test them truthily.
        const items = tree.EnhancementTreeItem
        const normItems = Array.isArray(items)
          ? (items as Record<string, unknown>[]).map(it => ({
              ...it,
              Tier5: 'Tier5' in it ? true : undefined,
              Clickie: 'Clickie' in it ? true : undefined,
            }))
          : items
        return {
          ...tree,
          EnhancementTreeItem: normItems,
          // self-closing tags arrive as "" — normalise to explicit booleans
          IsReaperTree: 'IsReaperTree' in tree ? true : undefined,
          IsEpicDestiny: 'IsEpicDestiny' in tree ? true : undefined,
          IsRacialTree: 'IsRacialTree' in tree ? true : undefined,
          IsUniversalTree: 'IsUniversalTree' in tree ? true : undefined,
        }
      }) as EnhancementTree[]
    } catch { return [] }
  })
}

export function loadSpells(dataDir: string): Spell[] {
  try {
    const parsed = readXml(path.join(dataDir, 'Spells.xml')) as { Spells?: { Spell?: unknown[] } }
    return (parsed?.Spells?.Spell ?? []) as Spell[]
  } catch { return [] }
}

export function loadWeaponGroups(dataDir: string): WeaponGroupSpec[] {
  try {
    const parsed = readXml(path.join(dataDir, 'WeaponGroupings.xml')) as {
      WeaponGroupings?: { WeaponGroup?: unknown[] }
    }
    return (parsed?.WeaponGroupings?.WeaponGroup ?? []) as WeaponGroupSpec[]
  } catch { return [] }
}

export function loadStances(dataDir: string): Stance[] {
  try {
    const parsed = readXml(path.join(dataDir, 'Stances.xml')) as { Stances?: { Stance?: unknown[] } }
    return (parsed?.Stances?.Stance ?? []) as Stance[]
  } catch { return [] }
}

export function loadItems(dataDir: string): Item[] {
  const dir = path.join(dataDir, 'Items')
  if (!fs.existsSync(dir)) return []
  const files = fs.readdirSync(dir).filter(f => /\.item$/i.test(f))
  return files.flatMap(f => {
    try {
      const parsed = readXml(path.join(dir, f)) as { Items?: { Item?: unknown[] } }
      const items = parsed?.Items?.Item
      if (!items) return []
      return (Array.isArray(items) ? items : [items]) as Item[]
    } catch { return [] }
  })
}

export function loadAugments(dataDir: string): Augment[] {
  const dir = path.join(dataDir, 'Augments')
  if (!fs.existsSync(dir)) return []
  // V2 ships Augment files as "*.Augments.xml" (capital A) on Windows and as
  // "*.augments.xml" historically; match either to be robust on Linux.
  const files = fs.readdirSync(dir).filter(f => /\.augments\.xml$/i.test(f))
  return files.flatMap(f => {
    try {
      const parsed = readXml(path.join(dir, f)) as { Augments?: { Augment?: unknown[] } }
      return (parsed?.Augments?.Augment ?? []) as Augment[]
    } catch { return [] }
  })
}

export function loadSetBonuses(dataDir: string): SetBonus[] {
  try {
    const parsed = readXml(path.join(dataDir, 'SetBonuses.xml')) as { SetBonuses?: { SetBonus?: unknown[] } }
    return (parsed?.SetBonuses?.SetBonus ?? []) as SetBonus[]
  } catch { return [] }
}

export function loadGuildBuffs(dataDir: string): GuildBuff[] {
  try {
    const parsed = readXml(path.join(dataDir, 'GuildBuffs.xml')) as { GuildBuffs?: { GuildBuff?: unknown[] } }
    return (parsed?.GuildBuffs?.GuildBuff ?? []) as GuildBuff[]
  } catch { return [] }
}

export function loadFiligreeSets(dataDir: string): Filigree[] {
  const dir = path.join(dataDir, 'FiligreeSets')
  if (!fs.existsSync(dir)) return []
  const files = fs.readdirSync(dir).filter(f => /\.filigree\.xml$/i.test(f))
  return files.flatMap(f => {
    try {
      const parsed = readXml(path.join(dir, f)) as { Filigrees?: { Filigree?: unknown[] } }
      return (parsed?.Filigrees?.Filigree ?? []) as Filigree[]
    } catch { return [] }
  })
}

export function loadFiligreeBonuses(dataDir: string): FiligreeSetBonus[] {
  const dir = path.join(dataDir, 'FiligreeSets')
  if (!fs.existsSync(dir)) return []
  const files = fs.readdirSync(dir).filter(f => /\.filigree\.xml$/i.test(f))
  return files.flatMap(f => {
    try {
      const parsed = readXml(path.join(dir, f)) as { Filigrees?: { SetBonus?: unknown[] } }
      return (parsed?.Filigrees?.SetBonus ?? []) as FiligreeSetBonus[]
    } catch { return [] }
  })
}

export function loadSelfAndPartyBuffs(dataDir: string): OptionalBuff[] {
  try {
    const parsed = readXml(path.join(dataDir, 'SelfAndPartyBuffs.xml')) as {
      SelfAndPartyBuffs?: { OptionalBuff?: unknown[] }
    }
    return (parsed?.SelfAndPartyBuffs?.OptionalBuff ?? []) as OptionalBuff[]
  } catch { return [] }
}

export function loadPatrons(dataDir: string): Patron[] {
  try {
    const parsed = readXml(path.join(dataDir, 'Patrons.xml')) as { Patrons?: { Patron?: unknown[] } }
    return (parsed?.Patrons?.Patron ?? []) as Patron[]
  } catch { return [] }
}

export function loadQuests(dataDir: string): Quest[] {
  try {
    const parsed = readXml(path.join(dataDir, 'Quests.xml')) as { Quests?: { Quest?: unknown[] } }
    return (parsed?.Quests?.Quest ?? []) as Quest[]
  } catch { return [] }
}

export function loadSentientGems(dataDir: string): SentientGem[] {
  try {
    const parsed = readXml(path.join(dataDir, 'Sentient.gems.xml')) as { SentientGems?: { Gem?: unknown[] } }
    return (parsed?.SentientGems?.Gem ?? []) as SentientGem[]
  } catch { return [] }
}

// ---------------------------------------------------------------------------
// V2-parity additions: AttackRates, BonusTypes, Challenges, ItemBuffs,
// ItemClickies. These were not loaded by V3 previously even though they
// ship in the V2 DataFiles distribution.
// ---------------------------------------------------------------------------

/** V2 AttackRates.xml — attacks-per-minute tables keyed by combat style. */
export interface AttackRate {
  Style: string
  Race?: string
  AttacksPerMinute?: string
}

export function loadAttackRates(dataDir: string): AttackRate[] {
  try {
    const parsed = readXml(path.join(dataDir, 'AttackRates.xml')) as { AttackRates?: { Rate?: unknown[] } }
    return (parsed?.AttackRates?.Rate ?? []) as AttackRate[]
  } catch { return [] }
}

/** V2 BonusTypes.xml — stacking rules by bonus type name. */
export interface BonusTypeSpec {
  Name: string
  Stacking?: 'Highest Only' | 'Stacking' | string
}

export function loadBonusTypes(dataDir: string): BonusTypeSpec[] {
  try {
    const parsed = readXml(path.join(dataDir, 'BonusTypes.xml')) as { BonusTypes?: { Bonus?: unknown[] } }
    return (parsed?.BonusTypes?.Bonus ?? []) as BonusTypeSpec[]
  } catch { return [] }
}

/** V2 Challenges.xml (added 2.0.0.79) — patron-affiliated challenges. */
export interface Challenge {
  Name: string
  Patron?: string
  AdventurePack?: string
  LevelRange?: string | { '#text'?: string }
  Favor?: number
}

export function loadChallenges(dataDir: string): Challenge[] {
  try {
    const parsed = readXml(path.join(dataDir, 'Challenges.xml')) as { Challenges?: { Challenge?: unknown[] } }
    return (parsed?.Challenges?.Challenge ?? []) as Challenge[]
  } catch { return [] }
}

/** V2 ItemBuffs.xml — item-buff display-text catalogue (Type → text). */
export interface ItemBuffSpec {
  Type: string
  DisplayText?: string
}

export function loadItemBuffs(dataDir: string): ItemBuffSpec[] {
  try {
    const parsed = readXml(path.join(dataDir, 'ItemBuffs.xml')) as { Buffs?: { Buff?: unknown[] } }
    return (parsed?.Buffs?.Buff ?? []) as ItemBuffSpec[]
  } catch { return [] }
}

/** V2 ItemClickies.xml — clickie spell catalog (description + icon). */
export interface ItemClickieSpec {
  Name: string
  Description?: string
  Icon?: string
}

export function loadItemClickies(dataDir: string): ItemClickieSpec[] {
  try {
    const parsed = readXml(path.join(dataDir, 'ItemClickies.xml')) as { Spells?: { Spell?: unknown[] } }
    return (parsed?.Spells?.Spell ?? []) as ItemClickieSpec[]
  } catch { return [] }
}

/**
 * Convenience: load every catalogue. Returns the same shape the React
 * `BuildStatsInput` expects (minus `gearItems`, which depend on the
 * specific build's equipped items).
 */
export interface LoadedCatalogues {
  allRaces: Race[]
  allClasses: DDOClass[]
  allFeats: Feat[]
  allTrees: EnhancementTree[]
  allSelfBuffs: OptionalBuff[]
  allAugments: Augment[]
  allSetBonuses: SetBonus[]
  allFiligreeBonuses: FiligreeSetBonus[]
  allFiligrees: Filigree[]
  allWeaponGroups: WeaponGroupSpec[]
  allSpells: Spell[]
  allGuildBuffs: GuildBuff[]
  allItems: Item[]
  allAttackRates: AttackRate[]
  allBonusTypes: BonusTypeSpec[]
  allChallenges: Challenge[]
  allItemBuffs: ItemBuffSpec[]
  allItemClickies: ItemClickieSpec[]
}

export function loadAllCatalogues(dataDir: string): LoadedCatalogues {
  return {
    allRaces: loadRaces(dataDir),
    allClasses: loadClasses(dataDir),
    allFeats: loadFeats(dataDir),
    allTrees: loadEnhancementTrees(dataDir),
    allSelfBuffs: loadSelfAndPartyBuffs(dataDir),
    allAugments: loadAugments(dataDir),
    allSetBonuses: loadSetBonuses(dataDir),
    allFiligreeBonuses: loadFiligreeBonuses(dataDir),
    allFiligrees: loadFiligreeSets(dataDir),
    allWeaponGroups: loadWeaponGroups(dataDir),
    allSpells: loadSpells(dataDir),
    allGuildBuffs: loadGuildBuffs(dataDir),
    allItems: loadItems(dataDir),
    allAttackRates: loadAttackRates(dataDir),
    allBonusTypes: loadBonusTypes(dataDir),
    allChallenges: loadChallenges(dataDir),
    allItemBuffs: loadItemBuffs(dataDir),
    allItemClickies: loadItemClickies(dataDir),
  }
}
