import { useState } from 'react'
import { CharacterProvider, useCharacter } from './context/CharacterContext'
import Layout from './components/layout/Layout'
import CharacterInfo from './components/builder/CharacterInfo'
import RaceSelector from './components/builder/RaceSelector'
import ClassSelector from './components/builder/ClassSelector'
import AbilityScores from './components/builder/AbilityScores'
import StatsPanel from './components/builder/StatsPanel'
import FeatSlots from './components/builder/FeatSlots'
import Skills from './components/builder/Skills'
import AutomaticFeats from './components/builder/AutomaticFeats'
import SpellsPanel from './components/builder/SpellsPanel'
import EnhancementTreePanel from './components/enhancements/EnhancementTreePanel'
import GearPanel from './components/items/GearPanel'
import { SaveLoadBar } from './hooks/usePersistence'
import type { CharacterBuild } from './types/ddo'
import styles from './App.module.css'

const TABS = ['Builder', 'Skills', 'Enhancements', 'Spells', 'Gear'] as const
type Tab = typeof TABS[number]

export default function App() {
  return (
    <CharacterProvider>
      <AppInner />
    </CharacterProvider>
  )
}

function AppInner() {
  const { dispatch } = useCharacter()
  const [activeTab, setActiveTab] = useState<Tab>('Builder')

  function handleLoad(build: CharacterBuild) {
    dispatch({ type: 'LOAD_BUILD', build })
  }

  return (
    <Layout headerExtra={<SaveLoadBar onLoad={handleLoad} />}>
      <nav className={styles.tabs}>
        {TABS.map(tab => (
          <button
            key={tab}
            className={`${styles.tab} ${activeTab === tab ? styles.tabActive : ''}`}
            onClick={() => setActiveTab(tab)}
          >
            {tab}
          </button>
        ))}
      </nav>

      <div className={styles.content}>
        {activeTab === 'Builder' && (
          <div className={styles.builderLayout}>
            <aside className={styles.sidebar}>
              <CharacterInfo />
              <RaceSelector />
              <ClassSelector />
              <AbilityScores />
              <StatsPanel />
            </aside>
            <section className={styles.main}>
              <FeatSlots />
              <AutomaticFeats />
            </section>
          </div>
        )}

        {activeTab === 'Skills' && (
          <div className={styles.single}>
            <Skills />
          </div>
        )}

        {activeTab === 'Enhancements' && (
          <div className={styles.single}>
            <EnhancementTreePanel />
          </div>
        )}

        {activeTab === 'Spells' && (
          <div className={styles.single}>
            <SpellsPanel />
          </div>
        )}

        {activeTab === 'Gear' && (
          <div className={styles.single}>
            <GearPanel />
          </div>
        )}
      </div>
    </Layout>
  )
}
