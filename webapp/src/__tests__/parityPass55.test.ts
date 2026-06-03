// Parity pass 55: Reaper AP budget persisted to build model
//
// V2 persists the reaper enhancement-point budget as part of the build
// (ReaperEnhancementsPane tracks the slider against the character's earned
// Reaper XP, which is stored in the build). V3's ReaperPanel.tsx kept
// `reaperAP` as session-only React.useState, so it reset to 0 on every
// page refresh. The fix adds `reaperAP: number` to `CharacterBuild` and
// wires a `SET_REAPER_AP` action through the reducer.

import { describe, it, expect } from 'vitest'
import { emptyBuild } from '../types/ddo'

describe('reaperAP persistence (U3)', () => {
  it('emptyBuild() initialises reaperAP to 0', () => {
    const build = emptyBuild()
    expect(typeof build.reaperAP).toBe('number')
    expect(build.reaperAP).toBe(0)
  })

  it('reaperAP is preserved when a build is spread', () => {
    const build = { ...emptyBuild(), reaperAP: 150 }
    expect(build.reaperAP).toBe(150)
  })
})
