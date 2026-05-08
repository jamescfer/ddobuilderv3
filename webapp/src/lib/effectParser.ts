// DDO Effect / ItemBuff → RawBonus converter
//
// Converts parsed XML Effect objects and ItemBuff objects into ParsedBonus
// entries for specific stat keys. Stat keys are flat dot-separated strings
// (e.g. "ability.Strength", "save.Fort", "skill.Heal", "sp.Fire", …).

import type { Effect, ItemBuff } from '../types/ddo'

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

function resolveValue(
  effect: Effect,
  rank: number,
  classLevels: number,
  treeTotalAP: number,
): number | null {
  const atype = effect.AType ?? 'Stacks'

  switch (atype) {
    case 'SpellInfo':
    case 'NotNeeded':
    case 'UserList':
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
): ParsedBonus[] {
  // Skip stance-gated effects
  if (hasStanceRequirement(effect)) return []

  const value = resolveValue(effect, rank, classLevels, treeTotalAP)
  if (value === null) return []

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

    case 'Weapon_Attack':
      return [make('melee.toHit')]

    case 'Weapon_Damage':
      return [make('melee.damage')]

    case 'Weapon_AttackAndDamage':
      return [make('melee.toHit'), make('melee.damage')]

    case 'Weapon_OtherDamageBonus':
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
export function parseItemBuff(buff: ItemBuff, source: string): ParsedBonus[] {
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
      return [make('speed')]

    // Unknown buff type
    default:
      return []
  }
}
