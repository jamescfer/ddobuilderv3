// V2 source: ForumExportDlg.cpp:1454-1530 (FES_AutomaticFeats), Race::GrantedFeats(),
// Class::AutomaticFeats(). Computes the auto-granted feats for a build given race
// and class data so the same logic can drive both the Builder panel and the
// forum export section.

import type { CharacterBuild, DDOClass, Race } from '../types/ddo'
import { characterLevelForClassLevel } from './levelProgression'

export interface AutomaticFeatGroup {
  source: string
  feats: string[]
  /** Character level the group was granted at (for sorting; 0 for race/completionist). */
  charLevel?: number
}

function toArray<T>(val: T | T[] | undefined): T[] {
  if (val === undefined || val === null) return []
  return Array.isArray(val) ? val : [val]
}

export function buildAutomaticFeatGroups(
  build: Pick<CharacterBuild, 'race' | 'classes' | 'levelClasses' | 'totalLevel' | 'pastLives'>,
  allClasses: DDOClass[],
  allRaces: Race[],
): AutomaticFeatGroup[] {
  const groups: AutomaticFeatGroup[] = []

  if (build.race) {
    const race = allRaces.find(r => r.Name === build.race)
    if (race) {
      const feats = toArray(race.GrantedFeat).filter(Boolean)
      if (feats.length > 0) groups.push({ source: build.race, feats, charLevel: 0 })
    }
  }

  for (const bc of build.classes) {
    if (!bc.name || bc.levels === 0) continue
    const cls = allClasses.find(c => c.Name === bc.name)
    if (!cls?.AutomaticFeats) continue
    for (const autoFeat of cls.AutomaticFeats) {
      const classLvl = autoFeat.Level ?? 1
      if (classLvl > bc.levels) continue
      const featNames = toArray(autoFeat.Feats).filter(Boolean)
      if (featNames.length === 0) continue
      // V2 parity: the auto-feat is granted at the character level where the
      // class hits this class-level. Surface this so the panel and forum
      // export can sort and label correctly for multi-class builds.
      const charLvl = characterLevelForClassLevel(build, bc.name, classLvl)
      const sourceLabel = charLvl
        ? `Lv ${charLvl} — ${bc.name} ${classLvl}`
        : `${bc.name} Lv ${classLvl}`
      groups.push({ source: sourceLabel, feats: featNames, charLevel: charLvl })
    }
  }

  const heroicClassNames = allClasses.filter(c => !c.NotHeroic).map(c => c.Name)
  if (heroicClassNames.length > 0 && heroicClassNames.every(cn => (build.pastLives[cn] ?? 0) >= 3)) {
    groups.push({ source: 'Completionist', feats: ['Completionist'], charLevel: 0 })
  }

  const heroicRaceNames = allRaces.filter(r => !r.NotHeroic && !r.IsIconic).map(r => r.Name)
  if (heroicRaceNames.length > 0 && heroicRaceNames.every(rn => (build.pastLives[rn] ?? 0) >= 3)) {
    groups.push({ source: 'Racial Completionist', feats: ['Racial Completionist'], charLevel: 0 })
  }

  // Sort: race/completionist first (charLevel=0), then by character level ascending.
  return groups.sort((a, b) => (a.charLevel ?? 0) - (b.charLevel ?? 0))
}
