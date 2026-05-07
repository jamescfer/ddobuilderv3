import { useCharacter } from '../../context/CharacterContext'
import styles from './NotesPanel.module.css'

export default function NotesPanel() {
  const { build, dispatch } = useCharacter()

  function handleChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    dispatch({ type: 'SET_NOTES', notes: e.target.value })
  }

  return (
    <div className="panel">
      <div className="panel-header">
        Notes
        <span className={styles.subtitle}>Notes are saved with your character.</span>
      </div>
      <div className={`panel-body ${styles.body}`}>
        <textarea
          className={styles.textarea}
          value={build.notes ?? ''}
          onChange={handleChange}
          placeholder="Write notes about your build here…"
          spellCheck={false}
        />
      </div>
    </div>
  )
}
