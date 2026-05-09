// V3 V2-parity DPS calculator.
//
// Mirrors the field gathering of V2 DDOBuilder/AttackEntry.cpp:44-81 and the
// per-swing damage formulas of Attack.cpp / AttackChain.cpp.
//
// The function is pure (consumes a stats map + weapon info) so it can be unit
// tested independently of React.

import type { BuildStats, WeaponInfo } from '../../hooks/useBuildStats'

export interface AttackEntryOptions {
  offhand?: WeaponInfo | null
  helpless?: boolean
  /** Foe AC. Used to estimate hit chance. */
  foeAC: number
  /** Foe PRR (percentage damage reduction). */
  foePRR?: number
  /** Foe fortification (0-100). Reduces crit damage proportionally. */
  foeFortification?: number
  /** Optional override of attack-chain length per round. Defaults to 5. */
  attacksPerRound?: number
  /** True if both hands are filled and TWF feats grant offhand attacks. */
  twoWeaponFightingTier?: 0 | 1 | 2 | 3 | 4
  /** True for two-handed weapons (THF / Strikethrough). */
  twoHanded?: boolean
}

export interface AttackEntryResult {
  /** Per-round average main-hand damage (before fortification mitigation). */
  mainDPR: number
  /** Per-round average off-hand damage. */
  offhandDPR: number
  /** Per-round expected total damage incl. fortification mitigation. */
  totalDPR: number
  /** DPS (per second) assuming 1.5 attacks/sec baseline (V2 typical). */
  dps: number
  /** Probability that a single attack lands a hit. */
  hitChance: number
  /** Probability that a single attack confirms a critical hit. */
  critChance: number
  /** Average non-crit damage for a single hit. */
  hitDamage: number
  /** Average critical-hit damage for a single confirmed crit. */
  critDamage: number
}

const TWF_OFFHAND_CHANCE = [0, 0.20, 0.40, 0.60, 0.80, 1.00] // tier 0..4 (Perfect = 100%)

function avgDie(diceNum: number, diceSides: number): number {
  return diceNum * (diceSides + 1) / 2
}

function modifier(score: number): number {
  return Math.floor((score - 10) / 2)
}

/**
 * Estimates the chance to hit a foe with the given AC, given attack bonus.
 * V2 simulates a d20 roll; minimum hit on natural 2 (auto miss on 1).
 * Returns a value in [0.05, 0.95].
 */
function hitChanceVsAC(attackBonus: number, foeAC: number): number {
  const minRoll = Math.max(2, Math.min(20, foeAC - attackBonus))
  // Faces 2..20 inclusive → 19 faces on a d20 are valid (face 1 always misses)
  const validRolls = 21 - minRoll
  const chance = Math.max(0.05, Math.min(0.95, validRolls / 20))
  return chance
}

/** PRR-style damage mitigation: actualDmg = base * 100 / (100 + PRR). */
function applyPRR(damage: number, foePRR: number): number {
  if (foePRR <= 0) return damage
  return damage * (100 / (100 + foePRR))
}

/**
 * Computes a single attack-entry result. Reads bonus stats by key from
 * `stats.total(...)` so that any V2-parity bonus chain plugs straight in.
 */
export function buildAttackEntry(
  stats: BuildStats,
  weapon: WeaponInfo,
  abilityScore: number,
  bab: number,
  opts: AttackEntryOptions,
): AttackEntryResult {
  const meleePower = stats.total('melee.power')
  const meleePowerMult = 1 + meleePower / 100
  const doublestrike = stats.total('melee.doublestrike') / 100
  const damageAbilMult = stats.total('melee.damageAbilityMult') || 1
  const helplessDmg = stats.total('helpless') / 100
  const strikethrough = stats.total('melee.strikethrough') / 100
  const offhandAttackBonus = stats.total('offhand.attack') / 100
  const offhandDoublestrike = stats.total('offhand.doublestrike') / 100
  const meleeToHit = stats.total('melee.toHit') + stats.total('melee.attack')
  const meleeDamage = stats.total('melee.damage')
  const baseCrit = stats.total('melee.crit.range') // additional threat faces from feats
  const baseCritMult = stats.total('melee.crit.multiplier')
  const sneakDice = stats.total('melee.sneakDice') + stats.total('melee.sneakAttack')

  const abilityMod = modifier(abilityScore)
  const weaponDie = avgDie(weapon.diceNum, weapon.diceSides)
  const baseDamage = weaponDie + meleeDamage + abilityMod * damageAbilMult
  const sneakBonus = sneakDice * 3.5 // 1d6 = 3.5
  const hitDmgRaw = (baseDamage + sneakBonus) * meleePowerMult

  const attackBonus = bab + meleeToHit + abilityMod
  const hitC = hitChanceVsAC(attackBonus, opts.foeAC)

  // Crit math: threat range = (21 - critThreatRange) .. 20
  const threatFaces = Math.max(1, weapon.critThreatRange + baseCrit)
  const critC = (threatFaces / 20) * hitC
  const critMult = weapon.critMultiplier + baseCritMult
  // Crit damage = base damage scaled by multiplier (sneak NOT multiplied in DDO)
  const critDmgRaw = baseDamage * critMult + sneakBonus
  const critDmgScaled = critDmgRaw * meleePowerMult

  // Per-attack expected damage = nonCritHits * hitDmg + crits * critDmg
  // Decompose: hit-with-crit-confirm = critC, hit-without-crit = hitC - critC
  const expectedRaw = (hitC - critC) * hitDmgRaw + critC * critDmgScaled
  // Doublestrike adds another swing of equal expected value
  const withDoublestrike = expectedRaw * (1 + doublestrike)
  // Strikethrough effectively scales DPS up against multi-target (THF only)
  const withStrike = opts.twoHanded ? withDoublestrike * (1 + strikethrough) : withDoublestrike
  // Helpless scales total damage
  const helplessFactor = opts.helpless ? 1 + helplessDmg : 1
  const mainDPR = withStrike * helplessFactor

  // Off-hand
  let offhandDPR = 0
  if (opts.offhand) {
    const offhandTier = opts.twoWeaponFightingTier ?? 0
    const offhandChance =
      Math.min(1, TWF_OFFHAND_CHANCE[offhandTier] + offhandAttackBonus + offhandDoublestrike)
    const ohDie = avgDie(opts.offhand.diceNum, opts.offhand.diceSides)
    const ohRaw = (ohDie + meleeDamage + abilityMod * (damageAbilMult / 2) + sneakBonus) * meleePowerMult
    offhandDPR = ohRaw * hitC * offhandChance * helplessFactor
  }

  const fortMitigation = 1 - (opts.foeFortification ?? 0) / 100
  // Fortification only affects crit portion of damage; approximate by halving
  // the crit contribution proportional to fortification.
  const totalDPR = applyPRR(
    mainDPR * (1 - critC) + (mainDPR * critC) * fortMitigation + offhandDPR,
    opts.foePRR ?? 0,
  )

  const attacksPerRound = opts.attacksPerRound ?? 5
  // Heuristic: 1.5 attacks/sec baseline (V2 displays per-attack & per-second)
  const dps = totalDPR * (attacksPerRound / 6) * 1.0 // 6-second round → DPS = DPR / 6 * APR

  return {
    mainDPR,
    offhandDPR,
    totalDPR,
    dps,
    hitChance: hitC,
    critChance: critC,
    hitDamage: hitDmgRaw,
    critDamage: critDmgScaled,
  }
}
