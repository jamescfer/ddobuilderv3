import { useEffect, useMemo, useState } from 'react'
import { api } from '../../api'
import { useCharacter } from '../../context/CharacterContext'
import type {
  Spell, DDOClass, Race, Feat, EnhancementTree, Item,
  Augment, SetBonus, FiligreeSetBonus, Filigree, OptionalBuff,
} from '../../types/ddo'
import { useBuildStats } from '../../hooks/useBuildStats'
import {
  computeSpellDC, computeCasterLevel, computeMaxCasterLevel,
  computeSpellCost, computeMaxSpellLevel, availableMetamagics, METAMAGIC_KEYS,
} from '../../lib/spells/spellMath'
import styles from './SpellsPanel.module.css'

interface ClassTab {
  className: string
  classLevel: number
  cls: DDOClass | undefined
  byLevel: Record<number, Spell[]>
  cap: number
}

function buildClassTabs(
  classes: { name: string; levels: number }[],
  allClasses: DDOClass[],
  allSpells: Spell[],
): ClassTab[] {
  const result: ClassTab[] = []
  for (const bc of classes) {
    if (!bc.name || bc.levels === 0) continue
    const cls = allClasses.find(c => c.Name === bc.name)
    const cap = computeMaxSpellLevel(cls, bc.levels)
    if (cap === 0) continue
    const byLevel: Record<number, Spell[]> = {}
    for (const spell of allSpells) {
      const lvl = spell.Level?.[bc.name]
      if (lvl == null || lvl < 1 || lvl > cap) continue
      if (!byLevel[lvl]) byLevel[lvl] = []
      byLevel[lvl].push(spell)
    }
    if (Object.keys(byLevel).length > 0) {
      result.push({ className: bc.name, classLevel: bc.levels, cls, byLevel, cap })
    }
  }
  return result
}

export default function SpellsPanel() {
  const { build, dispatch } = useCharacter()

  const [allSpells, setAllSpells] = useState<Spell[]>([])
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
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<string | null>(null)

  useEffect(() => {
    setLoading(true)
    Promise.all([
      api.spells().catch(() => [] as Spell[]),
      api.classes().catch(() => [] as DDOClass[]),
      api.races().catch(() => [] as Race[]),
      api.feats().catch(() => [] as Feat[]),
      api.enhancements().catch(() => [] as EnhancementTree[]),
      api.selfbuffs().catch(() => [] as OptionalBuff[]),
      api.augments().catch(() => [] as Augment[]),
      api.setbonuses().catch(() => [] as SetBonus[]),
      api.filigreeSetBonuses().catch(() => [] as FiligreeSetBonus[]),
      api.filigree().catch(() => [] as Filigree[]),
    ]).then(([sp, cls, ra, fe, tr, sb, aug, sbn, fbn, fil]) => {
      setAllSpells(sp); setAllClasses(cls); setAllRaces(ra); setAllFeats(fe)
      setAllTrees(tr); setAllSelfBuffs(sb); setAllAugments(aug)
      setAllSetBonuses(sbn); setAllFiligreeBonuses(fbn); setAllFiligrees(fil)
    }).finally(() => setLoading(false))
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

  const tabs = buildClassTabs(build.classes, allClasses, allSpells)
  const tabNames = tabs.map(t => t.className)
  const resolvedTab = tabNames.includes(activeTab ?? '') ? activeTab! : (tabNames[0] ?? null)
  const activeTabData = tabs.find(t => t.className === resolvedTab)

  const heightenActive = build.activeBuffs.includes('Heighten Spell') ||
    build.activeBuffs.includes('Heighten')

  // V2 BreakdownItemCasterLevel.cpp:77-100: the "Mixed Magics" enhancement
  // (Wild Mage tree WMUnstableSorcery / Arcane Trickster tree ATMoreMagicMoreFun)
  // raises that class's caster level to min(20, character level). The selection
  // value "Mixed Magics" is stored under the owning archetype tree, so we map
  // the trained selection back to its class and pass min(20, totalLevel) to
  // computeCasterLevel for that class only.
  const mixedMagicsClasses = useMemo(() => {
    const set = new Set<string>()
    const treeToClass: Record<string, string> = {
      'Wild Mage': 'Wild Mage',
      'Arcane Trickster': 'Arcane Trickster',
    }
    for (const [treeName, sels] of Object.entries(build.enhancementSelections ?? {})) {
      const cls = treeToClass[treeName]
      if (!cls) continue
      if (Object.values(sels).includes('Mixed Magics')) set.add(cls)
    }
    return set
  }, [build.enhancementSelections])
  const characterLevel = Math.min(20, build.totalLevel ?? 0)

  function isTrained(className: string, lvl: number, name: string): boolean {
    return (build.trainedSpells[className]?.[lvl] ?? []).includes(name)
  }
  function toggleTrain(className: string, lvl: number, name: string) {
    if (isTrained(className, lvl, name)) {
      dispatch({ type: 'REVOKE_SPELL', className, spellLevel: lvl, spellName: name })
    } else {
      dispatch({ type: 'TRAIN_SPELL', className, spellLevel: lvl, spellName: name })
    }
  }
  function isMetamagicEnabled(className: string, spellName: string, mm: string): boolean {
    return (build.spellMetamagics[className]?.[spellName] ?? []).includes(mm)
  }
  function toggleMetamagic(className: string, spellName: string, mm: string) {
    dispatch({ type: 'TOGGLE_SPELL_METAMAGIC', className, spellName, metamagic: mm })
  }

  return (
    <div className="panel">
      <div className="panel-header">Spells</div>
      <div className="panel-body">
        {loading ? (
          <p className={styles.empty}>Loading spells…</p>
        ) : tabs.length === 0 ? (
          <p className={styles.empty}>No spellcasting classes selected.</p>
        ) : (
          <>
            {tabNames.length > 1 && (
              <div className={styles.tabs}>
                {tabNames.map(name => (
                  <button
                    key={name}
                    className={`${styles.tab} ${name === resolvedTab ? styles.tabActive : ''}`}
                    onClick={() => setActiveTab(name)}
                  >
                    {name}
                  </button>
                ))}
              </div>
            )}
            {activeTabData && (
              <div className={styles.spellList}>
                {Object.keys(activeTabData.byLevel)
                  .map(Number).sort((a, b) => a - b)
                  .map(lvl => {
                    const trainedCount = (build.trainedSpells[activeTabData.className]?.[lvl] ?? []).length
                    return (
                      <div key={lvl} className={styles.levelGroup}>
                        <div className={styles.levelHeader}>
                          Level {lvl} <span className={styles.levelCount}>({trainedCount} trained)</span>
                        </div>
                        {activeTabData.byLevel[lvl]
                          .slice().sort((a, b) => a.Name.localeCompare(b.Name))
                          .map(spell => {
                            const trained = isTrained(activeTabData.className, lvl, spell.Name)
                            const enabledMM = build.spellMetamagics[activeTabData.className]?.[spell.Name] ?? []
                            const dcs = Array.isArray(spell.SpellDC) ? spell.SpellDC : (spell.SpellDC ? [spell.SpellDC] : [])
                            const dcValues = dcs.map(d => computeSpellDC(spell, d, activeTabData.cls, activeTabData.classLevel, stats, { heightenActive }))
                            const cl = computeCasterLevel(
                              spell, activeTabData.cls, activeTabData.classLevel, stats,
                              mixedMagicsClasses.has(activeTabData.className)
                                ? { mixedMagicsCharacterLevel: characterLevel }
                                : {},
                            )
                            const mcl = computeMaxCasterLevel(spell, activeTabData.cls, activeTabData.classLevel, stats)
                            const cost = computeSpellCost(spell, activeTabData.cls, activeTabData.classLevel, stats, enabledMM)
                            const mmList = availableMetamagics(spell)
                            return (
                              <div key={spell.Name} className={styles.spellRow}>
                                <input type="checkbox" checked={trained} onChange={() => toggleTrain(activeTabData.className, lvl, spell.Name)} className={styles.trainCheckbox} title={trained ? 'Untrain' : 'Train'} />
                                <span className={styles.spellName} title={spell.Description ?? spell.Name}>{spell.Name}</span>
                                {spell.School && <span className={styles.spellSchool}>{Array.isArray(spell.School) ? spell.School.join('/') : spell.School}</span>}
                                <span className={styles.spellStat} title="Caster Level">CL {cl}{mcl !== Infinity ? `/${mcl}` : ''}</span>
                                <span className={styles.spellStat} title="Spell Point cost">SP {cost}</span>
                                {dcValues.length > 0 && (
                                  <span className={styles.spellStat} title="Spell DC">DC {Math.max(...dcValues)}</span>
                                )}
                                {trained && mmList.length > 0 && (
                                  <span className={styles.metamagic}>
                                    {mmList.map(mm => (
                                      <button
                                        key={mm}
                                        type="button"
                                        className={`${styles.mmToggle} ${isMetamagicEnabled(activeTabData.className, spell.Name, mm) ? styles.mmActive : ''}`}
                                        onClick={() => toggleMetamagic(activeTabData.className, spell.Name, mm)}
                                        title={`Toggle ${mm} metamagic`}
                                      >
                                        {mm[0]}
                                      </button>
                                    ))}
                                  </span>
                                )}
                              </div>
                            )
                          })}
                      </div>
                    )
                  })}
              </div>
            )}
            {/* Reference key for metamagic letters */}
            {activeTabData && (
              <div className={styles.mmLegend}>
                {METAMAGIC_KEYS.map(k => (
                  <span key={k}><kbd>{(k as string)[0]}</kbd> {k as string}</span>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
