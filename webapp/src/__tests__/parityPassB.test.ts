// V2 → V3 Section B parity: Effect & Requirement engine.
//
// Covers AmountType resolution (Effect::TotalAmount) and Requirement::Evaluate*
// divergences brought to parity with the V2 C++ source.
//
// V2 sources cited:
//   Effect.cpp:1161-1183   Amount_BAB           (stacks = min(BAB, MAX_BAB=25))
//   Effect.cpp:1258-1278   Amount_SetBonusCount (Amount[min(count,size-1)] * stacks)
//   Effect.cpp:1417-1428   Amount_FeatCount     (Amount[min(count,size-1)] * stacks)
//   Effect.cpp:1448-1467   Amount_SliderValueLookup (Amount[min(classLevels,size-1)] * stacks)
//   Requirement.cpp:870-911 EvaluateFeat / EvaluateFeatAnySource
//   Requirement.cpp:719-731 EvaluateBaseClass
//   Requirement.cpp:662-706 EvaluateAlignmentType
//   Requirement.cpp:1004-1038 EvaluateNotConstruct / EvaluateRaceConstruct

import { describe, expect, it } from 'vitest'
import { parseEffect, type EffectContext } from '../lib/effectParser'
import { meetsSingleRequirement, type RequirementContext } from '../lib/requirements'
import type { CharacterBuild, DDOClass, Effect, Requirement } from '../types/ddo'

const baseCtx: EffectContext = {
  race: 'Human', alignment: 'True Neutral',
  classLevels: { Fighter: 12 }, baseClassLevels: { Fighter: 12 }, totalLevel: 20,
  feats: new Set(), enhancements: new Set(),
  abilityTotals: { Strength: 18, Dexterity: 14, Constitution: 14, Intelligence: 10, Wisdom: 10, Charisma: 8 },
  stances: new Set(), bab: 20, weaponTypes: new Set(),
}
const mk = (extra: Partial<Effect>): Effect =>
  ({ Type: 'Hitpoints', Bonus: 'Enhancement', ...extra }) as Effect

describe('Section B — AmountType resolution parity', () => {
  it('BAB clamps stacks to MAX_BAB=25 (Effect.cpp:1169)', () => {
    // Amount[0]=2, BAB=30 → 2 * min(30,25) = 50, not 60.
    const out = parseEffect(mk({ Type: 'Hitpoints', AType: 'BAB', Amount: 2 }), 1, 'T', 0, 0,
      { ...baseCtx, bab: 30 })
    expect(out[0].value).toBe(50)
  })

  it('BAB below the cap multiplies by actual BAB', () => {
    const out = parseEffect(mk({ Type: 'Hitpoints', AType: 'BAB', Amount: 3 }), 1, 'T', 0, 0,
      { ...baseCtx, bab: 10 })
    expect(out[0].value).toBe(30)
  })

  it('SetBonusCount is a vector lookup by tier count, not base*count (Effect.cpp:1267)', () => {
    // Amount = [0, 5, 10, 25]; 3 tiers equipped → Amount[3] = 25 (V2: Amount[min(3,3)]).
    const eff = mk({ Type: 'ACBonus', AType: 'SetBonusCount', Amount: '0 5 10 25', StackSource: 'My Set' })
    const out = parseEffect(eff, 1, 'T', 0, 0, { ...baseCtx, setBonusCounts: { 'My Set': 3 } })
    expect(out[0].value).toBe(25)
  })

  it('SetBonusCount clamps index to the vector bounds', () => {
    // count=5 but vector only has 4 entries → clamps to Amount[3]=25.
    const eff = mk({ Type: 'ACBonus', AType: 'SetBonusCount', Amount: '0 5 10 25', StackSource: 'My Set' })
    const out = parseEffect(eff, 1, 'T', 0, 0, { ...baseCtx, setBonusCounts: { 'My Set': 5 } })
    expect(out[0].value).toBe(25)
  })

  it('FeatCount is a vector lookup keyed off StackSource feat (Effect.cpp:1419,1427)', () => {
    // Amount = [0, 4, 9, 16]; 2 trained → Amount[2] = 9 (V2: Amount[count]).
    const eff = mk({ Type: 'Hitpoints', AType: 'FeatCount', Amount: '0 4 9 16', StackSource: 'Toughness' })
    const out = parseEffect(eff, 1, 'T', 0, 0, { ...baseCtx, featCounts: { Toughness: 2 } })
    expect(out[0].value).toBe(9)
  })

  it('FeatCount with zero trained returns Amount[0]', () => {
    const eff = mk({ Type: 'Hitpoints', AType: 'FeatCount', Amount: '0 4 9 16', StackSource: 'Toughness' })
    const out = parseEffect(eff, 1, 'T', 0, 0, { ...baseCtx, featCounts: { Toughness: 0 } })
    expect(out[0].value).toBe(0)
  })

  it('SliderValueLookup indexes Amount[] by ClassLevels(StackSource), per V2 (Effect.cpp:1456)', () => {
    // Deliberate V2 parity: name implies slider value, but V2 uses class levels.
    // Amount = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]; Fighter 12 → Amount[12] = 12.
    const eff = mk({ Type: 'Hitpoints', AType: 'SliderValueLookup', Amount: '0 1 2 3 4 5 6 7 8 9 10 11 12', StackSource: 'Fighter' })
    const out = parseEffect(eff, 1, 'T', 0, 0, baseCtx)
    expect(out[0].value).toBe(12)
  })
})

// ---------------------------------------------------------------------------
// Requirement::Evaluate* parity (requirements.ts)
// ---------------------------------------------------------------------------

const mkBuild = (over: Partial<CharacterBuild> = {}): CharacterBuild => ({
  race: 'Human', alignment: 'Lawful Good', totalLevel: 12,
  classes: [{ name: 'Fighter', levels: 12 }],
  featChoices: {}, enhancementChoices: {},
  ...(over as object),
}) as CharacterBuild

const classes: DDOClass[] = [{ Name: 'Fighter' } as DDOClass]
const rctx = (build: CharacterBuild, extra: Partial<RequirementContext> = {}): RequirementContext =>
  ({ build, allClasses: classes, ...extra })
const req = (Type: string, extra: Partial<Requirement> = {}): Requirement =>
  ({ Type, ...extra }) as Requirement

describe('Section B — Requirement::Evaluate parity', () => {
  it('FeatAnySource is evaluated against the feat set (Requirement.cpp:890)', () => {
    const ctxYes = rctx(mkBuild(), { feats: new Set(['Cleave']) })
    const ctxNo = rctx(mkBuild(), { feats: new Set() })
    expect(meetsSingleRequirement(req('FeatAnySource', { Item: 'Cleave' }), ctxYes)).toBe(true)
    expect(meetsSingleRequirement(req('FeatAnySource', { Item: 'Cleave' }), ctxNo)).toBe(false)
  })

  it('BaseClass passes only when base class levels > 0 (Requirement.cpp:719)', () => {
    expect(meetsSingleRequirement(req('BaseClass', { Item: 'Fighter' }), rctx(mkBuild()))).toBe(true)
    expect(meetsSingleRequirement(req('BaseClass', { Item: 'Wizard' }), rctx(mkBuild()))).toBe(false)
  })

  it('RaceConstruct / NotConstruct gate on construct races (Requirement.cpp:1004,1031)', () => {
    const wf = rctx(mkBuild({ race: 'Warforged' }))
    const human = rctx(mkBuild({ race: 'Human' }))
    expect(meetsSingleRequirement(req('RaceConstruct'), wf)).toBe(true)
    expect(meetsSingleRequirement(req('RaceConstruct'), human)).toBe(false)
    expect(meetsSingleRequirement(req('NotConstruct'), human)).toBe(true)
    expect(meetsSingleRequirement(req('NotConstruct'), wf)).toBe(false)
  })

  it('AlignmentType matches by alignment axis (Requirement.cpp:662)', () => {
    const lg = rctx(mkBuild({ alignment: 'Lawful Good' }))
    expect(meetsSingleRequirement(req('AlignmentType', { Item: 'Lawful' }), lg)).toBe(true)
    expect(meetsSingleRequirement(req('AlignmentType', { Item: 'Good' }), lg)).toBe(true)
    expect(meetsSingleRequirement(req('AlignmentType', { Item: 'Chaotic' }), lg)).toBe(false)
    expect(meetsSingleRequirement(req('AlignmentType', { Item: 'Evil' }), lg)).toBe(false)
  })
})
