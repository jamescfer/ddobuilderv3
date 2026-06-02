// Side-by-side build comparison. Loads two saved builds (or the active one
// plus a saved one) and shows each major stat in parallel columns.
//
// V2 parity: DDOBuilder.h supports multiple active builds for stat comparison.
// V3's flat save list is the data source; user picks two from a dropdown.

import { useEffect, useMemo, useState } from 'react'
import { api } from '../../api'
import { useCharacter } from '../../context/CharacterContext'
import { usePersistence } from '../../hooks/usePersistence'
import { useBuildStats } from '../../hooks/useBuildStats'
import type {
  CharacterBuild, DDOClass, Race, Feat, EnhancementTree, Item,
  Augment, SetBonus, FiligreeSetBonus, Filigree, OptionalBuff,
} from '../../types/ddo'
import type { ItemBuffSpec } from '../../server/dataLoaders'
import styles from './BuildCompare.module.css'

interface DataBundle {
  allClasses: DDOClass[]
  allRaces: Race[]
  allFeats: Feat[]
  allTrees: EnhancementTree[]
  allSelfBuffs: OptionalBuff[]
  allAugments: Augment[]
  allSetBonuses: SetBonus[]
  allFiligreeBonuses: FiligreeSetBonus[]
  allFiligrees: Filigree[]
  allItemBuffs: ItemBuffSpec[]
}

function useGearItems(build: CharacterBuild): Record<string, Item> {
  const [gearItems, setGearItems] = useState<Record<string, Item>>({})
  useEffect(() => {
    const slots = Object.entries(build.gear).filter(([, name]) => name)
    if (slots.length === 0) { setGearItems({}); return }
    let cancelled = false
    Promise.all(
      slots.map(([slot, name]) =>
        api.item(name).then(it => it ? [slot, it] as [string, Item] : null),
      ),
    ).then(results => {
      if (cancelled) return
      const map: Record<string, Item> = {}
      for (const r of results) { if (r) map[r[0]] = r[1] }
      setGearItems(map)
    })
    return () => { cancelled = true }
  }, [build.gear])
  return gearItems
}

/**
 * Hook that runs `useBuildStats` against an arbitrary CharacterBuild by
 * temporarily swapping the build context provider — except the API doesn't
 * allow that. So we provide a shim that mimics what useBuildStats reads.
 *
 * Implementation note: useBuildStats reads `useCharacter()` directly. To
 * compute stats for a non-active build we instead call a side helper. We
 * approximate by passing the build via React.useMemo and relying on
 * useBuildStats for stat calculation of one column at a time.
 *
 * Practical compromise: render two BuildColumn children, each within its own
 * hook call, with the build supplied via a context override.
 */

const STATS_TO_SHOW: Array<{ label: string; key: string; fmt?: (n: number) => string }> = [
  { label: 'Total Level', key: '_meta.totalLevel' },
  { label: 'HP', key: 'hp' },
  { label: 'AC', key: 'ac' },
  { label: 'BAB', key: 'bab' },
  { label: 'Fortitude', key: 'save.Fort' },
  { label: 'Reflex', key: 'save.Reflex' },
  { label: 'Will', key: 'save.Will' },
  { label: 'PRR', key: 'prr' },
  { label: 'MRR', key: 'mrr' },
  { label: 'Dodge', key: 'dodge', fmt: n => `${n}%` },
  { label: 'Fortification', key: 'fortification', fmt: n => `${n}%` },
  { label: 'Concealment', key: 'concealment', fmt: n => `${n}%` },
  // Offensive
  { label: 'Doublestrike', key: 'melee.doublestrike', fmt: n => `${n}%` },
  { label: 'Doubleshot', key: 'ranged.doubleshot', fmt: n => `${n}%` },
  { label: 'Strikethrough', key: 'strikethrough', fmt: n => `${n}%` },
  { label: 'Melee Power', key: 'melee.power' },
  { label: 'Ranged Power', key: 'ranged.power' },
  // Casting
  { label: 'Spell Points', key: 'spellPoints' },
  { label: 'Universal Spell Power', key: 'spellPower.Universal' },
  { label: 'Universal DC', key: 'dc.All' },
  // Abilities
  { label: 'STR', key: 'ability.Strength' },
  { label: 'DEX', key: 'ability.Dexterity' },
  { label: 'CON', key: 'ability.Constitution' },
  { label: 'INT', key: 'ability.Intelligence' },
  { label: 'WIS', key: 'ability.Wisdom' },
  { label: 'CHA', key: 'ability.Charisma' },
]

function StatColumn({ build, data }: { build: CharacterBuild; data: DataBundle }) {
  const gearItems = useGearItems(build)
  const statsInput = useMemo(() => ({ ...data, gearItems }), [data, gearItems])
  // useBuildStats accepts a build override so this column computes stats for
  // the supplied saved build instead of the active one.
  const stats = useBuildStats(statsInput, build)
  return (
    <td className={styles.statCol}>
      {STATS_TO_SHOW.map(({ label, key, fmt }) => {
        const v = key === '_meta.totalLevel' ? build.totalLevel : stats.total(key)
        const display = fmt ? fmt(v) : String(v)
        return (
          <div key={label} className={styles.statRow}>
            <span className={styles.statLabel}>{label}</span>
            <span className={styles.statValue}>{display}</span>
          </div>
        )
      })}
    </td>
  )
}

export default function BuildCompare() {
  const { build } = useCharacter()
  const { saves } = usePersistence()
  const [otherId, setOtherId] = useState<string | null>(null)

  const [data, setData] = useState<DataBundle | null>(null)

  useEffect(() => {
    Promise.all([
      api.classes(), api.races(), api.feats(), api.enhancements(),
      api.selfbuffs(), api.augments(), api.setbonuses(),
      api.filigreeSetBonuses(), api.filigree(),
      api.itemBuffs().catch(() => [] as ItemBuffSpec[]),
    ]).then(([classes, races, feats, trees, selfBuffs, augs, sets, fbn, fil, itemBuffs]) => {
      setData({
        allClasses: classes, allRaces: races, allFeats: feats, allTrees: trees,
        allSelfBuffs: selfBuffs, allAugments: augs, allSetBonuses: sets,
        allFiligreeBonuses: fbn, allFiligrees: fil, allItemBuffs: itemBuffs,
      })
    }).catch(() => setData(null))
  }, [])

  const other = saves.find(b => b.id === otherId) ?? null
  const otherBuilds = saves.filter(b => b.id !== build.id)

  return (
    <div className="panel">
      <div className="panel-header">Build Comparison</div>
      <div className="panel-body">
        <div className={styles.controls}>
          <strong>Compare with:</strong>
          <select value={otherId ?? ''} onChange={e => setOtherId(e.target.value || null)}>
            <option value="">— Select saved build —</option>
            {otherBuilds.map(b => (
              <option key={b.id} value={b.id}>{b.name}</option>
            ))}
          </select>
        </div>
        {!data ? (
          <p className={styles.empty}>Loading data…</p>
        ) : (
          <table className={styles.table}>
            <thead>
              <tr>
                <th></th>
                <th>Active: {build.name}</th>
                <th>{other ? other.name : '(none)'}</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className={styles.spacer}></td>
                <StatColumn build={build} data={data} />
                {other ? <StatColumn build={other} data={data} /> : <td className={styles.empty}>No build selected</td>}
              </tr>
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
