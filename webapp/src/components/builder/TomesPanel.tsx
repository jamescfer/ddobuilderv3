import { useCharacter } from '../../context/CharacterContext'
import type { Ability } from '../../types/ddo'
import { SKILL_NAMES } from '../../lib/gamedata'
import styles from './TomesPanel.module.css'

const ABILITIES: Ability[] = ['Strength', 'Dexterity', 'Constitution', 'Intelligence', 'Wisdom', 'Charisma']

export default function TomesPanel() {
  const { build, dispatch } = useCharacter()
  const { abilityTomes, skillTomes } = build

  return (
    <div className="panel">
      <div className="panel-header">Tomes</div>
      <div className="panel-body">
        <section className={styles.section}>
          <h3 className={styles.sectionTitle}>Ability Tomes</h3>
          <div className={styles.abilityGrid}>
            {ABILITIES.map(ab => (
              <div key={ab} className={styles.abilityRow}>
                <span className={styles.abilityLabel}>{ab}</span>
                <select
                  className={styles.select}
                  value={abilityTomes[ab] ?? 0}
                  onChange={e => {
                    const bonus = Number(e.target.value)
                    dispatch({ type: 'SET_ABILITY_TOME', ability: ab, bonus })
                  }}
                >
                  <option value={0}>None</option>
                  {[1, 2, 3, 4, 5, 6, 7, 8].map(n => (
                    <option key={n} value={n}>+{n}</option>
                  ))}
                </select>
              </div>
            ))}
          </div>
        </section>

        <section className={styles.section}>
          <h3 className={styles.sectionTitle}>Skill Tomes</h3>
          <div className={styles.skillGrid}>
            {SKILL_NAMES.map(skill => (
              <div key={skill} className={styles.skillRow}>
                <span className={styles.skillLabel}>{skill}</span>
                <select
                  className={styles.select}
                  value={skillTomes[skill] ?? 0}
                  onChange={e => {
                    const bonus = Number(e.target.value)
                    dispatch({ type: 'SET_SKILL_TOME', skill, bonus })
                  }}
                >
                  <option value={0}>None</option>
                  {[1, 2, 3, 4].map(n => (
                    <option key={n} value={n}>+{n}</option>
                  ))}
                </select>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  )
}
