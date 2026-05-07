import { useCharacter } from '../../context/CharacterContext'
import type { Ability } from '../../types/ddo'
import styles from './AbilityLevelUps.module.css'

const ABILITIES: Ability[] = ['Strength', 'Dexterity', 'Constitution', 'Intelligence', 'Wisdom', 'Charisma']
const LEVELUP_LEVELS = [4, 8, 12, 16, 20, 24, 28, 32, 36, 40] as const
type LevelUpLevel = typeof LEVELUP_LEVELS[number]

export default function AbilityLevelUps() {
  const { build, dispatch } = useCharacter()
  const { totalLevel, abilityLevelUps } = build

  const available = Math.floor(totalLevel / 4)
  const activeLevels = LEVELUP_LEVELS.filter(l => l <= totalLevel)
  const assigned = activeLevels.filter(l => abilityLevelUps[l]).length

  return (
    <div className="panel">
      <div className="panel-header">
        Ability Score Increases
        <span className={styles.summary} data-complete={assigned === available && available > 0}>
          {assigned} / {available} assigned
        </span>
      </div>
      <div className="panel-body">
        {available === 0 ? (
          <p className={styles.placeholder}>Reach level 4 to assign ability score increases.</p>
        ) : (
          <div className={styles.grid}>
            {activeLevels.map(level => {
              const current = abilityLevelUps[level] ?? ''
              return (
                <div key={level} className={styles.row}>
                  <span className={styles.levelLabel}>Level {level}</span>
                  <select
                    className={styles.select}
                    value={current}
                    onChange={e =>
                      dispatch({
                        type: 'SET_ABILITY_LEVELUP',
                        level: level as LevelUpLevel,
                        ability: e.target.value as Ability,
                      })
                    }
                  >
                    <option value="">— Choose —</option>
                    {ABILITIES.map(ab => (
                      <option key={ab} value={ab}>{ab}</option>
                    ))}
                  </select>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
