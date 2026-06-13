/**
 * Parity pass — gear-data edge cases (PARITY_TODO "Data-file edge cases").
 *
 * Covers four V2↔V3 parity items:
 *
 * 1. Sentient gem personality buffs — NOT A GAP. V2's Gem class
 *    (DDOBuilder/Gem.h:31-34) holds only Name/Description/Icon; the data file
 *    (Output/DataFiles/Sentient.gems.xml) contains zero <Effect> elements.
 *    V2 uses the personality solely for the jewel icon/tooltip
 *    (InventoryDialog.cpp:313-325, 764-770). It never applies stat effects,
 *    so V3 applying nothing matches V2 exactly.
 *
 * 2. Cosmetic gear effects — V2 declares the cosmetic slots AFTER the
 *    Inventory_Count sentinel (InventorySlotTypes.h:33-38) and
 *    Build::ApplyGearEffects (Build.cpp:4824-4834) only loops
 *    Inventory_Unknown+1..Inventory_Count, so cosmetic items are displayed
 *    but never contribute effects, set bonuses, or augments. V3 strips
 *    cosmetic slots in buildStatMap (stripCosmeticSlots) and ignores
 *    cosmetic-slot augment choices.
 *
 * 3. Item slot edge cases — Ring1/Ring2 are two independent slots
 *    (InventorySlotTypes.h:26-27); "trinket-via-augment" is NOT A GAP:
 *    V2's Augment class (Augment.h:35-56) can only add/grant *augment*
 *    slots (AddAugment / GrantAugment / GrantConditionalAugment) — there is
 *    no mechanic by which an augment grants or occupies an inventory
 *    (trinket) slot. Augment types like "Reaper Trinket" are ordinary
 *    augment-slot types hosted BY trinket items.
 *
 * 4. Filigree set bonuses with conditional triggers — V2 gates them behind
 *    user-toggleable stances: e.g. Deadly Rain 5pc (+20 Ranged Power) has
 *    Requirements → Requirement → Stance:"Action Boost"
 *    (Output/DataFiles/FiligreeSets/DeadlyRain.Filigree.xml:38-53), and the
 *    "Action Boost" stance is hosted on the automatically-acquired "Attack"
 *    feat (Feats.xml, Group=User) and surfaced by CStancesPane as a toggle.
 *    V3 already evaluates Stance requirements against build.activeBuffs;
 *    loadStances now merges the Attack-feat user stances so the trigger is
 *    toggleable in the Stances panel.
 */

import { describe, it, expect } from 'vitest'
import { existsSync, readFileSync } from 'fs'
import { join } from 'path'
import { computeBuildStats, stripCosmeticSlots, type BuildStatsInput } from '../hooks/useBuildStats'
import { emptyBuild as makeEmptyBuild } from '../types/ddo'
import type {
  DDOClass, Feat, EnhancementTree, FiligreeSetBonus, Filigree,
  Item, OptionalBuff, SetBonus, Augment,
} from '../types/ddo'
import { importV2Build } from '../lib/v2Import'
import { exportV2Build } from '../lib/v2Export'
import {
  loadSentientGems, loadItems, loadAugments, loadStances,
  loadFiligreeSets, loadFiligreeBonuses,
} from '../server/dataLoaders'

const FIXTURE_DIR = join(__dirname, '..', '..', '..', 'Output', 'Example Builds')
const DATA_DIR = join(__dirname, '..', '..', '..', 'Output', 'DataFiles')

const haveData = existsSync(DATA_DIR) && existsSync(join(FIXTURE_DIR, 'YingsMonk.DDOBuild'))
const maybeDescribe = haveData ? describe : describe.skip

function emptyInput(): BuildStatsInput {
  return {
    allRaces: [],
    allClasses: [] as DDOClass[],
    allFeats: [] as Feat[],
    allTrees: [] as EnhancementTree[],
    gearItems: {} as Record<string, Item>,
    allSelfBuffs: [] as OptionalBuff[],
    allAugments: [] as Augment[],
    allSetBonuses: [] as SetBonus[],
    allFiligreeBonuses: [] as FiligreeSetBonus[],
    allFiligrees: [] as Filigree[],
  }
}

// ---------------------------------------------------------------------------
// 1. Sentient gem personalities — purely cosmetic in V2 (not-a-gap)
// ---------------------------------------------------------------------------

maybeDescribe('sentient gem personalities are cosmetic-only (V2 Gem.h:31-34)', () => {
  it('no gem in Sentient.gems.xml carries Effect or Buff data', () => {
    const gems = loadSentientGems(DATA_DIR)
    expect(gems.length).toBeGreaterThanOrEqual(10)
    for (const gem of gems) {
      const raw = gem as unknown as Record<string, unknown>
      expect(raw.Effect, `${gem.Name} should have no effects`).toBeUndefined()
      expect(raw.Buff, `${gem.Name} should have no buffs`).toBeUndefined()
    }
  })

  it('setting a personality changes no stat totals (matches V2 ApplyGearEffects)', () => {
    const base = makeEmptyBuild()
    const withPersonality = {
      ...makeEmptyBuild(),
      sentientGem: {
        name: 'Sentient Jewel of the Kobold',
        personality: 'Sentient Jewel of the Kobold',
        majorAugment: '',
        minorAugment: '',
      },
    }
    const statsBase = computeBuildStats(emptyInput(), base)
    const statsPers = computeBuildStats(emptyInput(), withPersonality)
    expect(statsPers.keys().sort()).toEqual(statsBase.keys().sort())
    for (const key of statsBase.keys()) {
      expect(statsPers.total(key)).toBe(statsBase.total(key))
    }
  })

  it('V2 import preserves the personality string for display', () => {
    const xml = readFileSync(join(FIXTURE_DIR, 'YingsMonk.DDOBuild'), 'utf-8')
    const { build } = importV2Build(xml)
    expect(build.sentientGem.personality).toBe('Sentient Jewel of the Kobold')
  })
})

// ---------------------------------------------------------------------------
// 2. Cosmetic gear slots — displayed but never contribute stats
// ---------------------------------------------------------------------------

describe('cosmetic slots never contribute stats (V2 Build.cpp:4824-4834)', () => {
  const buffedItem: Item = {
    Name: 'Suspiciously Buffed Cosmetic',
    Buff: [{ Type: 'SchoolFocusNumber', Value1: 3, BonusType: 'Equipment', Item: 'Evocation' }],
  } as Item

  it('stripCosmeticSlots drops every Cosmetic* slot and keeps the rest', () => {
    const filtered = stripCosmeticSlots({
      'Armor': buffedItem,
      'Cosmetic Armor': buffedItem,
      'Cosmetic Helmet': buffedItem,
      'Cosmetic Cloak': buffedItem,
      'Cosmetic Weapon': buffedItem,
      'Cosmetic Off Hand': buffedItem,
    })
    expect(Object.keys(filtered)).toEqual(['Armor'])
  })

  it('an item buff applies from Armor but NOT from Cosmetic Armor', () => {
    const inNormal = computeBuildStats(
      { ...emptyInput(), gearItems: { Armor: buffedItem } }, makeEmptyBuild())
    expect(inNormal.total('dc.Evocation')).toBe(3)

    const inCosmetic = computeBuildStats(
      { ...emptyInput(), gearItems: { 'Cosmetic Armor': buffedItem } }, makeEmptyBuild())
    expect(inCosmetic.total('dc.Evocation')).toBe(0)
  })

  it('cosmetic items do not count toward gear set bonuses', () => {
    const setItem = (name: string): Item => ({ Name: name, SetBonus: 'Test Set' } as Item)
    const setBonus: SetBonus = {
      Type: 'Test Set',
      Buff: [{
        EquippedCount: 2,
        Effect: { Type: 'PRR', Bonus: 'Profane', AType: 'Simple', Amount: 7 },
      }],
    } as unknown as SetBonus

    // Both pieces in real slots → 2pc tier fires
    const real = computeBuildStats({
      ...emptyInput(), allSetBonuses: [setBonus],
      gearItems: { Helmet: setItem('Piece A'), Belt: setItem('Piece B') },
    }, makeEmptyBuild())
    expect(real.total('prr')).toBe(7)

    // Second piece only in a cosmetic slot → count stays at 1, no tier
    const cosmetic = computeBuildStats({
      ...emptyInput(), allSetBonuses: [setBonus],
      gearItems: { Helmet: setItem('Piece A'), 'Cosmetic Helmet': setItem('Piece B') },
    }, makeEmptyBuild())
    expect(cosmetic.total('prr')).toBe(0)
  })

  it('augments slotted on cosmetic items are ignored', () => {
    const augment: Augment = {
      Name: 'Test Diamond',
      Effect: { Type: 'PRR', Bonus: 'Profane', AType: 'Simple', Amount: 5 },
    } as unknown as Augment

    const inNormal = computeBuildStats(
      { ...emptyInput(), allAugments: [augment] },
      { ...makeEmptyBuild(), augmentChoices: { 'Armor:Blue:0': 'Test Diamond' } })
    expect(inNormal.total('prr')).toBe(5)

    const inCosmetic = computeBuildStats(
      { ...emptyInput(), allAugments: [augment] },
      { ...makeEmptyBuild(), augmentChoices: { 'Cosmetic Armor:Blue:0': 'Test Diamond' } })
    expect(inCosmetic.total('prr')).toBe(0)
  })
})

maybeDescribe('cosmetic slots — data catalogue and V2 round-trip', () => {
  it('the item catalogue serves cosmetic-slot items via V2 EquipmentSlot keys', () => {
    const items = loadItems(DATA_DIR)
    const bySlot = (key: string) => items.filter(i => {
      const s = (i as unknown as Record<string, unknown>).EquipmentSlot
      return s != null && typeof s === 'object' && key in (s as Record<string, unknown>)
    })
    // V2 InventorySlotTypeMap names: CosmeticArmor / CosmeticCloak / CosmeticHelm
    expect(bySlot('CosmeticArmor').length).toBeGreaterThan(10)
    expect(bySlot('CosmeticCloak').length).toBeGreaterThan(10)
    expect(bySlot('CosmeticHelm').length).toBeGreaterThan(10)
    expect(bySlot('CosmeticCloak').some(i => i.Name === 'Black and Red Cosmetic Cloak')).toBe(true)
  })

  it('V2 <CosmeticCloak> imports into the "Cosmetic Cloak" slot and exports back', () => {
    const xml = readFileSync(join(FIXTURE_DIR, 'YingsMonk.DDOBuild'), 'utf-8')
    // Inject a cosmetic cloak into the first (active) EquippedGear set.
    const injected = xml.replace(
      '<EquippedGear>',
      '<EquippedGear><CosmeticCloak><Name>Black and Red Cosmetic Cloak</Name></CosmeticCloak>',
    )
    const { build } = importV2Build(injected)
    expect(build.gear['Cosmetic Cloak']).toBe('Black and Red Cosmetic Cloak')

    const exported = exportV2Build(build)
    expect(exported).toContain('<CosmeticCloak>')
    expect(exported).toContain('Black and Red Cosmetic Cloak')
    const { build: reimported } = importV2Build(exported)
    expect(reimported.gear['Cosmetic Cloak']).toBe('Black and Red Cosmetic Cloak')
  })
})

// ---------------------------------------------------------------------------
// 3. Item slot edge cases — Ring1/Ring2, trinket-via-augment
// ---------------------------------------------------------------------------

describe('two ring slots (V2 InventorySlotTypes.h:26-27)', () => {
  it('items in Ring1 and Ring2 both contribute (different bonus types stack)', () => {
    const ring1: Item = {
      Name: 'Ring A',
      Buff: [{ Type: 'SchoolFocusNumber', Value1: 3, BonusType: 'Equipment', Item: 'Abjuration' }],
    } as Item
    const ring2: Item = {
      Name: 'Ring B',
      Buff: [{ Type: 'SchoolFocusNumber', Value1: 2, BonusType: 'Insightful', Item: 'Abjuration' }],
    } as Item
    const stats = computeBuildStats(
      { ...emptyInput(), gearItems: { Ring1: ring1, Ring2: ring2 } }, makeEmptyBuild())
    expect(stats.total('dc.Abjuration')).toBe(5)
  })
})

maybeDescribe('ring slots + trinket import from real V2 build', () => {
  const xml = readFileSync(join(FIXTURE_DIR, 'YingsMonk.DDOBuild'), 'utf-8')
  const { build } = importV2Build(xml)

  it('V2 Ring1/Ring2 import into two distinct V3 slots', () => {
    expect(build.gear['Ring']).toBeTruthy()
    expect(build.gear['Ring2']).toBeTruthy()
  })

  it('the trinket slot is populated only by the <Trinket> gear element', () => {
    expect(build.gear['Trinket']).toBeTruthy()
  })
})

maybeDescribe('trinket-via-augment is not a V2 mechanic (Augment.h:35-56)', () => {
  it('no augment in the catalogue grants or occupies an inventory slot', () => {
    const augments = loadAugments(DATA_DIR)
    expect(augments.length).toBeGreaterThan(500)
    for (const aug of augments) {
      const raw = aug as unknown as Record<string, unknown>
      // V2 Augment_PROPERTIES has no inventory-slot fields: augments can only
      // add further AUGMENT slots (AddAugment/GrantAugment), never gear slots.
      expect(raw.EquipmentSlot, `${aug.Name} must not declare an equipment slot`).toBeUndefined()
      expect(raw.InventorySlot, `${aug.Name} must not declare an inventory slot`).toBeUndefined()
      expect(raw.GrantSlot, `${aug.Name} must not grant a gear slot`).toBeUndefined()
    }
  })

  it('"Trinket"-named augment types are ordinary augment-slot types', () => {
    const augments = loadAugments(DATA_DIR)
    const types = (a: Augment): string[] => {
      const t = (a as unknown as { Type?: string | string[] }).Type
      return Array.isArray(t) ? t : t ? [t] : []
    }
    const trinketTyped = augments.filter(a => types(a).some(t => t.includes('Trinket')))
    // e.g. "Reaper Trinket", "Cannith Trinket Prefix/Suffix" — these are slot
    // TYPES hosted by trinket items' <ItemAugment> lists, not slot grants.
    expect(trinketTyped.length).toBeGreaterThan(0)
  })
})

// ---------------------------------------------------------------------------
// 4. Filigree set bonuses with conditional (stance-gated) triggers
// ---------------------------------------------------------------------------

maybeDescribe('conditional filigree set-bonus tiers are stance-toggleable', () => {
  const allFiligrees = loadFiligreeSets(DATA_DIR)
  const allFiligreeBonuses = loadFiligreeBonuses(DATA_DIR)

  // Five Deadly Rain filigrees that do NOT themselves grant Ranged Power, so
  // ranged.power isolates the set-bonus tiers (2pc = +5 RP always-on;
  // 5pc = +20 RP gated on the "Action Boost" stance).
  const slots = [
    'Deadly Rain: +1 Dexterity',
    'Deadly Rain: +1 Wisdom',
    'Deadly Rain: +1 Attack and Damage',
    'Deadly Rain: +2 Critical Attack and Damage',
    'Deadly Rain: +3 PRR',
  ].map(name => ({ name, rare: false }))

  const input = (): BuildStatsInput => ({ ...emptyInput(), allFiligrees, allFiligreeBonuses })

  it('fixture filigrees exist in the catalogue', () => {
    const names = new Set(allFiligrees.map(f => f.Name))
    for (const s of slots) expect(names.has(s.name), s.name).toBe(true)
    expect(allFiligreeBonuses.some(b => b.Type === 'Deadly Rain')).toBe(true)
  })

  it('5pc Deadly Rain WITHOUT Action Boost active: only the always-on +5 RP tier', () => {
    const build = { ...makeEmptyBuild(), filigreeSlots: slots }
    const stats = computeBuildStats(input(), build)
    expect(stats.total('ranged.power')).toBe(5)
  })

  it('5pc Deadly Rain WITH the Action Boost stance toggled: +5 and +20 both fire', () => {
    const build = { ...makeEmptyBuild(), filigreeSlots: slots, activeBuffs: ['Action Boost'] }
    const stats = computeBuildStats(input(), build)
    expect(stats.total('ranged.power')).toBe(25)
  })

  it('loadStances surfaces the feat-hosted "Action Boost" user toggle (V2 CStancesPane)', () => {
    const stances = loadStances(DATA_DIR)
    const actionBoost = stances.find(s => s.Name === 'Action Boost')
    expect(actionBoost).toBeDefined()
    // 'Group' is in the XML parser's isArray list, so it arrives as ['User'].
    const group = actionBoost?.Group
    expect(Array.isArray(group) ? group[0] : group).toBe('User')
    // Not auto-controlled → rendered as a toggle button in StancesPanel
    expect(Boolean(actionBoost?.AutoControlled)).toBe(false)
  })
})
