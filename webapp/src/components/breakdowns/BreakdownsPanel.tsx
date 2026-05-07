import { useEffect, useState, useRef, useCallback } from 'react'
import { api } from '../../api'
import { useCharacter } from '../../context/CharacterContext'
import type { DDOClass, Race } from '../../types/ddo'
import styles from './BreakdownsPanel.module.css'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Source {
  label: string
  value: number
  type?: string  // "Base", "Ability mod", "Feat", "Enhancement", "Racial", "Tome"
}

interface Stat {
  label: string
  total: number
  display?: string          // override formatted value
  sources: Source[]
  indent?: boolean          // sub-stat row
  dim?: boolean             // zero / not-yet-implemented
}

interface TipState {
  label: string
  display: string
  sources: Source[]
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

const ALL_SKILLS: { name: string; ability: Ab }[] = [
  { name: 'Balance',          ability: 'Dexterity' },
  { name: 'Bluff',            ability: 'Charisma' },
  { name: 'Concentration',    ability: 'Constitution' },
  { name: 'Diplomacy',        ability: 'Charisma' },
  { name: 'Disable Device',   ability: 'Intelligence' },
  { name: 'Haggle',           ability: 'Charisma' },
  { name: 'Heal',             ability: 'Wisdom' },
  { name: 'Hide',             ability: 'Dexterity' },
  { name: 'Intimidate',       ability: 'Charisma' },
  { name: 'Jump',             ability: 'Strength' },
  { name: 'Listen',           ability: 'Wisdom' },
  { name: 'Move Silently',    ability: 'Dexterity' },
  { name: 'Open Lock',        ability: 'Dexterity' },
  { name: 'Perform',          ability: 'Charisma' },
  { name: 'Repair',           ability: 'Intelligence' },
  { name: 'Search',           ability: 'Intelligence' },
  { name: 'Spellcraft',       ability: 'Intelligence' },
  { name: 'Spot',             ability: 'Wisdom' },
  { name: 'Swim',             ability: 'Strength' },
  { name: 'Tumble',           ability: 'Dexterity' },
  { name: 'Use Magic Device', ability: 'Charisma' },
]

// 18 spell power types matching V2
const SPELL_POWERS = [
  'Universal', 'Acid', 'Cold', 'Electric', 'Fire', 'Force',
  'Light/Alignment', 'Negative', 'Positive', 'Repair', 'Rust',
  'Sonic', 'Poison', 'Physical', 'Chaos', 'Evil', 'Lawful', 'Untyped',
]

// ---------------------------------------------------------------------------
// Math helpers
// ---------------------------------------------------------------------------

function abMod(score: number) { return Math.floor((score - 10) / 2) }
function sign(n: number)     { return (n >= 0 ? '+' : '') + n }
function pct(n: number)      { return n + '%' }
function mult(n: number)     { return '×' + n.toFixed(1).replace(/\.0$/, '') }

function saveBase(saveType: unknown, levels: number): number {
  const s = String(saveType ?? '')
  if (s === 'Strong') return 2 + Math.floor(levels / 2)
  return Math.floor(levels / 3)
}

function classBAB(cls: DDOClass, levels: number): number {
  const arr = String(cls.BAB ?? '').trim().split(/\s+/).map(Number).filter(n => !isNaN(n))
  if (arr.length > levels) return arr[levels]
  if (arr.length > 0) return arr[arr.length - 1]
  return Math.floor(levels * 0.75)
}

function computeSpellPoints(formula: unknown, levels: number): number {
  if (formula == null) return 0
  const s = String(formula).trim()
  const m = s.match(/(\d+)\s*\+\s*(\d+)\s*\*/)
  if (m) return parseInt(m[1]) + parseInt(m[2]) * levels
  const p = parseInt(s)
  return isNaN(p) ? 0 : p * levels
}

// ---------------------------------------------------------------------------
// Tooltip
// ---------------------------------------------------------------------------

function Tooltip({ tip, onHide }: { tip: TipState; onHide: () => void }) {
  const total = tip.sources.reduce((s, x) => s + x.value, 0)
  const hasSources = tip.sources.length > 0

  return (
    <div
      className={styles.tipBox}
      style={{ left: tip.x + 14, top: tip.y - 8 }}
      onMouseEnter={onHide}
    >
      <div className={styles.tipTitle}>{tip.label} — {tip.display}</div>
      {hasSources ? (
        <table className={styles.tipTable}>
          <thead>
            <tr>
              <th>Source</th>
              <th>Type</th>
              <th>Value</th>
            </tr>
          </thead>
          <tbody>
            {tip.sources.map((s, i) => (
              <tr key={i}>
                <td>{s.label}</td>
                <td>{s.type ?? '—'}</td>
                <td className={styles.tipVal}>{sign(s.value)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={2}><strong>Total</strong></td>
              <td className={styles.tipVal}><strong>{sign(total)}</strong></td>
            </tr>
          </tfoot>
        </table>
      ) : (
        <div className={styles.tipEmpty}>No bonuses tracked yet — requires feat/gear data.</div>
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

function StatRow({ stat, onTip }: {
  stat: Stat
  onTip: (t: TipState | null) => void
}) {
  const display = stat.display ?? sign(stat.total)
  return (
    <div
      className={`${styles.row} ${stat.indent ? styles.rowIndent : ''} ${stat.dim ? styles.rowDim : ''}`}
      onMouseEnter={e => {
        const r = (e.currentTarget as HTMLElement).getBoundingClientRect()
        onTip({ label: stat.label, display, sources: stat.sources, x: r.right, y: r.top })
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

function SpellPowerRow({ name, power, critPct, critMult, onTip, sourcePower, sourceCrit, sourceMult }: {
  name: string
  power: number
  critPct: number
  critMult: number
  onTip: (t: TipState | null) => void
  sourcePower: Source[]
  sourceCrit: Source[]
  sourceMult: Source[]
}) {
  function cell(display: string, label: string, sources: Source[]) {
    return (
      <td
        className={`${styles.spCell} ${power === 0 && sources.length === 0 ? styles.spCellDim : ''}`}
        onMouseEnter={e => {
          const r = (e.currentTarget as HTMLElement).getBoundingClientRect()
          onTip({ label: `${name} — ${label}`, display, sources, x: r.right, y: r.top })
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
      {cell(String(power), 'Power', sourcePower)}
      {cell(pct(critPct), 'Crit Chance', sourceCrit)}
      {cell(mult(critMult), 'Crit Mult', sourceMult)}
    </tr>
  )
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export default function BreakdownsPanel() {
  const { build } = useCharacter()
  const [allClasses, setAllClasses] = useState<DDOClass[]>([])
  const [allRaces,   setAllRaces]   = useState<Race[]>([])
  const [tip, setTip] = useState<TipState | null>(null)
  const panelRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    api.classes().then(setAllClasses)
    api.races().then(setAllRaces)
  }, [])

  const hideTip = useCallback(() => setTip(null), [])

  // ── Ability scores ──────────────────────────────────────────────────────
  const race = allRaces.find(r => r.Name === build.race)

  function racialMod(ab: Ab): number {
    if (!race) return 0
    const raw = (race as unknown as Record<string, unknown>)[ab]
    return typeof raw === 'number' ? raw : 0
  }

  function levelUpCount(ab: Ab): number {
    return Object.values(build.abilityLevelUps).filter(v => v === ab).length
  }

  function score(ab: Ab): number {
    return build.baseAbilities[ab] + racialMod(ab) + levelUpCount(ab) + (build.abilityTomes[ab] ?? 0)
  }

  const scores = Object.fromEntries(ABILITIES.map(ab => [ab, score(ab)])) as Record<Ab, number>
  const mods   = Object.fromEntries(ABILITIES.map(ab => [ab, abMod(scores[ab])])) as Record<Ab, number>

  function abilityStat(ab: Ab): Stat {
    const base  = build.baseAbilities[ab]
    const racial = racialMod(ab)
    const lvl   = levelUpCount(ab)
    const tome  = build.abilityTomes[ab] ?? 0
    const total = scores[ab]
    const sources: Source[] = [{ label: 'Base (point buy)', value: base, type: 'Base' }]
    if (racial) sources.push({ label: `${build.race} racial`, value: racial, type: 'Racial' })
    if (lvl)    sources.push({ label: 'Level-up bonuses', value: lvl, type: 'Level-up' })
    if (tome)   sources.push({ label: 'Ability tome', value: tome, type: 'Tome' })
    return {
      label: `${ab.slice(0, 3).toUpperCase()}  ${total}`,
      total,
      display: `${total}  (${sign(mods[ab])})`,
      sources,
    }
  }

  // ── Class aggregates ────────────────────────────────────────────────────
  type ClassDetail = { name: string; levels: number; cls: DDOClass | undefined }
  const classDetails: ClassDetail[] = build.classes
    .filter(bc => bc.name && bc.levels > 0)
    .map(bc => ({ name: bc.name, levels: bc.levels, cls: allClasses.find(c => c.Name === bc.name) }))

  let bab = 0, fortBase = 0, refBase = 0, willBase = 0
  let hp = 0, totalSP = 0, skillPts = 0
  let firstClass = true

  const babSources: Source[] = []
  const fortSources: Source[] = []
  const refSources: Source[] = []
  const willSources: Source[] = []
  const hpSources: Source[] = []
  const spSources: Source[] = []

  for (const { name, levels, cls } of classDetails) {
    if (!cls) continue

    const b = classBAB(cls, levels)
    bab += b
    babSources.push({ label: `${name} (${levels} lv)`, value: b, type: 'Base' })

    const f = saveBase(cls.Fortitude, levels)
    fortBase += f
    fortSources.push({ label: `${name} (${levels} lv)`, value: f, type: 'Base' })

    const r = saveBase(cls.Reflex, levels)
    refBase += r
    refSources.push({ label: `${name} (${levels} lv)`, value: r, type: 'Base' })

    const w = saveBase(cls.Will, levels)
    willBase += w
    willSources.push({ label: `${name} (${levels} lv)`, value: w, type: 'Base' })

    const hpPerLv = (cls.HitPoints ?? 6) + mods.Constitution
    const classHP = levels * hpPerLv
    hp += classHP
    hpSources.push({ label: `${name} ×${levels} (d${cls.HitPoints ?? 6}+CON)`, value: classHP, type: 'Base' })

    const sp = computeSpellPoints(cls.SpellPointsPerLevel, levels)
    if (sp) {
      totalSP += sp
      spSources.push({ label: `${name} (${levels} lv)`, value: sp, type: 'Base' })
    }

    const spp = Math.max(1, (cls.SkillPoints ?? 2) + mods.Intelligence)
    if (firstClass) { skillPts += spp * 4 + spp * (levels - 1); firstClass = false }
    else skillPts += spp * levels
  }

  // Saves add ability mod
  const fortTotal = fortBase + mods.Constitution
  const refTotal  = refBase  + mods.Dexterity
  const willTotal = willBase + mods.Wisdom
  const fortSrcFull: Source[] = [...fortSources, { label: 'Constitution', value: mods.Constitution, type: 'Ability mod' }]
  const refSrcFull:  Source[] = [...refSources,  { label: 'Dexterity',    value: mods.Dexterity,    type: 'Ability mod' }]
  const willSrcFull: Source[] = [...willSources, { label: 'Wisdom',       value: mods.Wisdom,       type: 'Ability mod' }]

  // ── Class skill set ─────────────────────────────────────────────────────
  const classSkillSet = new Set<string>()
  for (const { cls } of classDetails) {
    if (!cls?.ClassSkill) continue
    const list = Array.isArray(cls.ClassSkill) ? cls.ClassSkill : [cls.ClassSkill]
    list.forEach(s => classSkillSet.add(s))
  }

  // ── Placeholder stat (no data yet) ─────────────────────────────────────
  function placeholder(label: string, display = '0'): Stat {
    return { label, total: 0, display, sources: [], dim: true }
  }

  // ── Melee stats ─────────────────────────────────────────────────────────
  const meleeToHitSrc: Source[] = [
    ...babSources,
    { label: 'Strength', value: mods.Strength, type: 'Ability mod' },
  ]
  const meleeDmgSrc: Source[] = [
    { label: 'Strength', value: mods.Strength, type: 'Ability mod' },
  ]

  const meleeStats: Stat[] = [
    { label: 'Melee Power',    total: 0, display: '0',    sources: [], dim: true },
    { label: 'To-Hit Bonus',   total: bab + mods.Strength, display: sign(bab + mods.Strength), sources: meleeToHitSrc },
    { label: 'Damage Bonus',   total: mods.Strength, display: sign(mods.Strength), sources: meleeDmgSrc },
    { label: 'Threat Range',   total: 20, display: '20', sources: [{ label: 'Base', value: 20, type: 'Base' }] },
    { label: 'Crit Multiplier',total: 2, display: '×2', sources: [{ label: 'Base', value: 2, type: 'Base' }] },
    placeholder('Doublestrike', '0%'),
    placeholder('Sneak Attack', '0d6'),
    placeholder('Fortif. Bypass', '0%'),
    placeholder('DR Bypass', '0%'),
    placeholder('Strikethrough', '0%'),
  ]

  // ── Ranged stats ────────────────────────────────────────────────────────
  const rangedToHitSrc: Source[] = [
    ...babSources,
    { label: 'Dexterity', value: mods.Dexterity, type: 'Ability mod' },
  ]

  const rangedStats: Stat[] = [
    { label: 'Ranged Power',   total: 0, display: '0',    sources: [], dim: true },
    { label: 'To-Hit Bonus',   total: bab + mods.Dexterity, display: sign(bab + mods.Dexterity), sources: rangedToHitSrc },
    { label: 'Damage Bonus',   total: 0, display: '0',    sources: [], dim: true },
    { label: 'Threat Range',   total: 20, display: '20', sources: [{ label: 'Base', value: 20, type: 'Base' }] },
    { label: 'Crit Multiplier',total: 2, display: '×2', sources: [{ label: 'Base', value: 2, type: 'Base' }] },
    placeholder('Doubleshot', '0%'),
    placeholder('Missile Deflect', '0%'),
  ]

  // ── Defense stats ───────────────────────────────────────────────────────
  const acSrc: Source[] = [
    { label: 'Base',        value: 10,            type: 'Base' },
    { label: 'Dexterity',   value: mods.Dexterity, type: 'Ability mod' },
  ]
  const defenseStats: Stat[] = [
    { label: 'Hit Points',  total: hp, display: String(hp), sources: hpSources },
    { label: 'AC (base)',   total: 10 + mods.Dexterity, display: String(10 + mods.Dexterity), sources: acSrc },
    placeholder('PRR'),
    placeholder('MRR'),
    placeholder('MRR Cap'),
    placeholder('Dodge', '0%'),
    placeholder('Fortification', '0%'),
    placeholder('Concealment', '0%'),
    placeholder('Displacement', '0%'),
    { label: 'Move Speed', total: 100, display: '100%', sources: [{ label: 'Base', value: 100, type: 'Base' }] },
    placeholder('Spell Resistance'),
  ]

  // ── Save stats ──────────────────────────────────────────────────────────
  const saveStats: Stat[] = [
    { label: 'Fortitude',     total: fortTotal, display: sign(fortTotal), sources: fortSrcFull },
    { label: 'vs Poison',     total: fortTotal, display: sign(fortTotal), sources: fortSrcFull, indent: true },
    { label: 'vs Disease',    total: fortTotal, display: sign(fortTotal), sources: fortSrcFull, indent: true },
    { label: 'Reflex',        total: refTotal,  display: sign(refTotal),  sources: refSrcFull },
    { label: 'vs Traps',      total: refTotal,  display: sign(refTotal),  sources: refSrcFull, indent: true },
    { label: 'vs Spells',     total: refTotal,  display: sign(refTotal),  sources: refSrcFull, indent: true },
    { label: 'Will',          total: willTotal, display: sign(willTotal), sources: willSrcFull },
    { label: 'vs Enchantment',total: willTotal, display: sign(willTotal), sources: willSrcFull, indent: true },
    { label: 'vs Fear',       total: willTotal, display: sign(willTotal), sources: willSrcFull, indent: true },
  ]

  // ── Spell stats ─────────────────────────────────────────────────────────
  const casterLevelStats: Stat[] = classDetails
    .filter(({ cls }) => cls?.SpellPointsPerLevel)
    .map(({ name, levels }) => ({
      label: `${name} CL`,
      total: levels,
      display: String(levels),
      sources: [{ label: `${name} class levels`, value: levels, type: 'Base' }],
    }))

  const spellStats: Stat[] = [
    { label: 'Spell Points', total: totalSP, display: String(totalSP), sources: spSources, dim: totalSP === 0 },
    ...casterLevelStats,
    placeholder('Spell Penetration'),
    placeholder('Evocation DC'),
    placeholder('Conjuration DC'),
    placeholder('Necromancy DC'),
    placeholder('Enchantment DC'),
    placeholder('Transmutation DC'),
    placeholder('Illusion DC'),
    placeholder('Abjuration DC'),
    placeholder('Divination DC'),
  ]

  // ── Skills ──────────────────────────────────────────────────────────────
  const skillStats: Stat[] = ALL_SKILLS.map(({ name, ability }) => {
    const abilityMod = mods[ability]
    const ranks = build.skillRanks?.[name] ?? 0
    const tome  = build.skillTomes?.[name] ?? 0
    const isClass = classSkillSet.has(name)
    const classMod = (isClass && ranks > 0) ? 1 : 0
    const total = ranks + abilityMod + tome + classMod
    const sources: Source[] = [
      { label: ability, value: abilityMod, type: 'Ability mod' },
    ]
    if (ranks)    sources.unshift({ label: 'Skill ranks', value: ranks, type: 'Ranks' })
    if (tome)     sources.push({ label: 'Skill tome', value: tome, type: 'Tome' })
    if (classMod) sources.push({ label: 'Class skill bonus', value: classMod, type: 'Class' })
    return {
      label: name,
      total,
      display: sign(total),
      sources,
      dim: total <= 0,
    }
  })

  // ── Misc stats ───────────────────────────────────────────────────────────
  const miscStats: Stat[] = [
    { label: 'BAB',       total: bab, display: sign(bab), sources: babSources },
    { label: 'Initiative',total: mods.Dexterity, display: sign(mods.Dexterity),
      sources: [{ label: 'Dexterity', value: mods.Dexterity, type: 'Ability mod' }] },
    { label: 'Skill Pts', total: skillPts, display: String(skillPts),
      sources: [{ label: 'All classes (×4 first)', value: skillPts, type: 'Base' }] },
    placeholder('Off-hand Attack', '60%'),
    placeholder('Helpless Bonus', '0%'),
  ]

  const hasCharacter = build.race || build.classes.some(c => c.name)

  return (
    <div className="panel" ref={panelRef} style={{ position: 'relative' }}>
      <div className="panel-header">Analysis</div>

      {tip && (
        <Tooltip tip={tip} onHide={hideTip} />
      )}

      <div className="panel-body" style={{ padding: '8px 0' }}>
        {!hasCharacter ? (
          <p className={styles.empty}>Select a race and classes to see stats.</p>
        ) : (
          <div className={styles.sections}>

            {/* ── Ability Scores ── */}
            <Section title="Ability Scores">
              <div className={styles.abilityGrid}>
                {ABILITIES.map(ab => {
                  const s = abilityStat(ab)
                  return (
                    <div
                      key={ab}
                      className={styles.abilityCell}
                      onMouseEnter={e => {
                        const r = (e.currentTarget as HTMLElement).getBoundingClientRect()
                        setTip({ label: ab, display: s.display!, sources: s.sources, x: r.right, y: r.top })
                      }}
                      onMouseLeave={hideTip}
                    >
                      <span className={styles.abLabel}>{AB3[ab]}</span>
                      <span className={styles.abScore}>{scores[ab]}</span>
                      <span className={styles.abMod}>{sign(mods[ab])}</span>
                    </div>
                  )
                })}
              </div>
            </Section>

            {/* ── Saves ── */}
            <Section title="Saving Throws">
              {saveStats.map(s => <StatRow key={s.label + (s.indent ? '-sub' : '')} stat={s} onTip={setTip} />)}
            </Section>

            {/* ── Defense ── */}
            <Section title="Defense">
              {defenseStats.map(s => <StatRow key={s.label} stat={s} onTip={setTip} />)}
            </Section>

            {/* ── Melee ── */}
            <Section title="Melee">
              {meleeStats.map(s => <StatRow key={s.label} stat={s} onTip={setTip} />)}
            </Section>

            {/* ── Ranged ── */}
            <Section title="Ranged">
              {rangedStats.map(s => <StatRow key={s.label} stat={s} onTip={setTip} />)}
            </Section>

            {/* ── Spell Powers ── */}
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
                  {SPELL_POWERS.map(name => (
                    <SpellPowerRow
                      key={name}
                      name={name}
                      power={0}
                      critPct={5}
                      critMult={1.5}
                      sourcePower={[]}
                      sourceCrit={[{ label: 'Base threat (20)', value: 5, type: 'Base' }]}
                      sourceMult={[{ label: 'Base critical multiplier', value: 1.5, type: 'Base' }]}
                      onTip={setTip}
                    />
                  ))}
                </tbody>
              </table>
            </Section>

            {/* ── Spellcasting ── */}
            <Section title="Spellcasting" defaultOpen={spellStats.some(s => !s.dim)}>
              {spellStats.map(s => <StatRow key={s.label} stat={s} onTip={setTip} />)}
            </Section>

            {/* ── Combat / Misc ── */}
            <Section title="Combat">
              {miscStats.map(s => <StatRow key={s.label} stat={s} onTip={setTip} />)}
            </Section>

            {/* ── Skills ── */}
            <Section title="Skills" defaultOpen={false}>
              {skillStats.map(s => <StatRow key={s.label} stat={s} onTip={setTip} />)}
            </Section>

          </div>
        )}
      </div>
    </div>
  )
}
