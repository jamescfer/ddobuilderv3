import React from 'react'
import styles from './Layout.module.css'

interface LayoutProps {
  children: React.ReactNode
}

export default function Layout({ children }: LayoutProps) {
  return (
    <div className={styles.root}>
      <header className={styles.header}>
        <span className={styles.logo}>DDO Builder</span>
        <span className={styles.subtitle}>Character Planner</span>
      </header>
      <main className={styles.main}>
        {children}
      </main>
    </div>
  )
}
