// V2 parity: shared Requirements::Met implementation.
//
// V2 Requirement.cpp:Evaluate*() handles every requirement type. V3 had
// its own private copy inside FeatSlots.tsx; consolidating it here lets
// enhancements, item-equip rules, and spell-train rules use the same
// engine.
//
// V2 sources cited:
//   Requirement.cpp:780-836  Evaluate{Class,ClassMinLevel,BaseClassMinLevel,…}
//   Requirement.cpp:864      EvaluateSpecificLevel
//   Requirement.cpp:880-905  EvaluateAbility / Skill / BAB
//   Requirement.cpp:944-990  EvaluateAlignment / Race / RaceConstruct …
import type {
  Ability, CharacterBuild, DDOClass, Race, Requirement, RequiresOneOf,
  Requirements,
} from '../types/ddo'
import {
  abilityAtLevel, classLevelsAtLevel, getLevelClasses, tomeCapAtLevel,
} from './levelProgression'

// ---------------------------------------------------------------------------
// BAB helper (V2 parity: per-class table sum)
// ---------------------------------------------------------------------------

function classBABAtLevels(cls: DDOClass | undefined, levels: number): number {
  if (!cls?.BAB) return Math.floor(levels * 0.75)
  const arr = String(cls.BAB).trim().split(/\s+/).map(Number).filter(n => !isNaN(n))
  return arr[Math.min(levels, arr.length - 1)] ?? 0
}

function totalBAB(build: CharacterBuild, allClasses: DDOClass[]): number {
  const lc = getLevelClasses(build)
  const counts: Record<string, number> = {}
  for (const c of lc) if (c) counts[c] = (counts[c] ?? 0) + 1
  if ((build.epicLevels ?? 0) > 0) counts['Epic'] = build.epicLevels
  if ((build.legendaryLevels ?? 0) > 0) counts['Legendary'] = build.legendaryLevels
  let sum = 0
  for (const [name, levels] of Object.entries(counts)) {
    const cls = allClasses.find(c => c.Name === name)
    sum += classBABAtLevels(cls, levels)
  }
  return sum
}

// ---------------------------------------------------------------------------
// Single-requirement evaluator
// ---------------------------------------------------------------------------

export interface RequirementContext {
  build: CharacterBuild
  allClasses: DDOClass[]
  /** Optional race object — folds racial ability/skill bonuses into checks. */
  race?: Race
  /** Optional pre-built feat name set; defaults to build.featChoices values. */
  feats?: Set<string>
}

function getFeatSet(ctx: RequirementContext): Set<string> {
  if (ctx.feats) return ctx.feats
  return new Set(Object.values(ctx.build.featChoices).filter(Boolean))
}

export function meetsSingleRequirement(req: Requirement, ctx: RequirementContext): boolean {
  const item = Array.isArray(req.Item) ? req.Item[0] : req.Item ?? ''
  const value = req.Value ?? 0
  const { build, allClasses } = ctx

  switch (req.Type) {
    case 'Ability': {
      const charLvl = Math.max(1, build.totalLevel || 1)
      const tomeRaw = (build.abilityTomes ?? {})[item as Ability] ?? 0
      const tome = Math.min(tomeRaw, tomeCapAtLevel(charLvl))
      const racial = ctx.race ? Number((ctx.race as unknown as Record<string, unknown>)[item] ?? 0) || 0 : 0
      return abilityAtLevel(build, item as Ability, charLvl, racial, tome) >= value
    }
    case 'BAB':
      return totalBAB(build, allClasses) >= value
    case 'Feat':
      return getFeatSet(ctx).has(item)
    case 'Race':
      return build.race === item
    case 'Class':
      return build.classes.some(c => c.name === item && c.levels > 0)
    case 'ClassLevel': {
      const bc = build.classes.find(c => c.name === item)
      return (bc?.levels ?? 0) >= value
    }
    case 'ClassMinLevel': {
      if (!item || item === 'Any') {
        return build.classes.some(c => c.levels >= value)
      }
      const bc = build.classes.find(c => c.name === item)
      return (bc?.levels ?? 0) >= value
    }
    case 'BaseClassMinLevel':
      return classLevelsAtLevel(build, item, build.totalLevel || 20, allClasses, true) >= value
    case 'Level':
    case 'SpecificLevel':
      return build.totalLevel >= value
    case 'Alignment':
      return build.alignment === item
    case 'Enhancement': {
      // Allow either trained (rank > 0) or trained-with-min-rank.
      const minRank = value
      for (const choices of Object.values(build.enhancementChoices ?? {})) {
        const rank = choices[item] ?? 0
        if (rank > 0 && (minRank === 0 || rank >= minRank)) return true
      }
      return false
    }
    case 'Stance':
    case 'EnemyType':
      // Runtime conditions; treat as met for static prerequisite display.
      return true
    case 'Skill':
      // Skill ranks are character-level dependent; we don't track per-level
      // ranks yet (skillRanksByLevel is in flight). Treat as met to avoid
      // false negatives.
      return true
    case 'StartingWorld':
      return true
    default:
      return true
  }
}

export function meetsOneOfGroup(group: RequiresOneOf, ctx: RequirementContext): boolean {
  const reqs = Array.isArray(group.Requirement) ? group.Requirement : [group.Requirement]
  return reqs.some(r => meetsSingleRequirement(r, ctx))
}

export function meetsRequirements(
  reqs: Requirements | undefined,
  ctx: RequirementContext,
): boolean {
  if (!reqs) return true

  if (reqs.Requirement) {
    const list = Array.isArray(reqs.Requirement) ? reqs.Requirement : [reqs.Requirement]
    if (!list.every(r => meetsSingleRequirement(r, ctx))) return false
  }

  if (reqs.RequiresOneOf) {
    const groups = Array.isArray(reqs.RequiresOneOf) ? reqs.RequiresOneOf : [reqs.RequiresOneOf]
    if (!groups.every(g => meetsOneOfGroup(g, ctx))) return false
  }

  if (reqs.RequiresNoneOf) {
    const groups = Array.isArray(reqs.RequiresNoneOf) ? reqs.RequiresNoneOf : [reqs.RequiresNoneOf]
    if (groups.some(g => meetsOneOfGroup(g, ctx))) return false
  }

  return true
}
