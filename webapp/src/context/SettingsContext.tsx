import React, { createContext, useContext, useEffect, useState } from 'react'
import { api } from '../api'

// V2 Settings menu parity (DDOBuilder.rc IDR_MAINFRAME "&Settings" popup +
// CDDOBuilderApp registry settings, DDOBuilder.cpp:169):
//  - "Show only Epic feats for Epic feat slots" (ID_EDIT_FEATS_EPICONLY)
//  - "Show Unavailable Feats" (ID_EDIT_FEATS_SHOWUNAVAILABLE)
//  - "Ignore Lists Active" (ID_EDIT_IGNORELIST_ACTIVE)
//  - "Auto Select Single Option Enhancements"
//    (ID_SETTINGS_AUTOSELECTSINGLEOPTIONENHANCEMENTS)
// "Lamannia Mode" (alternate data dir) and "Allow DPI Scaling" are V2
// desktop-only concerns — not applicable to the webapp.
//
// The ignore list itself is V2's IgnoredList.xml (served by
// /api/ignored-list) plus the user's own additions/removals, persisted in
// localStorage alongside the toggles (V2 writes the merged list back to the
// user-data-dir copy of the file).

export interface BuilderSettings {
  /** Epic feat slots list only Epic-group feats (Standard excluded). */
  showEpicOnly: boolean
  /** Selection lists include feats that fail their requirements. */
  showUnavailable: boolean
  /** Hide ignore-listed feats/items from selection lists. */
  ignoreListActive: boolean
  /** Buying an enhancement with exactly one selector option auto-picks it. */
  autoSelectSingleOption: boolean
  /** Auto-save the document shortly after every change (V2 backup model). */
  autoSave: boolean
  /** User additions to the ignore list. */
  ignoredAdded: string[]
  /** User removals from the default ignore list. */
  ignoredRemoved: string[]
}

const DEFAULTS: BuilderSettings = {
  showEpicOnly: false,
  showUnavailable: false,
  ignoreListActive: true,
  autoSelectSingleOption: false,
  autoSave: false,
  ignoredAdded: [],
  ignoredRemoved: [],
}

const SETTINGS_KEY = 'ddo-builder-settings'

function readSettings(): BuilderSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY)
    if (!raw) return DEFAULTS
    return { ...DEFAULTS, ...(JSON.parse(raw) as Partial<BuilderSettings>) }
  } catch {
    return DEFAULTS
  }
}

interface SettingsContextValue {
  settings: BuilderSettings
  update: (patch: Partial<BuilderSettings>) => void
  /** The effective ignore set: default IgnoredList.xml + added − removed. */
  ignoredSet: Set<string>
  /** V2 Build::IsInIgnoreList — true when `name` should be hidden. */
  isIgnored: (name: string) => boolean
  toggleIgnored: (name: string) => void
}

const SettingsContext = createContext<SettingsContextValue | null>(null)

export function SettingsProvider({ children }: { children: React.ReactNode }) {
  const [settings, setSettings] = useState<BuilderSettings>(() => readSettings())
  const [defaultIgnored, setDefaultIgnored] = useState<string[]>([])

  useEffect(() => {
    api.ignoredList().then(setDefaultIgnored).catch(() => setDefaultIgnored([]))
  }, [])

  function update(patch: Partial<BuilderSettings>) {
    setSettings(prev => {
      const next = { ...prev, ...patch }
      try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(next)) } catch { /* ignore */ }
      return next
    })
  }

  const ignoredSet = new Set([
    ...defaultIgnored.filter(n => !settings.ignoredRemoved.includes(n)),
    ...settings.ignoredAdded,
  ])

  function isIgnored(name: string): boolean {
    return settings.ignoreListActive && ignoredSet.has(name)
  }

  function toggleIgnored(name: string) {
    const inDefault = defaultIgnored.includes(name)
    if (ignoredSet.has(name)) {
      update(inDefault
        ? { ignoredRemoved: [...settings.ignoredRemoved, name] }
        : { ignoredAdded: settings.ignoredAdded.filter(n => n !== name) })
    } else {
      update(inDefault
        ? { ignoredRemoved: settings.ignoredRemoved.filter(n => n !== name) }
        : { ignoredAdded: [...settings.ignoredAdded, name] })
    }
  }

  return (
    <SettingsContext.Provider value={{ settings, update, ignoredSet, isIgnored, toggleIgnored }}>
      {children}
    </SettingsContext.Provider>
  )
}

export function useSettings() {
  const ctx = useContext(SettingsContext)
  if (!ctx) throw new Error('useSettings must be used inside SettingsProvider')
  return ctx
}
