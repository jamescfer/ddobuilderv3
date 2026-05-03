import { useEffect, useState } from 'react'
import { api } from '../../api'
import { useCharacter } from '../../context/CharacterContext'
import type { DDOClass } from '../../types/ddo'
import styles from './StatsPanel.module.css'

function babPerLevel(babStr: string | undefined): number {
  switch (babStr) {
    case 'Full': return 1
    case '3/4': return 0.75
    case '1/2': return 0.5
    default: return 0.75
  }
}

function saveBonus(saveType: string | undefined, levels: number): number {
  if (saveType === 'Strong') return 2 + Math.floor(levels / 2)
  return Math.floor(levels / 3)
}

function hpForClass(cls: DDOClass, levels: number, conMod: number): number {
  const hd = cls.HitPoints ?? 6
  return levels * (hd + conMod)
}

export default function StatsPanel() {
  const { build } = useCharacter()
  const [allClasses, setAllClasses] = useState<DDOClass[]>([])

  useEffect(() => {
    api.classes().then(setAllClasses)
  }, [])

  const conScore = build.baseAbilities.Constitution
  const conMod = Math.floor((conScore - 10) / 2)

  let bab = 0
  let fort = 0
  let ref = 0
  let will = 0
  let hp = 0
  let skillPts = 0

  for (const bc of build.classes) {
    if (!bc.name || bc.levels === 0) continue
    const cls = allClasses.find(c => c.Name === bc.name)
    if (!cls) continue
    bab += Math.floor(bc.levels * babPerLevel(cls.BAB))
    fort += saveBonus(cls.Fortitude, bc.levels)
    ref += saveBonus(cls.Reflex, bc.levels)
    will += saveBonus(cls.Will, bc.levels)
    hp += hpForClass(cls, bc.levels, conMod)
    const intMod = Math.floor((build.baseAbilities.Intelligence - 10) / 2)
    skillPts += bc.levels * Math.max(1, (cls.SkillPoints ?? 2) + intMod)
  }

  const rows: Array<{ label: string; value: string | number }> = [
    { label: 'BAB', value: `+${bab}` },
    { label: 'Fortitude', value: `+${fort}` },
    { label: 'Reflex', value: `+${ref}` },
    { label: 'Will', value: `+${will}` },
    { label: 'HP (base)', value: hp },
    { label: 'Skill Points', value: skillPts },
  ]

  return (
    <div className="panel">
      <div className="panel-header">Class Stats</div>
      <div className="panel-body">
        <div className={styles.grid}>
          {rows.map(r => (
            <div key={r.label} className={styles.row}>
              <span className={styles.label}>{r.label}</span>
              <span className={styles.value}>{r.value}</span>
            </div>
          ))}
        </div>
        <p className={styles.note}>Base values only — does not include feat/enhancement bonuses</p>
      </div>
    </div>
  )
}
