import { useState, useEffect } from 'react'
import { api } from '../../api'
import type { GuildBuff } from '../../types/ddo'
import styles from './GuildBuffsPanel.module.css'

export default function GuildBuffsPanel() {
  const [guildLevel, setGuildLevel] = useState(0)
  const [buffs, setBuffs] = useState<GuildBuff[]>([])

  useEffect(() => {
    api.guildbuffs().then(setBuffs).catch(() => setBuffs([]))
  }, [])

  const unlockedBuffs = buffs.filter(b => (b.Level ?? 0) <= guildLevel)
  const lockedBuffs = buffs.filter(b => (b.Level ?? 0) > guildLevel)

  return (
    <div className="panel">
      <div className="panel-header">
        Guild Buffs
        {guildLevel > 0 && (
          <span className={styles.activeCount}>
            {unlockedBuffs.length} buffs active
          </span>
        )}
      </div>
      <div className="panel-body">
        <div className={styles.levelControl}>
          <label className={styles.levelLabel} htmlFor="guild-level-input">
            Guild Level: <strong>{guildLevel}</strong>
          </label>
          <div className={styles.levelInputRow}>
            <input
              id="guild-level-input"
              type="range"
              min={0}
              max={200}
              value={guildLevel}
              onChange={e => setGuildLevel(Number(e.target.value))}
              className={styles.slider}
            />
            <input
              type="number"
              min={0}
              max={200}
              value={guildLevel}
              onChange={e => {
                const v = Math.max(0, Math.min(200, Number(e.target.value)))
                setGuildLevel(isNaN(v) ? 0 : v)
              }}
              className={styles.numberInput}
            />
          </div>
        </div>

        {guildLevel === 0 ? (
          <p className={styles.hint}>Set a guild level above to see available buffs.</p>
        ) : (
          <div className={styles.buffList}>
            {unlockedBuffs.length > 0 && (
              <div className={styles.section}>
                <div className={styles.sectionHeader}>Unlocked</div>
                {unlockedBuffs.map(buff => (
                  <div key={buff.Name} className={styles.buffRow}>
                    <div className={styles.buffName}>{buff.Name}</div>
                    {buff.Description && (
                      <div className={styles.buffDesc}>{buff.Description}</div>
                    )}
                    <div className={styles.buffLevel}>Requires guild level {buff.Level ?? 0}</div>
                  </div>
                ))}
              </div>
            )}
            {lockedBuffs.length > 0 && (
              <div className={styles.section}>
                <div className={styles.sectionHeader}>Locked</div>
                {lockedBuffs.map(buff => (
                  <div key={buff.Name} className={`${styles.buffRow} ${styles.buffLocked}`}>
                    <div className={styles.buffName}>{buff.Name}</div>
                    {buff.Description && (
                      <div className={styles.buffDesc}>{buff.Description}</div>
                    )}
                    <div className={styles.buffLevel}>Requires guild level {buff.Level ?? 0}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
