/**
 * Per-level skill rank display helpers — V2 BreakdownItemSkill parity.
 *
 * Cross-class skills cost 2 SP per 0.5 rank. These functions translate
 * internal "trained levels" (always integers, 1 per SP spent) into the
 * displayed rank values shown in the per-level allocation grid.
 */

/** Display rank for a per-level cell: class → 1:1, cross-class → trained/2 */
export function perLevelRankDisplay(trainedLevels: number, isClass: boolean): number {
  return isClass ? trainedLevels : trainedLevels / 2
}

/**
 * Maximum *displayed* rank a skill may reach at a given character level.
 * Class skill: charLvl + 3 ranks. Cross-class: (charLvl + 3) / 2 ranks.
 */
export function perLevelRankCap(charLvl: number, isClass: boolean): number {
  return isClass ? charLvl + 3 : (charLvl + 3) / 2
}

/** Convert a user-entered displayed rank back to an internal trained level count. */
export function displayRankToTrained(displayRank: number, isClass: boolean): number {
  return isClass ? displayRank : Math.round(displayRank * 2)
}
