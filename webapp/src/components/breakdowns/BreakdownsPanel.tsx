import { useEffect, useState } from 'react'
import { api } from '../../api'
import { useCharacter } from '../../context/CharacterContext'
import type { DDOClass, Race } from '../../types/ddo'
import styles from './BreakdownsPanel.module.css'

const ABILITIES = ['Strength', 'Dexterity', 'Constitution', 'Intelligence', 'Wisdom', 'Charisma'] as const
type Ab = typeof ABILITIES[number]

const ALL_SKILLS = [
  { name: 'Balance',           ability: 'Dexterity' as Ab },
  { name: 'Bluff',             ability: 'Charisma' as Ab },
  { name: 'Concentration',     ability: 'Constitution' as Ab },
  { name: 'Diplomacy',         ability: 'Charisma' as Ab },
  { name: 'Disable Device',    ability: 'Intelligence' as Ab },
  { name: 'Haggle',            ability: 'Charisma' as Ab },
  { name: 'Heal',              ability: 'Wisdom' as Ab },
  { name: 'Hide',              ability: 'Dexterity' as Ab },
  { name: 'Intimidate',        ability: 'Charisma' as Ab },
  { name: 'Jump',              ability: 'Strength' as Ab },
  { name: 'Listen',            ability: 'Wisdom' as Ab },
  { name: 'Move Silently',     ability: 'Dexterity' as Ab },
  { name: 'Open Lock',         ability: 'Dexterity' as Ab },
  { name: 'Perform',           ability: 'Charisma' as Ab },
  { name: 'Repair',            ability: 'Intelligence' as Ab },
  { name: 'Search',            ability: 'Intelligence' as Ab },
  { name: 'Spellcraft',        ability: 'Intelligence' as Ab },
  { name: 'Spot',              ability: 'Wisdom' as Ab },
  { name: 'Swim',              ability: 'Strength' as Ab },
  { name: 'Tumble',            ability: 'Dexterity' as Ab },
  { name: 'Use Magic Device',  ability: 'Charisma' as Ab },
]

const SPELL_POWER_TYPES = [
  'Universal', 'Acid', 'Cold', 'Electric', 'Fire', 'Force/Physical',
  'Light', 'Negative', 'Positive', 'Repair', 'Sonic',
]

function mod(score: number): number { return Math.floor((score - 10) / 2) }
function signStr(n: number): string { return (n >= 0 ? '+' : '') + n }

function saveBonus(saveType: string | undefined, levels: number): number {
  if (saveType === 'Strong') return 2 + Math.floor(levels / 2)
  return Math.floor(levels / 3)
}

function babPerLevel(babStr: string | undefined): number {
  switch (babStr) {
    case 'Full': return 1
    case '3/4': return 0.75
    case '1/2': return 0.5
    default: return 0.75
  }
}

/** Parse SpellPointsPerLevel like "10+2*CasterLevel" or a plain number */
function computeSpellPoints(formula: string | undefined, casterLevel: number): number {
  if (!formula) return 0
  // Simple heuristic: look for a multiplier pattern like "10+2*CasterLevel"
  const match = formula.match(/(\d+)\s*\+\s*(\d+)\s*\*/)
  if (match) return parseInt(match[1]) + parseInt(match[2]) * casterLevel
  const plain = parseInt(formula)
  return isNaN(plain) ? 0 : plain * casterLevel
}

// ---------------------------------------------------------------------------
// Row type
// ---------------------------------------------------------------------------
interface Row { label: string; value: string | number; detail?: string }

function Section({ title, rows }: { title: string; rows: Row[] }) {
  return (
    <section className={styles.section}>
      <div className={styles.sectionTitle}>{title}</div>
      <div className={styles.table}>
        {rows.map(r => (
          <div key={r.label} className={styles.row} title={r.detail}>
            <span className={styles.label}>{r.label}</span>
            <span className={styles.value}>{r.value}</span>
            {r.detail && <span className={styles.detail}>{r.detail}</span>}
          </div>
        ))}
      </div>
    </section>
  )
}

// ---------------------------------------------------------------------------
// Panel
// ---------------------------------------------------------------------------
export default function BreakdownsPanel() {
  const { build } = useCharacter()
  const [allClasses, setAllClasses] = useState<DDOClass[]>([])
  const [allRaces, setAllRaces] = useState<Race[]>([])

  useEffect(() => {
    api.classes().then(setAllClasses)
    api.races().then(setAllRaces)
  }, [])

  const race = allRaces.find(r => r.Name === build.race)

  function racialMod(ab: Ab): number {
    if (!race) return 0
    const raw = (race as unknown as Record<string, unknown>)[ab]
    return typeof raw === 'number' ? raw : 0
  }

  function levelUpBonus(ab: Ab): number {
    let n = 0
    for (const v of Object.values(build.abilityLevelUps)) { if (v === ab) n++ }
    return n
  }

  function tomeBonus(ab: Ab): number { return build.abilityTomes[ab] ?? 0 }

  function totalScore(ab: Ab): number {
    return build.baseAbilities[ab] + racialMod(ab) + levelUpBonus(ab) + tomeBonus(ab)
  }

  const scores = Object.fromEntries(ABILITIES.map(ab => [ab, totalScore(ab)])) as Record<Ab, number>
  const mods = Object.fromEntries(ABILITIES.map(ab => [ab, mod(scores[ab])])) as Record<Ab, number>

  // ---------------------------------------------------------------------------
  // Class aggregates
  // ---------------------------------------------------------------------------
  let bab = 0, fort = 0, ref = 0, will = 0, hp = 0, skillPts = 0
  let totalSpellPoints = 0
  let firstClass = true

  const classDetails: { name: string; levels: number; cls: DDOClass | undefined }[] = []

  for (const bc of build.classes) {
    if (!bc.name || bc.levels === 0) continue
    const cls = allClasses.find(c => c.Name === bc.name)
    classDetails.push({ name: bc.name, levels: bc.levels, cls })
    if (!cls) continue
    bab += Math.floor(bc.levels * babPerLevel(cls.BAB))
    fort += saveBonus(cls.Fortitude, bc.levels)
    ref += saveBonus(cls.Reflex, bc.levels)
    will += saveBonus(cls.Will, bc.levels)
    hp += bc.levels * ((cls.HitPoints ?? 6) + mods.Constitution)
    const spp = Math.max(1, (cls.SkillPoints ?? 2) + mods.Intelligence)
    if (firstClass) { skillPts += spp * 4 + spp * (bc.levels - 1); firstClass = false }
    else skillPts += spp * bc.levels
    totalSpellPoints += computeSpellPoints(cls.SpellPointsPerLevel, bc.levels)
  }

  const totalLevel = build.totalLevel || build.classes.reduce((s, c) => s + c.levels, 0)

  // ---------------------------------------------------------------------------
  // Class skills (union of all class's ClassSkill lists)
  // ---------------------------------------------------------------------------
  const classSkillSet = new Set<string>()
  for (const { cls } of classDetails) {
    if (!cls?.ClassSkill) continue
    const list = Array.isArray(cls.ClassSkill) ? cls.ClassSkill : [cls.ClassSkill]
    list.forEach(s => classSkillSet.add(s))
  }

  // ---------------------------------------------------------------------------
  // Sections
  // ---------------------------------------------------------------------------

  const abilityRows: Row[] = ABILITIES.map(ab => {
    const base = build.baseAbilities[ab]
    const racial = racialMod(ab)
    const lvl = levelUpBonus(ab)
    const tome = tomeBonus(ab)
    const total = scores[ab]
    const m = mods[ab]
    const parts = [`Base ${base}`]
    if (racial) parts.push(`Racial ${signStr(racial)}`)
    if (lvl)    parts.push(`Level-ups +${lvl}`)
    if (tome)   parts.push(`Tome +${tome}`)
    return { label: ab.slice(0, 3).toUpperCase(), value: `${total} (${signStr(m)})`, detail: parts.join(' | ') }
  })

  const combatRows: Row[] = [
    { label: 'BAB',         value: signStr(bab) },
    { label: 'Fort Save',   value: signStr(fort + mods.Constitution), detail: `Base ${signStr(fort)} + CON ${signStr(mods.Constitution)}` },
    { label: 'Ref Save',    value: signStr(ref + mods.Dexterity),     detail: `Base ${signStr(ref)} + DEX ${signStr(mods.Dexterity)}` },
    { label: 'Will Save',   value: signStr(will + mods.Wisdom),       detail: `Base ${signStr(will)} + WIS ${signStr(mods.Wisdom)}` },
    { label: 'Initiative',  value: signStr(mods.Dexterity),           detail: `DEX modifier` },
  ]

  const defenseRows: Row[] = [
    { label: 'HP (base)',   value: hp,                                detail: `HD + CON mod per level` },
    { label: 'SP (base)',   value: totalSpellPoints,                  detail: `From class SpellPointsPerLevel` },
    { label: 'AC (base)',   value: 10 + mods.Dexterity,              detail: `10 + DEX ${signStr(mods.Dexterity)}` },
    { label: 'PRR',         value: 0,                                 detail: `Physical Resistance Rating — gear/feats only` },
    { label: 'MRR',         value: 0,                                 detail: `Magical Resistance Rating — gear/feats only` },
    { label: 'PRR Cap',     value: 0,                                 detail: `Increases with heavier armor proficiency` },
    { label: 'Dodge',       value: '0%',                              detail: `Gear/enhancements only` },
    { label: 'Fortif.',     value: '0%',                              detail: `Fortification — gear/feats only` },
    { label: 'Concealment', value: '0%',                              detail: `Gear/spells only` },
    { label: 'Move Speed',  value: '100%',                            detail: `Base movement speed` },
    { label: 'Spell Resist',value: 0,                                 detail: `Gear/feats only` },
  ]

  const offenseRows: Row[] = [
    { label: 'Melee Power',    value: 0,                              detail: `Enhancements/gear only at base` },
    { label: 'Ranged Power',   value: 0,                              detail: `Enhancements/gear only at base` },
    { label: 'Melee Dmg',      value: signStr(mods.Strength),        detail: `STR modifier` },
    { label: 'Ranged Dmg',     value: signStr(mods.Dexterity),       detail: `DEX modifier (thrown/ranged)` },
    { label: 'Offhand Pen.',   value: '-2/-6',                       detail: `Two-weapon fighting penalty (main/off)` },
    { label: 'Doublestrike',   value: '0%',                          detail: `Enhancements/gear only` },
    { label: 'Doubleshot',     value: '0%',                          detail: `Enhancements/gear only` },
    { label: 'Melee Crit %',   value: '5%',                          detail: `Base 20 threat range` },
    { label: 'Melee Crit ×',   value: '×2',                          detail: `Base critical multiplier` },
    { label: 'Ranged Crit %',  value: '5%',                          detail: `Base 20 threat range` },
    { label: 'Ranged Crit ×',  value: '×2',                          detail: `Base critical multiplier` },
    { label: 'Fort Bypass',    value: '0%',                          detail: `Fortification bypass — gear/feats only` },
    { label: 'Armor Piercing', value: '0%',                          detail: `Gear/feats only` },
    { label: 'Strikethrough',  value: '0%',                          detail: `Gear/feats only` },
  ]

  const spellRows: Row[] = [
    { label: 'Spell Crit %',  value: '0%',                           detail: `Universal spell crit — enhancements only` },
    { label: 'Spell Crit ×',  value: '×1.5',                         detail: `Base spell critical multiplier` },
    ...SPELL_POWER_TYPES.map(t => ({
      label: t.length > 14 ? t.slice(0, 13) + '…' : t,
      value: 0,
      detail: `${t} spell power — enhancements/gear only at base`,
    })),
  ]

  // Per-class caster levels
  const casterLevelRows: Row[] = classDetails
    .filter(({ cls }) => cls?.SpellPointsPerLevel)
    .map(({ name, levels }) => ({
      label: `${name.slice(0, 10)} CL`,
      value: levels,
      detail: `Caster level = class levels`,
    }))
  if (casterLevelRows.length === 0) {
    casterLevelRows.push({ label: 'Caster Level', value: 0, detail: 'No spellcasting class selected' })
  }

  const skillRows: Row[] = ALL_SKILLS.map(({ name, ability }) => {
    const abilityMod = mods[ability]
    const ranks = build.skillRanks[name] ?? 0
    const tome = build.skillTomes[name] ?? 0
    const isClass = classSkillSet.has(name)
    const classMod = isClass && ranks > 0 ? 1 : 0 // DDO class skill perk
    const total = ranks + abilityMod + tome + classMod
    return {
      label: name.length > 16 ? name.slice(0, 15) + '…' : name,
      value: signStr(total),
      detail: [
        `Ranks: ${ranks}`,
        `${ability.slice(0,3)}: ${signStr(abilityMod)}`,
        tome ? `Tome: +${tome}` : '',
        isClass ? 'Class skill' : '',
      ].filter(Boolean).join(' | '),
    }
  })

  const miscRows: Row[] = [
    { label: 'Total Level',   value: totalLevel },
    { label: 'Skill Points',  value: skillPts,                       detail: `Includes 4× first-level bonus` },
    { label: 'Carrying Cap.', value: `${Math.floor((mods.Strength + 10) * 10)} lb`, detail: `Rough estimate from STR` },
    { label: 'Jump (max)',    value: `${Math.max(0, 40 + mods.Strength)}`,         detail: `~40 base + STR mod` },
  ]

  const hasClasses = build.classes.some(c => c.name && c.levels > 0)

  return (
    <div className="panel">
      <div className="panel-header">Analysis</div>
      <div className="panel-body">
        {!hasClasses && !build.race ? (
          <p className={styles.empty}>Select a race and classes to see stats.</p>
        ) : (
          <>
            <p className={styles.note}>Base values only — hover rows for breakdown. Gear, feat, and enhancement bonuses shown as 0.</p>
            <div className={styles.grid}>
              <Section title="Ability Scores" rows={abilityRows} />
              <Section title="Combat" rows={combatRows} />
              <Section title="Defense" rows={defenseRows} />
              <Section title="Offense" rows={offenseRows} />
              <Section title="Spellcasting" rows={[...casterLevelRows, ...spellRows]} />
              <Section title="Skills" rows={skillRows} />
              <Section title="Misc" rows={miscRows} />
            </div>
          </>
        )}
      </div>
    </div>
  )
}
