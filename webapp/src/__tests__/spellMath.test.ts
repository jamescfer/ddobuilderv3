import { describe, expect, it } from 'vitest'
import {
  computeSpellDC, computeCasterLevel, computeMaxCasterLevel,
  computeSpellCost, computeMaxSpellLevel, availableMetamagics, METAMAGIC_KEYS,
} from '../lib/spells/spellMath'
import type { Spell, DDOClass } from '../types/ddo'
import type { BuildStats } from '../hooks/useBuildStats'
import type { ResolvedStat } from '../lib/bonus'

function makeStats(map: Record<string, number>): BuildStats {
  return {
    resolve: (k: string): ResolvedStat => ({ total: map[k] ?? 0, bonuses: [] }),
    total: (k: string) => map[k] ?? 0,
    keys: () => Object.keys(map),
    weapon: null,
    armorMaxDex: null,
  }
}

const wizard: DDOClass = ({
  Name: 'Wizard',
  CastingStat: 'Intelligence',
  Level20: '4 4 4 4 4 4 4 4 4',
} as unknown) as DDOClass

describe('computeMaxSpellLevel', () => {
  it('reads Level20 row to determine cap', () => {
    expect(computeMaxSpellLevel(wizard, 20)).toBe(9)
  })
  it('falls back when row missing (full caster)', () => {
    const cls = { Name: 'Cleric' } as DDOClass
    expect(computeMaxSpellLevel(cls, 20)).toBe(10) // (20+1)/2 = 10 (clamped by data normally)
  })
})

describe('computeSpellDC', () => {
  it('Fireball at Wizard 20 with INT 24 and Spell Focus Evocation', () => {
    const fireball: Spell = {
      Name: 'Fireball',
      School: 'Evocation',
      Level: { Wizard: 3 },
    }
    const stats = makeStats({
      'ability.Intelligence': 24,         // mod = +7
      'dc.Evocation': 1,                  // Spell Focus
    })
    // V2 SpellDC.cpp:120-128 iterates the DC block's OWN School list (no
    // fallback to spell.School), so the DC block must carry School itself —
    // exactly as the real Fireball <SpellDC> does (School=Evocation).
    const dc = computeSpellDC(fireball, { Amount: 10, CastingStatMod: true, School: 'Evocation' }, wizard, 20, stats)
    expect(dc).toBe(10 + 7 + 3 + 1)
  })

  it('does NOT add school DC bonus to a school-less (fixed on-hit) DC block', () => {
    // V2 SpellDC.cpp:120-128: a DC block with no <School> (e.g. Gust of Wind's
    // "Knocked Prone" effect) gets zero school DC bonus even though the parent
    // spell has a school. Previously V3 fell back to spell.School and over-counted.
    const spell: Spell = { Name: 'Gust of Wind', School: 'Evocation', Level: { Wizard: 2 } }
    const stats = makeStats({ 'ability.Intelligence': 24, 'dc.Evocation': 5 })
    const dc = computeSpellDC(spell, { Amount: 12, CastingStatMod: true }, wizard, 20, stats)
    // 12 (fixed) + INT mod(+7) + spell level(2); NO +5 from dc.Evocation.
    expect(dc).toBe(12 + 7 + 2)
  })

  it('returns base DC when CastingStatMod false', () => {
    const spell: Spell = { Name: 'X', Level: { Wizard: 2 } }
    expect(computeSpellDC(spell, { Amount: 12 }, wizard, 20, makeStats({}))).toBe(12)
  })

  it('Heighten substitutes spell level with max class spell level', () => {
    const spell: Spell = { Name: 'Magic Missile', Level: { Wizard: 1 }, Heighten: true }
    const stats = makeStats({ 'ability.Intelligence': 10 })
    const dc = computeSpellDC(
      spell, { Amount: 10, CastingStatMod: true }, wizard, 20, stats,
      { heightenActive: true },
    )
    // Heighten replaces 1 with the class max (9 from Level20 row).
    expect(dc).toBe(10 + 0 + 9)
  })

  it('ModAbility picks best of options', () => {
    const dc = computeSpellDC(
      { Name: 'X' } as Spell,
      { Amount: 10, ModAbility: ['Charisma', 'Wisdom'] },
      wizard, 20,
      makeStats({ 'ability.Wisdom': 14, 'ability.Charisma': 20 }),
    )
    // mod(20)=5, mod(14)=2, picks 5
    expect(dc).toBe(15)
  })
})

describe('computeMaxCasterLevel', () => {
  it('returns +Infinity when not capped', () => {
    const spell: Spell = { Name: 'X' }
    expect(computeMaxCasterLevel(spell, wizard, 20, makeStats({}))).toBe(Infinity)
  })
  it('respects MaxCasterLevel + bonuses', () => {
    const spell: Spell = { Name: 'X', MaxCasterLevel: 10, School: 'Evocation' }
    const stats = makeStats({ 'maxCl.Wizard': 1, 'maxClSchool.Evocation': 1 })
    expect(computeMaxCasterLevel(spell, wizard, 20, stats)).toBe(20) // 12 vs 20: max(20)
  })
})

describe('computeCasterLevel', () => {
  it('caps at maxCasterLevel', () => {
    const spell: Spell = { Name: 'Burning Hands', MaxCasterLevel: 5, School: 'Evocation' }
    const stats = makeStats({ 'cl.Wizard': 0, 'clSchool.Evocation': 0 })
    expect(computeCasterLevel(spell, wizard, 20, stats)).toBe(20) // max(5, classLevel)=20
  })
  it('adds class+school+per-spell CL bonuses', () => {
    const spell: Spell = { Name: 'Magic Missile', MaxCasterLevel: 30, School: 'Evocation' }
    const stats = makeStats({
      'cl.Wizard': 2, 'clSchool.Evocation': 1, 'clSpell.Magic Missile': 3,
    })
    expect(computeCasterLevel(spell, wizard, 10, stats)).toBe(16)
  })
  it('cl.All (universal equipment bonus) contributes to caster level — V2 Spell.cpp:174 parity', () => {
    // An item giving "+2 Insightful Caster Levels" with no class/school/spell
    // restriction emits cl.All. V2 adds this in ActualCasterLevel; V3 must too.
    const spell: Spell = { Name: 'Fireball', MaxCasterLevel: 30, School: 'Evocation' }
    const stats = makeStats({ 'cl.All': 2 })
    expect(computeCasterLevel(spell, wizard, 10, stats)).toBe(12)
  })
  it('maxCl.All (universal cap raise) contributes to max caster level', () => {
    // An item raising the cap universally emits maxCl.All; V2 adds it in MaxCasterLevel.
    const spell: Spell = { Name: 'Fireball', MaxCasterLevel: 10, School: 'Evocation' }
    const stats = makeStats({ 'cl.All': 3, 'maxCl.All': 3 })
    // base cl = 10 + 3(cl.All) = 13; max = 10 + 3(maxCl.All) = 13 (max(13,10)=13)
    expect(computeCasterLevel(spell, wizard, 10, stats)).toBe(13)
  })
  it('Mixed Magics raises class CL to character level — V2 BreakdownItemCasterLevel.cpp:77-100', () => {
    // A Sorcerer/Wild Mage 12 splash on a level-20 character: without Mixed Magics
    // the class CL is 12; with it, CL becomes min(20, 20)=20.
    const spell: Spell = { Name: 'Fireball', MaxCasterLevel: 30, School: 'Evocation' }
    const stats = makeStats({})
    expect(computeCasterLevel(spell, wizard, 12, stats)).toBe(12)
    expect(computeCasterLevel(spell, wizard, 12, stats, { mixedMagicsCharacterLevel: 20 })).toBe(20)
  })
  it('Mixed Magics never lowers CL when class level already exceeds char level', () => {
    const spell: Spell = { Name: 'Fireball', MaxCasterLevel: 30, School: 'Evocation' }
    // classLevel 20, character level cap 20 → delta 0, no change.
    expect(computeCasterLevel(spell, wizard, 20, makeStats({}), { mixedMagicsCharacterLevel: 20 })).toBe(20)
  })
})

describe('computeSpellCost', () => {
  it('default cost is 5*spellLevel when not overridden', () => {
    const spell: Spell = { Name: 'Fireball', Level: { Wizard: 3 } }
    expect(computeSpellCost(spell, wizard, 20, makeStats({}), [])).toBe(15)
  })
  it('respects Cost override', () => {
    const spell: Spell = { Name: 'X', Cost: 22, Level: { Wizard: 3 } }
    expect(computeSpellCost(spell, wizard, 20, makeStats({}), [])).toBe(22)
  })
  it('Maximize adds metamagic cost', () => {
    const spell: Spell = { Name: 'Fireball', Level: { Wizard: 3 }, Maximize: true }
    const stats = makeStats({ 'metamagic.cost.Maximize': 20 })
    expect(computeSpellCost(spell, wizard, 20, stats, ['Maximize'])).toBe(15 + 20)
  })
  it('Heighten adds (maxLevel-spellLevel) * cost.Heighten', () => {
    const spell: Spell = { Name: 'Magic Missile', Level: { Wizard: 1 }, Heighten: true }
    const stats = makeStats({ 'metamagic.cost.Heighten': 8 })
    // maxLevel(Wizard L20) = 9, spellLvl=1 → delta=8 → +64
    expect(computeSpellCost(spell, wizard, 20, stats, ['Heighten'])).toBe(5 + 64)
  })
  it('applies percentage reduction last', () => {
    const spell: Spell = { Name: 'Fireball', Level: { Wizard: 3 } }
    const stats = makeStats({ spellCostPct: 25 })
    expect(computeSpellCost(spell, wizard, 20, stats, [])).toBe(11) // 15 * 0.75 = 11.25 → 11
  })
})

describe('availableMetamagics', () => {
  it('lists only declared metamagics', () => {
    const spell: Spell = { Name: 'X', Empower: true, Maximize: true, Heighten: true }
    expect(availableMetamagics(spell).sort()).toEqual(['Empower', 'Heighten', 'Maximize'])
  })

  it('does not offer EschewMaterials (not a V2 Spell.h:67-76 metamagic flag)', () => {
    // EschewMaterials is a feat, not a per-spell DL_FLAG metamagic. Even if a
    // spell object carried the field, it must never be a toggle.
    const spell = { Name: 'X', Empower: true, EschewMaterials: true } as unknown as Spell
    expect(availableMetamagics(spell)).not.toContain('EschewMaterials')
    expect(availableMetamagics(spell)).toEqual(['Empower'])
  })
})

describe('METAMAGIC_KEYS', () => {
  it('contains exactly the ten V2 Spell.h:67-76 metamagic flags', () => {
    expect([...METAMAGIC_KEYS].sort()).toEqual([
      'Accelerate', 'Embolden', 'Empower', 'EmpowerHealing', 'Enlarge',
      'Extend', 'Heighten', 'Intensify', 'Maximize', 'Quicken',
    ].sort())
    expect(METAMAGIC_KEYS).not.toContain('EschewMaterials')
  })
})
