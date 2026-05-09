// DDO Effect / ItemBuff → RawBonus converter
//
// Converts parsed XML Effect objects and ItemBuff objects into ParsedBonus
// entries for specific stat keys. Stat keys are flat dot-separated strings
// (e.g. "ability.Strength", "save.Fort", "skill.Heal", "sp.Fire", …).

import type { Effect, ItemBuff, Buff, Requirements, Requirement } from '../types/ddo'

// ---------------------------------------------------------------------------
// EffectContext: evaluated build state used to gate effects
// ---------------------------------------------------------------------------

export interface EffectContext {
  race: string
  alignment: string
  classLevels: Record<string, number>       // exact class → levels
  baseClassLevels: Record<string, number>   // base class (incl. derived) → total levels
  totalLevel: number
  feats: Set<string>                        // trained feats (player + auto + race)
  enhancements: Set<string>                 // trained enhancement item names
  abilityTotals: Record<string, number>     // ability → score (base+race+levelup)
  stances: Set<string>                      // active stances (Cloth Armor, Tower Shield, …)
  bab: number
  weaponTypes: Set<string>                  // currently equipped weapon types
  // Optional fields used by AType resolution and weapon-class requirements.
  // Older callers that don't populate these get conservative fallbacks.
  featCounts?: Record<string, number>       // feat → number of times trained
  setBonusCounts?: Record<string, number>   // set bonus name → equipped tier count
  sliderValues?: Record<string, number>     // slider name → current value
  weaponClassMain?: Set<string>             // main-hand weapon class memberships
  weaponClassOffhand?: Set<string>          // off-hand weapon class memberships
}

// ---------------------------------------------------------------------------
// Requirements evaluator
// ---------------------------------------------------------------------------

function reqList(r: Requirement | Requirement[] | undefined): Requirement[] {
  if (!r) return []
  return Array.isArray(r) ? r : [r]
}

function items(req: Requirement): string[] {
  if (!req.Item) return []
  return Array.isArray(req.Item) ? req.Item : [req.Item]
}

/** Checks a single Requirement against a build context. */
function checkRequirement(req: Requirement, ctx: EffectContext): boolean {
  const its = items(req)
  const v = req.Value ?? 0
  switch (req.Type) {
    case 'Stance':
      return its.length === 0 || its.some(i => ctx.stances.has(i))
    case 'Race':
      return its.some(i => ctx.race === i)
    case 'NotConstruct':
      return !(ctx.race === 'Warforged' || ctx.race === 'Bladeforged')
    case 'RaceConstruct':
      return ctx.race === 'Warforged' || ctx.race === 'Bladeforged'
    case 'Class':
      return its.some(i => (ctx.classLevels[i] ?? 0) > 0)
    case 'BaseClass':
      return its.some(i => (ctx.baseClassLevels[i] ?? 0) > 0)
    case 'ClassMinLevel':
      return its.some(i => (ctx.classLevels[i] ?? 0) >= v)
    case 'ClassAtLevel':
      return its.some(i => (ctx.classLevels[i] ?? 0) === v)
    case 'BaseClassMinLevel':
      return its.some(i => (ctx.baseClassLevels[i] ?? 0) >= v)
    case 'BaseClassAtLevel':
      return its.some(i => (ctx.baseClassLevels[i] ?? 0) === v)
    case 'Level':
    case 'SpecificLevel':
      return ctx.totalLevel >= v
    case 'Feat':
    case 'FeatAnySource':
      return its.some(i => ctx.feats.has(i))
    case 'Enhancement':
      return its.some(i => ctx.enhancements.has(i))
    case 'Ability':
      return its.some(i => (ctx.abilityTotals[i] ?? 0) >= v)
    case 'AbilityGreaterCondition':
      // Item[0] > Item[1]
      if (its.length < 2) return false
      return (ctx.abilityTotals[its[0]] ?? 0) > (ctx.abilityTotals[its[1]] ?? 0)
    case 'BAB':
      return ctx.bab >= v
    case 'Alignment':
      return its.some(i => ctx.alignment === i)
    case 'AlignmentType': {
      // Lawful/Chaotic/Good/Evil/Neutral type-axis match
      if (its.length === 0) return true
      const a = ctx.alignment
      return its.some(i => a.includes(i))
    }
    case 'WeaponTypesEquipped':
      return its.some(i => ctx.weaponTypes.has(i))
    case 'WeaponClassMainHand':
      // Conservative pass when caller hasn't populated weaponClassMain.
      if (!ctx.weaponClassMain) return true
      return its.some(i => ctx.weaponClassMain!.has(i))
    case 'WeaponClassOffHand':
      if (!ctx.weaponClassOffhand) return true
      return its.some(i => ctx.weaponClassOffhand!.has(i))
    case 'Skill':
      // Skill ranks ≥ value — V3 tracks skill totals via build stats not in
      // ctx; conservative pass to avoid false negatives.
      return true
    case 'GroupMember':
    case 'GroupMember2':
    case 'StartingWorld':
    case 'EnemyType':
    case 'ItemTypeInSlot':
    case 'ItemSlot':
    case 'MaterialType':
    case 'Exclusive':
      // Not gated client-side; always pass.
      return true
    default:
      // Unknown requirement → conservative pass
      return true
  }
}

/** V2 Requirements::Met — top-level Requirements are AND'd; OneOf is OR; NoneOf is NOR. */
export function requirementsMet(reqs: Requirements | undefined, ctx: EffectContext): boolean {
  if (!reqs) return true

  for (const r of reqList(reqs.Requirement)) {
    if (!checkRequirement(r, ctx)) return false
  }
  const oneOfGroups = reqs.RequiresOneOf
    ? (Array.isArray(reqs.RequiresOneOf) ? reqs.RequiresOneOf : [reqs.RequiresOneOf])
    : []
  for (const g of oneOfGroups) {
    const list = reqList(g.Requirement)
    if (list.length === 0) continue
    if (!list.some(r => checkRequirement(r, ctx))) return false
  }
  const noneOfGroups = reqs.RequiresNoneOf
    ? (Array.isArray(reqs.RequiresNoneOf) ? reqs.RequiresNoneOf : [reqs.RequiresNoneOf])
    : []
  for (const g of noneOfGroups) {
    const list = reqList(g.Requirement)
    if (list.some(r => checkRequirement(r, ctx))) return false
  }
  return true
}

// ---------------------------------------------------------------------------
// Re-export (useful for callers)
// ---------------------------------------------------------------------------
export type { RawBonus } from './bonus'

// ---------------------------------------------------------------------------
// Public interfaces
// ---------------------------------------------------------------------------

export interface ParsedBonus {
  statKey: string
  value: number
  bonusType: string  // from Effect.Bonus or ItemBuff.BonusType
  source: string
}

// ---------------------------------------------------------------------------
// Amount parsing helpers
// ---------------------------------------------------------------------------

/**
 * Coerces the raw Amount field (which fast-xml-parser may have produced as a
 * number, space-separated string, object with '#text', or array) into a flat
 * number[].
 */
export function parseAmount(raw: unknown): number[] {
  if (raw === undefined || raw === null) {
    return []
  }

  // Scalar number
  if (typeof raw === 'number') {
    return [raw]
  }

  // Plain string: space-separated numbers
  if (typeof raw === 'string') {
    return raw
      .trim()
      .split(/\s+/)
      .filter(s => s.length > 0)
      .map(s => parseFloat(s))
      .filter(n => !isNaN(n))
  }

  // Object with '#text' key (fast-xml-parser attribute-bearing text node)
  if (typeof raw === 'object' && !Array.isArray(raw)) {
    const obj = raw as Record<string, unknown>
    const text = obj['#text']
    if (text !== undefined) {
      return parseAmount(text)
    }
    return []
  }

  // Array: recurse to flatten
  if (Array.isArray(raw)) {
    return (raw as unknown[]).flatMap(item => parseAmount(item))
  }

  return []
}

/**
 * Returns the Amount value at the given 1-based rank, clamped to array bounds.
 * Returns 0 if the amount array is empty.
 */
export function getAmountAtRank(raw: unknown, rank: number): number {
  const amounts = parseAmount(raw)
  if (amounts.length === 0) return 0
  const idx = Math.max(0, Math.min(rank - 1, amounts.length - 1))
  return amounts[idx]
}

// ---------------------------------------------------------------------------
// Spell element normalization
// ---------------------------------------------------------------------------

/**
 * Normalises a spell-element string to the canonical form used by the stat key
 * system (e.g. 'Light/Alignment' → 'LightAlignment').
 */
function normalizeSpellElement(raw: string): string {
  switch (raw) {
    case 'Alignment':
    case 'Light':
    case 'Light/Alignment':
      return 'LightAlignment'
    default:
      return raw
  }
}

// ---------------------------------------------------------------------------
// V2 weapon-effect gating: an Item-filtered weapon effect applies only when
// the equipped weapon (or its weapon-class memberships) appears in the
// effect's Item list. "All" or empty Item is universal. When ctx hasn't
// populated weaponTypes / weaponClassMain, we default to permissive (apply)
// so legacy callers don't regress.
// ---------------------------------------------------------------------------

function weaponEffectMatches(items: string[], ctx?: EffectContext): boolean {
  if (items.length === 0) return true
  if (items.includes('All')) return true
  if (!ctx) return true
  // Match on equipped weapon type names.
  for (const i of items) {
    if (ctx.weaponTypes.has(i)) return true
  }
  // Match on weapon class (e.g. "Martial", "OneHanded", "Light").
  if (ctx.weaponClassMain) {
    for (const i of items) {
      if (ctx.weaponClassMain.has(i)) return true
    }
  }
  return false
}

// ---------------------------------------------------------------------------
// Item array helper
// ---------------------------------------------------------------------------

function toStringArray(val: string | string[] | undefined): string[] {
  if (!val) return []
  return Array.isArray(val) ? val : [val]
}

// ---------------------------------------------------------------------------
// Stance-gated effect guard
// ---------------------------------------------------------------------------

/**
 * Returns true if the effect has a Stance requirement, meaning it is
 * conditionally active only in a specific stance. These are toggled abilities
 * that must be excluded from passive stat totals.
 */
function hasStanceRequirement(effect: Effect): boolean {
  const reqs = effect.Requirements
  if (!reqs) return false

  const reqList = reqs.Requirement
  if (!reqList) return false

  const arr: { Type: string }[] = Array.isArray(reqList) ? reqList : [reqList]
  return arr.some(r => r.Type === 'Stance')
}

// ---------------------------------------------------------------------------
// AType → numeric value
// ---------------------------------------------------------------------------

function abilityModFromTotal(total: number): number {
  // V2: AbilityMod = (score - 10) / 2 floored, including for negatives.
  return Math.floor((total - 10) / 2)
}

function firstItem(effect: Effect): string | undefined {
  const it = effect.Item
  if (!it) return undefined
  if (Array.isArray(it)) return it[0]
  return it
}

function resolveValue(
  effect: Effect,
  rank: number,
  classLevels: number,
  treeTotalAP: number,
  ctx?: EffectContext,
): number | null {
  const atype = effect.AType ?? 'Stacks'

  switch (atype) {
    // ---------------------------------------------------------------------
    // Non-numeric / informational ATypes — produce no flat value.
    // ---------------------------------------------------------------------
    case 'Unknown':
    case 'NotNeeded':
    case 'SpellInfo':
    case 'SLA':                     // SLA: caster level + charges + recharge — handled separately
    case 'Dice':                    // Damage dice — modeled by weapon breakdown
    case 'CriticalDice':            // Critical damage dice — modeled by weapon breakdown
    case 'Slider':                  // Slider definition — UI metadata, not a stat value
    case 'UserList':                // V3 legacy alias — selector requiring user input
      return null

    case 'Simple':
      // V2: m_Amount[0] * m_stacks
      return getAmountAtRank(effect.Amount, 1) * Math.max(1, rank)

    case 'ClassLevel':
    case 'BaseClassLevel':
    case 'ClassCasterLevel': {
      const base = getAmountAtRank(effect.Amount, 1)
      return base * classLevels
    }

    case 'TotalLevel': {
      // V2: m_Amount[totalLevel-1] * m_stacks (40-entry array indexed by char level)
      const idx = Math.max(1, classLevels)
      return getAmountAtRank(effect.Amount, idx)
    }

    case 'APCount': {
      const base = getAmountAtRank(effect.Amount, 1)
      return base * treeTotalAP
    }

    // ---------------------------------------------------------------------
    // Ability-driven stack counts. V2 indexes Amount by ability score for
    // AbilityValue/Total, by mod for AbilityMod variants. We approximate by
    // multiplying base * derived-count (matches the typical Simple+stacks shape).
    // ---------------------------------------------------------------------
    case 'AbilityValue':
    case 'AbilityTotal':
    case 'AbilityTotalIndex': {
      const ability = firstItem(effect)
      const total = ability && ctx ? (ctx.abilityTotals[ability] ?? 0) : 0
      const base = getAmountAtRank(effect.Amount, 1)
      return base * total
    }

    case 'AbilityMod': {
      const ability = firstItem(effect)
      const total = ability && ctx ? (ctx.abilityTotals[ability] ?? 0) : 0
      const base = getAmountAtRank(effect.Amount, 1)
      return base * abilityModFromTotal(total)
    }

    case 'HalfAbilityMod': {
      const ability = firstItem(effect)
      const total = ability && ctx ? (ctx.abilityTotals[ability] ?? 0) : 0
      const base = getAmountAtRank(effect.Amount, 1)
      return base * Math.floor(abilityModFromTotal(total) / 2)
    }

    case 'ThirdAbilityMod': {
      const ability = firstItem(effect)
      const total = ability && ctx ? (ctx.abilityTotals[ability] ?? 0) : 0
      const base = getAmountAtRank(effect.Amount, 1)
      return base * Math.floor(abilityModFromTotal(total) / 3)
    }

    case 'BAB': {
      const base = getAmountAtRank(effect.Amount, 1)
      return base * (ctx?.bab ?? 0)
    }

    case 'FeatCount': {
      const feat = firstItem(effect)
      if (!feat) return 0
      const base = getAmountAtRank(effect.Amount, 1)
      const count =
        ctx?.featCounts?.[feat] ??
        (ctx?.feats.has(feat) ? 1 : 0)
      return base * count
    }

    case 'SetBonusCount': {
      const setName = firstItem(effect)
      if (!setName) return 0
      const base = getAmountAtRank(effect.Amount, 1)
      const count = ctx?.setBonusCounts?.[setName] ?? 0
      return base * count
    }

    case 'SliderValue': {
      const sliderName = firstItem(effect)
      if (!sliderName) return 0
      const base = getAmountAtRank(effect.Amount, 1)
      const value = ctx?.sliderValues?.[sliderName] ?? 0
      return base * value
    }

    case 'SliderValueLookup': {
      // V2 multiplies SliderValue by an Amount-array lookup at slider-value index.
      const sliderName = firstItem(effect)
      if (!sliderName) return 0
      const value = ctx?.sliderValues?.[sliderName] ?? 0
      return getAmountAtRank(effect.Amount, value)
    }

    case 'Stacks':
    default:
      return getAmountAtRank(effect.Amount, rank)
  }
}

// ---------------------------------------------------------------------------
// Effect.Type → stat key(s) mapping
// ---------------------------------------------------------------------------

/**
 * Returns zero or more ParsedBonus entries for a single Effect at the
 * specified rank.
 *
 * @param effect      The Effect object from the XML data
 * @param rank        1-based rank / tier of the enhancement or feat
 * @param source      Human-readable label for the bonus source
 * @param classLevels Number of class levels (used for ClassLevel AType)
 * @param treeTotalAP Total AP spent in the tree (used for APCount AType)
 */
export function parseEffect(
  effect: Effect,
  rank: number,
  source: string,
  classLevels = 0,
  treeTotalAP = 0,
  ctx?: EffectContext,
): ParsedBonus[] {
  // V2 Effect::IsActive → Requirements::Met. Gate the effect entirely if any
  // top-level requirement, OneOf group, or NoneOf group fails.
  // When no ctx is supplied, fall back to the legacy stance-only check.
  if (ctx) {
    if (!requirementsMet(effect.Requirements, ctx)) return []
  } else {
    if (hasStanceRequirement(effect)) return []
  }

  const resolved = resolveValue(effect, rank, classLevels, treeTotalAP, ctx)
  if (resolved === null) return []
  const value: number = resolved

  const bonusType = effect.Bonus ?? 'Enhancement'
  const items = toStringArray(effect.Item)

  function make(statKey: string, bt = bonusType): ParsedBonus {
    return { statKey, value, bonusType: bt, source }
  }

  const type = effect.Type

  switch (type) {
    // -----------------------------------------------------------------------
    // Ability scores
    // -----------------------------------------------------------------------
    case 'AbilityBonus':
    case 'AbilityScore':
      if (items.length > 0) {
        return items.map(item => make(`ability.${item}`))
      }
      return []

    // -----------------------------------------------------------------------
    // Skills
    // -----------------------------------------------------------------------
    case 'SkillBonus':
      if (items.length > 0) {
        return items.map(item => make(`skill.${item}`))
      }
      return []

    // -----------------------------------------------------------------------
    // Saving throws
    // -----------------------------------------------------------------------
    case 'SaveBonus': {
      if (items.length === 0) {
        // No Item → all three saves
        return [
          make('save.Fort'),
          make('save.Reflex'),
          make('save.Will'),
        ]
      }
      const results: ParsedBonus[] = []
      for (const item of items) {
        switch (item) {
          case 'All':
            results.push(make('save.Fort'))
            results.push(make('save.Reflex'))
            results.push(make('save.Will'))
            break
          case 'Fortitude':
            results.push(make('save.Fort'))
            break
          case 'Reflex':
            results.push(make('save.Reflex'))
            break
          case 'Will':
            results.push(make('save.Will'))
            break
          case 'Poison':
          case 'Disease':
          case 'Spell':
          case 'Traps':
          case 'Magic':
          case 'Fear':
          case 'Enchantment':
          case 'Illusion':
          case 'Curse':
            results.push(make(`save.sub.${item}`))
            break
          default:
            break
        }
      }
      return results
    }

    case 'FortitudeSave':
      return [make('save.Fort')]

    case 'ReflexSave':
      return [make('save.Reflex')]

    case 'WillSave':
      return [make('save.Will')]

    case 'AllSaveBonus':
      return [make('save.Fort'), make('save.Reflex'), make('save.Will')]

    // -----------------------------------------------------------------------
    // Defensive stats
    // -----------------------------------------------------------------------
    case 'Hitpoints':
      return [make('hp')]

    case 'ACBonus':
      return [make('ac')]

    case 'NaturalArmor':
    case 'NaturalArmorBonus':
      return [make('ac', 'Natural Armor')]

    case 'ShieldBonus':
      return [make('ac', 'Shield')]

    case 'Deflection':
      return [make('ac', 'Deflection')]

    case 'DodgeBonus':
    case 'Dodge':
      return [make('dodge', 'Dodge')]

    case 'DodgeCap':
      return [make('dodgeCap')]

    case 'MaxDexBonus':
      return [make('mdb')]

    case 'PRR':
      return [make('prr')]

    case 'MRR':
      return [make('mrr')]

    case 'MRRCap':
      return [make('mrrCap')]

    case 'BAB':
      return [make('bab')]

    case 'EnergyResistance':
      if (items.length > 0) {
        return items.flatMap(elem =>
          elem === 'All'
            ? ['Acid','Cold','Electric','Fire','Sonic','Force','Light','Negative','Positive','Poison','Repair','Untyped']
                .map(e => make(`resist.${e}`))
            : [make(`resist.${elem}`)],
        )
      }
      return []

    case 'EnergyAbsorbance':
    case 'EnergyAbsorption':
      if (items.length > 0) {
        return items.flatMap(elem =>
          elem === 'All'
            ? ['Acid','Cold','Electric','Fire','Sonic','Force','Light','Negative','Positive','Poison','Repair','Untyped']
                .map(e => make(`absorb.${e}`, 'Absorption'))
            : [make(`absorb.${elem}`, 'Absorption')],
        )
      }
      return []

    case 'DR':
      if (items.length > 0) return [make(`dr.${items[0]}`)]
      return [make('dr.Untyped')]

    case 'CasterLevel':
    case 'EpicCasterLevel':
      if (items.length > 0) return items.map(item => make(`cl.${item}`))
      return [make('cl.All')]

    case 'MaxCasterLevel':
      if (items.length > 0) return items.map(item => make(`maxCl.${item}`))
      return [make('maxCl.All')]

    case 'CasterLevelSchool':
      if (items.length > 0) return items.map(item => make(`clSchool.${item}`))
      return []

    case 'CasterLevelEnergy':
      if (items.length > 0) return items.map(item => make(`clEnergy.${normalizeSpellElement(item)}`))
      return []

    case 'Fortification':
      return [make('fortification')]

    case 'Concealment':
      return [make('concealment')]

    case 'MoveSpeed':
    case 'MovementSpeed':
      return [make('speed')]

    case 'SpellResistance':
      return [make('spellResistance')]

    // -----------------------------------------------------------------------
    // Melee / combat
    // -----------------------------------------------------------------------
    case 'MeleePower':
      return [make('melee.power')]

    case 'RangedPower':
      return [make('ranged.power')]

    case 'Doublestrike':
      return [make('melee.doublestrike')]

    case 'Strikethrough':
      return [make('melee.strikethrough')]

    case 'Doubleshot':
      return [make('ranged.doubleshot')]

    // V2 weapon-specific attack/damage effects: gated by Item filter against
    // the equipped main-hand weapon (or its class memberships). When matched,
    // they roll into the unified melee.toHit / melee.damage rather than a
    // per-weapon stat (the panel currently displays melee/ranged unified).
    case 'Weapon_Attack':
      if (!weaponEffectMatches(items, ctx)) return []
      return [make('melee.toHit')]

    case 'Weapon_Damage':
      if (!weaponEffectMatches(items, ctx)) return []
      return [make('melee.damage')]

    case 'Weapon_AttackAndDamage':
      if (!weaponEffectMatches(items, ctx)) return []
      return [make('melee.toHit'), make('melee.damage')]

    case 'Weapon_OtherDamageBonus':
      if (!weaponEffectMatches(items, ctx)) return []
      return [make('melee.damage')]

    case 'SneakAttack':
    case 'SneakAttackDice':
      return [make('melee.sneakDice')]

    // -----------------------------------------------------------------------
    // Spell power / crit / DC
    // -----------------------------------------------------------------------
    case 'SpellPower':
      if (items.length > 0) {
        return items.map(item => make(`sp.${normalizeSpellElement(item)}`))
      }
      return []

    case 'UniversalSpellPower':
      return [make('sp.Universal')]

    case 'SpellCritChance':
    case 'SpellLore':
      if (items.length > 0) {
        return items.map(item => make(`spCrit.${normalizeSpellElement(item)}`))
      }
      return []

    case 'UniversalSpellLore':
    case 'UniversalSpellCritChance':
      return [make('spCrit.Universal')]

    case 'SpellPoints':
      return [make('spellPoints')]

    case 'SpellFocusMastery':
      return [make('spellPenetration')]

    case 'SpellPenetration':
    case 'SpellResistancePenetration':
      return [make('spellPenetration')]

    case 'SpellFocus':
    case 'SpellDC':
      if (items.length > 0) {
        return items.map(item => make(`dc.${item}`))
      }
      return []

    // -----------------------------------------------------------------------
    // Miscellaneous
    // -----------------------------------------------------------------------
    case 'Initiative':
      return [make('initiative')]

    case 'ThreatRange':
    case 'ImprovedCritical':
      return [make('weapon.threatRange')]

    case 'OffHandAttack':
    case 'OffhandAttack':
      return [make('offhand.attack')]

    case 'Displacement':
      return [make('displacement')]

    case 'HelplessBonus':
      return [make('helpless')]

    case 'TurnUndead':
    case 'ExtraTurns':
      return [make('turnUndead')]

    // -----------------------------------------------------------------------
    // V2 parity: bypasses (DR / fortification / dodge / missile deflection)
    // -----------------------------------------------------------------------
    case 'DRBypass':
      if (items.length > 0) return items.map(item => make(`drBypass.${item}`))
      return [make('drBypass.Untyped')]

    case 'FortificationBypass':
      return [make('fortBypass')]

    case 'DodgeBypass':
      return [make('dodgeBypass')]

    case 'MissileDeflection':
      return [make('missileDeflection')]

    case 'MissileDeflectionBypass':
      return [make('missileDeflectionBypass')]

    // -----------------------------------------------------------------------
    // V2 parity: armor / shield specific AC and check penalty effects.
    // Bonus-type-coded variants flow into the same 'ac' stat key with the
    // appropriate exclusive-stack type per V2.
    // -----------------------------------------------------------------------
    case 'ArmorACBonus':
      return [make('ac', 'Armor')]

    case 'ACBonusShield':
      return [make('ac', 'Shield')]

    case 'ArmorCheckPenalty':
      return [make('armorCheckPenalty', 'Penalty')]

    case 'ArmorCheckPenaltyShield':
      return [make('armorCheckPenaltyShield', 'Penalty')]

    case 'ArcaneSpellFailure':
      return [make('arcaneSpellFailure')]

    case 'ArcaneSpellFailureShields':
      return [make('arcaneSpellFailureShield')]

    // Tower-shield-gated dodge — V2 gates this via Requirements; once the
    // requirement evaluator passes the bonus is a standard Dodge bonus.
    case 'DodgeBonusTowerShield':
      return [make('dodge', 'Dodge')]

    // V2 keeps armor MDB and tower-shield MDB as two distinct breakdowns
    // (Breakdown_MaxDexBonus vs Breakdown_MaxDexBonusShields). Both caps
    // apply concurrently — Dodge takes the minimum across them.
    case 'MaxDexBonusTowerShield':
      return [make('mdb.tower')]

    case 'BlockingDR':
      return [make('blockingDR')]

    case 'EnchantArmor':
      return [make('armor.enchantment')]

    case 'ShieldEnchantment':
      return [make('shield.enchantment')]

    // -----------------------------------------------------------------------
    // Healing / repair / negative-energy amplification
    // -----------------------------------------------------------------------
    case 'HealingAmplification':
      return [make('healAmp')]

    case 'NegativeHealingAmplification':
      return [make('negHealAmp')]

    case 'RepairAmplification':
      return [make('repairAmp')]

    // -----------------------------------------------------------------------
    // Hitpoint variants
    // -----------------------------------------------------------------------
    case 'HitpointsReaper':
      return [make('hp', 'Reaper')]

    case 'HitpointsStyleBonus':
      return [make('hp')]

    case 'FalseLife':
      return [make('hp', 'False Life')]

    // -----------------------------------------------------------------------
    // Sneak attack: V2 splits Dice / Damage / Range / Attack and main-vs-ranged.
    // -----------------------------------------------------------------------
    case 'SneakAttackAttack':
      return [make('melee.sneakAttack')]

    case 'SneakAttackDamage':
      return [make('melee.sneakDamage')]

    case 'SneakAttackRange':
      return [make('melee.sneakRange')]

    case 'RangedSneakAttackDamage':
      return [make('ranged.sneakDamage')]

    case 'RangedSneakAttackRange':
      return [make('ranged.sneakRange')]

    // -----------------------------------------------------------------------
    // AP / fate point bonuses
    // -----------------------------------------------------------------------
    case 'DestinyAPBonus':
      return [make('destinyAP')]

    case 'RAPBonus':
      return [make('reaperAP')]

    case 'UAPBonus':
      return [make('universalAP')]

    case 'FatePoint':
      return [make('fatePoint')]

    // -----------------------------------------------------------------------
    // Threat / tactical / spell DC
    // -----------------------------------------------------------------------
    case 'ThreatBonusMelee':
      return [make('threat.melee')]

    case 'ThreatBonusRanged':
      return [make('threat.ranged')]

    case 'ThreatBonusSpell':
      return [make('threat.spell')]

    case 'TacticalDC':
      if (items.length > 0) return items.map(item => make(`tacticalDC.${item}`))
      return [make('tacticalDC.All')]

    // -----------------------------------------------------------------------
    // Turn-undead (V2 splits these into multiple effects)
    // -----------------------------------------------------------------------
    case 'TurnBonus':
      return [make('turnUndead.bonus')]

    case 'TurnDiceBonus':
      return [make('turnUndead.diceBonus')]

    case 'TurnLevelBonus':
      return [make('turnUndead.levelBonus')]

    case 'TurnMaxDice':
      return [make('turnUndead.maxDice')]

    // -----------------------------------------------------------------------
    // Ki (monk)
    // -----------------------------------------------------------------------
    case 'KiCritical':
      return [make('ki.critical')]

    case 'KiHit':
      return [make('ki.hit')]

    case 'KiMaximum':
      return [make('ki.max')]

    case 'KiPassive':
      return [make('ki.passive')]

    // -----------------------------------------------------------------------
    // Songs (bard) — V2 emits these as Music-typed bonuses to the corresponding
    // primary stat key. We carry the V2 stat shape and tag the bonus type as
    // 'Music' so they stack-resolve correctly under the bard exclusive type.
    // -----------------------------------------------------------------------
    case 'SongCount':
      return [make('song.count')]

    case 'SongDuration':
      return [make('song.duration')]

    case 'SongACBonus':
      return [make('ac', 'Music')]

    case 'SongDodgeBonus':
      return [make('dodge', 'Music')]

    case 'SongSaveBonus': {
      const targets = items.length > 0 ? items : ['All']
      const out: ParsedBonus[] = []
      for (const t of targets) {
        switch (t) {
          case 'All':
            out.push(make('save.Fort', 'Music'))
            out.push(make('save.Reflex', 'Music'))
            out.push(make('save.Will', 'Music'))
            break
          case 'Fortitude': out.push(make('save.Fort', 'Music')); break
          case 'Reflex':    out.push(make('save.Reflex', 'Music')); break
          case 'Will':      out.push(make('save.Will', 'Music')); break
          default:          break
        }
      }
      return out
    }

    case 'SongAttackBonus':
      return [make('melee.toHit', 'Music')]

    case 'SongDoublestrike':
      return [make('melee.doublestrike', 'Music')]

    case 'SongDoubleshot':
      return [make('ranged.doubleshot', 'Music')]

    case 'SongDamageBonus':
      return [make('melee.damage', 'Music')]

    case 'SongUniversalSpellPower':
      return [make('sp.Universal', 'Music')]

    case 'SongSpellPenetration':
      return [make('spellPenetration', 'Music')]

    case 'SongCasterLevel':
      if (items.length > 0) return items.map(item => make(`cl.${item}`, 'Music'))
      return [make('cl.All', 'Music')]

    case 'SongSkillBonus':
      if (items.length > 0) return items.map(item => make(`skill.${item}`, 'Music'))
      return []

    case 'SongPRR':
      return [make('prr', 'Music')]

    case 'SongMRR':
      return [make('mrr', 'Music')]

    case 'SongHealingAmp':
      return [make('healAmp', 'Music')]

    case 'SongNegativeHealingAmp':
      return [make('negHealAmp', 'Music')]

    case 'SongRepairAmp':
      return [make('repairAmp', 'Music')]

    // -----------------------------------------------------------------------
    // Damage ability multipliers (Strength 1.5x for THF, 0.5x for offhand, …)
    // -----------------------------------------------------------------------
    case 'DamageAbilityMultiplier':
      return [make('melee.damageAbilityMult')]

    case 'DamageAbilityMultiplierOffhand':
      return [make('offhand.damageAbilityMult')]

    // -----------------------------------------------------------------------
    // Helpless (extra damage vs. helpless / damage taken while helpless)
    // -----------------------------------------------------------------------
    case 'HelplessDamage':
      return [make('helpless')]

    case 'HelplessDamageReduction':
      return [make('helplessDR')]

    // -----------------------------------------------------------------------
    // Miscellaneous combat / movement / utility
    // -----------------------------------------------------------------------
    case 'DivineGrace':
      return [make('save.divineGrace')]

    case 'OverrideBAB':
      return [make('babOverride')]

    case 'DoublestrikeOffhand':
      return [make('offhand.doublestrike')]

    case 'PointBlankShotRange':
      return [make('pointBlankShotRange')]

    case 'SecondaryShieldBash':
      return [make('secondaryShieldBash')]

    case 'TumbleCharge':
      return [make('tumbleCharge')]

    case 'TrueSeeing':
      return [make('trueSeeing')]

    case 'UnconsciousRange':
      return [make('unconsciousRange')]

    case 'WildsurgeChance':
      return [make('wildsurgeChance')]

    case 'Incorporeality':
      return [make('incorporeality')]

    case 'ImbueDice':
      return [make('imbueDice')]

    case 'Immunity':
      return [make(`immunity.${items[0] ?? 'All'}`)]

    case 'DragonmarkUse':
      return [make('dragonmark.uses')]

    case 'NegativeLevel':
      return [make('negativeLevel')]

    case 'OffHandAttackBonus':
      return [make('offhand.attack')]

    case 'ImplementBonus':
      return [make('implementBonus')]

    // -----------------------------------------------------------------------
    // Caster level — spell-specific / school-specific maxima
    // -----------------------------------------------------------------------
    case 'CasterLevelSpell':
      if (items.length > 0) return items.map(item => make(`clSpell.${item}`))
      return []

    case 'MaxCasterLevelSpell':
      if (items.length > 0) return items.map(item => make(`maxClSpell.${item}`))
      return []

    case 'MaxCasterLevelSchool':
      if (items.length > 0) return items.map(item => make(`maxClSchool.${item}`))
      return []

    // -----------------------------------------------------------------------
    // Spell cost / spell critical damage
    // -----------------------------------------------------------------------
    case 'SpellCostReduction':
      if (items.length > 0) return items.map(item => make(`spellCost.${item}`))
      return [make('spellCost.All')]

    case 'SpellPointCostPercent':
      return [make('spellCostPct')]

    case 'SpellCriticalDamage':
      if (items.length > 0) return items.map(item => make(`spCritDmg.${normalizeSpellElement(item)}`))
      return []

    case 'UniversalSpellCriticalDamage':
      return [make('spCritDmg.Universal')]

    // -----------------------------------------------------------------------
    // Metamagic cost reductions
    // -----------------------------------------------------------------------
    case 'MetamagicCostAccelerate':       return [make('metamagic.cost.Accelerate')]
    case 'MetamagicCostEschewMaterials':  return [make('metamagic.cost.EschewMaterials')]
    case 'MetamagicCostEmbolden':         return [make('metamagic.cost.Embolden')]
    case 'MetamagicCostEmpower':          return [make('metamagic.cost.Empower')]
    case 'MetamagicCostEmpowerHealing':   return [make('metamagic.cost.EmpowerHealing')]
    case 'MetamagicCostEnlarge':          return [make('metamagic.cost.Enlarge')]
    case 'MetamagicCostExtend':           return [make('metamagic.cost.Extend')]
    case 'MetamagicCostHeighten':         return [make('metamagic.cost.Heighten')]
    case 'MetamagicCostIntensify':        return [make('metamagic.cost.Intensify')]
    case 'MetamagicCostMaximize':         return [make('metamagic.cost.Maximize')]
    case 'MetamagicCostQuicken':          return [make('metamagic.cost.Quicken')]

    // -----------------------------------------------------------------------
    // Action boost / class extras (extra uses per rest)
    // -----------------------------------------------------------------------
    case 'ExtraActionBoost':       return [make('actionBoost.extra')]
    case 'ExtraLayOnHands':        return [make('lohExtra')]
    case 'LOHRegenRate':           return [make('lohRegen')]
    case 'ExtraRage':              return [make('rageExtra')]
    case 'ExtraSmite':             return [make('smiteExtra')]
    case 'ExtraRemoveDisease':     return [make('removeDiseaseExtra')]
    case 'ExtraWildEmpathy':       return [make('wildEmpathyExtra')]

    // -----------------------------------------------------------------------
    // Rune arm
    // -----------------------------------------------------------------------
    case 'RuneArmChargeRate':      return [make('runeArm.chargeRate')]
    case 'RuneArmStableCharge':    return [make('runeArm.stableCharge')]

    // -----------------------------------------------------------------------
    // Save / skill ability replacement (e.g. "use Cha for Reflex saves").
    // V2 models these as ability-substitution effects on the corresponding
    // save / skill breakdown. We can't fully model that without a breakdown
    // engine, so we surface them under a dedicated stat key for downstream
    // engines to consume.
    // -----------------------------------------------------------------------
    case 'SaveBonusAbility':
      if (items.length > 0) {
        return items.map(item => {
          switch (item) {
            case 'Fortitude': return make('save.Fort.ability')
            case 'Reflex':    return make('save.Reflex.ability')
            case 'Will':      return make('save.Will.ability')
            case 'All':       return make('save.All.ability')
            default:          return make(`save.sub.${item}.ability`)
          }
        })
      }
      return []

    case 'SaveNoFailOn1':
      if (items.length > 0) {
        return items.map(item => {
          switch (item) {
            case 'Fortitude': return make('save.Fort.noFailOn1')
            case 'Reflex':    return make('save.Reflex.noFailOn1')
            case 'Will':      return make('save.Will.noFailOn1')
            default:          return make('save.All.noFailOn1')
          }
        })
      }
      return [make('save.All.noFailOn1')]

    case 'SkillBonusAbility':
      if (items.length > 0) return items.map(item => make(`skill.${item}.ability`))
      return []

    // -----------------------------------------------------------------------
    // Hireling stats (modeled separately; not applied to the player build)
    // -----------------------------------------------------------------------
    case 'HirelingAbilityBonus':
    case 'HirelingConcealment':
    case 'HirelingHitpoints':
    case 'HirelingFortification':
    case 'HirelingPRR':
    case 'HirelingMRR':
    case 'HirelingDodge':
    case 'HirelingMeleePower':
    case 'HirelingRangedPower':
    case 'HirelingSpellPower':
    case 'HirelingSaveBonus':
    case 'HirelingGrantFeat':
      return []

    // -----------------------------------------------------------------------
    // V2 weapon breakdowns. Per-weapon-type / per-class effects are gated by
    // weaponEffectMatches against ctx.weaponTypes (equipped weapon names) and
    // ctx.weaponClassMain (equipped weapon's class memberships from
    // WeaponGroupings.xml + AddGroupWeapon effects). When matched, they emit
    // into the global weapon.* stat keys (V2 BreakdownItemWeapon family).
    // -----------------------------------------------------------------------
    case 'Weapon_Alacrity':
    case 'WeaponAlacrityClass':
      if (!weaponEffectMatches(items, ctx)) return []
      return [make('weapon.alacrity')]

    case 'Weapon_BaseDamage':
      if (!weaponEffectMatches(items, ctx)) return []
      return [make('weapon.baseDamage')]

    case 'Weapon_CriticalMultiplier':
    case 'WeaponCriticalMultiplierClass':
      if (!weaponEffectMatches(items, ctx)) return []
      return [make('weapon.critMult')]

    case 'Weapon_CriticalMultiplier19To20':
      if (!weaponEffectMatches(items, ctx)) return []
      return [make('weapon.critMult19to20')]

    case 'Weapon_CriticalRange':
    case 'WeaponCriticalRangeClass':
      if (!weaponEffectMatches(items, ctx)) return []
      return [make('weapon.threatRange')]

    case 'Weapon_Enchantment':
    case 'Weapon_EnchantmentClass':
      if (!weaponEffectMatches(items, ctx)) return []
      return [make('weapon.enchantment')]

    case 'Weapon_Keen':
      if (!weaponEffectMatches(items, ctx)) return []
      return [make('weapon.keen')]

    case 'Weapon_VorpalRange':
      if (!weaponEffectMatches(items, ctx)) return []
      return [make('weapon.vorpal')]

    // V2 weapon class attack/damage variants: gate on the weapon class match,
    // then roll into the unified melee.toHit / melee.damage stats so the
    // existing combat panel surfaces them without adding per-weapon UI yet.
    case 'WeaponAttackBonusClass':
      if (!weaponEffectMatches(items, ctx)) return []
      return [make('melee.toHit')]
    case 'WeaponDamageBonusClass':
      if (!weaponEffectMatches(items, ctx)) return []
      return [make('melee.damage')]

    // V2 weapon ability-replacement effects (e.g. Finesse: use DEX for attack,
    // Insightful Damage: use INT for damage). Modeled separately as 'weapon.X'
    // ability flags so a future weapon-breakdown engine can pick them up.
    case 'Weapon_AttackAbility':
    case 'WeaponAttackAbilityClass':
      if (!weaponEffectMatches(items, ctx)) return []
      // Ability name lives in Item; emit as a flag-style stat key per ability.
      return items
        .filter(i => i !== 'All')
        .map(i => make(`weapon.attackAbility.${i}`))

    case 'Weapon_DamageAbility':
    case 'WeaponDamageAbilityClass':
    case 'WeaponDamageBonusStat':
      if (!weaponEffectMatches(items, ctx)) return []
      return items
        .filter(i => i !== 'All')
        .map(i => make(`weapon.damageAbility.${i}`))

    // V2 effects that apply only on a critical hit (contribute to crit damage
    // but not normal damage). Emit to dedicated stat keys.
    case 'Weapon_AttackCritical':
      if (!weaponEffectMatches(items, ctx)) return []
      return [make('weapon.toHitCrit')]
    case 'Weapon_DamageCritical':
      if (!weaponEffectMatches(items, ctx)) return []
      return [make('weapon.damageCrit')]
    case 'Weapon_AttackAndDamageCritical':
      if (!weaponEffectMatches(items, ctx)) return []
      return [make('weapon.toHitCrit'), make('weapon.damageCrit')]
    case 'WeaponOtherDamageBonusCritical':
    case 'WeaponOtherDamageBonusCriticalClass':
      if (!weaponEffectMatches(items, ctx)) return []
      return [make('weapon.otherDamageCrit')]

    case 'WeaponOtherDamageBonus':
    case 'WeaponOtherDamageBonusClass':
      if (!weaponEffectMatches(items, ctx)) return []
      return [make('weapon.otherDamage')]

    // V2 effects that grant proficiency in a weapon class (no flat stat).
    case 'WeaponProficiencyClass':
      return []

    // V2 stat-substitution variants (DamageBonusStat, etc.) — already covered
    // by the *Ability cases above.
    case 'WeaponDamageBonusCriticalStat':
      if (!weaponEffectMatches(items, ctx)) return []
      return items
        .filter(i => i !== 'All')
        .map(i => make(`weapon.damageAbilityCrit.${i}`))

    // Damage-type variants (e.g. "+5 to all Slashing weapons") — V2 gates on
    // the equipped weapon's damage-type list. v3 doesn't currently track
    // per-weapon damage types, so these stay as no-ops until that data is
    // wired through.
    case 'WeaponAttackBonusDamageType':
    case 'WeaponAttackBonusCriticalDamageType':
    case 'WeaponDamageBonusDamageType':
    case 'WeaponDamageBonusCriticalDamageType':
    case 'WeaponKeenDamageType':
      return []

    // -----------------------------------------------------------------------
    // Control-flow / UI-only effects (no flat stat contribution)
    //   GrantFeat / GrantSpell / SpellListAddition / SpellLikeAbility — change
    //     the available feats/spells, handled by feat/spell aggregation.
    //   AddGroupWeapon / MergeGroups — modify weapon-group memberships.
    //   ExclusionGroup / ExcludeFeatSelection — gate selectors.
    //   CreateSlider — declares a slider; SliderValue effects consume it.
    //   EnhancementTree / DestinyTree — declare tree availability.
    //   ItemClickie / SLACharge — declares clickies / SLAs.
    //   SpellPowerReplacement / ImplementInYourHands — caster-level overrides.
    //   Regeneration / RustSusceptability — situational; not currently surfaced.
    //   NotModeled / Unknown — explicitly inert.
    // -----------------------------------------------------------------------
    case 'AddGroupWeapon':
    case 'MergeGroups':
    case 'ExclusionGroup':
    case 'ExcludeFeatSelection':
    case 'GrantFeat':
    case 'GrantSpell':
    case 'SpellListAddition':
    case 'SpellLikeAbility':
    case 'CreateSlider':
    case 'EnhancementTree':
    case 'DestinyTree':
    case 'ItemClickie':
    case 'SLACharge':
    case 'SpellPowerReplacement':
    case 'ImplementInYourHands':
    case 'Regeneration':
    case 'RustSusceptability':
    case 'NotModeled':
    case 'Unknown':
      return []

    // Unknown effect type — return nothing
    default:
      return []
  }
}

// ---------------------------------------------------------------------------
// ItemBuff parsing
// ---------------------------------------------------------------------------

/**
 * Converts an ItemBuff (from an equipped item's Buff list) into ParsedBonus
 * entries for the relevant stat keys.
 *
 * ItemBuff uses `Value1` for the magnitude and `BonusType` for the bonus type.
 */
export function parseItemBuff(buff: ItemBuff, source: string, ctx?: EffectContext): ParsedBonus[] {
  const value = buff.Value1 ?? 0
  const items = toStringArray(buff.Item as string | string[] | undefined)

  // Determine effective bonus type with override logic
  let bonusType: string
  switch (buff.BonusType) {
    case 'Natural Armor':
      bonusType = 'Natural Armor'
      break
    case 'Deflection':
      bonusType = 'Deflection'
      break
    case 'Dodge':
      bonusType = 'Dodge'
      break
    default:
      bonusType = buff.BonusType ?? 'Enhancement'
      break
  }

  function make(statKey: string, bt = bonusType): ParsedBonus {
    return { statKey, value, bonusType: bt, source }
  }

  const type = buff.Type

  switch (type) {
    // -----------------------------------------------------------------------
    // Ability scores — direct
    // -----------------------------------------------------------------------
    case 'Strength':
      return [make('ability.Strength')]
    case 'Dexterity':
      return [make('ability.Dexterity')]
    case 'Constitution':
      return [make('ability.Constitution')]
    case 'Intelligence':
      return [make('ability.Intelligence')]
    case 'Wisdom':
      return [make('ability.Wisdom')]
    case 'Charisma':
      return [make('ability.Charisma')]

    case 'AbilityBonus':
      if (items.length > 0) {
        return items.map(item => make(`ability.${item}`))
      }
      return []

    // -----------------------------------------------------------------------
    // Saving throws
    // -----------------------------------------------------------------------
    case 'FortitudeSave':
      return [make('save.Fort')]

    case 'ReflexSave':
      return [make('save.Reflex')]

    case 'WillSave':
      return [make('save.Will')]

    case 'SaveBonus': {
      if (items.length === 0) {
        return [make('save.Fort'), make('save.Reflex'), make('save.Will')]
      }
      const results: ParsedBonus[] = []
      for (const item of items) {
        switch (item) {
          case 'All':
            results.push(make('save.Fort'), make('save.Reflex'), make('save.Will'))
            break
          case 'Fortitude':
            results.push(make('save.Fort')); break
          case 'Reflex':
            results.push(make('save.Reflex')); break
          case 'Will':
            results.push(make('save.Will')); break
          case 'Poison': case 'Disease': case 'Spell': case 'Traps':
          case 'Magic': case 'Fear': case 'Enchantment':
          case 'Illusion': case 'Curse':
            results.push(make(`save.sub.${item}`)); break
          default:
            break
        }
      }
      return results
    }

    // -----------------------------------------------------------------------
    // Defensive stats
    // -----------------------------------------------------------------------
    case 'Hitpoints':
    case 'HitPoints':
      return [make('hp')]

    case 'ACBonus':
      return [make('ac')]

    case 'NaturalArmor':
      return [make('ac', 'Natural Armor')]

    case 'Deflection':
      return [make('ac', 'Deflection')]

    case 'DodgeBonus':
    case 'Dodge':
      return [make('dodge', 'Dodge')]

    case 'PRR':
      return [make('prr')]

    case 'MRR':
      return [make('mrr')]

    case 'MRRCap':
      return [make('mrrCap')]

    case 'BAB':
      return [make('bab')]

    case 'MaxDexBonus':
      return [make('mdb')]

    case 'MaxDexBonusTowerShield':
      return [make('mdb.tower')]

    case 'DodgeCap':
      return [make('dodgeCap')]

    case 'EnergyResistance':
      if (items.length > 0) {
        return items.flatMap(elem =>
          elem === 'All'
            ? ['Acid','Cold','Electric','Fire','Sonic','Force','Light','Negative','Positive','Poison','Repair','Untyped']
                .map(e => make(`resist.${e}`))
            : [make(`resist.${elem}`)],
        )
      }
      return []

    case 'EnergyAbsorbance':
    case 'EnergyAbsorption':
      if (items.length > 0) {
        return items.flatMap(elem =>
          elem === 'All'
            ? ['Acid','Cold','Electric','Fire','Sonic','Force','Light','Negative','Positive','Poison','Repair','Untyped']
                .map(e => make(`absorb.${e}`, 'Absorption'))
            : [make(`absorb.${elem}`, 'Absorption')],
        )
      }
      return []

    case 'DR':
      if (items.length > 0) return [make(`dr.${items[0]}`)]
      return [make('dr.Untyped')]

    case 'CasterLevel':
    case 'EpicCasterLevel':
      if (items.length > 0) return items.map(item => make(`cl.${item}`))
      return [make('cl.All')]

    case 'MaxCasterLevel':
      if (items.length > 0) return items.map(item => make(`maxCl.${item}`))
      return [make('maxCl.All')]

    case 'Fortification':
      return [make('fortification')]

    case 'Concealment':
      return [make('concealment')]

    case 'SpellResistance':
      return [make('spellResistance')]

    case 'SpellFocus':
    case 'SpellDC':
      if (items.length > 0) return items.map(item => make(`dc.${item}`))
      return [make('dc.All')]

    // -----------------------------------------------------------------------
    // Skills — by group type
    // -----------------------------------------------------------------------
    case 'SkillBonus':
      if (items.length > 0) {
        return items.map(item => make(`skill.${item}`))
      }
      return []

    case 'Balance':
      return [make('skill.Balance')]
    case 'Bluff':
      return [make('skill.Bluff')]
    case 'Concentration':
      return [make('skill.Concentration')]
    case 'Diplomacy':
      return [make('skill.Diplomacy')]
    case 'DisableDevice':
    case 'Disable_Device':
      return [make('skill.Disable Device')]
    case 'Haggle':
      return [make('skill.Haggle')]
    case 'Heal':
      return [make('skill.Heal')]
    case 'Hide':
      return [make('skill.Hide')]
    case 'Intimidate':
      return [make('skill.Intimidate')]
    case 'Jump':
      return [make('skill.Jump')]
    case 'Listen':
      return [make('skill.Listen')]
    case 'MoveSilently':
    case 'Move_Silently':
      return [make('skill.Move Silently')]
    case 'OpenLock':
    case 'Open_Lock':
      return [make('skill.Open Lock')]
    case 'Perform':
      return [make('skill.Perform')]
    case 'Repair':
      return [make('skill.Repair')]
    case 'Search':
      return [make('skill.Search')]
    case 'Spellcraft':
      return [make('skill.Spellcraft')]
    case 'Spot':
      return [make('skill.Spot')]
    case 'Swim':
      return [make('skill.Swim')]
    case 'Tumble':
      return [make('skill.Tumble')]
    case 'UseMagicDevice':
    case 'Use_Magic_Device':
      return [make('skill.Use Magic Device')]

    // -----------------------------------------------------------------------
    // Spell stats
    // -----------------------------------------------------------------------
    case 'SpellPoints':
      return [make('spellPoints')]

    case 'SpellPower':
      if (items.length > 0) {
        return items.map(item => make(`sp.${normalizeSpellElement(item)}`))
      }
      return []

    case 'UniversalSpellPower':
      return [make('sp.Universal')]

    case 'SpellFocusMastery':
      return [make('spellPenetration')]

    case 'SpellPenetration':
      return [make('spellPenetration')]

    // -----------------------------------------------------------------------
    // Combat
    // -----------------------------------------------------------------------
    case 'MeleePower':
      return [make('melee.power')]

    case 'RangedPower':
      return [make('ranged.power')]

    case 'Doublestrike':
      return [make('melee.doublestrike')]

    case 'Doubleshot':
      return [make('ranged.doubleshot')]

    case 'Initiative':
      return [make('initiative')]

    case 'MoveSpeed':
    case 'MovementSpeed':
      return [make('speed')]

    // -----------------------------------------------------------------------
    // V2 parity: bypasses
    // -----------------------------------------------------------------------
    case 'DRBypass':
      if (items.length > 0) return items.map(item => make(`drBypass.${item}`))
      return [make('drBypass.Untyped')]

    case 'FortificationBypass':
      return [make('fortBypass')]

    case 'DodgeBypass':
      return [make('dodgeBypass')]

    case 'MissileDeflection':
      return [make('missileDeflection')]

    case 'MissileDeflectionBypass':
      return [make('missileDeflectionBypass')]

    // -----------------------------------------------------------------------
    // V2 parity: armor / shield specific
    // -----------------------------------------------------------------------
    case 'ArmorACBonus':
    case 'ArmorBonus':
      return [make('ac', 'Armor')]

    case 'ACBonusShield':
    case 'ShieldBonus':
      return [make('ac', 'Shield')]

    case 'ArmorCheckPenalty':
      return [make('armorCheckPenalty', 'Penalty')]

    case 'ArmorCheckPenaltyShield':
      return [make('armorCheckPenaltyShield', 'Penalty')]

    case 'ArcaneSpellFailure':
      return [make('arcaneSpellFailure')]

    case 'ArcaneSpellFailureShields':
      return [make('arcaneSpellFailureShield')]

    case 'BlockingDR':
      return [make('blockingDR')]

    case 'EnchantArmor':
    case 'ArmorEnchantment':
      return [make('armor.enchantment')]

    case 'ShieldEnchantment':
      return [make('shield.enchantment')]

    // -----------------------------------------------------------------------
    // Healing / repair / negative-energy amplification
    // -----------------------------------------------------------------------
    case 'HealingAmplification':
      return [make('healAmp')]

    case 'NegativeHealingAmplification':
      return [make('negHealAmp')]

    case 'RepairAmplification':
      return [make('repairAmp')]

    // -----------------------------------------------------------------------
    // HP variants
    // -----------------------------------------------------------------------
    case 'HitpointsReaper':
      return [make('hp', 'Reaper')]

    case 'FalseLife':
      return [make('hp', 'False Life')]

    // -----------------------------------------------------------------------
    // Sneak attack
    // -----------------------------------------------------------------------
    case 'SneakAttackAttack':
      return [make('melee.sneakAttack')]

    case 'SneakAttackDamage':
      return [make('melee.sneakDamage')]

    case 'SneakAttackDice':
      return [make('melee.sneakDice')]

    case 'SneakAttackRange':
      return [make('melee.sneakRange')]

    case 'RangedSneakAttackDamage':
      return [make('ranged.sneakDamage')]

    case 'RangedSneakAttackRange':
      return [make('ranged.sneakRange')]

    // -----------------------------------------------------------------------
    // Threat / tactical / spell DC
    // -----------------------------------------------------------------------
    case 'ThreatBonusMelee':
      return [make('threat.melee')]

    case 'ThreatBonusRanged':
      return [make('threat.ranged')]

    case 'ThreatBonusSpell':
      return [make('threat.spell')]

    case 'TacticalDC':
      if (items.length > 0) return items.map(item => make(`tacticalDC.${item}`))
      return [make('tacticalDC.All')]

    // -----------------------------------------------------------------------
    // Spell-related
    // -----------------------------------------------------------------------
    case 'SpellLore':
    case 'SpellCritChance':
      if (items.length > 0) return items.map(item => make(`spCrit.${normalizeSpellElement(item)}`))
      return []

    case 'UniversalSpellLore':
    case 'UniversalSpellCritChance':
      return [make('spCrit.Universal')]

    case 'SpellCriticalDamage':
      if (items.length > 0) return items.map(item => make(`spCritDmg.${normalizeSpellElement(item)}`))
      return []

    case 'UniversalSpellCriticalDamage':
      return [make('spCritDmg.Universal')]

    case 'SpellCostReduction':
      if (items.length > 0) return items.map(item => make(`spellCost.${item}`))
      return [make('spellCost.All')]

    case 'SpellPointCostPercent':
      return [make('spellCostPct')]

    case 'CasterLevelSpell':
      if (items.length > 0) return items.map(item => make(`clSpell.${item}`))
      return []

    case 'MaxCasterLevelSpell':
      if (items.length > 0) return items.map(item => make(`maxClSpell.${item}`))
      return []

    case 'CasterLevelSchool':
      if (items.length > 0) return items.map(item => make(`clSchool.${item}`))
      return []

    case 'MaxCasterLevelSchool':
      if (items.length > 0) return items.map(item => make(`maxClSchool.${item}`))
      return []

    case 'CasterLevelEnergy':
      if (items.length > 0) return items.map(item => make(`clEnergy.${normalizeSpellElement(item)}`))
      return []

    case 'EpicCasterLevel':
      if (items.length > 0) return items.map(item => make(`cl.${item}`))
      return [make('cl.All')]

    // -----------------------------------------------------------------------
    // Metamagic cost reductions
    // -----------------------------------------------------------------------
    case 'MetamagicCostAccelerate':       return [make('metamagic.cost.Accelerate')]
    case 'MetamagicCostEschewMaterials':  return [make('metamagic.cost.EschewMaterials')]
    case 'MetamagicCostEmbolden':         return [make('metamagic.cost.Embolden')]
    case 'MetamagicCostEmpower':          return [make('metamagic.cost.Empower')]
    case 'MetamagicCostEmpowerHealing':   return [make('metamagic.cost.EmpowerHealing')]
    case 'MetamagicCostEnlarge':          return [make('metamagic.cost.Enlarge')]
    case 'MetamagicCostExtend':           return [make('metamagic.cost.Extend')]
    case 'MetamagicCostHeighten':         return [make('metamagic.cost.Heighten')]
    case 'MetamagicCostIntensify':        return [make('metamagic.cost.Intensify')]
    case 'MetamagicCostMaximize':         return [make('metamagic.cost.Maximize')]
    case 'MetamagicCostQuicken':          return [make('metamagic.cost.Quicken')]

    // -----------------------------------------------------------------------
    // AP / fate / class extras
    // -----------------------------------------------------------------------
    case 'DestinyAPBonus':         return [make('destinyAP')]
    case 'RAPBonus':               return [make('reaperAP')]
    case 'UAPBonus':               return [make('universalAP')]
    case 'FatePoint':              return [make('fatePoint')]
    case 'ExtraActionBoost':       return [make('actionBoost.extra')]
    case 'ExtraLayOnHands':        return [make('lohExtra')]
    case 'LOHRegenRate':           return [make('lohRegen')]
    case 'ExtraRage':              return [make('rageExtra')]
    case 'ExtraSmite':             return [make('smiteExtra')]
    case 'ExtraRemoveDisease':     return [make('removeDiseaseExtra')]
    case 'ExtraWildEmpathy':       return [make('wildEmpathyExtra')]
    case 'ExtraTurns':
    case 'TurnUndead':             return [make('turnUndead')]
    case 'TurnBonus':              return [make('turnUndead.bonus')]
    case 'TurnDiceBonus':          return [make('turnUndead.diceBonus')]
    case 'TurnLevelBonus':         return [make('turnUndead.levelBonus')]
    case 'TurnMaxDice':            return [make('turnUndead.maxDice')]

    // -----------------------------------------------------------------------
    // Ki / monk
    // -----------------------------------------------------------------------
    case 'KiCritical':             return [make('ki.critical')]
    case 'KiHit':                  return [make('ki.hit')]
    case 'KiMaximum':              return [make('ki.max')]
    case 'KiPassive':              return [make('ki.passive')]

    // -----------------------------------------------------------------------
    // Helpless / damage ability multiplier / divine grace
    // -----------------------------------------------------------------------
    case 'HelplessDamage':
    case 'HelplessBonus':          return [make('helpless')]
    case 'HelplessDamageReduction':return [make('helplessDR')]
    case 'DamageAbilityMultiplier':         return [make('melee.damageAbilityMult')]
    case 'DamageAbilityMultiplierOffhand':  return [make('offhand.damageAbilityMult')]
    case 'DivineGrace':            return [make('save.divineGrace')]

    // -----------------------------------------------------------------------
    // Songs (bard) — Music-typed bonuses to the corresponding stat keys
    // -----------------------------------------------------------------------
    case 'SongCount':              return [make('song.count')]
    case 'SongDuration':           return [make('song.duration')]
    case 'SongACBonus':            return [make('ac', 'Music')]
    case 'SongDodgeBonus':         return [make('dodge', 'Music')]
    case 'SongAttackBonus':        return [make('melee.toHit', 'Music')]
    case 'SongDoublestrike':       return [make('melee.doublestrike', 'Music')]
    case 'SongDoubleshot':         return [make('ranged.doubleshot', 'Music')]
    case 'SongDamageBonus':        return [make('melee.damage', 'Music')]
    case 'SongUniversalSpellPower':return [make('sp.Universal', 'Music')]
    case 'SongSpellPenetration':   return [make('spellPenetration', 'Music')]
    case 'SongPRR':                return [make('prr', 'Music')]
    case 'SongMRR':                return [make('mrr', 'Music')]
    case 'SongHealingAmp':         return [make('healAmp', 'Music')]
    case 'SongNegativeHealingAmp': return [make('negHealAmp', 'Music')]
    case 'SongRepairAmp':          return [make('repairAmp', 'Music')]
    case 'SongSaveBonus': {
      const targets = items.length > 0 ? items : ['All']
      const out: ParsedBonus[] = []
      for (const t of targets) {
        switch (t) {
          case 'All':
            out.push(make('save.Fort', 'Music'))
            out.push(make('save.Reflex', 'Music'))
            out.push(make('save.Will', 'Music'))
            break
          case 'Fortitude': out.push(make('save.Fort', 'Music')); break
          case 'Reflex':    out.push(make('save.Reflex', 'Music')); break
          case 'Will':      out.push(make('save.Will', 'Music')); break
          default:          break
        }
      }
      return out
    }
    case 'SongCasterLevel':
      if (items.length > 0) return items.map(item => make(`cl.${item}`, 'Music'))
      return [make('cl.All', 'Music')]
    case 'SongSkillBonus':
      if (items.length > 0) return items.map(item => make(`skill.${item}`, 'Music'))
      return []

    // -----------------------------------------------------------------------
    // Threat / utility / misc
    // -----------------------------------------------------------------------
    case 'OffHandAttackBonus':
    case 'OffHandAttack':
    case 'OffhandAttack':          return [make('offhand.attack')]
    case 'DoublestrikeOffhand':    return [make('offhand.doublestrike')]
    case 'OverrideBAB':            return [make('babOverride')]
    case 'PointBlankShotRange':    return [make('pointBlankShotRange')]
    case 'SecondaryShieldBash':    return [make('secondaryShieldBash')]
    case 'TumbleCharge':           return [make('tumbleCharge')]
    case 'TrueSeeing':              return [make('trueSeeing')]
    case 'UnconsciousRange':       return [make('unconsciousRange')]
    case 'WildsurgeChance':        return [make('wildsurgeChance')]
    case 'Incorporeality':         return [make('incorporeality')]
    case 'ImbueDice':              return [make('imbueDice')]
    case 'NegativeLevel':          return [make('negativeLevel')]
    case 'DragonmarkUse':          return [make('dragonmark.uses')]
    case 'ImplementBonus':         return [make('implementBonus')]
    case 'Displacement':           return [make('displacement')]
    case 'ThreatRange':
    case 'ImprovedCritical':       return [make('weapon.threatRange')]

    case 'Immunity':
      return [make(`immunity.${items[0] ?? 'All'}`)]

    // -----------------------------------------------------------------------
    // Save / skill ability replacement
    // -----------------------------------------------------------------------
    case 'SaveBonusAbility':
      if (items.length > 0) {
        return items.map(item => {
          switch (item) {
            case 'Fortitude': return make('save.Fort.ability')
            case 'Reflex':    return make('save.Reflex.ability')
            case 'Will':      return make('save.Will.ability')
            case 'All':       return make('save.All.ability')
            default:          return make(`save.sub.${item}.ability`)
          }
        })
      }
      return []

    case 'SkillBonusAbility':
      if (items.length > 0) return items.map(item => make(`skill.${item}.ability`))
      return []

    case 'SaveNoFailOn1':
      if (items.length > 0) {
        return items.map(item => {
          switch (item) {
            case 'Fortitude': return make('save.Fort.noFailOn1')
            case 'Reflex':    return make('save.Reflex.noFailOn1')
            case 'Will':      return make('save.Will.noFailOn1')
            default:          return make('save.All.noFailOn1')
          }
        })
      }
      return [make('save.All.noFailOn1')]

    // -----------------------------------------------------------------------
    // Rune arm
    // -----------------------------------------------------------------------
    case 'RuneArmChargeRate':      return [make('runeArm.chargeRate')]
    case 'RuneArmStableCharge':    return [make('runeArm.stableCharge')]

    // -----------------------------------------------------------------------
    // Hireling stats — modeled separately from the player build.
    // -----------------------------------------------------------------------
    case 'HirelingAbilityBonus':
    case 'HirelingConcealment':
    case 'HirelingHitpoints':
    case 'HirelingFortification':
    case 'HirelingPRR':
    case 'HirelingMRR':
    case 'HirelingDodge':
    case 'HirelingMeleePower':
    case 'HirelingRangedPower':
    case 'HirelingSpellPower':
    case 'HirelingSaveBonus':
    case 'HirelingGrantFeat':
      return []

    // -----------------------------------------------------------------------
    // V2 weapon breakdowns — same gating as parseEffect: emit weapon.* stat
    // keys only when the inline buff's Item filter (or the buff name itself)
    // matches the equipped weapon / weapon class. ctx is optional so
    // consumers that don't pass it default to permissive emission.
    // -----------------------------------------------------------------------
    case 'Weapon_Attack':
      if (!weaponEffectMatches(items, ctx)) return []
      return [make('melee.toHit')]
    case 'Weapon_Damage':
      if (!weaponEffectMatches(items, ctx)) return []
      return [make('melee.damage')]
    case 'Weapon_AttackAndDamage':
      if (!weaponEffectMatches(items, ctx)) return []
      return [make('melee.toHit'), make('melee.damage')]
    case 'Weapon_OtherDamageBonus':
    case 'WeaponOtherDamageBonus':
    case 'WeaponOtherDamageBonusClass':
      if (!weaponEffectMatches(items, ctx)) return []
      return [make('weapon.otherDamage')]
    case 'Weapon_Alacrity':
    case 'WeaponAlacrityClass':
      if (!weaponEffectMatches(items, ctx)) return []
      return [make('weapon.alacrity')]
    case 'Weapon_BaseDamage':
      if (!weaponEffectMatches(items, ctx)) return []
      return [make('weapon.baseDamage')]
    case 'Weapon_CriticalMultiplier':
    case 'WeaponCriticalMultiplierClass':
      if (!weaponEffectMatches(items, ctx)) return []
      return [make('weapon.critMult')]
    case 'Weapon_CriticalMultiplier19To20':
      if (!weaponEffectMatches(items, ctx)) return []
      return [make('weapon.critMult19to20')]
    case 'Weapon_CriticalRange':
    case 'WeaponCriticalRangeClass':
      if (!weaponEffectMatches(items, ctx)) return []
      return [make('weapon.threatRange')]
    case 'Weapon_Enchantment':
    case 'Weapon_EnchantmentClass':
      if (!weaponEffectMatches(items, ctx)) return []
      return [make('weapon.enchantment')]
    case 'Weapon_Keen':
      if (!weaponEffectMatches(items, ctx)) return []
      return [make('weapon.keen')]
    case 'Weapon_VorpalRange':
      if (!weaponEffectMatches(items, ctx)) return []
      return [make('weapon.vorpal')]
    case 'Weapon_AttackCritical':
      if (!weaponEffectMatches(items, ctx)) return []
      return [make('weapon.toHitCrit')]
    case 'Weapon_DamageCritical':
      if (!weaponEffectMatches(items, ctx)) return []
      return [make('weapon.damageCrit')]
    case 'Weapon_AttackAndDamageCritical':
      if (!weaponEffectMatches(items, ctx)) return []
      return [make('weapon.toHitCrit'), make('weapon.damageCrit')]
    case 'WeaponOtherDamageBonusCritical':
    case 'WeaponOtherDamageBonusCriticalClass':
      if (!weaponEffectMatches(items, ctx)) return []
      return [make('weapon.otherDamageCrit')]
    case 'WeaponAttackBonusClass':
      if (!weaponEffectMatches(items, ctx)) return []
      return [make('melee.toHit')]
    case 'WeaponDamageBonusClass':
      if (!weaponEffectMatches(items, ctx)) return []
      return [make('melee.damage')]
    case 'Weapon_AttackAbility':
    case 'WeaponAttackAbilityClass':
      if (!weaponEffectMatches(items, ctx)) return []
      return items
        .filter(i => i !== 'All')
        .map(i => make(`weapon.attackAbility.${i}`))
    case 'Weapon_DamageAbility':
    case 'WeaponDamageAbilityClass':
    case 'WeaponDamageBonusStat':
      if (!weaponEffectMatches(items, ctx)) return []
      return items
        .filter(i => i !== 'All')
        .map(i => make(`weapon.damageAbility.${i}`))
    case 'WeaponDamageBonusCriticalStat':
      if (!weaponEffectMatches(items, ctx)) return []
      return items
        .filter(i => i !== 'All')
        .map(i => make(`weapon.damageAbilityCrit.${i}`))

    // V2 weapon class crit-only attack/damage variants.
    case 'WeaponAttackBonusCriticalClass':
      if (!weaponEffectMatches(items, ctx)) return []
      return [make('weapon.toHitCrit')]
    case 'WeaponDamageBonusCriticalClass':
      if (!weaponEffectMatches(items, ctx)) return []
      return [make('weapon.damageCrit')]

    // Damage-type variants — V2 gates on equipped-weapon damage types, which
    // v3 doesn't track per-weapon yet.
    case 'WeaponAttackBonusDamageType':
    case 'WeaponAttackBonusCriticalDamageType':
    case 'WeaponDamageBonusDamageType':
    case 'WeaponDamageBonusCriticalDamageType':
    case 'WeaponKeenDamageType':
      return []

    // -----------------------------------------------------------------------
    // Control-flow / UI-only
    // -----------------------------------------------------------------------
    case 'AddGroupWeapon':
    case 'MergeGroups':
    case 'ExclusionGroup':
    case 'ExcludeFeatSelection':
    case 'GrantFeat':
    case 'GrantSpell':
    case 'SpellListAddition':
    case 'SpellLikeAbility':
    case 'CreateSlider':
    case 'EnhancementTree':
    case 'DestinyTree':
    case 'ItemClickie':
    case 'SLACharge':
    case 'SpellPowerReplacement':
    case 'ImplementInYourHands':
    case 'Regeneration':
    case 'RustSusceptability':
    case 'NotModeled':
    case 'Unknown':
      return []

    // Unknown buff type
    default:
      return []
  }
}

// ---------------------------------------------------------------------------
// V2 buff-database lookup + UpdatedEffects resolution
// ---------------------------------------------------------------------------

/**
 * Builds a Type → Buff lookup map from the global ItemBuffs.xml database.
 * Pass the result of `api.itemBuffs()` directly.
 */
export function buildBuffIndex(buffs: Buff[]): Map<string, Buff> {
  const map = new Map<string, Buff>()
  for (const b of buffs) {
    if (b && typeof b.Type === 'string') map.set(b.Type, b)
  }
  return map
}

/**
 * Returns true for fast-xml-parser's representation of a self-closing flag
 * tag (e.g. `<NegativeValues />`), which becomes `""` in the parsed object.
 * Plain booleans are also accepted in case the data shape evolves.
 */
function flag(v: boolean | '' | undefined): boolean {
  return v === true || v === ''
}

/**
 * Returns a flat string array, treating fast-xml-parser's possible shapes
 * (single string, array of strings, or undefined) uniformly.
 */
function asStringList(v: string | string[] | undefined): string[] {
  if (!v) return []
  return Array.isArray(v) ? v : [v]
}

/**
 * Returns a shallow array of effects from a parsed Buff. fast-xml-parser may
 * deliver `Effect` as a single object or an array depending on count.
 */
function effectsOf(buff: Buff): Effect[] {
  const e = buff.Effect
  if (!e) return []
  return Array.isArray(e) ? e : [e]
}

/**
 * V2 `Buff::UpdatedEffects` port. Mutates a list of Effect copies to apply
 * the inline buff's overrides:
 *
 *   - `BonusType` overrides every effect's Bonus.
 *   - `Item` replaces every effect's Item list (single string).
 *   - `Item2` appends to every effect's Item list.
 *   - `Value1` alone → set as Amount on every effect.
 *   - `Value1` + `Value2` → odd-indexed effects get Value1, even get Value2.
 *   - `negativeValues` flips the sign of applied values.
 *   - `requirementsToUse` (from the database buff) becomes the gating
 *     Requirements on every effect.
 *
 * The inline ItemBuff fields take precedence; the database Buff's defaults
 * fill in any inline field that wasn't explicitly set.
 */
function applyBuffOverrides(
  effects: Effect[],
  inline: ItemBuff,
  dbBuff: Buff,
): Effect[] {
  const bonusType = inline.BonusType ?? dbBuff.BonusType
  const item = inline.Item ?? dbBuff.Item
  const item2 = inline.Item2 ?? dbBuff.Item2
  const value1 = inline.Value1 ?? dbBuff.Value1
  const value2 = inline.Value2 ?? dbBuff.Value2
  const negative = flag(dbBuff.NegativeValues)
  const requirementsToUse = dbBuff.RequirementsToUse

  // Each Effect from the DB is shared across all consumers — clone before
  // mutating so we don't poison the cached database.
  const out = effects.map(e => ({ ...e }))

  if (bonusType) {
    for (const e of out) e.Bonus = bonusType
  }
  if (item) {
    for (const e of out) e.Item = item
  }
  if (item2) {
    for (const e of out) {
      const existing = asStringList(e.Item as string | string[] | undefined)
      e.Item = [...existing, item2]
    }
  }

  if (value1 !== undefined && value2 !== undefined) {
    out.forEach((e, i) => {
      const v = i % 2 === 0 ? value1 : value2
      e.Amount = negative ? -v : v
    })
  } else if (value1 !== undefined) {
    for (const e of out) {
      e.Amount = negative ? -value1 : value1
    }
  }

  if (requirementsToUse) {
    for (const e of out) e.Requirements = requirementsToUse
  }

  return out
}

/**
 * Resolves an inline `<Buff>` (from an item, augment, set bonus, etc.)
 * against the global ItemBuffs database and returns ParsedBonus entries.
 *
 * V2 flow (Build::ApplyItem → Build::ApplyItemEffect):
 *   1. `FindBuff(ibit.Type())` — look up by name.
 *   2. Copy the database buff's Effect list.
 *   3. `ibit.UpdatedEffects(&effects, buff.HasNegativeValues())` —
 *      apply Value/BonusType/Item overrides from the inline buff.
 *   4. For each effect, notify the build via `parseEffect`.
 *
 * Falls back to the legacy hard-coded `parseItemBuff` mapping when:
 *   - The buff name isn't in the database (rare; a few inline-only types).
 *   - The database buff has no `Effect` entries (purely cosmetic / display).
 *   - No buff index was supplied (call sites that haven't been wired yet).
 */
export function resolveItemBuff(
  inline: ItemBuff,
  buffIndex: Map<string, Buff> | undefined,
  source: string,
  ctx?: EffectContext,
): ParsedBonus[] {
  if (!buffIndex) return parseItemBuff(inline, source, ctx)

  const dbBuff = buffIndex.get(inline.Type)
  if (!dbBuff) return parseItemBuff(inline, source, ctx)

  const baseEffects = effectsOf(dbBuff)
  if (baseEffects.length === 0) {
    // Database buff is display-text only (no Effects). Try the legacy
    // direct-Type fallback so the inline Type remains addressable.
    return parseItemBuff(inline, source, ctx)
  }

  const effects = applyBuffOverrides(baseEffects, inline, dbBuff)
  const out: ParsedBonus[] = []
  for (const eff of effects) {
    // Stack count of an inline buff is always 1; ATypes that read stacks
    // (e.g. Stacks, Simple) treat rank=1 the same as a singular application.
    out.push(...parseEffect(eff, 1, source, 0, 0, ctx))
  }
  return out
}
