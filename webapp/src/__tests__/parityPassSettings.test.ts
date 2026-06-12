// V2 Settings menu parity (DDOBuilder.rc "&Settings" popup): the data side —
// IgnoredList.xml loading (CDDOBuilderApp::IgnoreList, DDOBuilder.cpp:1481).
// The four toggles themselves are UI state (SettingsContext) exercised via
// FeatSlots/TreeGrid wiring.

import { describe, expect, it } from 'vitest'
import { existsSync } from 'fs'
import { join } from 'path'
import { loadIgnoredList } from '../server/dataLoaders'

const DATA_DIR = join(__dirname, '..', '..', '..', 'Output', 'DataFiles')

describe('loadIgnoredList (V2 IgnoredList.xml)', () => {
  it.skipIf(!existsSync(DATA_DIR))('loads the default ignored names', () => {
    const list = loadIgnoredList(DATA_DIR)
    expect(list.length).toBeGreaterThan(10)
    expect(list).toContain('Skill Focus: Balance')
    // V2's file starts with the " No Selection" placeholder entry.
    expect(list.some(n => n.trim() === 'No Selection')).toBe(true)
  })

  it('returns [] for a missing file', () => {
    expect(loadIgnoredList('/nonexistent')).toEqual([])
  })
})
