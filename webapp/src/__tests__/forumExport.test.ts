import { describe, expect, it } from 'vitest'
import { emitForumExport, DEFAULT_SECTIONS } from '../lib/export/sections'
import { emptyBuild } from '../types/ddo'

describe('emitForumExport', () => {
  it('wraps output in BBCode courier font tags (V2 ForumExportDlg.cpp:195)', () => {
    const text = emitForumExport({ build: emptyBuild(), stats: null })
    expect(text.startsWith('[font=courier]')).toBe(true)
    expect(text.endsWith('[/font]')).toBe(true)
  })

  it('includes character header by default', () => {
    const build = { ...emptyBuild(), name: 'Test Hero', race: 'Dwarf' }
    const text = emitForumExport({ build, stats: null })
    expect(text).toMatch(/Character Name.*Test Hero/)
    expect(text).toMatch(/Race.*Dwarf/)
  })

  it('lists past lives when present', () => {
    const build = { ...emptyBuild(), pastLives: { Fighter: 3, Wizard: 1 } }
    const text = emitForumExport({ build, stats: null })
    expect(text).toMatch(/Past Lives/)
    expect(text).toMatch(/Fighter x3/)
  })

  it('omits empty sections', () => {
    const build = emptyBuild()
    const text = emitForumExport({ build, stats: null })
    // Default empty build has no past lives, no notes, no spells
    expect(text).not.toMatch(/\[b\]Past Lives\[\/b\]/)
    expect(text).not.toMatch(/\[b\]Notes\[\/b\]/)
  })

  it('user can disable a section by filtering DEFAULT_SECTIONS', () => {
    const build = { ...emptyBuild(), name: 'Hero', notes: 'My build' }
    const noNotes = DEFAULT_SECTIONS.filter(s => s.id !== 'Notes')
    const text = emitForumExport({ build, stats: null }, noNotes)
    expect(text).not.toMatch(/My build/)
  })

  it('includes trained spells when populated', () => {
    const build = {
      ...emptyBuild(),
      trainedSpells: { Wizard: { 3: ['Fireball'] } },
    }
    const text = emitForumExport({ build, stats: null })
    expect(text).toMatch(/Spells/)
    expect(text).toMatch(/Fireball/)
  })
})
