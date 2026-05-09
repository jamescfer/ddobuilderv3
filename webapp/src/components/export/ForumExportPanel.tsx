import { useEffect, useMemo, useState } from 'react'
import { api } from '../../api'
import { useCharacter } from '../../context/CharacterContext'
import { useBuildStats } from '../../hooks/useBuildStats'
import { DEFAULT_SECTIONS, emitForumExport, type SectionDef } from '../../lib/export/sections'
import type {
  DDOClass, Race, Feat, EnhancementTree, Item, Augment, SetBonus,
  FiligreeSetBonus, Filigree, OptionalBuff,
} from '../../types/ddo'
import styles from './ForumExportPanel.module.css'

export default function ForumExportPanel() {
  const { build } = useCharacter()
  const [copied, setCopied] = useState(false)
  const [enabled, setEnabled] = useState<Set<string>>(() => new Set(DEFAULT_SECTIONS.map(s => s.id)))

  // Stats input
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

  const sections: SectionDef[] = useMemo(
    () => DEFAULT_SECTIONS.filter(s => enabled.has(s.id)),
    [enabled],
  )
  const exportText = useMemo(
    () => emitForumExport({ build, stats }, sections),
    [build, stats, sections],
  )

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(exportText)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch { /* fallback: user can select manually */ }
  }

  function toggleSection(id: string) {
    setEnabled(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  return (
    <div className="panel">
      <div className="panel-header">Forum Export</div>
      <div className={`panel-body ${styles.body}`}>
        <div className={styles.toolbar}>
          <button
            type="button"
            className={`${styles.copyBtn} ${copied ? styles.copied : ''}`}
            onClick={handleCopy}
          >
            {copied ? 'Copied!' : 'Copy to Clipboard'}
          </button>
          <span className={styles.hint}>Paste into DDO forums or any BBCode-compatible board.</span>
        </div>
        <div className={styles.sectionsRow}>
          {DEFAULT_SECTIONS.map(s => (
            <label key={s.id} className={styles.sectionToggle}>
              <input type="checkbox" checked={enabled.has(s.id)} onChange={() => toggleSection(s.id)} />
              {s.label}
            </label>
          ))}
        </div>
        <textarea
          className={styles.textarea}
          value={exportText}
          readOnly
          spellCheck={false}
        />
      </div>
    </div>
  )
}
