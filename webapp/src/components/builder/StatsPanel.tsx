import { useEffect, useState } from 'react'
import { api } from '../../api'
import { useCharacter } from '../../context/CharacterContext'
import type { DDOClass } from '../../types/ddo'
import { getLevelClasses } from '../../lib/levelProgression'
import styles from './StatsPanel.module.css'

function classBABTable(cls: DDOClass | undefined): number[] {
  // V2 parity: classes carry an explicit BAB string "0 1 2 3 ... 20" (per
  // character class level). Older XML uses descriptors "Full"/"3/4"/"1/2";
  // synthesise them when the explicit table isn't present.
  if (cls?.BAB) {
    const arr = String(cls.BAB).trim().split(/\s+/).map(Number)
    if (arr.every(n => Number.isFinite(n))) return arr
  }
  // Fallback: rate-string only (legacy data files).
  const rate = (cls as unknown as { BABRate?: string })?.BABRate
  const factor = rate === 'Full' ? 1 : rate === '1/2' ? 0.5 : 0.75
  return Array.from({ length: 21 }, (_, n) => Math.floor(n * factor))
}

function babAtLevels(cls: DDOClass | undefined, levels: number): number {
  const t = classBABTable(cls)
  return t[Math.min(levels, t.length - 1)] ?? 0
}

function saveBonus(saveType: string | undefined, levels: number): number {
  if (levels <= 0) return 0
  if (saveType === 'Strong') return 2 + Math.floor(levels / 2)
  return Math.floor(levels / 3)
}

/**
 * V2 BreakdownItemHitpoints.cpp:74-83 — class HP per level. Heroic classes
 * use full HD; Epic and Legendary use half HD per level. CON bonus is
 * applied separately (per-total-level, not per-class).
 */
function classHp(cls: DDOClass, levels: number): number {
  const hd = cls.HitPoints ?? 6
  if (cls.Name === 'Epic' || cls.Name === 'Legendary') return Math.floor(hd * levels / 2)
  return hd * levels
}

export default function StatsPanel() {
  const { build } = useCharacter()
  const [allClasses, setAllClasses] = useState<DDOClass[]>([])

  useEffect(() => {
    api.classes().then(setAllClasses)
  }, [])

  const conScore = build.baseAbilities.Constitution
  const conMod = Math.floor((conScore - 10) / 2)
  const intMod = Math.floor((build.baseAbilities.Intelligence - 10) / 2)

  let bab = 0
  let fort = 0
  let ref = 0
  let will = 0
  let hp = 0
  let skillPts = 0

  // V2 parity: BAB / saves / HP are computed by walking the per-level array
  // and tallying class levels. BAB uses each class's table (handles the
  // "fractional BAB carried across classes" case correctly: each class
  // contributes its full table value at its own level count).
  const levelClasses = getLevelClasses(build)
  const counts: Record<string, number> = {}
  for (const c of levelClasses) if (c) counts[c] = (counts[c] ?? 0) + 1
  // Include Epic / Legendary tiers (V2 BreakdownItem* surfaces these).
  if ((build.epicLevels ?? 0) > 0) counts['Epic'] = build.epicLevels
  if ((build.legendaryLevels ?? 0) > 0) counts['Legendary'] = build.legendaryLevels

  for (const [name, levels] of Object.entries(counts)) {
    const cls = allClasses.find(c => c.Name === name)
    if (!cls) continue
    bab += babAtLevels(cls, levels)
    fort += saveBonus(cls.Fortitude, levels)
    ref += saveBonus(cls.Reflex, levels)
    will += saveBonus(cls.Will, levels)
    hp += classHp(cls, levels)
  }
  // V2 parity: CON-mod HP applied per total character level, not per class.
  const totalCharLevel = build.totalLevel + (build.epicLevels ?? 0) + (build.legendaryLevels ?? 0)
  hp += conMod * totalCharLevel
  // Skill points: per-character-level (V2 parity — first level is ×4)
  for (let i = 0; i < levelClasses.length && i < 20; i++) {
    const name = levelClasses[i]
    if (!name) continue
    const cls = allClasses.find(c => c.Name === name)
    const pts = Math.max(1, (cls?.SkillPoints ?? 2) + intMod)
    skillPts += i === 0 ? pts * 4 : pts
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
