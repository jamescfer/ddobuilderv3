import { CharacterProvider } from './context/CharacterContext'
import Layout from './components/layout/Layout'
import CharacterInfo from './components/builder/CharacterInfo'
import RaceSelector from './components/builder/RaceSelector'
import ClassSelector from './components/builder/ClassSelector'
import AbilityScores from './components/builder/AbilityScores'
import StatsPanel from './components/builder/StatsPanel'
import FeatSlots from './components/builder/FeatSlots'
import styles from './App.module.css'

export default function App() {
  return (
    <CharacterProvider>
      <Layout>
        <div className={styles.builder}>
          <section className={styles.sidebar}>
            <CharacterInfo />
            <RaceSelector />
            <ClassSelector />
            <AbilityScores />
            <StatsPanel />
          </section>
          <section className={styles.content}>
            <FeatSlots />
          </section>
        </div>
      </Layout>
    </CharacterProvider>
  )
}
