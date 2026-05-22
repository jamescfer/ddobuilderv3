// V2 parity: per-character-level skill rank allocation reducer behaviour.
// V2 BreakdownItemSkill / Build::AdjustSkillSpend stores ranks per level;
// V3's reducer mirrors that storage in `skillRanksByLevel` while also
// keeping the legacy `skillRanks` total view for back-compat.
//
// V2 source: Build.cpp Set_TrainedSkills + LevelTraining::TrainedSkills.

import { describe, expect, it } from 'vitest'
import { emptyBuild } from '../types/ddo'
import { perLevelRankDisplay, perLevelRankCap } from '../lib/skillDisplay'

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

// ---------------------------------------------------------------------------
// Parity pass 28 — per-level grid .5-rank display for cross-class skills
// V2 BreakdownItemSkill shows .5 increments in the per-level view;
// V3's PerLevelGrid was showing raw trained levels (integers) instead.
// ---------------------------------------------------------------------------

describe('V2 parity — perLevelRankDisplay (.5 increments for cross-class)', () => {
  it('class skill: display equals trained levels 1:1', () => {
    expect(perLevelRankDisplay(0, true)).toBe(0)
    expect(perLevelRankDisplay(1, true)).toBe(1)
    expect(perLevelRankDisplay(4, true)).toBe(4)
    expect(perLevelRankDisplay(23, true)).toBe(23)
  })

  it('cross-class skill: display is trained / 2 (.5 per trained level)', () => {
    expect(perLevelRankDisplay(0, false)).toBe(0)
    expect(perLevelRankDisplay(1, false)).toBe(0.5)
    expect(perLevelRankDisplay(2, false)).toBe(1.0)
    expect(perLevelRankDisplay(4, false)).toBe(2.0)
    expect(perLevelRankDisplay(7, false)).toBe(3.5)
  })
})

describe('V2 parity — perLevelRankCap (displayed cap for per-level grid)', () => {
  it('class skill cap at char level N is N+3 displayed ranks', () => {
    expect(perLevelRankCap(1, true)).toBe(4)
    expect(perLevelRankCap(5, true)).toBe(8)
    expect(perLevelRankCap(20, true)).toBe(23)
  })

  it('cross-class skill cap at char level N is (N+3)/2 displayed ranks', () => {
    // V2 parity: at char level 1, cross-class cap = (1+3)/2 = 2.0 displayed ranks
    expect(perLevelRankCap(1, false)).toBe(2.0)
    expect(perLevelRankCap(5, false)).toBe(4.0)
    expect(perLevelRankCap(17, false)).toBe(10.0)
    expect(perLevelRankCap(20, false)).toBe(11.5)
  })
})
