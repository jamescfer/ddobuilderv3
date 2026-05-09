// Breakdown helpers — V2 BreakdownItem family port (slice 3 of backend parity).
//
// Pure functions that capture the post-stacking cap / clamp / dependency
// logic V2 implements per-BreakdownItem subclass (BreakdownItemDodge,
// BreakdownItemAC, BreakdownItemMDB, BreakdownItemBAB, BreakdownItemPRR,
// BreakdownItemCasterLevel, etc.). Each helper consumes the already-resolved
// stat (total + bonus list from `bonus.ts`) and returns a CapApplied shape
// that the panel renders consistently.
//
// Cross-cutting: panels can hover the returned bonuses to see exactly which
// inputs participated and which caps activated.

import type { ResolvedBonus, ResolvedStat } from './bonus'

// ---------------------------------------------------------------------------
// Common shape
// ---------------------------------------------------------------------------

export interface CapApplied {
  /** Display value (post-cap) */
  total: number
  /** Pre-cap raw total — useful for "(capped from N)" tooltips */
  raw: number
  /** True iff a cap reduced the displayed value */
  capped: boolean
  /** Human-readable name of the cap that won, or null if no cap fired */
  capSource: string | null
  /** Raw bonus rows (input contributions) plus any cap-marker rows */
  bonuses: ResolvedBonus[]
}

// ---------------------------------------------------------------------------
// Mitigation math
// ---------------------------------------------------------------------------

/**
 * V2 PRR / MRR mitigation percent: 100 − 100/(100+value).
 * 100 PRR ≈ 50% reduction, 200 PRR ≈ 66.7%, etc.
 */
export function mitigationPercent(value: number): number {
  if (value === 0) return 0
  return 100 - (100 / (100 + value)) * 100
}

/**
 * V2 multiplicative absorption stacking — each absorption bonus multiplies
 * the *remainder* of damage that gets through. Returns the total percent
 * absorbed across all active bonuses.
 */
export function multiplicativeAbsorption(bonuses: ResolvedBonus[]): number {
  let factor = 1
  for (const b of bonuses) {
    if (!b.active) continue
    factor *= (100 - b.value) / 100
  }
  return 100 - factor * 100
}

// ---------------------------------------------------------------------------
// V2 BreakdownItemBAB: BAB capped at MAX_BAB (25).
// ---------------------------------------------------------------------------

export const MAX_BAB = 25

export function applyBabCap(bab: ResolvedStat): CapApplied {
  const raw = bab.total
  if (raw <= MAX_BAB) {
    return { total: raw, raw, capped: false, capSource: null, bonuses: bab.bonuses }
  }
  return {
    total: MAX_BAB,
    raw,
    capped: true,
    capSource: `BAB cap (${MAX_BAB})`,
    bonuses: [
      ...bab.bonuses,
      { value: -(raw - MAX_BAB), type: 'Cap', source: `Capped at ${MAX_BAB}`, active: true },
    ],
  }
}

// ---------------------------------------------------------------------------
// V2 BreakdownItemMDB: "Max Dex Bonus" total. Returns null when the build is
// in cloth armor without a tower shield (V2 marks this as "No limit").
// ---------------------------------------------------------------------------

/**
 * Returns the effective MDB cap value for AC dex contribution.
 *
 * @param mdb            Resolved 'mdb' stat (armor + effect contributions).
 * @param hasClothArmor  True when active armor stance is "Cloth Armor".
 * @param hasTowerShield True when a tower shield is equipped.
 *
 * Behaviour mirrors `BreakdownItemMDB::CreateOtherEffects`:
 *   cloth armor + no tower shield → no limit (return null).
 *   any other combination         → numeric cap from mdb.total.
 */
export function effectiveMDB(
  mdb: ResolvedStat,
  hasClothArmor: boolean,
  hasTowerShield: boolean,
): number | null {
  if (hasClothArmor && !hasTowerShield) return null
  return mdb.total
}

// ---------------------------------------------------------------------------
// V2 BreakdownItemDodge::CappedTotal — applies the three Dodge caps:
//   1. Basic Dodge Cap (`dodgeCap` stat; default 25).
//   2. Armor MDB (`mdb` stat) — only when not in cloth armor.
//   3. Tower Shield MDB (`mdb.tower` stat) — only when tower shield equipped.
// The displayed dodge is the *minimum* of dodge.total and any active cap.
// ---------------------------------------------------------------------------

export interface DodgeCapInputs {
  dodge: ResolvedStat
  dodgeCap: ResolvedStat                  // 'dodgeCap' stat key total → cap
  mdbArmor: number | null                 // result of effectiveMDB(mdb, …)
  mdbTowerShield: number | null           // result of effectiveMDB(mdb.tower, …)
  /** 25% default if no dodgeCap bonuses are present (V2 baseline). */
  baseDodgeCap?: number
}

export function applyDodgeCap(input: DodgeCapInputs): CapApplied {
  const { dodge, dodgeCap, mdbArmor, mdbTowerShield } = input
  const baseDodgeCap = input.baseDodgeCap ?? 25

  const raw = dodge.total
  // V2 dodge cap = baseDodgeCap (25) + sum of dodgeCap effect bonuses.
  // When the resolved dodgeCap stat is empty, fall back to the baseline.
  const effectiveDodgeCap =
    dodgeCap.bonuses.length > 0 ? baseDodgeCap + dodgeCap.total : baseDodgeCap

  let display = raw
  let capSource: string | null = null

  if (display > effectiveDodgeCap) {
    display = effectiveDodgeCap
    capSource = `Dodge Cap (${effectiveDodgeCap}%)`
  }
  if (mdbArmor != null && display > mdbArmor) {
    display = mdbArmor
    capSource = `Armor MDB (${mdbArmor})`
  }
  if (mdbTowerShield != null && display > mdbTowerShield) {
    display = mdbTowerShield
    capSource = `Tower Shield MDB (${mdbTowerShield})`
  }

  const capped = display < raw
  const bonuses: ResolvedBonus[] = [...dodge.bonuses]
  if (capped && capSource) {
    bonuses.push({ value: display - raw, type: 'Cap', source: `Capped: ${capSource}`, active: true })
  }

  return { total: display, raw, capped, capSource, bonuses }
}

// ---------------------------------------------------------------------------
// V2 BreakdownItemCasterLevel: a class's caster level is its class levels +
// class-specific CL bonuses + universal CL bonuses, capped at the higher of
// class-specific MaxCasterLevel and universal MaxCasterLevel (when present).
// ---------------------------------------------------------------------------

export interface CasterLevelInputs {
  className: string
  classLevels: number
  classCl: ResolvedStat        // resolved 'cl.<className>' stat
  allCl: ResolvedStat          // resolved 'cl.All' stat
  classMaxCl: ResolvedStat     // resolved 'maxCl.<className>'
  allMaxCl: ResolvedStat       // resolved 'maxCl.All'
}

export function applyCasterLevelCap(input: CasterLevelInputs): CapApplied {
  const { className, classLevels, classCl, allCl, classMaxCl, allMaxCl } = input
  const raw = classLevels + classCl.total + allCl.total

  // V2: when at least one MaxCasterLevel bonus exists, cap = max(class-specific, all)
  const hasCap = classMaxCl.bonuses.length > 0 || allMaxCl.bonuses.length > 0
  const cap = hasCap ? Math.max(classMaxCl.total, allMaxCl.total) : Number.POSITIVE_INFINITY

  const baseRow: ResolvedBonus = {
    value: classLevels,
    type: 'Base',
    source: `${className} class levels`,
    active: true,
  }
  const bonuses: ResolvedBonus[] = [baseRow, ...classCl.bonuses, ...allCl.bonuses]

  if (raw <= cap) {
    return { total: raw, raw, capped: false, capSource: null, bonuses }
  }
  bonuses.push({
    value: cap - raw,
    type: 'Cap',
    source: `MaxCasterLevel cap (${cap})`,
    active: true,
  })
  return {
    total: cap,
    raw,
    capped: true,
    capSource: `MaxCasterLevel (${cap})`,
    bonuses,
  }
}

// ---------------------------------------------------------------------------
// V2 BreakdownItemMRR: MRR clamped at MRRCap (when MRRCap > 0).
// ---------------------------------------------------------------------------

export function applyMRRCap(mrr: ResolvedStat, mrrCap: ResolvedStat): CapApplied {
  const raw = mrr.total
  const cap = mrrCap.total
  if (cap <= 0 || raw <= cap) {
    return { total: raw, raw, capped: false, capSource: null, bonuses: mrr.bonuses }
  }
  return {
    total: cap,
    raw,
    capped: true,
    capSource: `MRR Cap (${cap})`,
    bonuses: [
      ...mrr.bonuses,
      { value: cap - raw, type: 'Cap', source: `Capped at ${cap}`, active: true },
    ],
  }
}

// ---------------------------------------------------------------------------
// V2 tactical type list (TacticalTypes.h). Drives the Tactical DC section.
// ---------------------------------------------------------------------------

export const TACTICAL_TYPES: ReadonlyArray<{ key: string; label: string }> = [
  { key: 'Assassinate',     label: 'Assassinate' },
  { key: 'Trap',            label: 'Trap' },
  { key: 'Trip',            label: 'Trip' },
  { key: 'Stun',            label: 'Stun' },
  { key: 'Sunder',          label: 'Sunder' },
  { key: 'StunningShield',  label: 'Stunning Shield' },
  { key: 'General',         label: 'General' },
  { key: 'Wands',           label: 'Wands' },
  { key: 'Fear',            label: 'Fear' },
  { key: 'InnateAttack',    label: 'Innate Attack' },
  { key: 'BreathWeapon',    label: 'Breath Weapon' },
  { key: 'Poison',          label: 'Poison' },
  { key: 'RuneArm',         label: 'Rune Arm' },
]

// ---------------------------------------------------------------------------
// V2 turn-undead breakdown family. UI-side the relevant stat keys are
// emitted by parseEffect from the corresponding Effect.Type cases in slice 1.
// ---------------------------------------------------------------------------

export const TURN_UNDEAD_KEYS = [
  { key: 'turnUndead.bonus',      label: 'Turn Bonus' },
  { key: 'turnUndead.diceBonus',  label: 'Turn Dice Bonus' },
  { key: 'turnUndead.levelBonus', label: 'Turn Level Bonus' },
  { key: 'turnUndead.maxDice',    label: 'Turn Max Dice' },
  { key: 'turnUndead',            label: 'Extra Turns' },
] as const

// ---------------------------------------------------------------------------
// V2 healing amplification family. All three stack additively per-type per V2.
// ---------------------------------------------------------------------------

export const HEAL_AMP_KEYS = [
  { key: 'healAmp',     label: 'Positive Healing Amp' },
  { key: 'negHealAmp',  label: 'Negative Healing Amp' },
  { key: 'repairAmp',   label: 'Repair Amp' },
] as const

// ---------------------------------------------------------------------------
// V2 threat-bonus family.
// ---------------------------------------------------------------------------

export const THREAT_KEYS = [
  { key: 'threat.melee',  label: 'Melee Threat' },
  { key: 'threat.ranged', label: 'Ranged Threat' },
  { key: 'threat.spell',  label: 'Spell Threat' },
] as const

// ---------------------------------------------------------------------------
// V2 bypass family (DR / fortification / dodge / missile-deflection).
// ---------------------------------------------------------------------------

export const BYPASS_KEYS = [
  { key: 'fortBypass',                label: 'Fortification Bypass' },
  { key: 'dodgeBypass',               label: 'Dodge Bypass' },
  { key: 'missileDeflection',         label: 'Missile Deflection' },
  { key: 'missileDeflectionBypass',   label: 'Missile Deflection Bypass' },
] as const
