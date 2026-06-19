import { useState } from 'react'
import { CharacterProvider, useCharacter } from './context/CharacterContext'
import { BuildLogProvider } from './context/BuildLogContext'
import BuildHistoryPanel from './components/layout/BuildHistoryPanel'
import Layout from './components/layout/Layout'
import type { NavItem } from './components/layout/Sidebar'
import CharacterInfo from './components/builder/CharacterInfo'
import RaceSelector from './components/builder/RaceSelector'
import ClassSelector from './components/builder/ClassSelector'
import AbilityScores from './components/builder/AbilityScores'
import AbilityLevelUps from './components/builder/AbilityLevelUps'
import StatsPanel from './components/builder/StatsPanel'
import FeatSlots from './components/builder/FeatSlots'
import Skills from './components/builder/Skills'
import LevelTrainingPanel from './components/builder/LevelTrainingPanel'
import AutomaticFeats from './components/builder/AutomaticFeats'
import SpellsPanel from './components/builder/SpellsPanel'
import EnhancementTreePanel from './components/enhancements/EnhancementTreePanel'
import EpicDestiniesPanel from './components/epicdestinies/EpicDestiniesPanel'
import ReaperPanel from './components/reaper/ReaperPanel'
import GearPanel from './components/items/GearPanel'
import ClickiesPanel from './components/items/ClickiesPanel'
import BreakdownsPanel from './components/breakdowns/BreakdownsPanel'
import CombatPanel from './components/combat/CombatPanel'
import BuildCompare from './components/layout/BuildCompare'
import PastLivesPanel from './components/pastlives/PastLivesPanel'
import GuildBuffsPanel from './components/guildbuffs/GuildBuffsPanel'
import SetBonusesPanel from './components/setbonuses/SetBonusesPanel'
import StancesPanel from './components/stances/StancesPanel'
import FiligreePanel from './components/filigree/FiligreePanel'
import DCPanel from './components/dc/DCPanel'
import TomesPanel from './components/builder/TomesPanel'
import SelfBuffsPanel from './components/buffs/SelfBuffsPanel'
import BonusesPanel from './components/bonuses/BonusesPanel'
import FavorPanel from './components/favor/FavorPanel'
import NotesPanel from './components/notes/NotesPanel'
import ForumExportPanel from './components/export/ForumExportPanel'
import { SaveLoadBar } from './hooks/usePersistence'
import { DocumentProvider, useDocument } from './context/DocumentContext'
import { SettingsProvider } from './context/SettingsContext'
import SettingsPanel from './components/layout/SettingsPanel'
import ContentPanel from './components/layout/ContentPanel'
import HelpPanel from './components/layout/HelpPanel'
import AppShortcuts from './components/layout/AppShortcuts'
import Dashboard from './components/layout/Dashboard'
import LifeBuildBar from './components/layout/LifeBuildBar'
import { findActiveBuild } from './lib/multiLife'
import type { CharacterDocument } from './types/ddo'
import styles from './App.module.css'

export default function App() {
  return (
    <BuildLogProvider>
      <CharacterProvider>
        <DocumentProvider>
          <SettingsProvider>
            <AppInner />
          </SettingsProvider>
        </DocumentProvider>
      </CharacterProvider>
    </BuildLogProvider>
  )
}

function AppInner() {
  const { dispatch } = useCharacter()
  const { setDoc } = useDocument()
  const [activeItem, setActiveItem] = useState<NavItem>('Builder')

  function handleLoad(doc: CharacterDocument) {
    setDoc(doc)
    const build = findActiveBuild(doc)
    if (build) dispatch({ type: 'LOAD_BUILD', build })
  }

  const saveBar = (
    <>
      <SaveLoadBar onLoad={handleLoad} />
      <LifeBuildBar />
      <AppShortcuts onLoad={handleLoad} />
    </>
  )

  return (
    <Layout activeItem={activeItem} onNavigate={setActiveItem} saveBar={saveBar}>
      <div className={styles.content}>
        {activeItem === 'Main' && (
          <Dashboard />
        )}

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

        {activeItem === 'Level Training' && (
          <div className={styles.single}>
            <LevelTrainingPanel />
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

        {activeItem === 'Clickies' && (
          <div className={styles.single}>
            <ClickiesPanel />
          </div>
        )}

        {activeItem === 'Breakdowns' && (
          <div className={styles.single}>
            <BreakdownsPanel />
          </div>
        )}

        {activeItem === 'Combat' && (
          <div className={styles.single}>
            <CombatPanel />
          </div>
        )}

        {activeItem === 'Compare' && (
          <div className={styles.single}>
            <BuildCompare />
          </div>
        )}

        {activeItem === 'Bonuses' && (
          <div className={styles.single}>
            <BonusesPanel />
          </div>
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


        {activeItem === 'Tomes' && (
          <div className={styles.single}>
            <TomesPanel />
          </div>
        )}
        {activeItem === 'Favor' && (
          <div className={styles.single}>
            <FavorPanel />
          </div>
        )}

        {activeItem === 'Self Buffs' && (
          <div className={styles.single}>
            <SelfBuffsPanel />
          </div>
        )}

        {activeItem === 'Guild Buffs' && (
          <div className={styles.single}>
            <GuildBuffsPanel />
          </div>
        )}

        {activeItem === 'Notes' && (
          <div className={styles.single}>
            <NotesPanel />
          </div>
        )}

        {activeItem === 'Forum Export' && (
          <div className={styles.single}>
            <ForumExportPanel />
          </div>
        )}

        {activeItem === 'Settings' && (
          <div className={styles.single}>
            <SettingsPanel />
          </div>
        )}

        {activeItem === 'Content' && (
          <div className={styles.single}>
            <ContentPanel />
          </div>
        )}

        {activeItem === 'Help' && (
          <div className={styles.single}>
            <HelpPanel />
          </div>
        )}

        {activeItem === 'Build Log' && (
          <div className={styles.single}>
            <BuildHistoryPanel />
          </div>
        )}
      </div>
    </Layout>
  )
}
