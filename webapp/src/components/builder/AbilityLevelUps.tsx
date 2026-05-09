import { useCharacter } from '../../context/CharacterContext'
import type { Ability } from '../../types/ddo'
import { LEVELUP_LEVELS } from '../../lib/gamedata'
import type { LevelUpLevel } from '../../lib/gamedata'
import styles from './AbilityLevelUps.module.css'

const ABILITIES: Ability[] = ['Strength', 'Dexterity', 'Constitution', 'Intelligence', 'Wisdom', 'Charisma']

export default function AbilityLevelUps() {
  const { build, dispatch } = useCharacter()
  const { abilityLevelUps } = build

  // V2 parity: ability score increases unlock at every multiple of 4 up to
  // the character's overall level (heroic + epic + legendary), not just the
  // heroic cap. Build::DetermineLevelUps awards them at L4/8/.../40.
  const overallLevel = build.totalLevel + (build.epicLevels ?? 0) + (build.legendaryLevels ?? 0)
  const available = Math.floor(overallLevel / 4)
  const activeLevels = LEVELUP_LEVELS.filter(l => l <= overallLevel)
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
          <p className={styles.placeholder}>Reach level 4 to assign ability score increases. Epic (24/28) and legendary (32/36/40) levels unlock more.</p>
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
