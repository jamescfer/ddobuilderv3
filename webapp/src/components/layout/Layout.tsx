import React from 'react'
import styles from './Layout.module.css'

interface LayoutProps {
  children: React.ReactNode
  headerExtra?: React.ReactNode
}

export default function Layout({ children, headerExtra }: LayoutProps) {
  return (
    <div className={styles.root}>
      <header className={styles.header}>
        <span className={styles.logo}>DDO Builder</span>
        <span className={styles.subtitle}>Character Planner</span>
        {headerExtra && <div className={styles.headerExtra}>{headerExtra}</div>}
      </header>
      <main className={styles.main}>
        {children}
      </main>
    </div>
  )
}
