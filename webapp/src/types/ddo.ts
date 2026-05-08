// Core DDO types matching the XML data structure

export type Ability = 'Strength' | 'Dexterity' | 'Constitution' | 'Intelligence' | 'Wisdom' | 'Charisma'
export type SaveType = 'Strong' | 'Weak' | 'Type1' | 'Type2'
export type BonusType = 'Enhancement' | 'Competence' | 'Insight' | 'Morale' | 'Sacred' | 'Profane' | 'Luck' | 'Alchemical' | string

export interface AbilityScores {
  Strength: number
  Dexterity: number
  Constitution: number
  Intelligence: number
  Wisdom: number
  Charisma: number
}

// ---------------------------------------------------------------------------
// Requirements
// ---------------------------------------------------------------------------
export interface Requirement {
  Type: string
  Item?: string | string[]
  Value?: number
}

export interface RequiresOneOf {
  Requirement: Requirement[]
}

export interface Requirements {
  Requirement?: Requirement | Requirement[]
  RequiresOneOf?: RequiresOneOf | RequiresOneOf[]
  RequiresNoneOf?: RequiresOneOf | RequiresOneOf[]
}

// ---------------------------------------------------------------------------
// Effects
// ---------------------------------------------------------------------------
export interface Effect {
  Type: string
  Bonus?: string
  AType?: string
  Amount?: unknown           // number | string | { '#text': unknown } from XML
  Item?: string | string[]
  DisplayName?: string
  Requirements?: Requirements
  StackSource?: string
  ApplyAsItemEffect?: boolean
  Rare?: boolean             // effect only applies when filigree slot is marked rare
}

// ---------------------------------------------------------------------------
// Race
// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------
// FeatSlot (used by both Race and Class)
// ---------------------------------------------------------------------------
export interface FeatSlot {
  Level: number
  FeatType: string
  FeatUpdateList?: string | string[]
}

export interface Race {
  Name: string
  ShortName?: string
  Description?: string
  StartingWorld?: string
  BuildPoints?: unknown
  IconicClass?: string
  Strength?: number
  Dexterity?: number
  Constitution?: number
  Intelligence?: number
  Wisdom?: number
  Charisma?: number
  GrantedFeat?: string | string[]
  NotHeroic?: boolean
  NoPastLife?: boolean
  IsIconic?: boolean
  FeatSlot?: FeatSlot[]
  Feat?: unknown[]
}

// ---------------------------------------------------------------------------
// Class
// ---------------------------------------------------------------------------

export interface AutomaticFeat {
  Level?: number
  Feats?: string | string[]
}

export interface DDOClass {
  Name: string
  Description?: string
  SmallIcon?: string
  LargeIcon?: string
  SkillPoints?: number
  HitPoints?: number
  ClassSkill?: string | string[]
  Alignment?: string | string[]
  Fortitude?: SaveType
  Reflex?: SaveType
  Will?: SaveType
  SpellPointsPerLevel?: string
  BAB?: string
  CastingStat?: Ability
  BaseClass?: string
  FeatSlot?: FeatSlot[]
  AutomaticFeats?: AutomaticFeat[]
  NotHeroic?: boolean
}

// ---------------------------------------------------------------------------
// Feat
// ---------------------------------------------------------------------------
export interface Feat {
  Name: string
  Description?: string
  Icon?: string
  Group?: string | string[]
  Acquire?: string
  MaxTimesAcquire?: number
  Requirements?: Requirements
  Effect?: Effect | Effect[]
}

// ---------------------------------------------------------------------------
// Enhancement tree
// ---------------------------------------------------------------------------
export interface EnhancementSelection {
  Name: string
  Description?: string
  Icon?: string
  Cost?: number
  Effect?: Effect | Effect[]
}

export interface EnhancementTreeItem {
  Name: string
  InternalName?: string
  Description?: string
  Icon?: string
  XPosition?: number
  YPosition?: number
  CostPerRank?: string
  Ranks?: number
  MinSpent?: number
  ArrowRight?: boolean
  ArrowUp?: boolean
  Clickie?: boolean
  Requirements?: Requirements
  Selector?: { EnhancementSelection: EnhancementSelection[] }[]
  Effect?: Effect | Effect[]
}

export interface EnhancementTree {
  Name: string
  Version?: number
  IsRacialTree?: boolean
  IsEpicDestiny?: boolean
  IsReaperTree?: boolean
  Background?: string
  Icon?: string
  Requirements?: Requirements
  EnhancementTreeItem?: EnhancementTreeItem[]
}

// ---------------------------------------------------------------------------
// Item
// ---------------------------------------------------------------------------
export interface ItemBuff {
  Type: string
  Value1?: number
  BonusType?: string
  Description1?: string
  Item?: string
}

export interface ItemAugment {
  Type: string
  Augment?: {
    Name: string
    Description?: string
    MinLevel?: number
  }
}

export interface BaseDice {
  Number: number
  Sides: number
}

export interface Item {
  Name: string
  Icon?: string
  Description?: string
  DropLocation?: string
  MinLevel?: number
  AdventurePack?: string
  EquipmentSlot?: Record<string, boolean>
  Material?: string
  Buff?: ItemBuff | ItemBuff[]
  ItemAugment?: ItemAugment | ItemAugment[]
  SetBonus?: string | string[]
  Requirements?: Requirements
  // Weapon-specific
  Weapon?: string
  AttackModifier?: string | string[]
  DRBypass?: string | string[]
  WeaponDamage?: number
  BaseDice?: BaseDice
  CriticalMultiplier?: number
  CriticalThreatRange?: number
  // Armor-specific
  Armor?: string
  ArmorBonus?: number
  MaximumDexterityBonus?: number
  ArmorCheckPenalty?: number
  ArcaneSpellFailure?: number
  // Shield-specific
  ShieldBonus?: number
}

// ---------------------------------------------------------------------------
// Set Bonuses
// ---------------------------------------------------------------------------
export interface SetBonusBuff {
  EquippedCount: number
  Description?: string
  Effect?: Effect | Effect[]
}

export interface SetBonus {
  Type: string
  Icon?: string
  Buff?: SetBonusBuff | SetBonusBuff[]
}

// ---------------------------------------------------------------------------
// Stance
// ---------------------------------------------------------------------------
export interface Stance {
  Name: string
  Icon?: string
  Description?: string
  Group?: string
  AutoControlled?: boolean
}

// ---------------------------------------------------------------------------
// Augment type (from /api/augments)
// ---------------------------------------------------------------------------
export interface Augment {
  Name: string
  Description?: string
  MinLevel?: number
  Type: string
  Icon?: string
  Effect?: Effect | Effect[]
}

// ---------------------------------------------------------------------------
// Filigree
// ---------------------------------------------------------------------------
export interface FiligreeSetBuff {
  EquippedCount: number
  Description?: string
  Effect?: Effect | Effect[]
}

export interface FiligreeSetBonus {
  Type: string
  Icon?: string
  Buff?: FiligreeSetBuff | FiligreeSetBuff[]
}

export interface Filigree {
  Name: string
  Description?: string
  Icon?: string
  Menu?: string
  Effect?: Effect | Effect[]
  /** the set bonus type name this filigree belongs to */
  SetBonus?: string
}

/** A single filigree slot in the character build — tracks name and whether it is the rare variant */
export interface FiligreeSlot {
  name: string
  rare: boolean
}

// ---------------------------------------------------------------------------
// Optional (Self & Party) Buff
// ---------------------------------------------------------------------------
export interface OptionalBuff {
  Name: string
  Description?: string
  Icon?: string
  Effect?: Effect | Effect[]
}

// ---------------------------------------------------------------------------
// Guild Buff
// ---------------------------------------------------------------------------
export interface GuildBuff {
  Name: string
  Description?: string
  Level?: number  // minimum guild level to unlock this buff
}

// ---------------------------------------------------------------------------
// Patron / Favor
// ---------------------------------------------------------------------------
export interface Patron {
  Name: string
  FavorTiers?: unknown  // "75 150 400 700" with size attr
  AssociatedFavorFeat?: string
}

export interface Quest {
  Name: string
  Patron?: string
  AdventurePack?: string
  Favor?: number
  Levels?: unknown
  DoNotShow?: boolean
}

// ---------------------------------------------------------------------------
// Sentient Gem
// ---------------------------------------------------------------------------
export interface SentientGem {
  Name: string
  Icon?: string
  Description?: string
}

// ---------------------------------------------------------------------------
// Character build (client-side state)
// ---------------------------------------------------------------------------
export type BuildClass = { name: string; levels: number }

export interface CharacterBuild {
  id: string
  name: string
  race: string
  alignment: string
  classes: [BuildClass, BuildClass, BuildClass]
  /** Heroic class levels total (max 20) */
  totalLevel: number
  /** Epic progression levels 21–30 (0–10) */
  epicLevels: number
  /** Legendary progression levels 31–34 (0–4) */
  legendaryLevels: number
  baseAbilities: AbilityScores
  abilityLevelUps: Partial<Record<4 | 8 | 12 | 16 | 20 | 24 | 28 | 32 | 36 | 40, Ability>>
  purchasedPoints: number
  featChoices: Record<string, string>
  /** skill name → ranks allocated */
  skillRanks: Record<string, number>
  /** slot name → equipped item name */
  gear: Record<string, string>
  /** augment key (slot:augmentType:index) → augment name */
  augmentChoices: Record<string, string>
  /** className|raceName → count of past lives */
  pastLives: Record<string, number>
  /** sentient weapon filigree slots (6 slots) */
  filigreeSlots: FiligreeSlot[]
  /** artifact filigree slots (up to 10) */
  artifactFiligreeSlots: FiligreeSlot[]
  /** epic destiny tree choices: treeName → itemName → ranks */
  destinyChoices: Record<string, Record<string, number>>
  /** reaper enhancement choices: treeName → itemName → ranks */
  reaperChoices: Record<string, Record<string, number>>
  /** which of the 3 selected destiny trees is the active (primary) destiny */
  activeEpicDestiny: string
  /** the 3 chosen destiny tree names (empty string = slot unused) */
  selectedDestinyTrees: [string, string, string]
  /** destiny tree names the character has unlocked in-game */
  unlockedDestinyTrees: string[]
  /** twists of fate: enhancement internal names from unlocked destiny trees (5 slots) */
  twistChoices: string[]
  /** ability → tome bonus (+1 to +7) */
  abilityTomes: Partial<Record<Ability, number>>
  /** skill name → tome bonus (+0 to +7) */
  skillTomes: Record<string, number>
  /** names of toggled-on self/party buffs */
  activeBuffs: string[]
  /** quest name → completed */
  completedQuests: Record<string, boolean>
  notes: string
  /** name of equipped sentient gem */
  sentientGem: string
  /** setName → slot → itemName */
  namedGearSets: Record<string, Record<string, string>>
  activeGearSetName: string
  /** heroic enhancement choices: treeName → itemName → rank */
  enhancementChoices: Record<string, Record<string, number>>
  /** heroic enhancement selector choices: treeName → itemName → selected option name */
  enhancementSelections: Record<string, Record<string, string>>
  /** ordered list of pinned heroic enhancement tree names */
  enhancementPinned: string[]
}

function generateId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0
    return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16)
  })
}

export function emptyBuild(): CharacterBuild {
  return {
    id: generateId(),
    name: 'New Character',
    race: 'Human',
    alignment: 'True Neutral',
    classes: [
      { name: 'Fighter', levels: 20 },
      { name: '', levels: 0 },
      { name: '', levels: 0 },
    ],
    totalLevel: 20,
    epicLevels: 10,
    legendaryLevels: 4,
    baseAbilities: { Strength: 8, Dexterity: 8, Constitution: 8, Intelligence: 8, Wisdom: 8, Charisma: 8 },
    abilityLevelUps: {},
    purchasedPoints: 0,
    featChoices: {},
    skillRanks: {},
    gear: {},
    augmentChoices: {},
    pastLives: {},
    filigreeSlots: Array.from({ length: 6 }, () => ({ name: '', rare: false })),
    artifactFiligreeSlots: Array.from({ length: 10 }, () => ({ name: '', rare: false })),
    destinyChoices: {},
    reaperChoices: {},
    activeEpicDestiny: '',
    selectedDestinyTrees: ['', '', ''],
    unlockedDestinyTrees: [],
    twistChoices: ['', '', '', '', ''],
    abilityTomes: {},
    skillTomes: {},
    activeBuffs: [],
    completedQuests: {},
    notes: '',
    sentientGem: '',
    namedGearSets: {},
    activeGearSetName: '',
    enhancementChoices: {},
    enhancementSelections: {},
    enhancementPinned: [],
  }
}

export const POINT_BUY_COSTS: Record<number, number> = {
  8: 0, 9: 1, 10: 2, 11: 3, 12: 4, 13: 5, 14: 6, 15: 8, 16: 10, 17: 13, 18: 16,
}

export function pointBuyCost(score: number): number {
  return POINT_BUY_COSTS[score] ?? 0
}

export function totalPointsSpent(abilities: AbilityScores): number {
  return (Object.values(abilities) as number[]).reduce((sum, s) => sum + pointBuyCost(s), 0)
}
