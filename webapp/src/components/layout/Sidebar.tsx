import React from 'react'
import styles from './Sidebar.module.css'
import { useCharacter } from '../../context/CharacterContext'

export type NavItem =
  | 'Builder'
  | 'Ability Ups'
  | 'Skills'
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
  | 'Breakdowns'
  | 'Bonuses'
  | 'Stances'
  | 'Past Lives'
  | 'Tomes'
  | 'Favor'
  | 'Self Buffs'
  | 'Guild Buffs'
  | 'Notes'
  | 'Forum Export'

interface NavGroup {
  label: string
  items: NavItem[]
}

const NAV_GROUPS: NavGroup[] = [
  {
    label: 'Character',
    items: ['Builder', 'Ability Ups', 'Skills'],
  },
  {
    label: 'Combat',
    items: ['Feats', 'Automatic Feats', 'Spells', 'DCs'],
  },
  {
    label: 'Progression',
    items: ['Enhancements', 'Epic Destinies', 'Reaper'],
  },
  {
    label: 'Equipment',
    items: ['Gear', 'Filigrees', 'Set Bonuses'],
  },
  {
    label: 'Analysis',
    items: ['Breakdowns', 'Bonuses', 'Stances'],
  },
  {
    label: 'History',
    items: ['Past Lives', 'Tomes', 'Favor'],
  },
  {
    label: 'Buffs & Misc',
    items: ['Self Buffs', 'Guild Buffs', 'Notes', 'Forum Export'],
  },
]

interface SidebarProps {
  activeItem: NavItem
  onNavigate: (item: NavItem) => void
  isOpen: boolean
  onClose: () => void
  saveBar: React.ReactNode
}

export default function Sidebar({ activeItem, onNavigate, isOpen, onClose, saveBar }: SidebarProps) {
  const { build } = useCharacter()

  return (
    <>
      {/* Mobile overlay */}
      {isOpen && (
        <div className={styles.overlay} onClick={onClose} aria-hidden="true" />
      )}

      <aside className={`${styles.sidebar} ${isOpen ? styles.sidebarOpen : ''}`}>
        {/* Logo section */}
        <div className={styles.logoSection}>
          <div className={styles.logoRow}>
            <span className={styles.logoText}>DDO Builder</span>
            <span className={styles.vBadge}>v3</span>
          </div>
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
                  onClick={() => {
                    onNavigate(item)
                    onClose()
                  }}
                >
                  {item}
                </button>
              ))}
            </div>
          ))}
        </nav>
      </aside>
    </>
  )
}
