import React, { createContext, useContext, useReducer } from 'react'
import type { CharacterBuild, Ability } from '../types/ddo'
import { emptyBuild } from '../types/ddo'

type Action =
  | { type: 'SET_NAME'; name: string }
  | { type: 'SET_RACE'; race: string }
  | { type: 'SET_ALIGNMENT'; alignment: string }
  | { type: 'SET_CLASS'; index: 0 | 1 | 2; name: string }
  | { type: 'SET_CLASS_LEVELS'; index: 0 | 1 | 2; levels: number }
  | { type: 'SET_EPIC_LEVELS'; levels: number }
  | { type: 'SET_LEGENDARY_LEVELS'; levels: number }
  | { type: 'SET_ABILITY'; ability: Ability; score: number }
  | { type: 'SET_ABILITY_LEVELUP'; level: 4 | 8 | 12 | 16 | 20 | 24 | 28 | 32 | 36 | 40; ability: Ability }
  | { type: 'SET_FEAT'; slotKey: string; featName: string }
  | { type: 'SET_SKILL_RANK'; skill: string; rank: number }
  | { type: 'SET_GEAR'; slot: string; itemName: string }
  | { type: 'CLEAR_GEAR'; slot: string }
  | { type: 'SET_AUGMENT'; key: string; augmentName: string }
  | { type: 'CLEAR_AUGMENT'; key: string }
  | { type: 'SET_PAST_LIFE'; source: string; count: number }
  | { type: 'SET_FILIGREE'; slotIndex: number; name: string }
  | { type: 'SET_DESTINY_CHOICE'; treeName: string; itemName: string; rank: number }
  | { type: 'SET_REAPER_CHOICE'; treeName: string; itemName: string; rank: number }
  | { type: 'SET_ABILITY_TOME'; ability: Ability; bonus: number }
  | { type: 'SET_SKILL_TOME'; skill: string; bonus: number }
  | { type: 'TOGGLE_BUFF'; buffName: string }
  | { type: 'TOGGLE_QUEST'; questName: string }
  | { type: 'SET_NOTES'; notes: string }
  | { type: 'SET_SENTIENT_GEM'; gem: string }
  | { type: 'SET_ENH_CHOICES'; treeName: string; choices: Record<string, number> }
  | { type: 'SET_ENH_SELECTIONS'; treeName: string; selections: Record<string, string> }
  | { type: 'SET_ENH_PINNED'; pinned: string[] }
  | { type: 'RESET_ENH_TREE'; treeName: string }
  | { type: 'SAVE_GEAR_SET'; setName: string }
  | { type: 'LOAD_GEAR_SET'; setName: string }
  | { type: 'DELETE_GEAR_SET'; setName: string }
  | { type: 'LOAD_BUILD'; build: CharacterBuild }
  | { type: 'RESET' }

function migrateLoad(raw: CharacterBuild): CharacterBuild {
  return {
    ...raw,
    epicLevels: raw.epicLevels ?? 10,
    enhancementChoices: raw.enhancementChoices ?? {},
    enhancementSelections: raw.enhancementSelections ?? {},
    enhancementPinned: raw.enhancementPinned ?? [],
    legendaryLevels: raw.legendaryLevels ?? 4,
    skillRanks: raw.skillRanks ?? {},
    gear: raw.gear ?? {},
    augmentChoices: raw.augmentChoices ?? {},
    pastLives: raw.pastLives ?? {},
    filigreeSlots: raw.filigreeSlots ?? ['', '', '', '', '', ''],
    destinyChoices: raw.destinyChoices ?? {},
    reaperChoices: raw.reaperChoices ?? {},
    abilityTomes: raw.abilityTomes ?? {},
    skillTomes: raw.skillTomes ?? {},
    activeBuffs: raw.activeBuffs ?? [],
    completedQuests: raw.completedQuests ?? {},
    notes: raw.notes ?? '',
    sentientGem: raw.sentientGem ?? '',
    namedGearSets: raw.namedGearSets ?? {},
    activeGearSetName: raw.activeGearSetName ?? '',
  }
}

function reducer(state: CharacterBuild, action: Action): CharacterBuild {
  switch (action.type) {
    case 'SET_NAME':
      return { ...state, name: action.name }
    case 'SET_RACE':
      return { ...state, race: action.race }
    case 'SET_ALIGNMENT':
      return { ...state, alignment: action.alignment }
    case 'SET_CLASS': {
      const classes = [...state.classes] as CharacterBuild['classes']
      classes[action.index] = { ...classes[action.index], name: action.name }
      return { ...state, classes }
    }
    case 'SET_CLASS_LEVELS': {
      const classes = [...state.classes] as CharacterBuild['classes']
      classes[action.index] = { ...classes[action.index], levels: action.levels }
      const totalLevel = classes.reduce((s, c) => s + c.levels, 0)
      return { ...state, classes, totalLevel }
    }
    case 'SET_EPIC_LEVELS':
      return { ...state, epicLevels: Math.max(0, Math.min(10, action.levels)) }
    case 'SET_LEGENDARY_LEVELS':
      return { ...state, legendaryLevels: Math.max(0, Math.min(4, action.levels)) }
    case 'SET_ABILITY':
      return { ...state, baseAbilities: { ...state.baseAbilities, [action.ability]: action.score } }
    case 'SET_ABILITY_LEVELUP':
      return { ...state, abilityLevelUps: { ...state.abilityLevelUps, [action.level]: action.ability } }
    case 'SET_FEAT':
      return { ...state, featChoices: { ...state.featChoices, [action.slotKey]: action.featName } }
    case 'SET_SKILL_RANK':
      return { ...state, skillRanks: { ...state.skillRanks, [action.skill]: action.rank } }
    case 'SET_GEAR':
      return {
        ...state,
        gear: { ...state.gear, [action.slot]: action.itemName },
        augmentChoices: Object.fromEntries(
          Object.entries(state.augmentChoices).filter(([k]) => !k.startsWith(action.slot + ':')),
        ),
      }
    case 'CLEAR_GEAR': {
      const gear = { ...state.gear }
      delete gear[action.slot]
      const augmentChoices = Object.fromEntries(
        Object.entries(state.augmentChoices).filter(([k]) => !k.startsWith(action.slot + ':')),
      )
      return { ...state, gear, augmentChoices }
    }
    case 'SET_AUGMENT':
      return { ...state, augmentChoices: { ...state.augmentChoices, [action.key]: action.augmentName } }
    case 'CLEAR_AUGMENT': {
      const augmentChoices = { ...state.augmentChoices }
      delete augmentChoices[action.key]
      return { ...state, augmentChoices }
    }
    case 'SET_PAST_LIFE':
      return { ...state, pastLives: { ...state.pastLives, [action.source]: action.count } }
    case 'SET_FILIGREE': {
      const filigreeSlots = [...state.filigreeSlots]
      filigreeSlots[action.slotIndex] = action.name
      return { ...state, filigreeSlots }
    }
    case 'SET_DESTINY_CHOICE': {
      const treeChoices = { ...(state.destinyChoices[action.treeName] ?? {}), [action.itemName]: action.rank }
      return { ...state, destinyChoices: { ...state.destinyChoices, [action.treeName]: treeChoices } }
    }
    case 'SET_REAPER_CHOICE': {
      const treeChoices = { ...(state.reaperChoices[action.treeName] ?? {}), [action.itemName]: action.rank }
      return { ...state, reaperChoices: { ...state.reaperChoices, [action.treeName]: treeChoices } }
    }
    case 'SET_ABILITY_TOME':
      return { ...state, abilityTomes: { ...state.abilityTomes, [action.ability]: action.bonus } }
    case 'SET_SKILL_TOME':
      return { ...state, skillTomes: { ...state.skillTomes, [action.skill]: action.bonus } }
    case 'TOGGLE_BUFF': {
      const active = state.activeBuffs.includes(action.buffName)
        ? state.activeBuffs.filter(b => b !== action.buffName)
        : [...state.activeBuffs, action.buffName]
      return { ...state, activeBuffs: active }
    }
    case 'TOGGLE_QUEST':
      return { ...state, completedQuests: { ...state.completedQuests, [action.questName]: !state.completedQuests[action.questName] } }
    case 'SET_NOTES':
      return { ...state, notes: action.notes }
    case 'SET_SENTIENT_GEM':
      return { ...state, sentientGem: action.gem }
    case 'SET_ENH_CHOICES':
      return { ...state, enhancementChoices: { ...state.enhancementChoices, [action.treeName]: action.choices } }
    case 'SET_ENH_SELECTIONS':
      return { ...state, enhancementSelections: { ...state.enhancementSelections, [action.treeName]: action.selections } }
    case 'SET_ENH_PINNED':
      return { ...state, enhancementPinned: action.pinned }
    case 'RESET_ENH_TREE': {
      const enhancementChoices = { ...state.enhancementChoices }
      const enhancementSelections = { ...state.enhancementSelections }
      delete enhancementChoices[action.treeName]
      delete enhancementSelections[action.treeName]
      return { ...state, enhancementChoices, enhancementSelections }
    }
    case 'SAVE_GEAR_SET':
      return { ...state, namedGearSets: { ...state.namedGearSets, [action.setName]: { ...state.gear } }, activeGearSetName: action.setName }
    case 'LOAD_GEAR_SET': {
      const gearSet = state.namedGearSets[action.setName]
      if (!gearSet) return state
      return { ...state, gear: { ...gearSet }, activeGearSetName: action.setName }
    }
    case 'DELETE_GEAR_SET': {
      const sets = { ...state.namedGearSets }
      delete sets[action.setName]
      return { ...state, namedGearSets: sets, activeGearSetName: state.activeGearSetName === action.setName ? '' : state.activeGearSetName }
    }
    case 'LOAD_BUILD':
      return migrateLoad(action.build)
    case 'RESET':
      return emptyBuild()
    default:
      return state
  }
}

interface CharacterContextValue {
  build: CharacterBuild
  dispatch: React.Dispatch<Action>
}

const CharacterContext = createContext<CharacterContextValue | null>(null)

export function CharacterProvider({ children }: { children: React.ReactNode }) {
  const [build, dispatch] = useReducer(reducer, undefined, emptyBuild)
  return (
    <CharacterContext.Provider value={{ build, dispatch }}>
      {children}
    </CharacterContext.Provider>
  )
}

export function useCharacter() {
  const ctx = useContext(CharacterContext)
  if (!ctx) throw new Error('useCharacter must be used inside CharacterProvider')
  return ctx
}
