import { describe, expect, it } from 'vitest'
import { wrapLegacy, flattenDocument, isCharacterDocument, promoteBuildToLife } from '../lib/multiLife'
import { emptyBuild } from '../types/ddo'

describe('multiLife envelope', () => {
  it('wraps a flat build list into a Character with one Life', () => {
    const a = { ...emptyBuild(), name: 'A' }
    const b = { ...emptyBuild(), name: 'B' }
    const doc = wrapLegacy([a, b], 'My Character')
    expect(doc.name).toBe('My Character')
    expect(doc.lives).toHaveLength(1)
    expect(doc.lives[0].builds).toHaveLength(2)
    expect(doc._v).toBe(2)
  })

  it('flattens a document back to a flat list', () => {
    const a = { ...emptyBuild(), name: 'A' }
    const b = { ...emptyBuild(), name: 'B' }
    const doc = wrapLegacy([a, b])
    expect(flattenDocument(doc).map(x => x.name)).toEqual(['A', 'B'])
  })

  it('isCharacterDocument detects the envelope', () => {
    const a = { ...emptyBuild(), name: 'A' }
    expect(isCharacterDocument(a)).toBe(false)
    expect(isCharacterDocument(wrapLegacy([a]))).toBe(true)
  })

  it('promoteBuildToLife clones build with a fresh id', () => {
    const src = { ...emptyBuild(), name: 'Hero', race: 'Dwarf' }
    const life = promoteBuildToLife(src)
    expect(life.race).toBe('Dwarf')
    expect(life.builds).toHaveLength(1)
    expect(life.builds[0].id).not.toBe(src.id)
  })
})
