import { useEffect, useState, useRef, useCallback, useMemo } from 'react'
import { api } from '../../api'
import { useCharacter } from '../../context/CharacterContext'
import type { DDOClass, Race, Feat, EnhancementTree, Item, Augment, SetBonus, FiligreeSetBonus, Filigree, OptionalBuff } from '../../types/ddo'
import { useBuildStats } from '../../hooks/useBuildStats'
import type { ResolvedBonus } from '../../lib/bonus'
import { SKILLS, SCHOOL_DCS, SPELL_POWER_TYPES, SPELL_POWER_LABELS } from '../../lib/gamedata'
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
  const [gearItems,         setGearItems]         = useState<Record<string, Item>>({})
  const [tip, setTip] = useState<TipState | null>(null)
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
    }),
    [allClasses, allRaces, allFeats, allTrees, gearItems,
     allSelfBuffs, allAugments, allSetBonuses, allFiligreeBonuses, allFiligrees],
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
  const mrrCapTotal = stats.total('mrrCap')
  const spTotal = stats.total('spellPoints')
  // V2: BAB capped at MAX_BAB (25)
  const babRaw = stats.total('bab')
  const babTotal = Math.min(25, babRaw)
  const prrTotal = stats.total('prr')
  const mrrTotal = stats.total('mrr')

  // Mitigation % = 100 - (100 / (100 + value)) * 100
  function mitigation(n: number): string {
    if (n === 0) return '+0'
    const pctVal = 100 - (100 / (100 + n)) * 100
    return `${sign(n)} (${pctVal.toFixed(1)}%)`
  }

  const defenseStats: StatRowData[] = [
    fixedRow('Hit Points', hpTotal, String(hpTotal), stats.resolve('hp').bonuses, hpTotal === 0),
    fixedRow('AC', acTotal, String(acTotal), stats.resolve('ac').bonuses, acTotal <= 10),
    fixedRow('PRR', prrTotal, mitigation(prrTotal), stats.resolve('prr').bonuses, prrTotal === 0),
    fixedRow('MRR', mrrTotal, mitigation(mrrTotal), stats.resolve('mrr').bonuses, mrrTotal === 0),
    fixedRow('MRR Cap', mrrCapTotal, mrrCapTotal > 0 ? String(mrrCapTotal) : '—', stats.resolve('mrrCap').bonuses, mrrCapTotal === 0),
    statRow('Dodge',          'dodge',          pct),
    statRow('Fortification',  'fortification',  pct),
    statRow('Concealment',    'concealment',    pct),
    statRow('Displacement',   'displacement',   pct),
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
      // Multiplicative absorption: 100 - Π((100-x)/100)*100
      let factor = 1
      for (const b of a.bonuses) if (b.active) factor *= (100 - b.value) / 100
      const absPct = 100 - factor * 100
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
  const baseCritMult     = weapon?.critMultiplier ?? 2
  const threatDisplay    = totalThreatRange > 1 ? `${21 - totalThreatRange}–20` : '20'
  const weaponDiceDisplay = weapon ? `${weapon.diceNum}d${weapon.diceSides}` : '—'
  const threatBonuses: ResolvedBonus[] = [
    { value: baseThreatRange, type: 'Base', source: weapon?.name ?? 'Unarmed', active: true },
    ...stats.resolve('weapon.threatRange').bonuses,
  ]

  const meleeStats: StatRowData[] = [
    statRow('Melee Power',    'melee.power',        sign),
    fixedRow('To-Hit Bonus',  meleeToHitTotal, sign(meleeToHitTotal),
      [...stats.resolve('bab').bonuses, ...stats.resolve('melee.toHit').bonuses]),
    statRow('Damage Bonus',   'melee.damage',       sign),
    fixedRow('W Dice',        0, weaponDiceDisplay, [], !weapon),
    fixedRow('Threat Range',  totalThreatRange, threatDisplay, threatBonuses),
    fixedRow('Crit Multiplier', baseCritMult, `×${baseCritMult}`,
      [{ value: baseCritMult, type: 'Base', source: weapon?.name ?? 'Unarmed', active: true }]),
    statRow('Doublestrike',   'melee.doublestrike', pct),
    statRow('Sneak Atk Dice', 'melee.sneakDice'),
    statRow('Strikethrough',  'melee.strikethrough', pct),
  ]

  const rangedStats: StatRowData[] = [
    statRow('Ranged Power',   'ranged.power',      sign),
    fixedRow('To-Hit Bonus',  rangedToHitTotal, sign(rangedToHitTotal),
      [...stats.resolve('bab').bonuses, ...stats.resolve('ranged.toHit').bonuses]),
    fixedRow('Threat Range',  20, '20',  [{ value: 20, type: 'Base', source: 'Base', active: true }]),
    fixedRow('Crit Multiplier', 2, '×2', [{ value: 2,  type: 'Base', source: 'Base', active: true }]),
    statRow('Doubleshot',     'ranged.doubleshot', pct),
  ]

  const spellStats: StatRowData[] = [
    fixedRow('Spell Points', spTotal, String(spTotal), stats.resolve('spellPoints').bonuses, spTotal === 0),
    ...casterClasses.map(({ name, levels }) => {
      const clClass = stats.resolve(`cl.${name}`)
      const clAll = stats.resolve('cl.All')
      const total = levels + clClass.total + clAll.total
      return fixedRow(`${name} CL`, total, String(total),
        [
          { value: levels, type: 'Base', source: `${name} class levels`, active: true },
          ...clClass.bonuses,
          ...clAll.bonuses,
        ])
    }),
    statRow('Spell Penetration', 'spellPenetration'),
    ...SCHOOL_DCS.map(school => statRow(`${school} DC`, `dc.${school}`)),
  ]

  const initiativeTotal  = stats.total('initiative')
  const skillPointsTotal = stats.total('skillPoints')
  const babDisplay = babRaw > babTotal ? `${sign(babTotal)} (capped, raw ${sign(babRaw)})` : sign(babTotal)
  const miscStats: StatRowData[] = [
    fixedRow('BAB',        babTotal,        babDisplay,            stats.resolve('bab').bonuses),
    fixedRow('Initiative', initiativeTotal, sign(initiativeTotal), stats.resolve('initiative').bonuses),
    fixedRow('Skill Pts',  skillPointsTotal, String(skillPointsTotal), stats.resolve('skillPoints').bonuses),
    statRow('Off-hand Atk', 'offhand.attack', pct),
    statRow('Helpless Dmg', 'helpless',        pct),
  ]

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

            <Section title="Combat">
              {miscStats.map(s => <StatRow key={s.label} stat={s} onTip={setTip} />)}
            </Section>

            <Section title="Skills" defaultOpen={false}>
              {skillStats.map(s => <StatRow key={s.label} stat={s} onTip={setTip} />)}
            </Section>

          </div>
        )}
      </div>
    </div>
  )
}
