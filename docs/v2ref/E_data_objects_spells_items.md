# E. Data Objects — Spells, Items, Buffs, World

This section documents the V2 *static-content* data-object classes for spells, items, augments, set bonuses, filigrees, buffs (self/party/guild/optional), and world content (quests/challenges/patrons). Each class is an `XmlLib::SaxContentElement` whose fields are declared by an `X_PROPERTIES(_)` X-macro list in the matching `.h` and parsed via the `DL_*` macros (the same loader machinery used everywhere in V2). A companion `*File` class is a SAX reader whose `StartElement` watches for the element's self-tag and appends each parsed object into a `std::list<T>` (e.g. `SpellsFile.cpp:42-59`). The loaded lists live in global catalogues, looked up at runtime through `GlobalSupportFunctions` helpers (`FindClass`, `FindBuff`, `FindBreakdown`, `CasterLevelBreakdown`, the `*ToBreakdown` mappers).

Almost all *computation* in these classes is delegated to the breakdown engine (section A) via `FindBreakdown(BreakdownType)->Total()`: spell DC, caster level, school bonuses, spell power, ability mods are all read from already-resolved breakdowns. These classes mostly hold data + a few formula methods that aggregate breakdown totals. In V3 the static content is loaded by `server/dataLoaders.ts` into typed objects (`types/ddo.ts`), the formulas live in `lib/spells/spellMath.ts`, and item/buff effect conversion lives in `lib/effectParser.ts`.

## File Index

| File | Represents | XML source | V3 counterpart |
|------|-----------|------------|----------------|
| Spell.cpp / SpellsFile.cpp | one castable spell (school, level, metamagic flags, DCs, damage, effects, max CL) | `Spells.xml` `<Spells><Spell>` | `loadSpells` (dataLoaders.ts:139), `Spell` (ddo.ts:374), `computeCasterLevel`/`computeMaxCasterLevel`/`computeSpellCost` (spellMath.ts) |
| SpellDC.cpp | a spell's DC block (10 + stat + level + school) | `<Spell><SpellDC>` | `SpellDC` (ddo.ts:356), `computeSpellDC` (spellMath.ts:79) |
| DC.cpp | generic non-spell DC (tactical/skill/class-level scaling) | embedded in feats/enhancements | `lib/effects` tactical DCs / `useBuildStats.ts` tacticalDC.* |
| SpellDamage.cpp | a spell's damage instance (dice + element + spell power) | `<Spell><SpellDamage>` | `SpellDamage` (ddo.ts:363) |
| SpellDice.cpp | dice spec (standard + per-caster-level) with avg/crit math | `<SpellDamage><SpellDice>` | dice fields on `SpellDamage` |
| SpellListAddition.cpp | runtime record that an effect adds a spell to a class list | (none; built at runtime) | spell-list merge in build state (no static file) |
| Item.cpp | equippable item (armor/shield/weapon stats, augments, Buffs, set bonuses) | `Items/*.item` `<Item>` | `loadItems` (dataLoaders.ts:162), `Item` (ddo.ts:205) |
| ItemBuff.cpp | the `<Buff>` entry on an item — references a named buff + override values | `<Item><Buff>` and `ItemBuffs.xml` `<Buffs><Buff>` | `ItemBuff` (ddo.ts:182), `parseItemBuff` (effectParser.ts:1390); `loadItemBuffs` (dataLoaders.ts:313) |
| Augment.cpp | an augment/gem slottable into an item color slot | `Augments/*.Augments.xml` `<Augment>` | `loadAugments` (dataLoaders.ts:176), `Augment` (ddo.ts:267) |
| SetBonus.cpp / SetBonusFile.cpp | a named set with per-equipped-count tiers | `SetBonuses.xml`; also embedded in `FiligreeSets/*.xml` | `loadSetBonuses` (dataLoaders.ts:190), `SetBonus` (ddo.ts:245) |
| SetBonusBuff.cpp | one tier of a SetBonus (`EquippedCount` + effects) | `<SetBonus><Buff>` | `SetBonusBuff` (ddo.ts:239) |
| Filigree.cpp | a sentient-gem filigree (normal/rare effects + set bonuses) | filigree catalogue | `Filigree` (ddo.ts:291), `loadFiligreeSets` (dataLoaders.ts:204) |
| TrainedFiligree.cpp (base of ArtifactFiligree/WeaponFiligree) | a *slotted* filigree reference (Name + Rare flag) | inside saved sentient jewel | `FiligreeSlot` (ddo.ts:302) |
| ArtifactFiligree.cpp / WeaponFiligree.cpp | the artifact / weapon filigree slots | saved build | `FiligreeSlot` |
| Buff.cpp / BuffFile.cpp | a named reusable buff template (effects + value/bonus substitution) | `ItemBuffs.xml` `<Buffs><Buff>` | `loadItemBuffs` (dataLoaders.ts:313); applied via `parseItemBuff` |
| GuildBuff.cpp / GuildBuffsFile.cpp | a guild-level buff gated by guild level | `GuildBuffs.xml` `<GuildBuffs><GuildBuff>` | `loadGuildBuffs` (dataLoaders.ts:197), `GuildBuff` (ddo.ts:320) |
| OptionalBuff.cpp / OptionalBuffFile.cpp | a self/party (spell) buff the user can toggle | `SelfAndPartyBuffs.xml` `<SelfAndPartyBuffs>` | `loadSelfAndPartyBuffs` (dataLoaders.ts:228), `OptionalBuff` (ddo.ts:310) |
| Quest.cpp / QuestsFile.cpp | a quest with favor by difficulty | `Quests.xml` `<Quests><Quest>` | `loadQuests` (dataLoaders.ts:244), `Quest` (ddo.ts:335) |
| Challenge.cpp / ChallengesFile.cpp | a challenge with favor by star rating | `Challenges.xml` `<Challenges><Challenge>` | `loadChallenges` (dataLoaders.ts:300) |
| Patron.cpp / PatronsFile.cpp | a favor patron with favor-reward tiers | `Patrons.xml` `<Patrons><Patron>` | `loadPatrons` (dataLoaders.ts:237), `Patron` (ddo.ts:329) |
| SentientGemsFile.cpp | the list of sentient-jewel skins (`<Gem>`) | `Sentient.gems.xml` `<SentientGems><Gem>` | `loadSentientGems` (dataLoaders.ts:251), `SentientGem` (ddo.ts:347) |
| IgnoredListFile.cpp | user list of feats hidden from selection | `IgnoredList.xml` `<IgnoredList><Ignored>` | (UI prefs; not a content object) |
| GroupLine.cpp | **UI control** (a labelled separator line), not a data object | — | ❌ (UI only) |

---

## Spell.cpp / SpellsFile.cpp

- **Represents**: a single spell. Fields (`Spell.h:55-78`): `Name`, `Description`, `Icon`, `Level` (int), `School` (enum *list* — a spell may belong to multiple schools), `Primer`, `Cost`, `Effects` list, `DCs` list (`SpellDC`), `SpellDamageEffects` list, `Stances`, 10 metamagic flags (`Accelerate Embolden Empower EmpowerHealing Enlarge Extend Heighten Intensify Maximize Quicken`), `MaxCasterLevel`, `Cooldown`. `m_class` is set at runtime (the spell is shared across classes; `SetClass`/`UpdateSpell`, `Spell.cpp:147-172`) and the cost defaults to `5 * spellLevel` if unspecified (`Spell.cpp:151`).
- **`ActualCasterLevel(build)`** (`Spell.cpp:174-197`): `classCasterLevel = CasterLevelBreakdown(Class())->Total()` + Σ over `School()` of `FindBreakdown(CasterLevelSchoolToBreakdown(school))->Total()` + `build.BonusCasterLevels(Name())` (spell-specific) + `build.BonusCasterLevelsSchool(Name())`. No universal term here in V2 (the V3 `cl.All` is an extra hook). Caller `ActualCasterLevelText` caps the display at `ActualMaxCasterLevel` (`Spell.cpp:273-281`).
- **`ActualMaxCasterLevel(build)`** (`Spell.cpp:199-228`): only if `HasMaxCasterLevel()`. `MaxCasterLevel()` + class epic-MCL breakdown `Breakdown_MaxCasterLevel_First + class.Index()` + Σ school `MaxCasterLevelSchoolToBreakdown` + `build.BonusMaxCasterLevels(Name())` + `build.BonusMaxCasterLevelsSchool(Name())`.
- **`MetamagicCount`** (`Spell.cpp:66-80`) counts allowed metamagics. **`TotalCost(build)`** (`Spell.cpp:354-448`): base `Cost()` plus each *active-stance* metamagic's per-metamagic breakdown total; **Heighten is special** — cost is `Heighten breakdown total * (class.MaxSpellLevel(build.Level()) - Level())` (`Spell.cpp:408-422`).
- **`DC(build)`** (`Spell.cpp:113-122`) returns the first DC block's `CalculateSpellDC`.
- **XML source**: `Spells.xml` (`<Spells>` root → `<Spell>`); sample: "Curative Admixture: Cure Light Wounds" has `<School>Conjuration</School>`, `<MaxCasterLevel>5</MaxCasterLevel>`, a `<SpellDamage>`, and a `<SpellDC>` (`Half Damage` vs `Will`, school Conjuration, `<CastingStatMod/>`). The placeholder first entry "No spell trained" has only Name/Description/Icon/School.
- **V3 counterpart**: `loadSpells` (dataLoaders.ts:139) → `Spell` (ddo.ts:374). `computeCasterLevel`/`computeMaxCasterLevel`/`computeSpellCost` (spellMath.ts:131/149/176) mirror the above; V3 reads `stats.total('cl.'+class)`, `clSchool.*`, `clSpell.<name>`, `cl.All` and caps at max (spellMath.ts:144-145). `METAMAGIC_KEYS` (spellMath.ts:63) — note V3 lists `EschewMaterials` where V2 does not have that flag on `Spell`.

## SpellDC.cpp — the spell-DC formula

- **Represents**: one DC block on a spell. Fields (`SpellDC.h:31-38`): `DCType`, `DCVersus` (the save), optional `Amount` (a *fixed* DC override), optional `Other`, flag `CastingStatMod`, `ModAbility` enum list, `School` enum list.
- **`CalculateSpellDC(build, spell)`** (`SpellDC.cpp:62-129`):
  1. `value = 10` (or `Amount()` if present — fixed DC) (`SpellDC.cpp:64-68`).
  2. If `CastingStatMod` and the spell has a class: add `BaseStatToBonus(FindBreakdown(StatToBreakdown(class.ClassCastingStat()))->Total())` (`SpellDC.cpp:70-85`). **The casting stat is the class's own `ClassCastingStat()`** (not the largest of several).
  3. Spell-level term (`SpellDC.cpp:87-98`): if Heighten metamagic is active (`build->IsStanceActive("Heighten Spell")`) add `class.MaxSpellLevel(build->Level())`, else add `spell.Level()`.
  4. `ModAbility` term (`SpellDC.cpp:101-118`): if any `ModAbility` entries, add the **largest** ability mod among them (`BaseStatToBonus(...->Total())`).
  5. School bonuses (`SpellDC.cpp:120-128`): **add all** of `FindBreakdown(SchoolToBreakdown(school))->Total()` for every school listed.
- **XML source**: `<Spell><SpellDC>` (see Spell sample).
- **V3 counterpart**: `computeSpellDC` (spellMath.ts:79-125). Differences to note for parity: V3 `pickCastingStat` picks the *highest-mod* casting stat from a list (spellMath.ts:55-60) whereas V2 uses the single `ClassCastingStat`; V3 falls back to the spell's own `School` when the DC block has none (spellMath.ts:116-117) — V2 does not, it iterates only the DC's `m_School`; V3 adds universal `dc.All` + `dc.Spell` terms (spellMath.ts:122-123) absent in V2.

## DC.cpp (generic / tactical DCs)

- **Represents**: a non-spell DC (used by feats/enhancements for tactical feats, skill checks, etc.). Richer than `SpellDC`. Fields (`DC.h:39-57`): `Name`, `Description`, `Icon`, `DCType`, `DCVersus`, optional `Other`, `Amount` vector (per-stack), `ClassMultiplier` vector, `FullAbility` list (uses *full* score total), `ModAbility` list (uses ability *mod*), `School` list, optional `Skill`, `Tactical`/`Tactical2`, and four class-level scaling strings (`ClassLevel`, `HalfClassLevel`, `BaseClassLevel`, `HalfBaseClassLevel`). `m_stacks` (default 1, `AddStack`/`RevokeStack`) selects the indexed `Amount`/`ClassMultiplier`.
- **`CalculateDC(build)`** (`DC.cpp:95-209`): base from `Amount[stacks-1]` (clamped to last); + **largest** `FullAbility` total (raw, not mod); + **largest** `ModAbility` mod (seeded at -5); + skill breakdown; + tactical breakdown(s); + **all** school bonuses; + class-level terms scaled by `multiplier` (`ClassLevel` full, `HalfClassLevel` ÷2 round-down, plus base-class variants), using `build->ClassLevels(...)`/`BaseClassLevels(...)`. `DCBreakdown` (`DC.cpp:211-479`) renders the human-readable sum (truncates ability names to 3 chars; replaces "0.5"/"0.5×" glyphs).
- **XML source**: embedded inside feat/enhancement XML, not a standalone file.
- **V3 counterpart**: tactical DCs are computed in `useBuildStats.ts` (`tacticalDC.*`) / `lib/effects`; see section A `BreakdownItemTactical`.

## SpellDamage.cpp / SpellDice.cpp

- **SpellDamage represents** a spell damage instance: `DamageDice` (a `SpellDice`), optional `Damage` element type, optional `SpellPower` type (`SpellDamage.h:32-35`). `SpellDamageText`/`AverageDamageText`/`CriticalDamageText` (`SpellDamage.cpp:54-217`) pull spell power, crit chance, and crit multiplier from breakdowns (`SpellPowerToBreakdown`, `...CriticalChanceBreakdown`, `...CriticalMultiplierBreakdown`) using `ReplacementTotal()` (highest replacement), then multiply by `(1 + spellPower)` where `spellPower = breakdown/100` (`SpellDamage.cpp:62-92`); default crit multiplier 2.0.
- **SpellDice represents** the dice spec (`SpellDice.h:30-35`): optional `StandardDice` (`BaseDice`), `PerCasterLevels` (divisor, default 1), `DicePerCasterLevel` (`BonusDice`), plus `Damage`/`SpellPower`. `AverageDamageText`/`CriticalDamageText` (`SpellDice.cpp:51-132`): `total = standard + perCL * floor(casterLevel / perCasterLevel)`, then `floor(total * spellPower [* critMultiplier])`. `VerifyObject` requires a `MaxCasterLevel` whenever per-caster-level dice exist (`SpellDamage.cpp:248-253`).
- **XML source**: `<Spell><SpellDamage><SpellDice>` — sample uses `<BonusDice><Number>1</Number><Sides>8</Sides><Bonus>1</Bonus></BonusDice>`, `<Damage>Positive</Damage>`, `<SpellPower>Positive</SpellPower>`.
- **V3 counterpart**: `SpellDamage` (ddo.ts:363); the avg/crit display math is a V2 tooltip helper (V3 surfaces it in spell panels). Cross-ref: spell power breakdowns = section A `BreakdownItemSpellPower`.

## SpellListAddition.cpp

- **Represents**: a *runtime* (not XML) record that an effect adds a spell to a class spell list. Ctor stores `class`, `spellLevel`, `spellName`, `count` (`SpellListAddition.cpp:6-15`). `AddsToSpellList` matches by (class, level) or (class, name) (`:21-31`); `AddReference`/`RemoveReference` ref-count so the addition is removed when the last contributing effect goes away (`:38-48`).
- **V3 counterpart**: spell-list merging happens in build state when effects of the relevant type are active; there is no static file.

## Item.cpp / ItemBuff.cpp

- **Item represents** an equippable item. Fields (`Item.h:64-100`): `Name`, `Icon`, `Description`, `DropLocation`, `MinLevel`, `Slots`/`RestrictedSlots` (`EquipmentSlot`), `RequirementsToUse`, weapon fields (`Weapon`, `AttackModifier`/`DamageModifier` ability lists, `DRBypass`, `WeaponDamage`, `DamageDice`, `CriticalMultiplier`, `CriticalThreatRange`), armor fields (`Armor` type enum, `ArmorBonus`, `MithralBody`/`AdamantineBody`, `MaximumDexterityBonus`, `ArmorCheckPenalty`, `ArcaneSpellFailure`), `ShieldBonus`, `DamageReduction`, `Material`, an `Effects` vector, a **`Buffs` vector** (`Buff` objects), `SetBonus` string list, `Augments` (`ItemAugment`), `SlotUpgrades`, and flags `IsAcceptsSentience`/`IsGreensteel`/`MinorArtifact`.
- **How item Buffs become effects**: an item's `<Buff>` entries are `Buff` objects whose `Type` *names* a template in `ItemBuffs.xml`. `BuffDescriptions` (`Item.cpp:357-380`) does `Buff buff = FindBuff(it.Type())` then overrides `BonusType`/`Ignore`/`Value1`/`Value2`/`Item`/`Description1` from the item's entry and renders `MakeDescription()`. `FindEffect(et)` (`Item.cpp:452-472`) checks the item's own `Effects` first, then resolves each Buff via `FindBuff(...).Effects()`. `BuffValue(et)` (`Item.cpp:474-506`) returns the first matching effect amount, calling `bit.UpdatedEffects(&effects, false)` to inject the item's `Value1/2` into the template effects. `RealCriticalThreatRange` (`Item.cpp:440-450`) adds the weapon's base crit range when a Keen effect is present. `HasSetBonus` (`Item.cpp:508+`) also checks augment-provided set bonuses (and augment `SuppressSetBonus`).
- **ItemBuff.cpp** is a *separate, smaller* class (`ItemBuff.h:24-28`): `Type`, `Bonus`, `Item` string list, `Values` vector. This is the wrapper used by the standalone `ItemBuffs.xml` enumerations (loaded by `loadItemBuffs`), distinct from `Buff` (the template) and from the `Item`'s `Buffs` vector. (V3 collapses the item's per-item `<Buff>` into the `ItemBuff` interface.)
- **XML source**: `Items/*.item` (one `<Item>` each). Armor sample (Heavy Armor of the Warblade's Reflection): `<Armor>Heavy</Armor>`, `<ArmorBonus>43</ArmorBonus>`, `<MaximumDexterityBonus>6</MaximumDexterityBonus>`, `<ArmorCheckPenalty>-5</ArmorCheckPenalty>`, `<ArcaneSpellFailure>35</ArcaneSpellFailure>`, then multiple `<Buff>` blocks with `<Type>`, `<Value1>`, `<BonusType>`. `ItemBuffs.xml` root is `<Buffs>` with `<Buff>` templates (e.g. `BuffNotFound` sentinel, `+2 vs Evil`, named on-hit litanies).
- **V3 counterpart**: `loadItems` (dataLoaders.ts:162), `Item` (ddo.ts:205) with armor/weapon/shield field groups; `ItemBuff` (ddo.ts:182) = the per-item `<Buff>` (Type/Value1/BonusType/Description1/Item/Percent); `parseItemBuff` (effectParser.ts:1390) converts it to `ParsedBonus[]` (Value1 magnitude, BonusType bonus type, SchoolFocus/SpellFocus special-cased at effectParser.ts:1569/1576). `loadItemBuffs` (dataLoaders.ts:313) loads the `ItemBuffs.xml` templates. Cross-ref: effect→bonus engine = section B; AC/armor breakdowns = section A.

## Augment.cpp

- **Represents**: an augment/gem that slots into an item color slot. Fields (`Augment.h:35-55`): `Name`, `Description`, `MinLevel`, `Icon`, `Type` string list (slot colors it fits), `AddAugment`/`GrantAugment`/`GrantConditionalAugment` (chains that add further augment slots), `WeaponClass`, flags `DualValues`/`EnterValue`/`ChooseLevel`, `Levels` + `LevelValue`/`LevelValue2` vectors (value scales by chosen level), `SetBonus` list + `SuppressSetBonus` flag, `StanceData`, `EffectDescription`, and `Effects` list. `IsCompatibleWithSlot` (`Augment.cpp:63`) matches by slot type/color; `CompoundDescription` (`Augment.cpp:112`) builds the display.
- **XML source**: `Augments/*.Augments.xml` (`<Augment>`). Sample "Adamantine": `<MinLevel>29</MinLevel>`, `<Type>Legendary Alchemical Material</Type>`, a `DRBypass` effect, and `<AddAugment>Legendary Alchemical Tier 1</AddAugment>` (slot-chaining).
- **V3 counterpart**: `loadAugments` (dataLoaders.ts:176), `Augment` (ddo.ts:267).

## SetBonus.cpp / SetBonusFile.cpp / SetBonusBuff.cpp

- **SetBonus represents** a named set whose buffs apply once N matching "items" are equipped; unique by `Type` (`SetBonus.h:27-32`): `Type`, `AdditionalDescription`, `Icon`, `IgnoreForParse` flag, `Buffs` list of `SetBonusBuff`. **`ActiveEffects(stacks)`** (`SetBonus.cpp:88-109`) returns only the effects of buffs whose `EquippedCount == stacks` (i.e. the tier exactly matching the current equipped count, not cumulative), defaulting each effect's display name to the set `Type` if unset.
- **SetBonusBuff represents** one tier (`SetBonusBuff.h:23-26`): `EquippedCount` (the count that activates this tier), `Description`, `Effects` list. Its SAX element name is literally `Buff` (`SetBonusBuff.cpp:12`).
- **XML source**: `SetBonuses.xml` (`<SetBonuses><SetBonus>`). Sample "Inevitable Balance" → `<Buff><EquippedCount>2</EquippedCount>` granting MeleePower+Doublestrike. Set bonuses are *also* embedded in each `FiligreeSets/*.Filigree.xml` (root `<Filigrees>`) — e.g. "Angelic Wings" with tiers at EquippedCount 2/3/4/5.
- **V3 counterpart**: `loadSetBonuses` (dataLoaders.ts:190) + `loadFiligreeBonuses` (dataLoaders.ts:216) for the filigree-embedded sets; `SetBonus` (ddo.ts:245), `SetBonusBuff` (ddo.ts:239).

## Filigree.cpp / ArtifactFiligree.cpp / WeaponFiligree.cpp / TrainedFiligree.cpp

- **Filigree (catalogue) represents** a sentient-gem filigree definition (`Filigree.h:32-38`): `Name`, `Description`, `Icon`, `Menu` (grouping), `Effects` list, `SetBonus` string list. `NormalEffects()` / `RareEffects()` split the effect list by the per-effect `Rare` flag (`Filigree.cpp:56-80`); `HasSetBonus` checks membership (`:82-93`); sorting is by `Menu` then `Name` (`:95-111`).
- **TrainedFiligree (slot) represents** a *slotted* filigree reference on a saved build (`TrainedFiligree.h:26-28`): just `Name` + `Rare` flag. `ArtifactFiligree` and `WeaponFiligree` are thin subclasses choosing the element names `ArtifactFiligree` / `Filigree` respectively (`ArtifactFiligree.cpp:14-17`, `WeaponFiligree.cpp:14-17`). The set bonuses from sentient-gem filigrees are aggregated like item set bonuses (counting filigrees in the gem that share a `SetBonus` name).
- **XML source**: filigree catalogue with embedded `<SetBonus>` tiers (see SetBonus above); slotted filigrees are saved inside the sentient jewel on a build.
- **V3 counterpart**: `Filigree` (ddo.ts:291) + `FiligreeSetBonus`/`FiligreeSetBuff` (ddo.ts:285/279); `loadFiligreeSets` (dataLoaders.ts:204), `loadFiligreeBonuses` (dataLoaders.ts:216); slot state = `FiligreeSlot` (ddo.ts:302). Cross-ref: gem/filigree state = section D character data objects.

## Buff.cpp / BuffFile.cpp

- **Represents**: a reusable named buff template (`Buff.h:32-46`): `Type` (the lookup key), flags `ApplyToWeaponOnly`/`NegativeValues`, `DisplayText` lines (with `%v1`/`%v2`/`%b1`/`%i1` placeholders), `Ignore` list, `Value1`/`Value2`, `BonusType`, `Description1`, `Item`/`Item2`, `Effects` list, `Stances`, `RequirementsToUse`. `MakeDescription` (`Buff.cpp:95-162`) substitutes the placeholders (negating values when `NegativeValues`). **`UpdatedEffects(effects, bNegativeValues)`** (`Buff.cpp:164-249`) is the key method: it stamps `BonusType` onto every effect, injects `Item`/`Item2` filters, and assigns `Value1`/`Value2` to effect amounts — when both are present, `Value1` goes to even-indexed effects and `Value2` to odd-indexed (`:195-228`); requirements are propagated. This is how an item's `<Buff>` (which only carries values) drives the shared template's effects.
- **XML source**: `ItemBuffs.xml` (`<Buffs><Buff>`); contains a `BuffNotFound` sentinel returned by `FindBuff` on miss (`Buff.cpp:61-62`).
- **V3 counterpart**: templates loaded by `loadItemBuffs` (dataLoaders.ts:313); the value-injection + bonus-stamping behavior is reproduced inside `parseItemBuff` (effectParser.ts:1390). Cross-ref: effect engine = section B.

## GuildBuff.cpp / GuildBuffsFile.cpp

- **Represents**: a guild-amenity buff (`GuildBuff.h:23-27`): `Name`, `Description`, `Level` (guild level required), `Effects` list. Plain data — no formula methods.
- **XML source**: `GuildBuffs.xml` (`<GuildBuffs><GuildBuff>`). Sample "Sign of the Silver Flame I" `<Level>10</Level>` with `TotalLevel`-scaled `Amount` vectors (40 entries) for energy resistance and spell power per character level.
- **V3 counterpart**: `loadGuildBuffs` (dataLoaders.ts:197), `GuildBuff` (ddo.ts:320). Active guild buffs are gated by the build's selected guild level.

## OptionalBuff.cpp / OptionalBuffFile.cpp

- **Represents**: a self/party (spell) buff the user can toggle (`OptionalBuff.h:25-29`): `Name`, `Icon`, `Description`, `Effects` vector. Sorted by `Name` (`OptionalBuff.cpp:74-79`).
- **XML source**: `SelfAndPartyBuffs.xml` (root `<SelfAndPartyBuffs>`; loader root name confirmed in `OptionalBuffFile.cpp`).
- **V3 counterpart**: `loadSelfAndPartyBuffs` (dataLoaders.ts:228), `OptionalBuff` (ddo.ts:310).

## Quest.cpp / QuestsFile.cpp

- **Represents**: a quest (`Quest.h:47-62`): `Name`, `EpicName`, `Patron` enum, `AdventurePack`, difficulty-availability flags (`Solo`/`Casual`/`Normal`/`Hard`/`Elite`/`Reaper`), `IsRaid`/`DoNotShow`/`IgnoreForTotalFavor`, base `Favor` int, `Levels` vector. **`Favor(diff)`** (`Quest.cpp:107-130`): casual = base/2, normal/solo = base, hard = base×2, elite/all-reaper = base×3. **`MaxFavor()`** (`Quest.cpp:97-105`): ×3 if Reaper/Elite available, ×2 if Hard, ×1 if Normal/Solo, ÷2 if only Casual.
- **XML source**: `Quests.xml` (`<Quests><Quest>`).
- **V3 counterpart**: `loadQuests` (dataLoaders.ts:244), `Quest` (ddo.ts:335).

## Challenge.cpp / ChallengesFile.cpp

- **Represents**: a challenge (`Challenge.h:47-51`): `Name`, `Patron` enum, `AdventurePack`, `LevelRange` vector (`[min,max]`). **`Favor(diff)`** (`Challenge.cpp:103-117`) returns the star count directly (1–6). **`MaxFavor()`** is always `6` (`Challenge.cpp:97-101`). Sorting compares name then `LevelRange[0]`/`[1]`.
- **XML source**: `Challenges.xml` (`<Challenges><Challenge>`).
- **V3 counterpart**: `loadChallenges` (dataLoaders.ts:300). (No dedicated `Challenge` interface noted in ddo.ts — verify before reuse.)

## Patron.cpp / PatronsFile.cpp

- **Represents**: a favor patron (`Patron.h:27-30`): `Name` (PatronType enum), `FavorTiers` int vector (favor thresholds for reward tiers), `AssociatedFavorFeat`. `m_maxFavor` is set externally via `SetMaxFavor`/`MaxFavor` (`Patron.cpp:80-88`) — computed by summing the max favor of all quests/challenges for that patron.
- **XML source**: `Patrons.xml` (`<Patrons><Patron>`). Sample "Agents of Argonnessen" `<FavorTiers size="4">75 150 400 700</FavorTiers>`, `<AssociatedFavorFeat>`.
- **V3 counterpart**: `loadPatrons` (dataLoaders.ts:237), `Patron` (ddo.ts:329).

## SentientGemsFile.cpp

- **Represents**: the list of sentient-jewel cosmetic definitions. The loader (`SentientGemsFile.cpp:43-60`) pushes `Gem` objects from `<SentientGems><Gem>` (each: `Name`, `Icon`, `Description` — e.g. "Sentient Jewel of the Hopeful"). The actual filigree slots a gem holds are the `TrainedFiligree`/`ArtifactFiligree`/`WeaponFiligree` saved on the build.
- **XML source**: `Sentient.gems.xml`.
- **V3 counterpart**: `loadSentientGems` (dataLoaders.ts:251), `SentientGem` (ddo.ts:347); slotted-filigree state = `SentientGemState` (ddo.ts:531).

## IgnoredListFile.cpp

- **Represents**: a user preference list of feat names hidden from the feat selectors. Loader reads `<Ignored>` simple elements into `std::list<string>` (`IgnoredListFile.cpp:43-59`); `Save` writes them back (`:72-104`). Not game content — a UI/prefs persistence file.
- **XML source**: `IgnoredList.xml` (`<IgnoredList><Ignored>`).
- **V3 counterpart**: a UI/preferences concern, not a content loader.

## GroupLine.cpp

- **Not a data object.** `CGroupLine` is an MFC `CWnd` control that paints a labelled horizontal separator line (`GroupLine.cpp:92-160`). Included here only because it appeared in the file list; it has no XML source and no V3 data counterpart (V3 styling/layout is CSS/components).

---

## Cross-references

- **Caster-level / spell-power / DC breakdown internals** → section A (`A_breakdowns.md`): `BreakdownItemCasterLevel`, `BreakdownItemSchoolCasterLevel`, `BreakdownItemSpellSchool` (per-school DC), `BreakdownItemSpellPower`, `BreakdownItemTactical`. Every formula in this section reads `FindBreakdown(...)->Total()` from those.
- **Effect → bonus engine** → section B: how `Effect`/`Buff` objects (item Buffs, set-bonus effects, augment effects, guild/optional/spell effects documented here) are emitted and applied. V3 entry point `parseItemBuff` / effect conversion in `effectParser.ts`.
- **Character data objects** → section D: the *build-side* containers that hold equipped items, slotted augments, the sentient jewel + its filigrees, trained spells, active stances, and selected guild/optional buffs — the runtime consumers of the static catalogues documented here.
