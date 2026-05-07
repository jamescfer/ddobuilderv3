import { useState } from 'react'
import { CharacterProvider, useCharacter } from './context/CharacterContext'
import Layout from './components/layout/Layout'
import ComingSoon from './components/layout/ComingSoon'
import type { NavItem } from './components/layout/Sidebar'
import CharacterInfo from './components/builder/CharacterInfo'
import RaceSelector from './components/builder/RaceSelector'
import ClassSelector from './components/builder/ClassSelector'
import AbilityScores from './components/builder/AbilityScores'
import AbilityLevelUps from './components/builder/AbilityLevelUps'
import StatsPanel from './components/builder/StatsPanel'
import FeatSlots from './components/builder/FeatSlots'
import Skills from './components/builder/Skills'
import AutomaticFeats from './components/builder/AutomaticFeats'
import SpellsPanel from './components/builder/SpellsPanel'
import EnhancementTreePanel from './components/enhancements/EnhancementTreePanel'
import EpicDestiniesPanel from './components/epicdestinies/EpicDestiniesPanel'
import ReaperPanel from './components/reaper/ReaperPanel'
import GearPanel from './components/items/GearPanel'
import BreakdownsPanel from './components/breakdowns/BreakdownsPanel'
import PastLivesPanel from './components/pastlives/PastLivesPanel'
import GuildBuffsPanel from './components/guildbuffs/GuildBuffsPanel'
import SetBonusesPanel from './components/setbonuses/SetBonusesPanel'
import StancesPanel from './components/stances/StancesPanel'
import FiligreePanel from './components/filigree/FiligreePanel'
import DCPanel from './components/dc/DCPanel'
import { SaveLoadBar } from './hooks/usePersistence'
import type { CharacterBuild } from './types/ddo'
import styles from './App.module.css'

export default function App() {
  return (
    <CharacterProvider>
      <AppInner />
    </CharacterProvider>
  )
}

function AppInner() {
  const { dispatch } = useCharacter()
  const [activeItem, setActiveItem] = useState<NavItem>('Builder')

  function handleLoad(build: CharacterBuild) {
    dispatch({ type: 'LOAD_BUILD', build })
  }

  const saveBar = <SaveLoadBar onLoad={handleLoad} />

  return (
    <Layout activeItem={activeItem} onNavigate={setActiveItem} saveBar={saveBar}>
      <div className={styles.content}>
        {activeItem === 'Builder' && (
          <div className={styles.builderLayout}>
            <aside className={styles.builderSidebar}>
              <CharacterInfo />
              <RaceSelector />
              <ClassSelector />
              <AbilityScores />
              <AbilityLevelUps />
              <StatsPanel />
            </aside>
            <section className={styles.builderMain}>
              <FeatSlots />
              <AutomaticFeats />
            </section>
          </div>
        )}

        {activeItem === 'Ability Ups' && (
          <div className={styles.single}>
            <AbilityLevelUps />
          </div>
        )}

        {activeItem === 'Skills' && (
          <div className={styles.single}>
            <Skills />
          </div>
        )}

        {activeItem === 'Feats' && (
          <div className={styles.single}>
            <FeatSlots />
          </div>
        )}

        {activeItem === 'Automatic Feats' && (
          <div className={styles.single}>
            <AutomaticFeats />
          </div>
        )}

        {activeItem === 'Spells' && (
          <div className={styles.single}>
            <SpellsPanel />
          </div>
        )}

        {activeItem === 'DCs' && (
          <div className={styles.single}>
            <DCPanel />
          </div>
        )}

        {activeItem === 'Enhancements' && (
          <div className={styles.single}>
            <EnhancementTreePanel />
          </div>
        )}

        {activeItem === 'Epic Destinies' && (
          <div className={styles.single}>
            <EpicDestiniesPanel />
          </div>
        )}

        {activeItem === 'Reaper' && (
          <div className={styles.single}>
            <ReaperPanel />
          </div>
        )}

        {activeItem === 'Gear' && (
          <div className={styles.single}>
            <GearPanel />
          </div>
        )}

        {activeItem === 'Filigrees' && (
          <div className={styles.single}>
            <FiligreePanel />
          </div>
        )}

        {activeItem === 'Set Bonuses' && (
          <div className={styles.single}>
            <SetBonusesPanel />
          </div>
        )}

        {activeItem === 'Breakdowns' && (
          <div className={styles.single}>
            <BreakdownsPanel />
          </div>
        )}

        {activeItem === 'Bonuses' && (
          <ComingSoon label="Bonuses" />
        )}

        {activeItem === 'Stances' && (
          <div className={styles.single}>
            <StancesPanel />
          </div>
        )}

        {activeItem === 'Past Lives' && (
          <div className={styles.single}>
            <PastLivesPanel />
          </div>
        )}

        {activeItem === 'Favor' && (
          <ComingSoon label="Favor" />
        )}

        {activeItem === 'Self Buffs' && (
          <ComingSoon label="Self Buffs" />
        )}

        {activeItem === 'Guild Buffs' && (
          <div className={styles.single}>
            <GuildBuffsPanel />
          </div>
        )}

        {activeItem === 'Notes' && (
          <ComingSoon label="Notes" />
        )}

        {activeItem === 'Forum Export' && (
          <ComingSoon label="Forum Export" />
        )}
      </div>
    </Layout>
  )
}
