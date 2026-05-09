// V2 Character → Life → Build hierarchy utilities.
//
// V2 source: DDOBuilder/Character.h:100-117, Life.h:106-124, Build.h.
//
// V3 currently stores a flat list of CharacterBuild objects. This module
// provides:
//   - wrapLegacy(): converts a flat list into a Character document
//   - flattenDocument(): unwraps a Character into its builds
//   - promoteBuildToLife(): clones a build into a fresh Life
//
// The functions are pure so they can be used by usePersistence at load time
// and by the (future) CharacterLifeBar UI.

import type { CharacterBuild, Life, CharacterDocument, Ability } from '../types/ddo'

function generateId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0
    return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16)
  })
}

/**
 * Wraps a flat CharacterBuild[] into a single Character with one Life
 * containing all builds. Used to migrate legacy v1 saves.
 */
export function wrapLegacy(builds: CharacterBuild[], characterName = 'Imported'): CharacterDocument {
  const lifeId = generateId()
  const life: Life = {
    id: lifeId,
    name: 'Life 1',
    race: builds[0]?.race ?? '',
    alignment: builds[0]?.alignment ?? 'True Neutral',
    abilityTomes: builds[0]?.abilityTomes ?? {},
    skillTomes: builds[0]?.skillTomes ?? {},
    selfBuffs: builds[0]?.activeBuffs ?? [],
    specialFeats: [],
    builds,
  }
  return {
    id: generateId(),
    name: characterName,
    guildLevel: 0,
    applyGuildBuffs: false,
    characterTomes: {},
    contentIDontOwn: [],
    lives: [life],
    activeLifeId: lifeId,
    activeBuildId: builds[0]?.id ?? '',
    _v: 2,
  }
}

/**
 * Returns the flat list of builds inside a CharacterDocument so the legacy
 * save UI can keep working unchanged.
 */
export function flattenDocument(doc: CharacterDocument): CharacterBuild[] {
  const out: CharacterBuild[] = []
  for (const life of doc.lives) {
    for (const b of life.builds) out.push(b)
  }
  return out
}

/**
 * Auto-detect: returns true if the parsed object has the new envelope shape.
 */
export function isCharacterDocument(parsed: unknown): parsed is CharacterDocument {
  return (
    !!parsed && typeof parsed === 'object' &&
    Array.isArray((parsed as CharacterDocument).lives)
  )
}

/**
 * Promotes a build into a brand-new Life within the same Character. Returns
 * the new Life. Race/tomes/special-feats copy over; the build itself is
 * cloned with a fresh id.
 */
export function promoteBuildToLife(
  source: CharacterBuild,
  options: { name?: string } = {},
): Life {
  const cloned: CharacterBuild = JSON.parse(JSON.stringify(source))
  cloned.id = generateId()
  return {
    id: generateId(),
    name: options.name ?? `Life of ${source.name}`,
    race: source.race,
    alignment: source.alignment,
    abilityTomes: { ...source.abilityTomes } as Partial<Record<Ability, number>>,
    skillTomes: { ...source.skillTomes },
    selfBuffs: [...source.activeBuffs],
    specialFeats: [],
    builds: [cloned],
  }
}
