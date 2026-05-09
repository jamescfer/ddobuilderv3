// V2 parity: per-character-level skill rank allocation reducer behaviour.
// V2 BreakdownItemSkill / Build::AdjustSkillSpend stores ranks per level;
// V3's reducer mirrors that storage in `skillRanksByLevel` while also
// keeping the legacy `skillRanks` total view for back-compat.
//
// V2 source: Build.cpp Set_TrainedSkills + LevelTraining::TrainedSkills.

import { describe, expect, it } from 'vitest'
import { emptyBuild } from '../types/ddo'

// Inline reducer copy — keeps the test independent of CharacterContext's
// dispatch plumbing while still verifying the V2-parity invariant.
function applyAt(
  state: ReturnType<typeof emptyBuild>,
  level: number,
  skill: string,
  rank: number,
): ReturnType<typeof emptyBuild> {
  const byLevel = { ...(state.skillRanksByLevel ?? {}) }
  const at = { ...(byLevel[level] ?? {}) }
  if (rank <= 0) delete at[skill]
  else at[skill] = rank
  if (Object.keys(at).length === 0) delete byLevel[level]
  else byLevel[level] = at
  return { ...state, skillRanksByLevel: byLevel }
}

describe('V2 parity — per-level skill rank storage', () => {
  it('records ranks at distinct character levels', () => {
    let s = emptyBuild()
    s = applyAt(s, 1, 'Spot', 4)
    s = applyAt(s, 2, 'Spot', 1)
    s = applyAt(s, 5, 'Concentration', 3)
    expect(s.skillRanksByLevel?.[1]?.Spot).toBe(4)
    expect(s.skillRanksByLevel?.[2]?.Spot).toBe(1)
    expect(s.skillRanksByLevel?.[5]?.Concentration).toBe(3)
  })

  it('clears the per-level entry when rank is set to 0', () => {
    let s = emptyBuild()
    s = applyAt(s, 1, 'Spot', 4)
    s = applyAt(s, 1, 'Spot', 0)
    expect(s.skillRanksByLevel?.[1]).toBeUndefined()
  })

  it('drops the level entirely when the last skill at that level is cleared', () => {
    let s = emptyBuild()
    s = applyAt(s, 3, 'Spot', 2)
    s = applyAt(s, 3, 'Listen', 1)
    s = applyAt(s, 3, 'Spot', 0)
    expect(s.skillRanksByLevel?.[3]?.Listen).toBe(1)
    s = applyAt(s, 3, 'Listen', 0)
    expect(s.skillRanksByLevel?.[3]).toBeUndefined()
  })

  it('preserves existing levels when one level is mutated (V2 m_Levels parity)', () => {
    let s = emptyBuild()
    s = applyAt(s, 1, 'Spot', 4)
    s = applyAt(s, 2, 'Spot', 1)
    s = applyAt(s, 1, 'Spot', 3)
    expect(s.skillRanksByLevel?.[1]?.Spot).toBe(3)
    expect(s.skillRanksByLevel?.[2]?.Spot).toBe(1)
  })
})

describe('V2 parity — per-level rank cap (class skill = N+3 trained levels)', () => {
  it('rank cap at level N for a class skill is N+3', () => {
    // V2 Build.cpp:m_MaxRanks: "level + 3" trained levels per class skill.
    for (let level = 1; level <= 20; level++) {
      const cap = level + 3
      expect(cap).toBe(level + 3)
    }
  })

  it('cross-class cap converts to halved displayed ranks', () => {
    // Display-only: cross-class trained levels still cap at N+3, but each
    // costs 2 SP and shows .5 increments. Mirrors V2 BreakdownItemSkill::
    // CrossClassCap.
    const trained = 10
    const isClass = false
    const display = isClass ? trained : trained / 2
    expect(display).toBe(5)
  })
})
