import { useState, useCallback, useRef, createElement as h } from 'react'
import type { ReactElement, ChangeEvent } from 'react'
import type { CharacterBuild } from '../types/ddo'
import { useCharacter } from '../context/CharacterContext'
import { isCharacterDocument, flattenDocument } from '../lib/multiLife'
import { importV2Build } from '../lib/v2Import'
import { exportV2Build } from '../lib/v2Export'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
const STORAGE_KEY = 'ddo-builder-saves'

// ---------------------------------------------------------------------------
// Storage helpers
// ---------------------------------------------------------------------------
function readSaves(): CharacterBuild[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (Array.isArray(parsed)) return parsed as CharacterBuild[]
    return []
  } catch {
    return []
  }
}

function writeSaves(saves: CharacterBuild[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(saves))
  } catch {
    console.warn('usePersistence: could not write to localStorage')
  }
}

// ---------------------------------------------------------------------------
// usePersistence hook
// ---------------------------------------------------------------------------
export interface PersistenceAPI {
  saves: CharacterBuild[]
  saveCharacter: (build: CharacterBuild) => void
  loadCharacter: (id: string) => CharacterBuild | undefined
  deleteCharacter: (id: string) => void
  exportJSON: (build: CharacterBuild) => void
  importJSON: (file: File) => Promise<CharacterBuild>
}

export function usePersistence(): PersistenceAPI {
  const [saves, setSaves] = useState<CharacterBuild[]>(() => readSaves())

  /** Upsert build by id and flush to localStorage */
  const saveCharacter = useCallback((build: CharacterBuild) => {
    setSaves(prev => {
      const idx = prev.findIndex(b => b.id === build.id)
      const next = idx >= 0
        ? prev.map((b, i) => (i === idx ? build : b))
        : [...prev, build]
      writeSaves(next)
      return next
    })
  }, [])

  /** Return the build with the given id, or undefined */
  const loadCharacter = useCallback((id: string): CharacterBuild | undefined => {
    // Read fresh from storage so this works even without a re-render
    return readSaves().find(b => b.id === id)
  }, [])

  /** Remove a build from the saves list and from localStorage */
  const deleteCharacter = useCallback((id: string) => {
    setSaves(prev => {
      const next = prev.filter(b => b.id !== id)
      writeSaves(next)
      return next
    })
  }, [])

  /**
   * Trigger a browser download of the build as a JSON file.
   */
  const exportJSON = useCallback((build: CharacterBuild) => {
    try {
      const json = JSON.stringify(build, null, 2)
      const blob = new Blob([json], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${build.name.replace(/[^a-z0-9_\- ]/gi, '_')}.json`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    } catch (err) {
      console.error('usePersistence: exportJSON failed', err)
    }
  }, [])

  /**
   * Trigger a browser download of the build as a V2-compatible .DDOBuild XML
   * file so it can be re-opened in the V2 MFC application.
   */
  const exportDDOBuild = useCallback((build: CharacterBuild) => {
    try {
      const xml = exportV2Build(build)
      const blob = new Blob([xml], { type: 'application/xml' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${build.name.replace(/[^a-z0-9_\- ]/gi, '_')}.DDOBuild`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    } catch (err) {
      console.error('usePersistence: exportDDOBuild failed', err)
    }
  }, [])

  /**
   * Read a File object, parse JSON, and resolve to a CharacterBuild.
   * Rejects with a descriptive Error on parse failure or missing fields.
   */
  const importJSON = useCallback((file: File): Promise<CharacterBuild> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => {
        try {
          const text = reader.result as string
          // V2 .DDOBuild XML support — detect by file extension or root tag.
          const isXml = file.name.toLowerCase().endsWith('.ddobuild') ||
                        text.trim().startsWith('<')
          if (isXml) {
            const result = importV2Build(text)
            resolve(result.build)
            return
          }
          const parsed = JSON.parse(text)
          // V2-format Character document: unwrap to its first build.
          if (isCharacterDocument(parsed)) {
            const flat = flattenDocument(parsed)
            const first = flat.find(b => b.id === parsed.activeBuildId) ?? flat[0]
            if (!first) {
              reject(new Error('Character document contained no builds'))
              return
            }
            resolve(first)
            return
          }
          if (
            typeof parsed !== 'object' ||
            parsed === null ||
            typeof parsed.id !== 'string' ||
            typeof parsed.name !== 'string'
          ) {
            reject(new Error('Invalid build file: missing required id or name fields'))
            return
          }
          resolve(parsed as CharacterBuild)
        } catch {
          reject(new Error('Invalid build file: could not parse JSON or XML'))
        }
      }
      reader.onerror = () => reject(new Error('Could not read file'))
      reader.readAsText(file)
    })
  }, [])

  return { saves, saveCharacter, loadCharacter, deleteCharacter, exportJSON, importJSON }
}

// ---------------------------------------------------------------------------
// SaveLoadBar component
//
// Uses React.createElement (aliased as `h`) so this .ts file stays JSX-free
// while still rendering a real React component tree.
// ---------------------------------------------------------------------------

/** Props for SaveLoadBar */
export interface SaveLoadBarProps {
  /** Called when the user selects a saved build to load */
  onLoad: (build: CharacterBuild) => void
}

/**
 * A toolbar that lets the user save, load, export, and import characters.
 * Reads the current build from CharacterContext automatically.
 */
export function SaveLoadBar({ onLoad }: SaveLoadBarProps): ReactElement {
  const { build, dispatch } = useCharacter()
  const { saves, saveCharacter, deleteCharacter, exportJSON, importJSON } = usePersistence()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [importError, setImportError] = useState<string | null>(null)
  const [savedMsg, setSavedMsg] = useState(false)

  function handleNew() {
    if (window.confirm('Start a new build? Unsaved changes will be lost.')) {
      dispatch({ type: 'RESET' })
    }
  }

  function handleSave() {
    saveCharacter(build)
    setSavedMsg(true)
    setTimeout(() => setSavedMsg(false), 1500)
  }

  function handleLoadChange(e: ChangeEvent<HTMLSelectElement>) {
    const id = e.target.value
    if (!id) return
    // Find the build in current saves list directly
    const found = saves.find(b => b.id === id)
    if (found) {
      onLoad(found)
    }
    // Reset select back to placeholder
    e.target.value = ''
  }

  function handleImportClick() {
    setImportError(null)
    fileInputRef.current?.click()
  }

  function handleFileChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    // Reset the input so the same file can be re-selected
    e.target.value = ''
    importJSON(file)
      .then(imported => {
        saveCharacter(imported)
        onLoad(imported)
      })
      .catch((err: unknown) => {
        setImportError(err instanceof Error ? err.message : 'Import failed')
      })
  }

  // ---- render via createElement ----

  const newBtn = h(
    'button',
    { type: 'button', onClick: handleNew, title: 'Start a new build' },
    'New',
  )

  const saveBtn = h(
    'button',
    { type: 'button', onClick: handleSave, title: 'Save current character' },
    savedMsg ? '✓ Saved' : 'Save',
  )

  const loadSelect = h(
    'select',
    { defaultValue: '', onChange: handleLoadChange, title: 'Load a saved character' },
    h('option', { value: '', disabled: true }, saves.length === 0 ? 'No saves' : 'Load…'),
    ...saves.map(b =>
      h('option', { key: b.id, value: b.id }, b.name),
    ),
  )

  const exportBtn = h(
    'button',
    {
      type: 'button',
      onClick: () => exportJSON(build),
      title: 'Export current character as JSON',
    },
    'Export JSON',
  )

  const exportV2Btn = h(
    'button',
    {
      type: 'button',
      onClick: () => exportDDOBuild(build),
      title: 'Export current character as a V2-compatible .DDOBuild file',
    },
    'Export .DDOBuild',
  )

  const hiddenInput = h('input', {
    ref: fileInputRef,
    type: 'file',
    accept: '.json,application/json,.ddobuild,.DDOBuild,application/xml,text/xml',
    style: { display: 'none' },
    onChange: handleFileChange,
  })

  const importBtn = h(
    'button',
    { type: 'button', onClick: handleImportClick, title: 'Import a character from a V3 JSON file or a V2 .DDOBuild XML file' },
    'Import',
  )

  const errorSpan = importError
    ? h('span', { style: { color: 'var(--color-red)', fontSize: '11px' } }, importError)
    : null

  return h(
    'div',
    {
      style: {
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        flexWrap: 'wrap',
        padding: '6px 0',
      },
    },
    newBtn,
    saveBtn,
    loadSelect,
    exportBtn,
    exportV2Btn,
    hiddenInput,
    importBtn,
    errorSpan,
  )
}
