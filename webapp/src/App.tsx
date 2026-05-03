import { CharacterProvider, useCharacter } from './context/CharacterContext'
import Layout from './components/layout/Layout'
import RaceSelector from './components/builder/RaceSelector'
import ClassSelector from './components/builder/ClassSelector'
import AbilityScores from './components/builder/AbilityScores'
import styles from './App.module.css'

export default function App() {
  return (
    <CharacterProvider>
      <Layout>
        <div className={styles.builder}>
          <section className={styles.sidebar}>
            <RaceSelector />
            <ClassSelector />
            <AbilityScores />
          </section>
          <section className={styles.content}>
            <div className="panel">
              <div className="panel-header">Character Summary</div>
              <div className="panel-body">
                <CharacterSummary />
              </div>
            </div>
          </section>
        </div>
      </Layout>
    </CharacterProvider>
  )
}

function CharacterSummary() {
  const { build } = useCharacter()
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <Row label="Name" value={build.name || '—'} />
      <Row label="Race" value={build.race || '—'} />
      <Row label="Alignment" value={build.alignment} />
      <Row label="Total Level" value={String(build.totalLevel)} />
      {build.classes.filter(c => c.name).map((c, i) => (
        <Row key={i} label={`Class ${i + 1}`} value={`${c.name} ${c.levels}`} />
      ))}
    </div>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: 'flex', gap: 8 }}>
      <span style={{ color: 'var(--color-text-secondary)', width: 90, flexShrink: 0 }}>{label}</span>
      <span>{value}</span>
    </div>
  )
}
