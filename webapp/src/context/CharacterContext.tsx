import React, { createContext, useContext, useReducer } from 'react'
import type { CharacterBuild, Ability, AbilityScores } from '../types/ddo'
import { emptyBuild } from '../types/ddo'

type Action =
  | { type: 'SET_NAME'; name: string }
  | { type: 'SET_RACE'; race: string }
  | { type: 'SET_ALIGNMENT'; alignment: string }
  | { type: 'SET_CLASS'; index: 0 | 1 | 2; name: string }
  | { type: 'SET_CLASS_LEVELS'; index: 0 | 1 | 2; levels: number }
  | { type: 'SET_ABILITY'; ability: Ability; score: number }
  | { type: 'SET_ABILITY_LEVELUP'; level: 4 | 8 | 12 | 16 | 20 | 24 | 28 | 32 | 36 | 40; ability: Ability }
  | { type: 'RESET' }

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
    case 'SET_ABILITY':
      return { ...state, baseAbilities: { ...state.baseAbilities, [action.ability]: action.score } }
    case 'SET_ABILITY_LEVELUP':
      return { ...state, abilityLevelUps: { ...state.abilityLevelUps, [action.level]: action.ability } }
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
