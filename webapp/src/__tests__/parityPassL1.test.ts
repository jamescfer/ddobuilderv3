// L1 regression: Build History Log (V2 LogPane parity).
// V2's LogPane displays a timestamped list of build actions during the session.
// V3 must have an equivalent log that records key build changes.
// Tests cover the pure actionToLogMessage helper.

import { describe, expect, it } from 'vitest'
import { actionToLogMessage } from '../lib/buildLog'

describe('actionToLogMessage', () => {
  it('logs name change', () => {
    const msg = actionToLogMessage({ type: 'SET_NAME', name: 'Aelindra' })
    expect(msg).toMatch(/name.*Aelindra/i)
  })

  it('logs race change', () => {
    const msg = actionToLogMessage({ type: 'SET_RACE', race: 'Elf' })
    expect(msg).toMatch(/race.*Elf/i)
  })

  it('logs class change', () => {
    const msg = actionToLogMessage({ type: 'SET_CLASS', index: 0, name: 'Wizard' })
    expect(msg).toMatch(/class.*Wizard/i)
  })

  it('logs feat training', () => {
    const msg = actionToLogMessage({ type: 'SET_FEAT', slotKey: 'L1-General', featName: 'Toughness' })
    expect(msg).toMatch(/feat.*Toughness/i)
  })

  it('logs ability score change', () => {
    const msg = actionToLogMessage({ type: 'SET_ABILITY', ability: 'Strength', score: 16 })
    expect(msg).toMatch(/strength/i)
    expect(msg).toMatch(/16/)
  })

  it('logs ability level-up', () => {
    const msg = actionToLogMessage({ type: 'SET_ABILITY_LEVELUP', level: 4, ability: 'Charisma' })
    expect(msg).toMatch(/charisma/i)
    expect(msg).toMatch(/level.*4|4.*level/i)
  })

  it('logs gear equipped', () => {
    const msg = actionToLogMessage({ type: 'SET_GEAR', slot: 'Helmet', itemName: 'Epic Hat of Diversion' })
    expect(msg).toMatch(/helmet/i)
    expect(msg).toMatch(/Epic Hat of Diversion/)
  })

  it('logs gear cleared', () => {
    const msg = actionToLogMessage({ type: 'CLEAR_GEAR', slot: 'Ring 1' })
    expect(msg).toMatch(/ring 1/i)
  })

  it('logs enhancement spend', () => {
    const msg = actionToLogMessage({
      type: 'SET_DESTINY_CHOICE',
      treeName: 'Exalted Angel',
      itemName: 'Soul Purge',
      rank: 1,
    })
    expect(msg).toMatch(/Exalted Angel|Soul Purge/)
  })

  it('logs enhancement tree reset', () => {
    const msg = actionToLogMessage({ type: 'RESET_ENH_TREE', treeName: 'Harper Agent' })
    expect(msg).toMatch(/harper agent/i)
    expect(msg).toMatch(/reset/i)
  })

  it('logs past life change', () => {
    const msg = actionToLogMessage({ type: 'SET_PAST_LIFE', source: 'Fighter', count: 3 })
    expect(msg).toMatch(/fighter/i)
    expect(msg).toMatch(/3/)
  })

  it('logs build load', () => {
    const msg = actionToLogMessage({ type: 'LOAD_BUILD', build: { name: 'MyBuild' } as never })
    expect(msg).toMatch(/loaded|MyBuild/i)
  })

  it('logs build reset', () => {
    const msg = actionToLogMessage({ type: 'RESET' })
    expect(msg).toMatch(/reset|new build/i)
  })

  it('returns null for noisy / high-frequency actions', () => {
    // SET_NOTES is too chatty (every keystroke), so should return null
    expect(actionToLogMessage({ type: 'SET_NOTES', notes: 'abc' })).toBeNull()
    // Buff toggles should return null (already shown in stances panel)
    expect(actionToLogMessage({ type: 'TOGGLE_BUFF', buffName: 'Rage' })).toBeNull()
  })
})
