// V2 source: ForumExportDlg.cpp:1454-1530 (FES_AutomaticFeats), Race::GrantedFeats(),
// Class::AutomaticFeats(). Computes the auto-granted feats for a build given race
// and class data so the same logic can drive both the Builder panel and the
// forum export section.

import type { CharacterBuild, DDOClass, Race } from '../types/ddo'

export interface AutomaticFeatGroup {
  source: string
  feats: string[]
}

function toArray<T>(val: T | T[] | undefined): T[] {
  if (val === undefined || val === null) return []
  return Array.isArray(val) ? val : [val]
}

export function buildAutomaticFeatGroups(
  build: Pick<CharacterBuild, 'race' | 'classes' | 'totalLevel' | 'pastLives'>,
  allClasses: DDOClass[],
  allRaces: Race[],
): AutomaticFeatGroup[] {
  const groups: AutomaticFeatGroup[] = []

  if (build.race) {
    const race = allRaces.find(r => r.Name === build.race)
    if (race) {
      const feats = toArray(race.GrantedFeat).filter(Boolean)
      if (feats.length > 0) groups.push({ source: build.race, feats })
    }
  }

  for (const bc of build.classes) {
    if (!bc.name || bc.levels === 0) continue
    const cls = allClasses.find(c => c.Name === bc.name)
    if (!cls?.AutomaticFeats) continue
    for (const autoFeat of cls.AutomaticFeats) {
      if ((autoFeat.Level ?? 1) > bc.levels) continue
      const featNames = toArray(autoFeat.Feats).filter(Boolean)
      if (featNames.length === 0) continue
      groups.push({ source: `${bc.name} Lv ${autoFeat.Level}`, feats: featNames })
    }
  }

  const heroicClassNames = allClasses.filter(c => !c.NotHeroic).map(c => c.Name)
  if (heroicClassNames.length > 0 && heroicClassNames.every(cn => (build.pastLives[cn] ?? 0) >= 3)) {
    groups.push({ source: 'Completionist', feats: ['Completionist'] })
  }

  const heroicRaceNames = allRaces.filter(r => !r.NotHeroic && !r.IsIconic).map(r => r.Name)
  if (heroicRaceNames.length > 0 && heroicRaceNames.every(rn => (build.pastLives[rn] ?? 0) >= 3)) {
    groups.push({ source: 'Racial Completionist', feats: ['Racial Completionist'] })
  }

  return groups
}
