import React from 'react'
import styles from './ComingSoon.module.css'

interface ComingSoonProps {
  label: string
}

export default function ComingSoon({ label }: ComingSoonProps) {
  return (
    <div className={styles.wrapper}>
      <div className={styles.card}>
        <div className={styles.icon}>⚒</div>
        <h2 className={styles.title}>{label}</h2>
        <p className={styles.message}>This section is coming soon.</p>
      </div>
    </div>
  )
}
