import { useCharacter } from '../../context/CharacterContext'
import styles from './CharacterInfo.module.css'

const ALIGNMENTS = [
  'Lawful Good', 'Neutral Good', 'Chaotic Good',
  'Lawful Neutral', 'True Neutral', 'Chaotic Neutral',
  'Lawful Evil', 'True Evil', 'Chaotic Evil',
]

export default function CharacterInfo() {
  const { build, dispatch } = useCharacter()
  return (
    <div className="panel">
      <div className="panel-header">Character</div>
      <div className="panel-body">
        <div className={styles.fields}>
          <div className={styles.field}>
            <label>Name</label>
            <input
              type="text"
              value={build.name}
              onChange={e => dispatch({ type: 'SET_NAME', name: e.target.value })}
              placeholder="Character name"
            />
          </div>
          <div className={styles.field}>
            <label>Alignment</label>
            <select
              value={build.alignment}
              onChange={e => dispatch({ type: 'SET_ALIGNMENT', alignment: e.target.value })}
            >
              {ALIGNMENTS.map(a => <option key={a} value={a}>{a}</option>)}
            </select>
          </div>
        </div>
      </div>
    </div>
  )
}
