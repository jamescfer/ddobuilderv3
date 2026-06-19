import React, { useEffect, useState, useCallback } from 'react'
import styles from './Sidebar.module.css'
import { useCharacter } from '../../context/CharacterContext'
import { api } from '../../api'

export type NavItem =
  | 'Main'
  | 'Builder'
  | 'Ability Ups'
  | 'Skills'
  | 'Level Training'
  | 'Feats'
  | 'Automatic Feats'
  | 'Spells'
  | 'DCs'
  | 'Enhancements'
  | 'Epic Destinies'
  | 'Reaper'
  | 'Gear'
  | 'Filigrees'
  | 'Set Bonuses'
  | 'Clickies'
  | 'Combat'
  | 'Breakdowns'
  | 'Bonuses'
  | 'Stances'
  | 'Compare'
  | 'Past Lives'
  | 'Tomes'
  | 'Favor'
  | 'Self Buffs'
  | 'Guild Buffs'
  | 'Notes'
  | 'Forum Export'
  | 'Settings'
  | 'Content'
  | 'Help'
  | 'Build Log'

interface NavGroup {
  label: string
  items: NavItem[]
}

const NAV_GROUPS: NavGroup[] = [
  { label: 'Character', items: ['Main', 'Builder', 'Ability Ups', 'Skills', 'Level Training'] },
  { label: 'Combat', items: ['Feats', 'Automatic Feats', 'Spells', 'DCs'] },
  { label: 'Progression', items: ['Enhancements', 'Epic Destinies', 'Reaper'] },
  { label: 'Equipment', items: ['Gear', 'Filigrees', 'Set Bonuses', 'Clickies'] },
  { label: 'Analysis', items: ['Breakdowns', 'Combat', 'Bonuses', 'Stances', 'Compare'] },
  { label: 'History', items: ['Past Lives', 'Tomes', 'Favor'] },
  { label: 'Buffs & Misc', items: ['Self Buffs', 'Guild Buffs', 'Notes', 'Forum Export', 'Content', 'Settings', 'Help', 'Build Log'] },
]

// ---------------------------------------------------------------------------
// Update button
// ---------------------------------------------------------------------------

interface UpdateInfo {
  upToDate: boolean
  commits: string[]
  error?: string
}

function UpdateButton() {
  const [status, setStatus] = useState<'idle' | 'checking' | 'behind' | 'upToDate' | 'updating' | 'error'>('idle')
  const [info, setInfo] = useState<UpdateInfo | null>(null)
  const [expanded, setExpanded] = useState(false)

  const checkUpdate = useCallback(async () => {
    setStatus('checking')
    setExpanded(false)
    try {
      const res = await fetch('/api/update/check')
      const data: UpdateInfo = await res.json()
      setInfo(data)
      setStatus(data.upToDate ? 'upToDate' : 'behind')
      if (!data.upToDate) setExpanded(true)
    } catch {
      setStatus('error')
      setInfo({ upToDate: false, commits: [], error: 'Network error' })
    }
  }, [])

  const applyUpdate = useCallback(async () => {
    setStatus('updating')
    setExpanded(false)
    try {
      await fetch('/api/update/apply', { method: 'POST' })
      // Poll /api/health until server comes back up
      const poll = setInterval(async () => {
        try {
          const r = await fetch('/api/health')
          if (r.ok) { clearInterval(poll); window.location.reload() }
        } catch { /* still restarting */ }
      }, 2000)
    } catch {
      setStatus('error')
    }
  }, [])

  return (
    <div className={styles.updateSection}>
      <button
        className={styles.updateBtn}
        onClick={status === 'idle' || status === 'upToDate' || status === 'error' ? checkUpdate : undefined}
        disabled={status === 'checking' || status === 'updating'}
      >
        {status === 'checking' && '⟳ Checking…'}
        {status === 'updating' && '⟳ Updating…'}
        {status === 'idle' && '↑ Check for Update'}
        {status === 'upToDate' && '✓ Up to date'}
        {status === 'behind' && `↑ ${info?.commits.length} new commit${info?.commits.length !== 1 ? 's' : ''}`}
        {status === 'error' && '⚠ Check failed'}
      </button>

      {expanded && info && !info.upToDate && (
        <div className={styles.updatePanel}>
          <div className={styles.updateCommits}>
            {info.commits.map((c, i) => (
              <div key={i} className={styles.updateCommit}>{c}</div>
            ))}
          </div>
          <button className={styles.updateNowBtn} onClick={applyUpdate}>
            Update now
          </button>
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Sidebar
// ---------------------------------------------------------------------------

interface SidebarProps {
  activeItem: NavItem
  onNavigate: (item: NavItem) => void
  isOpen: boolean
  onClose: () => void
  saveBar: React.ReactNode
}

export default function Sidebar({ activeItem, onNavigate, isOpen, onClose, saveBar }: SidebarProps) {
  const { build } = useCharacter()
  const [version, setVersion] = useState<string>(
    typeof __BUILDER_VERSION__ !== 'undefined' ? __BUILDER_VERSION__ : ''
  )

  useEffect(() => {
    let cancelled = false
    api.version()
      .then(v => {
        // Only adopt a real version from the server; never let a missing/
        // 'unknown' response clobber the build-time version baked in by Vite.
        if (!cancelled && v?.version && v.version !== 'unknown') {
          setVersion(v.version)
        }
      })
      .catch(() => { /* keep build-time version */ })
    return () => { cancelled = true }
  }, [])

  return (
    <>
      {isOpen && (
        <div className={styles.overlay} onClick={onClose} aria-hidden="true" />
      )}

      <aside className={`${styles.sidebar} ${isOpen ? styles.sidebarOpen : ''}`}>
        {/* Logo */}
        <div className={styles.logoSection}>
          <div className={styles.logoRow}>
            <span className={styles.logoText}>DDO Builder</span>
            <span className={styles.vBadge}>v3</span>
          </div>
          {version && (
            <div className={styles.versionLine} title="Builder version">v{version}</div>
          )}
          {build.name && (
            <div className={styles.charName}>{build.name}</div>
          )}
        </div>

        {/* Save/load bar */}
        <div className={styles.saveBarWrapper}>
          {saveBar}
        </div>

        {/* Navigation */}
        <nav className={styles.nav}>
          {NAV_GROUPS.map(group => (
            <div key={group.label} className={styles.navGroup}>
              <div className={styles.groupHeader}>{group.label}</div>
              {group.items.map(item => (
                <button
                  key={item}
                  className={`${styles.navItem} ${activeItem === item ? styles.navItemActive : ''}`}
                  onClick={() => { onNavigate(item); onClose() }}
                >
                  {item}
                </button>
              ))}
            </div>
          ))}
        </nav>

        {/* Update button */}
        <UpdateButton />
      </aside>
    </>
  )
}
