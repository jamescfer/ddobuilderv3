import { useEffect, useState } from 'react'
import { api } from '../../api'
import { useCharacter } from '../../context/CharacterContext'
import type { DDOClass, Race } from '../../types/ddo'
import styles from './BonusesPanel.module.css'

const ABILITIES = ['Strength', 'Dexterity', 'Constitution', 'Intelligence', 'Wisdom', 'Charisma'] as const
type Ab = typeof ABILITIES[number]

function mod(score: number): number {
  return Math.floor((score - 10) / 2)
}

export default function BonusesPanel() {
  const { build } = useCharacter()
  const [allClasses, setAllClasses] = useState<DDOClass[]>([])
  const [allRaces, setAllRaces] = useState<Race[]>([])

  useEffect(() => {
    api.classes().then(setAllClasses)
    api.races().then(setAllRaces)
  }, [])

  // --- Ability score calculation (mirrors BreakdownsPanel) ---
  const race = allRaces.find(r => r.Name === build.race)

  function racialMod(ab: Ab): number {
    if (!race) return 0
    const raw = (race as unknown as Record<string, unknown>)[ab]
    return typeof raw === 'number' ? raw : 0
  }

  function levelUpBonus(ab: Ab): number {
    let count = 0
    for (const v of Object.values(build.abilityLevelUps)) {
      if (v === ab) count++
    }
    return count
  }

  function tomeMod(ab: Ab): number {
    return build.abilityTomes?.[ab] ?? 0
  }

  function totalScore(ab: Ab): number {
    return build.baseAbilities[ab] + racialMod(ab) + levelUpBonus(ab) + tomeMod(ab)
  }

  // --- Derived data ---
  const chosenFeats = Object.values(build.featChoices).filter(Boolean)
  const activeBuffs = build.activeBuffs ?? []
  const equippedItems = Object.entries(build.gear).filter(([, name]) => Boolean(name))

  return (
    <div className="panel">
      <div className="panel-header">Bonuses Summary</div>
      <div className="panel-body">
        <div className={styles.sections}>

          <details className={styles.section} open>
            <summary className={styles.sectionTitle}>
              Active Feats
              <span className={styles.badge}>{chosenFeats.length}</span>
            </summary>
            {chosenFeats.length === 0 ? (
              <p className={styles.empty}>No feats chosen.</p>
            ) : (
              <ul className={styles.list}>
                {chosenFeats.map((feat, i) => (
                  <li key={i} className={styles.listItem}>{feat}</li>
                ))}
              </ul>
            )}
          </details>

          <details className={styles.section} open>
            <summary className={styles.sectionTitle}>
              Active Buffs
              <span className={styles.badge}>{activeBuffs.length}</span>
            </summary>
            {activeBuffs.length === 0 ? (
              <p className={styles.empty}>No buffs active. Toggle buffs in the Self Buffs tab.</p>
            ) : (
              <ul className={styles.list}>
                {activeBuffs.map(name => (
                  <li key={name} className={`${styles.listItem} ${styles.buffItem}`}>{name}</li>
                ))}
              </ul>
            )}
          </details>

          <details className={styles.section} open>
            <summary className={styles.sectionTitle}>
              Equipped Items
              <span className={styles.badge}>{equippedItems.length}</span>
            </summary>
            {equippedItems.length === 0 ? (
              <p className={styles.empty}>No items equipped.</p>
            ) : (
              <ul className={styles.list}>
                {equippedItems.map(([slot, name]) => (
                  <li key={slot} className={styles.listItem}>
                    <span className={styles.slot}>{slot}:</span>
                    <span className={styles.itemName}>{name}</span>
                  </li>
                ))}
              </ul>
            )}
          </details>

          <details className={styles.section} open>
            <summary className={styles.sectionTitle}>
              Enhancement Bonuses
            </summary>
            <p className={styles.empty}>Enhancement bonuses calculated in the Enhancements panel.</p>
          </details>

          <details className={styles.section} open>
            <summary className={styles.sectionTitle}>
              Ability Totals
            </summary>
            <div className={styles.abilityTable}>
              {ABILITIES.map(ab => {
                const total = totalScore(ab)
                const m = mod(total)
                return (
                  <div key={ab} className={styles.abilityRow}>
                    <span className={styles.abilityLabel}>{ab.slice(0, 3).toUpperCase()}</span>
                    <span className={styles.abilityValue}>{total}</span>
                    <span className={styles.abilityMod}>
                      {m >= 0 ? '+' : ''}{m}
                    </span>
                  </div>
                )
              })}
            </div>
          </details>

        </div>
      </div>
    </div>
  )
}
