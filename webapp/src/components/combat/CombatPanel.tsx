import { useEffect, useMemo, useState } from 'react'
import { api } from '../../api'
import { useCharacter } from '../../context/CharacterContext'
import type {
  DDOClass, Race, Feat, EnhancementTree, Item, Augment, SetBonus,
  FiligreeSetBonus, Filigree, OptionalBuff,
} from '../../types/ddo'
import { useBuildStats } from '../../hooks/useBuildStats'
import { buildAttackEntry } from '../../lib/combat/attackEntry'
import styles from './CombatPanel.module.css'

function pickTwfTier(featChoices: Record<string, string>): 0 | 1 | 2 | 3 | 4 {
  const f = new Set(Object.values(featChoices).filter(Boolean))
  if (f.has('Perfect Two Weapon Fighting')) return 4
  if (f.has('Greater Two Weapon Fighting')) return 3
  if (f.has('Improved Two Weapon Fighting')) return 2
  if (f.has('Two Weapon Fighting')) return 1
  return 0
}

const DEFAULT_FOE_AC = 80
const DEFAULT_FOE_PRR = 50
const DEFAULT_FOE_FORT = 50

export default function CombatPanel() {
  const { build } = useCharacter()

  const [allClasses, setAllClasses] = useState<DDOClass[]>([])
  const [allRaces, setAllRaces] = useState<Race[]>([])
  const [allFeats, setAllFeats] = useState<Feat[]>([])
  const [allTrees, setAllTrees] = useState<EnhancementTree[]>([])
  const [allSelfBuffs, setAllSelfBuffs] = useState<OptionalBuff[]>([])
  const [allAugments, setAllAugments] = useState<Augment[]>([])
  const [allSetBonuses, setAllSetBonuses] = useState<SetBonus[]>([])
  const [allFiligreeBonuses, setAllFiligreeBonuses] = useState<FiligreeSetBonus[]>([])
  const [allFiligrees, setAllFiligrees] = useState<Filigree[]>([])
  const [gearItems, setGearItems] = useState<Record<string, Item>>({})

  const [foeAC, setFoeAC] = useState(DEFAULT_FOE_AC)
  const [foePRR, setFoePRR] = useState(DEFAULT_FOE_PRR)
  const [foeFort, setFoeFort] = useState(DEFAULT_FOE_FORT)
  const [helpless, setHelpless] = useState(false)

  useEffect(() => {
    api.classes().then(setAllClasses)
    api.races().then(setAllRaces)
    api.feats().then(setAllFeats)
    api.enhancements().then(setAllTrees)
    api.selfbuffs().then(setAllSelfBuffs)
    api.augments().then(setAllAugments)
    api.setbonuses().then(setAllSetBonuses)
    api.filigreeSetBonuses().then(setAllFiligreeBonuses)
    api.filigree().then(setAllFiligrees)
  }, [])

  useEffect(() => {
    const slots = Object.entries(build.gear).filter(([, name]) => name)
    if (slots.length === 0) { setGearItems({}); return }
    let cancelled = false
    Promise.all(
      slots.map(([slot, name]) =>
        api.item(name).then(item => item ? [slot, item] as [string, Item] : null)
      )
    ).then(results => {
      if (cancelled) return
      const map: Record<string, Item> = {}
      for (const r of results) { if (r) map[r[0]] = r[1] }
      setGearItems(map)
    })
    return () => { cancelled = true }
  }, [build.gear])

  const statsInput = useMemo(() => ({
    allClasses, allRaces, allFeats, allTrees, gearItems,
    allSelfBuffs, allAugments, allSetBonuses, allFiligreeBonuses, allFiligrees,
  }), [allClasses, allRaces, allFeats, allTrees, gearItems,
      allSelfBuffs, allAugments, allSetBonuses, allFiligreeBonuses, allFiligrees])
  const stats = useBuildStats(statsInput)

  const result = useMemo(() => {
    if (!stats.weapon) return null
    const ab = stats.weapon.attackModifier as 'Strength' | 'Dexterity'
    const abilityScore = stats.total(`ability.${ab}`)
    const bab = Math.min(25, stats.total('bab'))
    return buildAttackEntry(stats, stats.weapon, abilityScore, bab, {
      foeAC, foePRR, foeFortification: foeFort,
      helpless,
      twoWeaponFightingTier: pickTwfTier(build.featChoices),
      twoHanded: stats.weapon.diceNum >= 2,
    })
  }, [stats, foeAC, foePRR, foeFort, helpless, build.featChoices])

  return (
    <div className="panel">
      <div className="panel-header">Combat</div>
      <div className="panel-body">
        {!stats.weapon ? (
          <p className={styles.empty}>Equip a weapon to see combat stats.</p>
        ) : (
          <>
            <div className={styles.weaponHead}>
              <strong>{stats.weapon.name}</strong>
              <span className={styles.subtle}>
                {stats.weapon.diceNum}d{stats.weapon.diceSides} crit {21 - stats.weapon.critThreatRange}-20 ×{stats.weapon.critMultiplier}
              </span>
            </div>

            <div className={styles.controls}>
              <label>
                Foe AC <input type="number" value={foeAC} onChange={e => setFoeAC(Number(e.target.value))} />
              </label>
              <label>
                Foe PRR <input type="number" value={foePRR} onChange={e => setFoePRR(Number(e.target.value))} />
              </label>
              <label>
                Foe Fort % <input type="number" value={foeFort} onChange={e => setFoeFort(Number(e.target.value))} />
              </label>
              <label>
                <input type="checkbox" checked={helpless} onChange={e => setHelpless(e.target.checked)} /> Helpless
              </label>
            </div>

            {result && (
              <table className={styles.statsTable}>
                <tbody>
                  <tr><th>Hit chance</th><td>{(result.hitChance * 100).toFixed(1)}%</td></tr>
                  <tr><th>Crit chance</th><td>{(result.critChance * 100).toFixed(1)}%</td></tr>
                  <tr><th>Hit damage</th><td>{result.hitDamage.toFixed(1)}</td></tr>
                  <tr><th>Crit damage</th><td>{result.critDamage.toFixed(1)}</td></tr>
                  <tr><th>Main DPR</th><td>{result.mainDPR.toFixed(1)}</td></tr>
                  <tr><th>Off-hand DPR</th><td>{result.offhandDPR.toFixed(1)}</td></tr>
                  <tr><th>Total DPR</th><td>{result.totalDPR.toFixed(1)}</td></tr>
                  <tr><th>Estimated DPS</th><td>{result.dps.toFixed(1)}</td></tr>
                </tbody>
              </table>
            )}

            <AttackChainsEditor />
          </>
        )}
      </div>
    </div>
  )
}

/**
 * Editor for named attack chains (V2 AttackChain.h). Each chain is a
 * comma-separated ordered list of attack-action names. Surfaced for parity
 * with V2's chain editor.
 */
function AttackChainsEditor() {
  const { build, dispatch } = useCharacter()
  const [newName, setNewName] = useState('')
  const chains = Object.entries(build.attackChains)

  return (
    <details className={styles.chainsBlock}>
      <summary>Attack Chains ({chains.length})</summary>
      <div className={styles.chainsList}>
        {chains.length === 0 && <p className={styles.empty}>No chains defined.</p>}
        {chains.map(([name, attacks]) => (
          <div key={name} className={styles.chainRow}>
            <strong>{name}</strong>
            <input
              type="text"
              defaultValue={attacks.join(', ')}
              onBlur={e => dispatch({
                type: 'SET_ATTACK_CHAIN',
                chainName: name,
                attacks: e.target.value.split(',').map(s => s.trim()).filter(Boolean),
              })}
            />
            <button onClick={() => dispatch({ type: 'DELETE_ATTACK_CHAIN', chainName: name })}>
              ×
            </button>
          </div>
        ))}
        <div className={styles.chainRow}>
          <input
            placeholder="New chain name"
            value={newName}
            onChange={e => setNewName(e.target.value)}
          />
          <button
            onClick={() => {
              if (newName.trim()) {
                dispatch({ type: 'SET_ATTACK_CHAIN', chainName: newName.trim(), attacks: [] })
                setNewName('')
              }
            }}
          >
            Add
          </button>
        </div>
      </div>
    </details>
  )
}
