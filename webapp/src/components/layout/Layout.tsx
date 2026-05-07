import React, { useState } from 'react'
import Sidebar, { type NavItem } from './Sidebar'
import styles from './Layout.module.css'

interface LayoutProps {
  children: React.ReactNode
  activeItem: NavItem
  onNavigate: (item: NavItem) => void
  saveBar: React.ReactNode
}

export default function Layout({ children, activeItem, onNavigate, saveBar }: LayoutProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false)

  return (
    <div className={styles.root}>
      {/* Mobile hamburger */}
      <button
        className={styles.hamburger}
        onClick={() => setSidebarOpen(prev => !prev)}
        aria-label="Toggle navigation"
      >
        <span className={styles.hamburgerLine} />
        <span className={styles.hamburgerLine} />
        <span className={styles.hamburgerLine} />
      </button>

      <Sidebar
        activeItem={activeItem}
        onNavigate={onNavigate}
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        saveBar={saveBar}
      />

      <main className={styles.content}>
        {children}
      </main>
    </div>
  )
}
