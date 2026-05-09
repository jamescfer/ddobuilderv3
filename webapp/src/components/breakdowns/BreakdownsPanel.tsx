import { useEffect, useState, useRef, useCallback, useMemo } from 'react'
import { api } from '../../api'
import { useCharacter } from '../../context/CharacterContext'
import type { DDOClass, Race, Feat, EnhancementTree, Item, Augment, SetBonus, FiligreeSetBonus, Filigree, OptionalBuff, Buff, GuildBuff, WeaponGroup, Patron, Quest, Spell } from '../../types/ddo'
import { useBuildStats, computePatronFavorTotals, favorRankForTotal } from '../../hooks/useBuildStats'
import type { ResolvedBonus } from '../../lib/bonus'
import { SKILLS, SCHOOL_DCS, SPELL_POWER_TYPES, SPELL_POWER_LABELS } from '../../lib/gamedata'
import {
  MAX_BAB,
  applyBabCap, applyDodgeCap, applyMRRCap,
  effectiveMDB, mitigationPercent, multiplicativeAbsorption,
  TACTICAL_TYPES, TURN_UNDEAD_KEYS, HEAL_AMP_KEYS, THREAT_KEYS, BYPASS_KEYS,
} from '../../lib/breakdowns'
import { buildSpellClassIndex } from '../../lib/spells'
import styles from './BreakdownsPanel.module.css'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface TipState {
  label: string
  display: string
  bonuses: ResolvedBonus[]
  x: number
  y: number
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const ABILITIES = ['Strength', 'Dexterity', 'Constitution', 'Intelligence', 'Wisdom', 'Charisma'] as const
type Ab = typeof ABILITIES[number]
const AB3: Record<Ab, string> = {
  Strength: 'STR', Dexterity: 'DEX', Constitution: 'CON',
  Intelligence: 'INT', Wisdom: 'WIS', Charisma: 'CHA',
}

// ---------------------------------------------------------------------------
// Math helpers
// ---------------------------------------------------------------------------

function abMod(score: number) { return Math.floor((score - 10) / 2) }
function sign(n: number)      { return (n >= 0 ? '+' : '') + n }
function pct(n: number)       { return n + '%' }
function mult(n: number)      { return '×' + n.toFixed(1).replace(/\.0$/, '') }

// ---------------------------------------------------------------------------
// Tooltip
// ---------------------------------------------------------------------------

function Tooltip({ tip, onHide }: { tip: TipState; onHide: () => void }) {
  const activeTotal = tip.bonuses.filter(b => b.active).reduce((s, b) => s + b.value, 0)
  const hasBonuses = tip.bonuses.length > 0

  return (
    <div
      className={styles.tipBox}
      style={{ left: tip.x + 14, top: tip.y - 8 }}
      onMouseEnter={onHide}
    >
      <div className={styles.tipTitle}>{tip.label} — {tip.display}</div>
      {hasBonuses ? (
        <table className={styles.tipTable}>
          <thead>
            <tr>
              <th>Source</th>
              <th>Type</th>
              <th>Value</th>
            </tr>
          </thead>
          <tbody>
            {tip.bonuses.map((b, i) => (
              <tr key={i} className={b.active ? '' : styles.tipRowSuppressed}>
                <td>{b.source}</td>
                <td>{b.type}</td>
                <td className={styles.tipVal}>{sign(b.value)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={2}><strong>Total</strong></td>
              <td className={styles.tipVal}><strong>{sign(activeTotal)}</strong></td>
            </tr>
          </tfoot>
        </table>
      ) : (
        <div className={styles.tipEmpty}>No bonuses tracked.</div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Collapsible section
// ---------------------------------------------------------------------------

function Section({ title, children, defaultOpen = true }: {
  title: string; children: React.ReactNode; defaultOpen?: boolean
}) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className={styles.section}>
      <button className={styles.sectionHeader} onClick={() => setOpen(v => !v)}>
        <span className={styles.sectionCaret}>{open ? '▾' : '▸'}</span>
        {title}
      </button>
      {open && <div className={styles.sectionBody}>{children}</div>}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Stat row
// ---------------------------------------------------------------------------

interface StatRowData {
  label: string
  total: number
  display?: string
  bonuses: ResolvedBonus[]
  indent?: boolean
  dim?: boolean
}

function StatRow({ stat, onTip }: {
  stat: StatRowData
  onTip: (t: TipState | null) => void
}) {
  const display = stat.display ?? sign(stat.total)
  return (
    <div
      className={`${styles.row} ${stat.indent ? styles.rowIndent : ''} ${stat.dim ? styles.rowDim : ''}`}
      onMouseEnter={e => {
        const r = (e.currentTarget as HTMLElement).getBoundingClientRect()
        onTip({ label: stat.label, display, bonuses: stat.bonuses, x: r.right, y: r.top })
      }}
      onMouseLeave={() => onTip(null)}
    >
      <span className={styles.label}>{stat.label}</span>
      <span className={`${styles.value} ${stat.dim ? styles.valueDim : ''}`}>{display}</span>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Spell power grid row
// ---------------------------------------------------------------------------

function SpellPowerRow({ name, spKey, stats, onTip }: {
  name: string
  spKey: string
  stats: ReturnType<typeof useBuildStats>
  onTip: (t: TipState | null) => void
}) {
  const power    = stats.total(`sp.${spKey}`) + stats.total('sp.Universal')
  const critPct  = 5 + stats.total(`spCrit.${spKey}`) + stats.total('spCrit.Universal')
  const critMult = 1.5  // base; no data yet for crit mult enhancers

  const spBonuses = [
    ...stats.resolve(`sp.${spKey}`).bonuses,
    ...stats.resolve('sp.Universal').bonuses,
  ]
  const critBonuses: ResolvedBonus[] = [
    { value: 5, type: 'Base', source: 'Base threat (20)', active: true },
    ...stats.resolve(`spCrit.${spKey}`).bonuses,
    ...stats.resolve('spCrit.Universal').bonuses,
  ]
  const multBonuses: ResolvedBonus[] = [
    { value: 1.5, type: 'Base', source: 'Base critical multiplier', active: true },
  ]

  function cell(display: string, label: string, bonuses: ResolvedBonus[]) {
    return (
      <td
        className={`${styles.spCell} ${power === 0 && bonuses.length <= 1 ? styles.spCellDim : ''}`}
        onMouseEnter={e => {
          const r = (e.currentTarget as HTMLElement).getBoundingClientRect()
          onTip({ label: `${name} — ${label}`, display, bonuses, x: r.right, y: r.top })
        }}
        onMouseLeave={() => onTip(null)}
      >
        {display}
      </td>
    )
  }

  return (
    <tr className={styles.spRow}>
      <td className={styles.spName}>{name}</td>
      {cell(String(power),      'Power',       spBonuses)}
      {cell(pct(critPct),       'Crit Chance', critBonuses)}
      {cell(mult(critMult),     'Crit Mult',   multBonuses)}
    </tr>
  )
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export default function BreakdownsPanel() {
  const { build } = useCharacter()
  const [allClasses,        setAllClasses]        = useState<DDOClass[]>([])
  const [allRaces,          setAllRaces]          = useState<Race[]>([])
  const [allFeats,          setAllFeats]          = useState<Feat[]>([])
  const [allTrees,          setAllTrees]          = useState<EnhancementTree[]>([])
  const [allSelfBuffs,      setAllSelfBuffs]      = useState<OptionalBuff[]>([])
  const [allAugments,       setAllAugments]       = useState<Augment[]>([])
  const [allSetBonuses,     setAllSetBonuses]     = useState<SetBonus[]>([])
  const [allFiligreeBonuses,setAllFiligreeBonuses]= useState<FiligreeSetBonus[]>([])
  const [allFiligrees,      setAllFiligrees]      = useState<Filigree[]>([])
  const [allItemBuffs,      setAllItemBuffs]      = useState<Buff[]>([])
  const [allGuildBuffs,     setAllGuildBuffs]     = useState<GuildBuff[]>([])
  const [allWeaponGroups,   setAllWeaponGroups]   = useState<WeaponGroup[]>([])
  const [gearItems,         setGearItems]         = useState<Record<string, Item>>({})
  const [tip, setTip] = useState<TipState | null>(null)
  const [allPatrons,        setAllPatrons]        = useState<Patron[]>([])
  const [allQuests,         setAllQuests]         = useState<Quest[]>([])
  const [allSpells,         setAllSpells]         = useState<Spell[]>([])
  const panelRef = useRef<HTMLDivElement>(null)

  // Load static data once
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
    api.itemBuffs().then(setAllItemBuffs)
    api.guildbuffs().then(setAllGuildBuffs)
    api.weaponGroups().then(setAllWeaponGroups)
    api.patrons().then(setAllPatrons)
    api.quests().then(setAllQuests)
    api.spells().then(setAllSpells)
  }, [])

  // Resolve gear items whenever equipped slots change
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

  const hideTip = useCallback(() => setTip(null), [])

  // ── Build stats ──────────────────────────────────────────────────────────
  const statsInput = useMemo(
    () => ({
      allClasses, allRaces, allFeats, allTrees, gearItems,
      allSelfBuffs, allAugments, allSetBonuses, allFiligreeBonuses, allFiligrees,
      allItemBuffs, allGuildBuffs, allWeaponGroups, allPatrons, allQuests,
    }),
    [allClasses, allRaces, allFeats, allTrees, gearItems,
     allSelfBuffs, allAugments, allSetBonuses, allFiligreeBonuses, allFiligrees,
     allItemBuffs, allGuildBuffs, allWeaponGroups, allPatrons, allQuests],
  )
  const stats = useBuildStats(statsInput)

  // ── Class aggregates for labels ──────────────────────────────────────────
  const casterClasses = build.classes
    .filter(bc => bc.name && bc.levels > 0)
    .map(bc => ({ name: bc.name, levels: bc.levels, cls: allClasses.find(c => c.Name === bc.name) }))
    .filter(({ cls }) => cls?.SpellPointsPerLevel)

  // ── Helper builders ──────────────────────────────────────────────────────
  function statRow(label: string, key: string, fmt?: (n: number) => string, indent?: boolean): StatRowData {
    const resolved = stats.resolve(key)
    const total = resolved.total
    return {
      label, total,
      display: fmt ? fmt(total) : sign(total),
      bonuses: resolved.bonuses,
      indent,
      dim: total === 0,
    }
  }

  function subSave(label: string, baseKey: string, subKey: string): StatRowData {
    const total = stats.total(baseKey) + stats.total(subKey)
    return {
      label, total,
      display: sign(total),
      bonuses: [...stats.resolve(baseKey).bonuses, ...stats.resolve(subKey).bonuses],
      indent: true,
    }
  }

  function fixedRow(label: string, value: number, display: string, bonuses: ResolvedBonus[], dim = false): StatRowData {
    return { label, total: value, display, bonuses, dim }
  }

  // ── Sections ─────────────────────────────────────────────────────────────

  const saveStats: StatRowData[] = [
    statRow('Fortitude',      'save.Fort',   sign),
    subSave('vs Poison',      'save.Fort',   'save.sub.Poison'),
    subSave('vs Disease',     'save.Fort',   'save.sub.Disease'),
    statRow('Reflex',         'save.Reflex', sign),
    subSave('vs Traps',       'save.Reflex', 'save.sub.Traps'),
    subSave('vs Spell',       'save.Reflex', 'save.sub.Spell'),
    subSave('vs Magic',       'save.Reflex', 'save.sub.Magic'),
    statRow('Will',           'save.Will',   sign),
    subSave('vs Enchantment', 'save.Will',   'save.sub.Enchantment'),
    subSave('vs Illusion',    'save.Will',   'save.sub.Illusion'),
    subSave('vs Fear',        'save.Will',   'save.sub.Fear'),
    subSave('vs Curse',       'save.Will',   'save.sub.Curse'),
  ]

  const hpTotal = stats.total('hp')
  const acTotal = stats.total('ac')
  const spTotal = stats.total('spellPoints')

  // ── V2 BreakdownItem caps ────────────────────────────────────────────────
  const bab = applyBabCap(stats.resolve('bab'))
  const babTotal = bab.total

  const mrr = applyMRRCap(stats.resolve('mrr'), stats.resolve('mrrCap'))
  const mrrTotal = mrr.total
  const mrrCapResolved = stats.resolve('mrrCap')

  // V2 BreakdownItemMDB: cloth armor + no tower shield → "no limit".
  const mdbResolved      = stats.resolve('mdb')
  const mdbTowerResolved = stats.resolve('mdb.tower')
  const mdbValue      = effectiveMDB(mdbResolved,      stats.inClothArmor, stats.inTowerShield)
  const mdbTowerValue = stats.inTowerShield && mdbTowerResolved.bonuses.length > 0
    ? mdbTowerResolved.total
    : null

  const dodge = applyDodgeCap({
    dodge: stats.resolve('dodge'),
    dodgeCap: stats.resolve('dodgeCap'),
    mdbArmor: mdbValue,
    mdbTowerShield: mdbTowerValue,
  })

  const prrTotal = stats.total('prr')

  function mitigation(n: number): string {
    if (n === 0) return '+0'
    return `${sign(n)} (${mitigationPercent(n).toFixed(1)}%)`
  }

  const defenseStats: StatRowData[] = [
    fixedRow('Hit Points', hpTotal, String(hpTotal), stats.resolve('hp').bonuses, hpTotal === 0),
    fixedRow('AC', acTotal, String(acTotal), stats.resolve('ac').bonuses, acTotal <= 10),
    fixedRow('PRR', prrTotal, mitigation(prrTotal), stats.resolve('prr').bonuses, prrTotal === 0),
    fixedRow(
      'MRR',
      mrrTotal,
      mrr.capped ? `${mitigation(mrrTotal)} (capped from ${sign(mrr.raw)})` : mitigation(mrrTotal),
      mrr.bonuses,
      mrrTotal === 0,
    ),
    fixedRow(
      'MRR Cap',
      mrrCapResolved.total,
      mrrCapResolved.total > 0 ? String(mrrCapResolved.total) : '—',
      mrrCapResolved.bonuses,
      mrrCapResolved.total === 0,
    ),
    fixedRow(
      'Dodge',
      dodge.total,
      dodge.capped ? `${pct(dodge.total)} (capped from ${pct(dodge.raw)})` : pct(dodge.total),
      dodge.bonuses,
      dodge.raw === 0,
    ),
    fixedRow(
      'Dodge Cap',
      stats.resolve('dodgeCap').total,
      pct(25 + stats.resolve('dodgeCap').total),
      stats.resolve('dodgeCap').bonuses,
      stats.resolve('dodgeCap').bonuses.length === 0,
    ),
    fixedRow(
      'Max Dex Bonus',
      mdbValue ?? 0,
      mdbValue == null ? 'No limit' : String(mdbValue),
      mdbResolved.bonuses,
      mdbResolved.bonuses.length === 0,
    ),
    ...(mdbTowerValue != null ? [fixedRow(
      'MDB (Tower Shield)',
      mdbTowerValue,
      String(mdbTowerValue),
      mdbTowerResolved.bonuses,
    )] : []),
    statRow('Fortification',  'fortification',  pct),
    statRow('Concealment',    'concealment',    pct),
    statRow('Displacement',   'displacement',   pct),
    statRow('Incorporeality',  'incorporeality', pct),
    statRow('True Seeing',     'trueSeeing'),
    fixedRow('Move Speed', stats.total('speed'), pct(stats.total('speed')), stats.resolve('speed').bonuses),
    statRow('Spell Resistance', 'spellResistance', String),
  ]

  // Energy Resistance / Absorption / DR rows (one per element with non-zero value)
  const ENERGY_TYPES = ['Fire','Cold','Acid','Electric','Sonic','Force','Light','Negative','Positive','Poison','Repair'] as const
  const energyStats: StatRowData[] = []
  for (const e of ENERGY_TYPES) {
    const r = stats.resolve(`resist.${e}`)
    const a = stats.resolve(`absorb.${e}`)
    if (r.total !== 0) {
      energyStats.push(fixedRow(`${e} Resistance`, r.total, String(r.total), r.bonuses))
    }
    if (a.total !== 0) {
      // V2 multiplicative absorption stacking
      const absPct = multiplicativeAbsorption(a.bonuses)
      energyStats.push(fixedRow(`${e} Absorption`, absPct, `${absPct.toFixed(1)}%`, a.bonuses))
    }
  }
  const drKeys = stats.keys().filter(k => k.startsWith('dr.'))
  for (const k of drKeys) {
    const bypass = k.slice(3)
    const r = stats.resolve(k)
    if (r.total !== 0) {
      energyStats.push(fixedRow(`DR ${r.total}/${bypass}`, r.total, `${r.total}/${bypass}`, r.bonuses))
    }
  }

  // melee.toHit / ranged.toHit already include STR/DEX mod from phase 2; bab is separate key
  const meleeToHitTotal  = babTotal + stats.total('melee.toHit')
  const rangedToHitTotal = babTotal + stats.total('ranged.toHit')

  const weapon = stats.weapon
  const baseThreatRange  = weapon?.critThreatRange ?? 1
  const bonusThreatRange = stats.total('weapon.threatRange')
  const totalThreatRange = baseThreatRange + bonusThreatRange
  const baseCritMult       = weapon?.critMultiplier ?? 2
  const bonusCritMult      = stats.total('weapon.critMult')
  const totalCritMult      = baseCritMult + bonusCritMult
  const threatDisplay      = totalThreatRange > 1 ? `${21 - totalThreatRange}–20` : '20'
  const weaponDiceDisplay  = weapon ? `${weapon.diceNum}d${weapon.diceSides}` : '—'
  const threatBonuses: ResolvedBonus[] = [
    { value: baseThreatRange, type: 'Base', source: weapon?.name ?? 'Unarmed', active: true },
    ...stats.resolve('weapon.threatRange').bonuses,
  ]
  const critMultBonuses: ResolvedBonus[] = [
    { value: baseCritMult, type: 'Base', source: weapon?.name ?? 'Unarmed', active: true },
    ...stats.resolve('weapon.critMult').bonuses,
  ]

  // V2 BreakdownItemWeaponVorpalRange: vorpal triggers on natural 20 by default
  // (range 1 = "20"); each Weapon_VorpalRange bonus widens the threshold (so a
  // value of 1 makes vorpal trigger on 19-20).
  const vorpalRangeBonus = stats.total('weapon.vorpal')
  const vorpalDisplay = vorpalRangeBonus > 0 ? `${20 - vorpalRangeBonus}–20` : '20'

  const enchantTotal = stats.total('weapon.enchantment')
  const alacrityTotal = stats.total('weapon.alacrity')
  const baseDamageTotal = stats.total('weapon.baseDamage')

  const meleeStats: StatRowData[] = [
    statRow('Melee Power',    'melee.power',        sign),
    fixedRow('To-Hit Bonus',  meleeToHitTotal, sign(meleeToHitTotal),
      [...stats.resolve('bab').bonuses, ...stats.resolve('melee.toHit').bonuses]),
    statRow('Damage Bonus',   'melee.damage',       sign),
    fixedRow('W Dice',        0, weaponDiceDisplay, [], !weapon),
    fixedRow('Weapon Enchant', enchantTotal,
      enchantTotal > 0 ? `+${enchantTotal}` : '—',
      stats.resolve('weapon.enchantment').bonuses, enchantTotal === 0),
    fixedRow('Base Damage Mod', baseDamageTotal, sign(baseDamageTotal),
      stats.resolve('weapon.baseDamage').bonuses, baseDamageTotal === 0),
    fixedRow('Threat Range',  totalThreatRange, threatDisplay, threatBonuses),
    fixedRow('Crit Multiplier', totalCritMult, `×${totalCritMult}`,
      critMultBonuses, bonusCritMult === 0),
    fixedRow('Vorpal Range',  vorpalRangeBonus, vorpalDisplay,
      stats.resolve('weapon.vorpal').bonuses, vorpalRangeBonus === 0),
    fixedRow('Attack Speed',  alacrityTotal, pct(alacrityTotal),
      stats.resolve('weapon.alacrity').bonuses, alacrityTotal === 0),
    statRow('Doublestrike',   'melee.doublestrike', pct),
    statRow('Sneak Atk Dice', 'melee.sneakDice'),
    statRow('Sneak Atk Dmg',  'melee.sneakDamage', sign),
    statRow('Strikethrough',  'melee.strikethrough', pct),
  ]

  const rangedStats: StatRowData[] = [
    statRow('Ranged Power',   'ranged.power',      sign),
    fixedRow('To-Hit Bonus',  rangedToHitTotal, sign(rangedToHitTotal),
      [...stats.resolve('bab').bonuses, ...stats.resolve('ranged.toHit').bonuses]),
    fixedRow('Threat Range',  20, '20',  [{ value: 20, type: 'Base', source: 'Base', active: true }]),
    fixedRow('Crit Multiplier', 2, '×2', [{ value: 2,  type: 'Base', source: 'Base', active: true }]),
    fixedRow('Attack Speed',  alacrityTotal, pct(alacrityTotal),
      stats.resolve('weapon.alacrity').bonuses, alacrityTotal === 0),
    statRow('Doubleshot',     'ranged.doubleshot', pct),
    statRow('Sneak Atk Dmg',  'ranged.sneakDamage', sign),
  ]

  // V2 BreakdownItemCasterLevel: per-class effective caster level + cap. Lifted
  // out of spellStats into a dedicated "Caster Levels" section below so that
  // the Spellcasting section stays focused on SP / penetration / DCs and the
  // CL family can grow (energy CL etc.) without crowding it.
  const casterLevelStats: StatRowData[] = casterClasses.map(({ name }) => {
    const cl = stats.casterLevelOf(name)
    const display = cl.capped ? `${cl.total} (capped from ${cl.raw})` : String(cl.total)
    return fixedRow(`${name} CL`, cl.total, display, cl.bonuses)
  })

  const spellStats: StatRowData[] = [
    fixedRow('Spell Points', spTotal, String(spTotal), stats.resolve('spellPoints').bonuses, spTotal === 0),
    statRow('Spell Penetration', 'spellPenetration'),
    ...SCHOOL_DCS.map(school => statRow(`${school} DC`, `dc.${school}`)),
  ]

  const initiativeTotal  = stats.total('initiative')
  const skillPointsTotal = stats.total('skillPoints')
  const babDisplay = bab.capped ? `${sign(bab.total)} (capped from ${sign(bab.raw)})` : sign(bab.total)
  const miscStats: StatRowData[] = [
    fixedRow('BAB',        babTotal,        babDisplay,            bab.bonuses),
    fixedRow('Initiative', initiativeTotal, sign(initiativeTotal), stats.resolve('initiative').bonuses),
    fixedRow('Skill Pts',  skillPointsTotal, String(skillPointsTotal), stats.resolve('skillPoints').bonuses),
    statRow('Off-hand Atk', 'offhand.attack', pct),
    statRow('Helpless Dmg', 'helpless',        pct),
  ]

  // ── V2 BreakdownItem parity: stat groups newly populated by slice 1 ─────
  const healAmpStats: StatRowData[] = HEAL_AMP_KEYS
    .map(({ key, label }) => statRow(label, key, pct))
    .filter(s => s.total !== 0)

  const tacticalStats: StatRowData[] = TACTICAL_TYPES
    .map(({ key, label }) => statRow(`${label} DC`, `tacticalDC.${key}`))
    .filter(s => s.total !== 0)

  const threatStats: StatRowData[] = THREAT_KEYS
    .map(({ key, label }) => statRow(label, key, pct))
    .filter(s => s.total !== 0)

  const turnUndeadStats: StatRowData[] = TURN_UNDEAD_KEYS
    .map(({ key, label }) => statRow(label, key))
    .filter(s => s.total !== 0)

  // V2 Bypass family + per-material DR bypass
  const bypassRows: StatRowData[] = []
  for (const { key, label } of BYPASS_KEYS) {
    const r = stats.resolve(key)
    if (r.bonuses.length > 0) bypassRows.push(fixedRow(label, r.total, sign(r.total), r.bonuses))
  }
  const drBypassKeys = stats.keys().filter(k => k.startsWith('drBypass.'))
  for (const k of drBypassKeys) {
    const material = k.slice('drBypass.'.length)
    const r = stats.resolve(k)
    if (r.total > 0) {
      bypassRows.push(fixedRow(`DR Bypass: ${material}`, r.total, String(r.total), r.bonuses))
    }
  }

  // Immunities — surfaced in slice 1 as 'immunity.<type>'
  const immunityRows: StatRowData[] = stats
    .keys()
    .filter(k => k.startsWith('immunity.'))
    .map(k => {
      const t = k.slice('immunity.'.length)
      const r = stats.resolve(k)
      return fixedRow(`Immunity: ${t}`, r.total, '✓', r.bonuses)
    })

  // Metamagic cost reductions — surfaced as 'metamagic.cost.<name>' (slice 1)
  const metamagicRows: StatRowData[] = stats
    .keys()
    .filter(k => k.startsWith('metamagic.cost.'))
    .map(k => {
      const t = k.slice('metamagic.cost.'.length)
      const r = stats.resolve(k)
      return fixedRow(`${t} Cost`, r.total, sign(r.total), r.bonuses)
    })
    .filter(s => s.total !== 0)

  // Spell cost reductions — 'spellCost.<element>' + 'spellCostPct'
  const spellCostRows: StatRowData[] = []
  for (const k of stats.keys().filter(kk => kk.startsWith('spellCost.'))) {
    const t = k.slice('spellCost.'.length)
    const r = stats.resolve(k)
    if (r.total !== 0) {
      spellCostRows.push(fixedRow(`Spell Cost (${t})`, r.total, sign(r.total), r.bonuses))
    }
  }
  {
    const r = stats.resolve('spellCostPct')
    if (r.total !== 0) {
      spellCostRows.push(fixedRow('Spell Cost %', r.total, pct(r.total), r.bonuses))
    }
  }

  // Action boost / class extras — surfaced as discrete keys (slice 1)
  const EXTRAS_KEYS = [
    { key: 'actionBoost.extra',   label: 'Extra Action Boosts' },
    { key: 'lohExtra',            label: 'Extra Lay on Hands' },
    { key: 'lohRegen',            label: 'LoH Regen Rate' },
    { key: 'rageExtra',           label: 'Extra Rages' },
    { key: 'smiteExtra',          label: 'Extra Smites' },
    { key: 'removeDiseaseExtra',  label: 'Extra Remove Disease' },
    { key: 'wildEmpathyExtra',    label: 'Extra Wild Empathy' },
    { key: 'fatePoint',           label: 'Fate Points' },
    { key: 'destinyAP',           label: 'Destiny AP Bonus' },
    { key: 'reaperAP',            label: 'Reaper AP Bonus' },
    { key: 'universalAP',         label: 'Universal AP Bonus' },
  ] as const
  const extrasRows: StatRowData[] = EXTRAS_KEYS
    .map(({ key, label }) => statRow(label, key))
    .filter(s => s.total !== 0)

  // Spell-specific / school / energy caster levels — beyond the per-class view
  const spellSpecificCLRows: StatRowData[] = []
  for (const k of stats.keys()) {
    if (k.startsWith('clSpell.')) {
      const t = k.slice('clSpell.'.length)
      const r = stats.resolve(k)
      if (r.total !== 0) spellSpecificCLRows.push(fixedRow(`CL: ${t}`, r.total, sign(r.total), r.bonuses))
    } else if (k.startsWith('maxClSpell.')) {
      const t = k.slice('maxClSpell.'.length)
      const r = stats.resolve(k)
      if (r.total !== 0) spellSpecificCLRows.push(fixedRow(`Max CL: ${t}`, r.total, String(r.total), r.bonuses))
    } else if (k.startsWith('clSchool.')) {
      const t = k.slice('clSchool.'.length)
      const r = stats.resolve(k)
      if (r.total !== 0) spellSpecificCLRows.push(fixedRow(`CL: ${t} school`, r.total, sign(r.total), r.bonuses))
    } else if (k.startsWith('clEnergy.')) {
      const t = k.slice('clEnergy.'.length)
      const r = stats.resolve(k)
      if (r.total !== 0) spellSpecificCLRows.push(fixedRow(`CL: ${t}`, r.total, sign(r.total), r.bonuses))
    }
  }

  // ── V2 BreakdownItemEnergyCasterLevel: per-element effective CL ──────────
  // V2 formula: highest casting class CL + Effect_CasterLevelEnergy (clEnergy.<X>)
  //             + universal CL bonuses (cl.All).
  // Hide elements with 0 contribution (no clEnergy.<X> bonuses present).
  const energyCLRows: StatRowData[] = (() => {
    // Highest casting class CL across the build's casting classes.
    let bestClassName: string | null = null
    let bestClassCL = 0
    for (const { name } of casterClasses) {
      const cl = stats.casterLevelOf(name)
      if (cl.total > bestClassCL) {
        bestClassCL = cl.total
        bestClassName = name
      }
    }
    if (!bestClassName) return []

    const rows: StatRowData[] = []
    for (const energyKey of stats.keys()) {
      if (!energyKey.startsWith('clEnergy.')) continue
      const elem = energyKey.slice('clEnergy.'.length)
      const energyResolved = stats.resolve(energyKey)
      if (energyResolved.total === 0) continue
      const total = bestClassCL + energyResolved.total
      const label = SPELL_POWER_LABELS[elem] ?? elem
      // V2: per-element CL = class CL (which already includes cl.All) +
      // clEnergy.<X> bonuses. Surface the class CL summary row + per-element
      // bonuses in the tooltip.
      const bonuses: ResolvedBonus[] = [
        {
          value: bestClassCL,
          type: 'Caster Level',
          source: `${bestClassName} effective CL (incl. universal CL)`,
          active: true,
        },
        ...energyResolved.bonuses,
      ]
      rows.push(fixedRow(`${label} CL`, total, String(total), bonuses))
    }
    return rows
  })()

  // ── Weapon Crit & On-Hit (slice 4b parser keys) ──────────────────────────
  const weaponCritRows: StatRowData[] = []
  {
    const keen = stats.resolve('weapon.keen')
    weaponCritRows.push({
      label: 'Keen',
      total: keen.total,
      display: keen.total > 0 ? '✓' : '—',
      bonuses: keen.bonuses,
      dim: keen.total === 0,
    })

    const cm1920 = stats.resolve('weapon.critMult19to20')
    weaponCritRows.push({
      label: 'Crit Mult (19-20)',
      total: cm1920.total,
      display: cm1920.total !== 0 ? `×${cm1920.total}` : '—',
      bonuses: cm1920.bonuses,
      dim: cm1920.total === 0,
    })

    const toHitCrit = stats.resolve('weapon.toHitCrit')
    weaponCritRows.push({
      label: 'Crit-only To-Hit',
      total: toHitCrit.total,
      display: sign(toHitCrit.total),
      bonuses: toHitCrit.bonuses,
      dim: toHitCrit.total === 0,
    })

    const damageCrit = stats.resolve('weapon.damageCrit')
    weaponCritRows.push({
      label: 'Crit-only Damage',
      total: damageCrit.total,
      display: sign(damageCrit.total),
      bonuses: damageCrit.bonuses,
      dim: damageCrit.total === 0,
    })

    const otherDamage = stats.resolve('weapon.otherDamage')
    weaponCritRows.push({
      label: 'On-Hit Damage Bonus',
      total: otherDamage.total,
      display: sign(otherDamage.total),
      bonuses: otherDamage.bonuses,
      dim: otherDamage.total === 0,
    })

    const otherDamageCrit = stats.resolve('weapon.otherDamageCrit')
    weaponCritRows.push({
      label: 'On-Hit Crit Bonus',
      total: otherDamageCrit.total,
      display: sign(otherDamageCrit.total),
      bonuses: otherDamageCrit.bonuses,
      dim: otherDamageCrit.total === 0,
    })

    for (const k of stats.keys()) {
      if (k.startsWith('weapon.attackAbility.')) {
        const ab = k.slice('weapon.attackAbility.'.length)
        const r = stats.resolve(k)
        weaponCritRows.push({
          label: `Attack Ability: ${ab}`,
          total: r.total,
          display: r.total > 0 ? '✓' : '—',
          bonuses: r.bonuses,
          dim: r.total === 0,
        })
      } else if (k.startsWith('weapon.damageAbilityCrit.')) {
        const ab = k.slice('weapon.damageAbilityCrit.'.length)
        const r = stats.resolve(k)
        weaponCritRows.push({
          label: `Crit Damage Ability: ${ab}`,
          total: r.total,
          display: r.total > 0 ? '✓' : '—',
          bonuses: r.bonuses,
          dim: r.total === 0,
        })
      } else if (k.startsWith('weapon.damageAbility.')) {
        const ab = k.slice('weapon.damageAbility.'.length)
        const r = stats.resolve(k)
        weaponCritRows.push({
          label: `Damage Ability: ${ab}`,
          total: r.total,
          display: r.total > 0 ? '✓' : '—',
          bonuses: r.bonuses,
          dim: r.total === 0,
        })
      }
    }
  }
  const weaponCritVisible = weaponCritRows.filter(r => !r.dim)

  // ── Class Resources (Ki / Rune Arm / Dragonmark) ─────────────────────────
  const classResourceRows: StatRowData[] = []
  {
    const KI_KEYS = [
      { key: 'ki.critical', label: 'Ki: Critical Bonus' },
      { key: 'ki.hit',      label: 'Ki: Hit Bonus' },
      { key: 'ki.max',      label: 'Ki: Max' },
      { key: 'ki.passive',  label: 'Ki: Passive Regen' },
    ] as const
    for (const { key, label } of KI_KEYS) {
      const r = stats.resolve(key)
      if (r.total !== 0) {
        classResourceRows.push(fixedRow(label, r.total, sign(r.total), r.bonuses))
      }
    }

    const ra1 = stats.resolve('runeArm.chargeRate')
    if (ra1.total !== 0) {
      classResourceRows.push(fixedRow('Rune Arm Charge Rate', ra1.total, sign(ra1.total), ra1.bonuses))
    }
    const ra2 = stats.resolve('runeArm.stableCharge')
    if (ra2.total !== 0) {
      classResourceRows.push(fixedRow('Rune Arm Stable Charge', ra2.total, sign(ra2.total), ra2.bonuses))
    }

    const dm = stats.resolve('dragonmark.uses')
    if (dm.total !== 0) {
      classResourceRows.push(fixedRow('Dragonmark Uses', dm.total, sign(dm.total), dm.bonuses))
    }
  }

  // V2 BreakdownItemWeapon family — per-equipped-weapon detail. We don't yet
  // split the weapon.* stat aggregates into mainhand/offhand stats (a deeper
  // refactor); instead we show each equipped weapon's intrinsic data alongside
  // the global weapon.* aggregate so the build's per-hand picture is clear.
  function gearLookup(...keys: string[]): { item: Item; slot: string } | null {
    for (const k of keys) {
      const it = gearItems[k]
      if (it) return { item: it, slot: k }
    }
    return null
  }
  function buildWeaponRows(slotLabel: string, hit: { item: Item; slot: string } | null): StatRowData[] {
    if (!hit?.item.Weapon) return []
    const item = hit.item
    const rows: StatRowData[] = []
    rows.push({
      label: 'Weapon',
      total: 0,
      display: `${item.Name} (${item.Weapon})`,
      bonuses: [{ value: 0, type: 'Equipped', source: `${slotLabel}: ${item.Name}`, active: true }],
    })
    if (item.BaseDice) {
      const dmgMult = item.WeaponDamage ?? 1
      const display = dmgMult !== 1
        ? `${item.BaseDice.Number}d${item.BaseDice.Sides} ×${dmgMult}`
        : `${item.BaseDice.Number}d${item.BaseDice.Sides}`
      rows.push({
        label: 'Base Damage',
        total: 0,
        display,
        bonuses: [{ value: 0, type: 'Base', source: `${item.Name} dice`, active: true }],
      })
    }
    if (item.CriticalMultiplier != null) {
      const bonus = stats.total('weapon.critMult')
      const total = item.CriticalMultiplier + bonus
      rows.push({
        label: 'Crit Multiplier',
        total,
        display: `×${total}`,
        bonuses: [
          { value: item.CriticalMultiplier, type: 'Base', source: `${item.Name}`, active: true },
          ...stats.resolve('weapon.critMult').bonuses,
        ],
      })
    }
    if (item.CriticalThreatRange != null) {
      const bonus = stats.total('weapon.threatRange')
      const total = item.CriticalThreatRange + bonus
      const display = total > 1 ? `${21 - total}–20` : '20'
      rows.push({
        label: 'Threat Range',
        total,
        display,
        bonuses: [
          { value: item.CriticalThreatRange, type: 'Base', source: `${item.Name}`, active: true },
          ...stats.resolve('weapon.threatRange').bonuses,
        ],
      })
    }
    if (item.AttackModifier) {
      const ams = Array.isArray(item.AttackModifier) ? item.AttackModifier : [item.AttackModifier]
      rows.push({
        label: 'Attack Mod',
        total: 0,
        display: ams.join(' / '),
        bonuses: [{ value: 0, type: 'Base', source: `${item.Name}`, active: true }],
      })
    }
    const drBypass = Array.isArray(item.DRBypass) ? item.DRBypass : (item.DRBypass ? [item.DRBypass] : [])
    if (drBypass.length > 0) {
      rows.push({
        label: 'DR Bypass',
        total: 0,
        display: drBypass.join(', '),
        bonuses: [{ value: 0, type: 'Base', source: `${item.Name}`, active: true }],
      })
    }
    return rows
  }
  const mainHand = gearLookup('Weapon1', 'MainHand', 'Weapon')
  const offHand  = gearLookup('Weapon2', 'OffHand')
  const mainWeaponRows = buildWeaponRows('Main hand', mainHand)
  const offWeaponRows  = buildWeaponRows('Off hand', offHand)

  // V2 on-hit dice damage (e.g. flaming weapon's +6d6 Fire). These are emitted
  // by the effect parser as 'weapon.diceDamage.<DamageType>' with the *average*
  // dice value (Number * (Sides + 1) / 2). We don't currently round-trip the
  // raw XdY notation, so only the average is shown.
  const onHitDamageRows: StatRowData[] = stats
    .keys()
    .filter(k => k.startsWith('weapon.diceDamage.'))
    .map(k => {
      const dmg = k.slice('weapon.diceDamage.'.length)
      const r = stats.resolve(k)
      return fixedRow(`${dmg}: avg ${r.total}`, r.total, sign(r.total), r.bonuses)
    })
    .filter(s => s.total !== 0)

  // ── V2 Spell Damage (BreakdownItemDice + Spell::SpellDamageText port) ────
  // For each spell whose <SpellDamage> block has a SpellPower scaler matching
  // one of the build's casting elements, compute expected hit / crit damage:
  //
  //   dice          = BaseDice.Number + BonusDice.Number * floor(CL / PerCasterLevels)
  //                   (clamped at MaxCasterLevel if present)
  //   base          = dice * ((Sides + 1) / 2 + Bonus)   // expected die roll
  //   dpsBase       = base * (1 + spellPower / 100)
  //   dpsWithCrit   = dpsBase * (1 + (critPct / 100) * (critMult - 1))
  //
  // V2 BreakdownItemSpellDamage uses the *casting class's* per-class caster
  // level, not the character's total level. We resolve which class casts each
  // spell via the Class XML <ClassSpell> entries (buildSpellClassIndex), then
  // pick the highest CL among the build's classes that know the spell. Spells
  // no class in the build can cast are hidden (V2 doesn't show them either).
  function num(v: number | string | undefined, fallback = 0): number {
    if (v == null) return fallback
    if (typeof v === 'number') return v
    const n = Number(v)
    return Number.isFinite(n) ? n : fallback
  }
  type SpellDmgRow = {
    spell: Spell
    school: string
    name: string
    dpsBase: number
    dpsCrit: number
    diceText: string                  // e.g. "5d6+5 Fire"
    spellPower: number
    critPct: number
    critMult: number
    spBonuses: ResolvedBonus[]
    critBonuses: ResolvedBonus[]
    cl: number
    castingClass: string
    damage: string
    powerKey: string
  }

  // Spell -> class names index (memoized: rebuilds only when the class XML
  // pool changes). A spell may belong to multiple classes (e.g. Magic Missile
  // is on both the Wizard and Sorcerer lists).
  const spellClassIndex = useMemo(() => buildSpellClassIndex(allClasses), [allClasses])
  const buildClassNames = useMemo(
    () => build.classes.filter(c => c.name && c.levels > 0).map(c => c.name),
    [build.classes],
  )

  const spellDamageRows: SpellDmgRow[] = []
  {
    for (const spell of allSpells) {
      const damages = spell.SpellDamage == null
        ? []
        : Array.isArray(spell.SpellDamage) ? spell.SpellDamage : [spell.SpellDamage]
      if (damages.length === 0) continue                                   // utility spell, skip

      // V2 parity: pick the highest-CL casting class in the build that knows
      // this spell. If none of the build's classes can cast it, hide the row.
      const knownBy = spellClassIndex.get(spell.Name) ?? []
      let bestClass = ''
      let bestCL = -1
      for (const c of knownBy) {
        if (!buildClassNames.includes(c)) continue
        const cl = stats.casterLevelOf(c).total
        if (cl > bestCL) { bestCL = cl; bestClass = c }
      }
      if (bestCL < 0) continue   // no class in the build knows this spell

      const maxCL = num(spell.MaxCasterLevel, Infinity)
      const effCL = Math.min(maxCL, bestCL)
      const castingClass = bestClass

      for (const dmg of damages) {
        const rawPower = dmg.SpellPower
        if (!rawPower) continue                                            // un-scaled (rare); skip
        // V2 stat keys collapse 'Light' / 'Alignment' / 'Light/Alignment'
        // into a single 'LightAlignment' bucket — match that here so the
        // stats.total('sp.…') lookup hits the right slot.
        const powerKey =
          (rawPower === 'Light/Alignment' || rawPower === 'Light' || rawPower === 'Alignment')
            ? 'LightAlignment'
            : rawPower
        const sd = dmg.SpellDice
        if (!sd) continue
        const base = sd.BaseDice
        const bonus = sd.BonusDice
        const perCL = Math.max(1, num(sd.PerCasterLevels, 1))

        // BaseDice = flat dice (always rolled). BonusDice = scales with CL
        // (1 instance per `perCL` caster levels).
        const baseN = num(base?.Number, 0)
        const baseS = num(base?.Sides, 0)
        const baseB = num(base?.Bonus, 0)
        const bonusN = num(bonus?.Number, 0)
        const bonusS = num(bonus?.Sides, 0)
        const bonusB = num(bonus?.Bonus, 0)

        const stacks = Math.floor(effCL / perCL)
        const baseAvg = baseN > 0 && baseS > 0
          ? baseN * ((baseS + 1) / 2) + baseB
          : 0
        const bonusAvgPerStack = bonusN > 0 && bonusS > 0
          ? bonusN * ((bonusS + 1) / 2) + bonusB
          : 0
        const totalAvg = baseAvg + bonusAvgPerStack * stacks
        if (totalAvg <= 0) continue

        const sp = stats.total(`sp.${powerKey}`) + stats.total('sp.Universal')
        const critPct = Math.min(100, 5 + stats.total(`spCrit.${powerKey}`) + stats.total('spCrit.Universal'))
        const critMult = 1.5

        const dpsBase = totalAvg * (1 + sp / 100)
        const dpsCrit = dpsBase * (1 + (critPct / 100) * (critMult - 1))

        const parts: string[] = []
        if (baseN > 0 && baseS > 0) {
          parts.push(`${baseN}d${baseS}${baseB ? sign(baseB) : ''}`)
        }
        if (bonusN > 0 && bonusS > 0 && stacks > 0) {
          const totalDice = bonusN * stacks
          const totalFlatBonus = bonusB * stacks
          parts.push(`${totalDice}d${bonusS}${totalFlatBonus ? sign(totalFlatBonus) : ''}`)
        } else if (bonusN > 0 && bonusS > 0) {
          parts.push(`${bonusN}d${bonusS}${bonusB ? sign(bonusB) : ''}/${perCL}CL`)
        }
        const diceText = `${parts.join(' + ') || '—'} ${dmg.Damage ?? ''}`.trim()

        const spBonuses: ResolvedBonus[] = [
          ...stats.resolve(`sp.${powerKey}`).bonuses,
          ...stats.resolve('sp.Universal').bonuses,
        ]
        const critBonuses: ResolvedBonus[] = [
          { value: 5, type: 'Base', source: 'Base spell crit (5%)', active: true },
          ...stats.resolve(`spCrit.${powerKey}`).bonuses,
          ...stats.resolve('spCrit.Universal').bonuses,
        ]

        spellDamageRows.push({
          spell,
          school: spell.School ?? 'Unknown',
          name: spell.Name,
          dpsBase,
          dpsCrit,
          diceText,
          spellPower: sp,
          critPct,
          critMult,
          spBonuses,
          critBonuses,
          cl: effCL,
          castingClass,
          damage: dmg.Damage ?? '',
          powerKey,
        })
      }
    }
  }
  // Group by school for display. We do NOT filter by "schools the build can
  // cast"; surfacing every damage spell is more useful than guessing wrong,
  // and the spell power column already grays out non-relevant entries.
  const spellDamageBySchool = new Map<string, SpellDmgRow[]>()
  for (const row of spellDamageRows) {
    let arr = spellDamageBySchool.get(row.school)
    if (!arr) { arr = []; spellDamageBySchool.set(row.school, arr) }
    arr.push(row)
  }
  for (const arr of spellDamageBySchool.values()) {
    arr.sort((a, b) => a.name.localeCompare(b.name))
  }
  const spellSchoolsSorted = [...spellDamageBySchool.keys()].sort()

  const skillStats: StatRowData[] = SKILLS.map(({ name }) => {
    const resolved = stats.resolve(`skill.${name}`)
    return {
      label:   name,
      total:   resolved.total,
      display: sign(resolved.total),
      bonuses: resolved.bonuses,
      dim:     resolved.total <= 0,
    }
  })

  // Patron favor totals + tier rank for the optional Patron Favor section.
  // Computed inline so we can render an empty section conditionally.
  const patronFavorRows: Array<{ name: string; total: number; rank: number; maxTier: number }> = []
  {
    const totals = computePatronFavorTotals(build.completedQuests ?? {}, allQuests)
    for (const patron of allPatrons) {
      const total = totals.get(patron.Name) ?? 0
      if (total <= 0) continue
      const tiersRaw = patron.FavorTiers
      const tiers: number[] = (() => {
        if (tiersRaw == null) return []
        if (typeof tiersRaw === 'string') return tiersRaw.split(/\s+/).map(Number).filter(n => !isNaN(n))
        if (typeof tiersRaw === 'number') return [tiersRaw]
        if (typeof tiersRaw === 'object') {
          const obj = tiersRaw as Record<string, unknown>
          const text = obj['#text']
          if (typeof text === 'string') return text.split(/\s+/).map(Number).filter(n => !isNaN(n))
          if (typeof text === 'number') return [text]
        }
        return []
      })()
      patronFavorRows.push({
        name: patron.Name,
        total,
        rank: favorRankForTotal(total, tiers),
        maxTier: tiers.length,
      })
    }
  }

  const hasCharacter = build.race || build.classes.some(c => c.name)

  return (
    <div className="panel" ref={panelRef} style={{ position: 'relative' }}>
      <div className="panel-header">Analysis</div>

      {tip && <Tooltip tip={tip} onHide={hideTip} />}

      <div className="panel-body" style={{ padding: '8px 0' }}>
        {!hasCharacter ? (
          <p className={styles.empty}>Select a race and classes to see stats.</p>
        ) : (
          <div className={styles.sections}>

            <Section title="Ability Scores">
              <div className={styles.abilityGrid}>
                {ABILITIES.map(ab => {
                  const resolved = stats.resolve(`ability.${ab}`)
                  const score = resolved.total
                  const mod   = abMod(score)
                  const display = `${score}  (${sign(mod)})`
                  return (
                    <div
                      key={ab}
                      className={styles.abilityCell}
                      onMouseEnter={e => {
                        const r = (e.currentTarget as HTMLElement).getBoundingClientRect()
                        setTip({ label: ab, display, bonuses: resolved.bonuses, x: r.right, y: r.top })
                      }}
                      onMouseLeave={hideTip}
                    >
                      <span className={styles.abLabel}>{AB3[ab]}</span>
                      <span className={styles.abScore}>{score}</span>
                      <span className={styles.abMod}>{sign(mod)}</span>
                    </div>
                  )
                })}
              </div>
            </Section>

            <Section title="Saving Throws">
              {saveStats.map(s => <StatRow key={s.label + (s.indent ? '-sub' : '')} stat={s} onTip={setTip} />)}
            </Section>

            <Section title="Defense">
              {defenseStats.map(s => <StatRow key={s.label} stat={s} onTip={setTip} />)}
            </Section>

            {energyStats.length > 0 && (
              <Section title="Energy Resistance &amp; DR">
                {energyStats.map(s => <StatRow key={s.label} stat={s} onTip={setTip} />)}
              </Section>
            )}

            <Section title="Melee">
              {meleeStats.map(s => <StatRow key={s.label} stat={s} onTip={setTip} />)}
            </Section>

            <Section title="Ranged">
              {rangedStats.map(s => <StatRow key={s.label} stat={s} onTip={setTip} />)}
            </Section>

            <Section title="Spell Powers">
              <div className={styles.spNote}>Hover any value to see sources.</div>
              <table className={styles.spTable}>
                <thead>
                  <tr>
                    <th className={styles.spName}>Type</th>
                    <th className={styles.spHead}>Power</th>
                    <th className={styles.spHead}>Crit %</th>
                    <th className={styles.spHead}>Crit ×</th>
                  </tr>
                </thead>
                <tbody>
                  {SPELL_POWER_TYPES.map(spKey => (
                    <SpellPowerRow
                      key={spKey}
                      name={SPELL_POWER_LABELS[spKey] ?? spKey}
                      spKey={spKey}
                      stats={stats}
                      onTip={setTip}
                    />
                  ))}
                </tbody>
              </table>
            </Section>

            <Section title="Spellcasting" defaultOpen={spellStats.some(s => !s.dim)}>
              {spellStats.map(s => <StatRow key={s.label} stat={s} onTip={setTip} />)}
            </Section>

            {casterLevelStats.length > 0 && (
              <Section title="Caster Levels" defaultOpen={casterLevelStats.length > 0}>
                {casterLevelStats.map(s => <StatRow key={s.label} stat={s} onTip={setTip} />)}
              </Section>
            )}

            <Section title="Combat">
              {miscStats.map(s => <StatRow key={s.label} stat={s} onTip={setTip} />)}
            </Section>

            {threatStats.length > 0 && (
              <Section title="Threat" defaultOpen={false}>
                {threatStats.map(s => <StatRow key={s.label} stat={s} onTip={setTip} />)}
              </Section>
            )}

            {tacticalStats.length > 0 && (
              <Section title="Tactical DCs" defaultOpen={false}>
                {tacticalStats.map(s => <StatRow key={s.label} stat={s} onTip={setTip} />)}
              </Section>
            )}

            {turnUndeadStats.length > 0 && (
              <Section title="Turn Undead" defaultOpen={false}>
                {turnUndeadStats.map(s => <StatRow key={s.label} stat={s} onTip={setTip} />)}
              </Section>
            )}

            {healAmpStats.length > 0 && (
              <Section title="Healing Amplification" defaultOpen={false}>
                {healAmpStats.map(s => <StatRow key={s.label} stat={s} onTip={setTip} />)}
              </Section>
            )}

            {bypassRows.length > 0 && (
              <Section title="Bypasses" defaultOpen={false}>
                {bypassRows.map(s => <StatRow key={s.label} stat={s} onTip={setTip} />)}
              </Section>
            )}

            {immunityRows.length > 0 && (
              <Section title="Immunities" defaultOpen={false}>
                {immunityRows.map(s => <StatRow key={s.label} stat={s} onTip={setTip} />)}
              </Section>
            )}

            {extrasRows.length > 0 && (
              <Section title="Class Extras &amp; AP Bonuses" defaultOpen={false}>
                {extrasRows.map(s => <StatRow key={s.label} stat={s} onTip={setTip} />)}
              </Section>
            )}

            {spellSpecificCLRows.length > 0 && (
              <Section title="Spell / School Caster Level" defaultOpen={false}>
                {spellSpecificCLRows.map(s => <StatRow key={s.label} stat={s} onTip={setTip} />)}
              </Section>
            )}

            {spellCostRows.length > 0 && (
              <Section title="Spell Cost Reductions" defaultOpen={false}>
                {spellCostRows.map(s => <StatRow key={s.label} stat={s} onTip={setTip} />)}
              </Section>
            )}

            {metamagicRows.length > 0 && (
              <Section title="Metamagic Costs" defaultOpen={false}>
                {metamagicRows.map(s => <StatRow key={s.label} stat={s} onTip={setTip} />)}
              </Section>
            )}

            {patronFavorRows.length > 0 && (
              <Section title="Patron Favor" defaultOpen={false}>
                {patronFavorRows.map(r => (
                  <div key={r.name} className={styles.row}>
                    <span className={styles.label}>{r.name}</span>
                    <span className={styles.value}>
                      {r.total} (tier {r.rank}/{r.maxTier})
                    </span>
                  </div>
                ))}
              </Section>
            )}

            {weaponCritVisible.length > 0 && (
              <Section title="Weapon Crit &amp; On-Hit" defaultOpen={false}>
                {weaponCritRows.map(s => <StatRow key={s.label} stat={s} onTip={setTip} />)}
              </Section>
            )}

            {classResourceRows.length > 0 && (
              <Section title="Class Resources" defaultOpen={false}>
                {classResourceRows.map(s => <StatRow key={s.label} stat={s} onTip={setTip} />)}
              </Section>
            )}

            {mainWeaponRows.length > 0 && (
              <Section title="Main Hand Weapon" defaultOpen={false}>
                {mainWeaponRows.map(s => <StatRow key={s.label} stat={s} onTip={setTip} />)}
              </Section>
            )}

            {offWeaponRows.length > 0 && (
              <Section title="Off Hand Weapon" defaultOpen={false}>
                {offWeaponRows.map(s => <StatRow key={s.label} stat={s} onTip={setTip} />)}
              </Section>
            )}

            {onHitDamageRows.length > 0 && (
              <Section title="On-Hit Damage" defaultOpen={false}>
                {onHitDamageRows.map(s => <StatRow key={s.label} stat={s} onTip={setTip} />)}
              </Section>
            )}

            {spellDamageRows.length > 0 && (
              <Section title="Spell Damage" defaultOpen={false}>
                {spellSchoolsSorted.map(school => (
                  <div key={school}>
                    <div className={styles.spellSchoolHeader}>{school}</div>
                    {spellDamageBySchool.get(school)!.map(row => {
                      const display = `${Math.floor(row.dpsBase)} (${Math.floor(row.dpsCrit)} w/crit)`
                      const tipBonuses: ResolvedBonus[] = [
                        { value: row.cl, type: 'CL', source: `${row.castingClass} caster level (cap ${row.spell.MaxCasterLevel != null ? num(row.spell.MaxCasterLevel, 0) : '—'})`, active: true },
                        { value: 0, type: 'Dice', source: row.diceText, active: true },
                        { value: row.spellPower, type: 'Spell Power', source: `${row.powerKey} + Universal`, active: true },
                        ...row.spBonuses,
                        { value: Number(row.critPct.toFixed(1)), type: 'Crit %', source: `${row.powerKey} crit chance`, active: true },
                        ...row.critBonuses,
                        { value: row.critMult, type: 'Crit ×', source: 'Base critical multiplier', active: true },
                      ]
                      return (
                        <div
                          key={`${row.name}|${row.powerKey}|${row.damage}`}
                          className={`${styles.row} ${styles.spellDmgRow}`}
                          onMouseEnter={e => {
                            const r = (e.currentTarget as HTMLElement).getBoundingClientRect()
                            setTip({
                              label: `${row.name}${row.damage ? ` (${row.damage})` : ''}`,
                              display, bonuses: tipBonuses, x: r.right, y: r.top,
                            })
                          }}
                          onMouseLeave={hideTip}
                        >
                          <span className={styles.label}>{row.name}{row.damage ? ` (${row.damage})` : ''}</span>
                          <span className={`${styles.value} ${styles.spellDmgValue}`}>{display}</span>
                        </div>
                      )
                    })}
                  </div>
                ))}
              </Section>
            )}

            {energyCLRows.length > 0 && (
              <Section title="Energy Caster Levels" defaultOpen={false}>
                {energyCLRows.map(s => <StatRow key={s.label} stat={s} onTip={setTip} />)}
              </Section>
            )}

            <Section title="Skills" defaultOpen={false}>
              {skillStats.map(s => <StatRow key={s.label} stat={s} onTip={setTip} />)}
            </Section>

          </div>
        )}
      </div>
    </div>
  )
}
