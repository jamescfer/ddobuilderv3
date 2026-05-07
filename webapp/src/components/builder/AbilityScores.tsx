import { useCharacter } from '../../context/CharacterContext'
import type { Ability } from '../../types/ddo'
import { POINT_BUY_COSTS, totalPointsSpent, pointBuyCost } from '../../types/ddo'
import styles from './AbilityScores.module.css'

const ABILITIES: Ability[] = ['Strength', 'Dexterity', 'Constitution', 'Intelligence', 'Wisdom', 'Charisma']
const ABBREV: Record<Ability, string> = {
  Strength: 'STR', Dexterity: 'DEX', Constitution: 'CON',
  Intelligence: 'INT', Wisdom: 'WIS', Charisma: 'CHA',
}
const MIN_SCORE = 8
const MAX_SCORE = 18
const POINT_BUY_BUDGET = 32

export default function AbilityScores() {
  const { build, dispatch } = useCharacter()
  const { baseAbilities } = build
  const spent = totalPointsSpent(baseAbilities)
  const remaining = POINT_BUY_BUDGET - spent

  function adjust(ability: Ability, delta: 1 | -1) {
    const current = baseAbilities[ability]
    const next = current + delta
    if (next < MIN_SCORE || next > MAX_SCORE) return
    const cost = pointBuyCost(next) - pointBuyCost(current)
    if (cost > remaining) return
    dispatch({ type: 'SET_ABILITY', ability, score: next })
  }

  return (
    <div className="panel">
      <div className="panel-header">
        Ability Scores
        <span className={styles.pointsRemaining} data-over={remaining < 0}>
          {remaining} pts remaining
        </span>
      </div>
      <div className="panel-body">
        <div className={styles.grid}>
          {ABILITIES.map(ab => {
            const score = baseAbilities[ab]
            const mod = Math.floor((score - 10) / 2)
            const canIncrease = score < MAX_SCORE && pointBuyCost(score + 1) - pointBuyCost(score) <= remaining
            const canDecrease = score > MIN_SCORE
            return (
              <div key={ab} className={styles.row}>
                <span className={styles.abbrev}>{ABBREV[ab]}</span>
                <button onClick={() => adjust(ab, -1)} disabled={!canDecrease}>−</button>
                <span className={styles.score}>{score}</span>
                <button onClick={() => adjust(ab, 1)} disabled={!canIncrease}>+</button>
                <span className={mod >= 0 ? styles.modPos : styles.modNeg}>
                  {mod >= 0 ? '+' : ''}{mod}
                </span>
                <span className={styles.cost}>{pointBuyCost(score)} pts</span>
              </div>
            )
          })}
        </div>
        <div className={styles.legend}>
          {Object.entries(POINT_BUY_COSTS).map(([score, cost]) => (
            <span key={score} className={styles.legendEntry}>
              {score}={cost}
            </span>
          ))}
        </div>
      </div>
    </div>
  )
}
