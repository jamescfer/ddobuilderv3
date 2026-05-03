import { useEffect, useState } from 'react'
import { api } from '../../api'
import { useCharacter } from '../../context/CharacterContext'
import type { Race } from '../../types/ddo'
import styles from './RaceSelector.module.css'

export default function RaceSelector() {
  const { build, dispatch } = useCharacter()
  const [races, setRaces] = useState<Race[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.races()
      .then(data => setRaces(data.filter(r => !r.NotHeroic)))
      .finally(() => setLoading(false))
  }, [])

  const heroicRaces = races.filter(r => !r.IsIconic)
  const iconicRaces = races.filter(r => r.IsIconic)
  const selected = races.find(r => r.Name === build.race)

  return (
    <div className="panel">
      <div className="panel-header">Race</div>
      <div className="panel-body">
        {loading ? (
          <span className={styles.loading}>Loading races…</span>
        ) : (
          <select
            value={build.race}
            onChange={e => dispatch({ type: 'SET_RACE', race: e.target.value })}
          >
            <option value="">— Select Race —</option>
            <optgroup label="Heroic Races">
              {heroicRaces.map(r => (
                <option key={r.Name} value={r.Name}>{r.ShortName ?? r.Name}</option>
              ))}
            </optgroup>
            {iconicRaces.length > 0 && (
              <optgroup label="Iconic Races">
                {iconicRaces.map(r => (
                  <option key={r.Name} value={r.Name}>{r.ShortName ?? r.Name}</option>
                ))}
              </optgroup>
            )}
          </select>
        )}

        {selected && (
          <div className={styles.raceInfo}>
            {selected.Description && (
              <p className={styles.description}>{selected.Description}</p>
            )}
            <div className={styles.statMods}>
              {(['Strength', 'Dexterity', 'Constitution', 'Intelligence', 'Wisdom', 'Charisma'] as const).map(ab => {
                const mod = (selected as unknown as Record<string, unknown>)[ab] as number | undefined
                if (!mod) return null
                return (
                  <span key={ab} className={mod > 0 ? styles.positive : styles.negative}>
                    {ab.slice(0, 3)} {mod > 0 ? '+' : ''}{mod}
                  </span>
                )
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
