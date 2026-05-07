import { useEffect, useState } from 'react'
import { api } from '../../api'
import { useCharacter } from '../../context/CharacterContext'
import type { DDOClass, Race } from '../../types/ddo'
import styles from './BreakdownsPanel.module.css'

const ABILITIES = ['Strength', 'Dexterity', 'Constitution', 'Intelligence', 'Wisdom', 'Charisma'] as const
type Ab = typeof ABILITIES[number]

function mod(score: number): number {
  return Math.floor((score - 10) / 2)
}

function saveBonus(saveType: string | undefined, levels: number): number {
  if (saveType === 'Strong') return 2 + Math.floor(levels / 2)
  return Math.floor(levels / 3)
}

function babPerLevel(babStr: string | undefined): number {
  switch (babStr) {
    case 'Full': return 1
    case '3/4': return 0.75
    case '1/2': return 0.5
    default: return 0.75
  }
}

interface Row {
  label: string
  value: string | number
  detail?: string
}

export default function BreakdownsPanel() {
  const { build } = useCharacter()
  const [allClasses, setAllClasses] = useState<DDOClass[]>([])
  const [allRaces, setAllRaces] = useState<Race[]>([])

  useEffect(() => {
    api.classes().then(setAllClasses)
    api.races().then(setAllRaces)
  }, [])

  const race = allRaces.find(r => r.Name === build.race)

  // Compute racial ability modifiers
  function racialMod(ab: Ab): number {
    if (!race) return 0
    const raw = (race as unknown as Record<string, unknown>)[ab]
    return typeof raw === 'number' ? raw : 0
  }

  // Compute level-up bonuses
  function levelUpBonus(ab: Ab): number {
    let count = 0
    for (const v of Object.values(build.abilityLevelUps)) {
      if (v === ab) count++
    }
    return count
  }

  // Total ability scores
  function totalScore(ab: Ab): number {
    return build.baseAbilities[ab] + racialMod(ab) + levelUpBonus(ab)
  }

  // Aggregate class stats
  let bab = 0
  let fort = 0
  let ref = 0
  let will = 0
  let hp = 0
  const conMod = mod(totalScore('Constitution'))
  const intMod = mod(totalScore('Intelligence'))
  let skillPts = 0
  let firstClass = true

  for (const bc of build.classes) {
    if (!bc.name || bc.levels === 0) continue
    const cls = allClasses.find(c => c.Name === bc.name)
    if (!cls) continue
    bab += Math.floor(bc.levels * babPerLevel(cls.BAB))
    fort += saveBonus(cls.Fortitude, bc.levels)
    ref += saveBonus(cls.Reflex, bc.levels)
    will += saveBonus(cls.Will, bc.levels)
    const hd = cls.HitPoints ?? 6
    hp += bc.levels * (hd + conMod)
    const baseSkill = cls.SkillPoints ?? 2
    const spp = Math.max(1, baseSkill + intMod)
    if (firstClass) {
      skillPts += spp * 4 + spp * (bc.levels - 1)
      firstClass = false
    } else {
      skillPts += spp * bc.levels
    }
  }

  const dexMod = mod(totalScore('Dexterity'))
  const wisMod = mod(totalScore('Wisdom'))
  const chaMod = mod(totalScore('Charisma'))
  const strMod = mod(totalScore('Strength'))

  const abilityRows: Row[] = ABILITIES.map(ab => {
    const base = build.baseAbilities[ab]
    const racial = racialMod(ab)
    const lvlUp = levelUpBonus(ab)
    const total = base + racial + lvlUp
    const m = mod(total)
    const parts: string[] = [`Base ${base}`]
    if (racial !== 0) parts.push(`Racial ${racial > 0 ? '+' : ''}${racial}`)
    if (lvlUp !== 0) parts.push(`Level-ups +${lvlUp}`)
    return {
      label: ab.slice(0, 3).toUpperCase(),
      value: `${total} (${m >= 0 ? '+' : ''}${m})`,
      detail: parts.join(' | '),
    }
  })

  const combatRows: Row[] = [
    { label: 'BAB', value: `+${bab}` },
    { label: 'Fort Save', value: `+${fort + conMod}`, detail: `Base +${fort} + CON ${conMod >= 0 ? '+' : ''}${conMod}` },
    { label: 'Ref Save', value: `+${ref + dexMod}`, detail: `Base +${ref} + DEX ${dexMod >= 0 ? '+' : ''}${dexMod}` },
    { label: 'Will Save', value: `+${will + wisMod}`, detail: `Base +${will} + WIS ${wisMod >= 0 ? '+' : ''}${wisMod}` },
    { label: 'HP (base)', value: hp, detail: `Includes CON modifier per level` },
    { label: 'AC (base)', value: 10 + dexMod, detail: `10 + DEX ${dexMod >= 0 ? '+' : ''}${dexMod}` },
    { label: 'Melee Dmg', value: `${strMod >= 0 ? '+' : ''}${strMod}`, detail: 'STR modifier only' },
    { label: 'Skill Pts', value: skillPts, detail: 'Includes 4× first-level bonus' },
  ]

  const hasClasses = build.classes.some(c => c.name && c.levels > 0)

  return (
    <div className="panel">
      <div className="panel-header">Breakdowns</div>
      <div className="panel-body">
        {!hasClasses && !build.race ? (
          <p className={styles.empty}>Select a race and classes to see computed stats.</p>
        ) : (
          <div className={styles.sections}>
            <section className={styles.section}>
              <div className={styles.sectionTitle}>Ability Scores</div>
              <div className={styles.table}>
                {abilityRows.map(r => (
                  <div key={r.label} className={styles.row} title={r.detail}>
                    <span className={styles.label}>{r.label}</span>
                    <span className={styles.value}>{r.value}</span>
                    {r.detail && <span className={styles.detail}>{r.detail}</span>}
                  </div>
                ))}
              </div>
            </section>

            {hasClasses && (
              <section className={styles.section}>
                <div className={styles.sectionTitle}>Combat &amp; Defense</div>
                <div className={styles.table}>
                  {combatRows.map(r => (
                    <div key={r.label} className={styles.row} title={r.detail}>
                      <span className={styles.label}>{r.label}</span>
                      <span className={styles.value}>{r.value}</span>
                      {r.detail && <span className={styles.detail}>{r.detail}</span>}
                    </div>
                  ))}
                </div>
              </section>
            )}

            <p className={styles.note}>
              Base values only — does not include feat, enhancement, or item bonuses.
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
