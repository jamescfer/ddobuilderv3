// Shared loader that fetches every static dataset useBuildStats needs.
// Replaces the boilerplate `Promise.all([api.classes(), api.races(), …])`
// blocks in BreakdownsPanel / CombatPanel / DCPanel / ForumExportPanel /
// BuildCompare / SpellsPanel.

import { useEffect, useState } from 'react'
import { api } from '../api'
import type {
  DDOClass, Race, Feat, EnhancementTree, Augment, SetBonus, FiligreeSetBonus,
  Filigree, OptionalBuff, GuildBuff, Spell,
} from '../types/ddo'
import type { WeaponGroupSpec } from '../lib/weapons/groups'
import type { BonusTypeSpec, ItemBuffSpec } from '../server/dataLoaders'
import { initBonusTypes } from '../lib/bonus'

export interface StaticBundle {
  allClasses: DDOClass[]
  allRaces: Race[]
  allFeats: Feat[]
  allTrees: EnhancementTree[]
  allSelfBuffs: OptionalBuff[]
  allAugments: Augment[]
  allSetBonuses: SetBonus[]
  allFiligreeBonuses: FiligreeSetBonus[]
  allFiligrees: Filigree[]
  allWeaponGroups: WeaponGroupSpec[]
  allGuildBuffs: GuildBuff[]
  allSpells: Spell[]
  allBonusTypes: BonusTypeSpec[]
  allItemBuffs: ItemBuffSpec[]
}

const empty: StaticBundle = {
  allClasses: [], allRaces: [], allFeats: [], allTrees: [],
  allSelfBuffs: [], allAugments: [], allSetBonuses: [],
  allFiligreeBonuses: [], allFiligrees: [], allWeaponGroups: [],
  allGuildBuffs: [], allSpells: [], allBonusTypes: [], allItemBuffs: [],
}

export function useStaticBundle(): StaticBundle {
  const [bundle, setBundle] = useState<StaticBundle>(empty)

  useEffect(() => {
    let cancelled = false
    Promise.all([
      api.classes().catch(() => [] as DDOClass[]),
      api.races().catch(() => [] as Race[]),
      api.feats().catch(() => [] as Feat[]),
      api.enhancements().catch(() => [] as EnhancementTree[]),
      api.selfbuffs().catch(() => [] as OptionalBuff[]),
      api.augments().catch(() => [] as Augment[]),
      api.setbonuses().catch(() => [] as SetBonus[]),
      api.filigreeSetBonuses().catch(() => [] as FiligreeSetBonus[]),
      api.filigree().catch(() => [] as Filigree[]),
      api.weaponGroups().catch(() => [] as WeaponGroupSpec[]),
      api.guildbuffs().catch(() => [] as GuildBuff[]),
      api.spells().catch(() => [] as Spell[]),
      api.bonusTypes().catch(() => [] as BonusTypeSpec[]),
      api.itemBuffs().catch(() => [] as ItemBuffSpec[]),
    ]).then(([
      allClasses, allRaces, allFeats, allTrees, allSelfBuffs, allAugments,
      allSetBonuses, allFiligreeBonuses, allFiligrees, allWeaponGroups,
      allGuildBuffs, allSpells, allBonusTypes, allItemBuffs,
    ]) => {
      if (cancelled) return
      if (allBonusTypes.length > 0) {
        initBonusTypes(allBonusTypes)
      }
      setBundle({
        allClasses, allRaces, allFeats, allTrees, allSelfBuffs, allAugments,
        allSetBonuses, allFiligreeBonuses, allFiligrees, allWeaponGroups,
        allGuildBuffs, allSpells, allBonusTypes, allItemBuffs,
      })
    })
    return () => { cancelled = true }
  }, [])

  return bundle
}
