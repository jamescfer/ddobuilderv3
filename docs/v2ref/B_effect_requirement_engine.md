# B. Effect & Requirement Engine

This section documents the V2 C++ "effect" system (how a single bonus computes its numeric contribution and decides whether it is active) and the "requirement" system (the boolean predicate tree that gates feats, enhancements, effects, and item buffs). An `Effect` is a SAX-loaded XML object carrying a `Type` (what stat it touches), a `Bonus` (the named bonus-type used for stacking), an `AType` (how its numeric `Amount` is interpreted), an optional `RequirementsToBeActive` block, and stack tracking. `Effect::TotalAmount()` resolves the AType into a number; `BreakdownItem` then buckets each effect into feat / item / other lists and applies bonus-type stacking from `BonusTypes.xml`. Requirements compose as AND-of(`Requires` list) + AND-of(`RequiresOneOf` groups, each OR-internally) + AND-of(`RequiresNoneOf` groups, each "none may be met"). The V3 port lives in `webapp/src/lib/effectParser.ts`, `requirements.ts`, `bonus.ts`, and `exclusionGroups.ts`.

## File index

| File | Role | V3 counterpart |
| --- | --- | --- |
| `Effect.cpp` / `.h` | Core effect object; `EffectType`/`AmountType` enums; `TotalAmount()`, `IsActive()`, stack tracking, percent | `webapp/src/lib/effectParser.ts` (`resolveValue`, `parseEffect`, `parseItemBuff`) |
| `ActiveEffect.cpp` | `BaseActiveEffect`: name + live stack count for a running effect instance | folded into runtime stacking in effects/ ❌ (no dedicated file) |
| `StackTracking.cpp` | Trivial name + integer stack counter | ❌ (inline counters) |
| `Bonus.cpp` / `.h` | XML wrapper for one bonus-type definition: `Name` + `StackingType` (HighestOnly/Always) | `bonus.ts` `BonusTypeEntry` |
| `BonusDice.cpp` | `BasicDice` subclass tagged `BonusDice` | `webapp/src/lib/weapons` ❌ (dice modeled in weapon breakdown) |
| `BonusTypesFile.cpp` | Loads `BonusTypes.xml` into a list of `Bonus` | `bonus.ts` `initBonusTypes`/`buildExclusiveSet` |
| `Requirement.cpp` / `RequirementTypes.h` | Single requirement + per-type `Evaluate*` dispatch (`Met`/`CanTrainEnhancement`/`MetHardRequirements`) | `requirements.ts` `meetsSingleRequirement`; `effectParser.ts` `evaluateRequirement` |
| `Requirements.cpp` / `.h` | Thin subclass of `RequirementsBase` (the public type) | `requirements.ts` `meetsRequirements` |
| `RequirementsBase.cpp` | Composition: `Requires` (AND) + `OneOf` (AND of groups) + `NoneOf`; `Met`, `MetHardRequirements`, `MetEnhancements` | `requirements.ts` `meetsRequirements` |
| `RequirementBlock.cpp` | Alternate composer (`Met(build,level,includeTomes)`, no slot/weapon) used by some objects | merged into `requirements.ts` |
| `RequiresOneOf.cpp` | OR group: true if ANY contained requirement is met | `requirements.ts` `meetsOneOfGroup` |
| `RequiresNoneOf.cpp` | NOR group: true only if NONE contained requirement is met | `requirements.ts` (`meetsOneOfGroup` negated) |
| `ConditionalGroup.cpp` | XML object: a `Group` string-list + optional `RequirementsToUse` (which conditional alternative applies) | conditional handling in effects/ ❌ partial |
| `AutomaticAcquisition.cpp` / `.h` | `RequirementsBase` subclass + `IgnoreRequirements` flag; drives auto-granted feats | `automaticFeats.ts` |
| `AutomaticAcquision.cpp` / `.h` | **TYPO'd duplicate, NOT compiled** (see below) | ❌ |
| `ExclusionGroup.cpp` | Named group + owning enhancement-id + stack count; backs `Exclusive` requirement | `exclusionGroups.ts` |
| `ObserverSubject.cpp` / `.h` | Templated Observer/Subject pattern for breakdown change notification | ❌ (React reactivity) |
| `ActiveStances.cpp` | List of currently-active stance names; `IsStanceActive` | stance state in build store ❌ |
| `WeaponGroupRequirements.cpp` | Pairs a `WeaponType` with `Requirements`; `RequirementsMet` for "is this weapon in group" | `weapons` group logic ❌ |
| `Dice.cpp` | Multi-entry damage-dice object (`Number`/`Sides`/`Bonus` vectors, indexed) | `weapons` ❌ |
| `BaseDice.cpp` | `BasicDice` subclass tagged `BaseDice` | ❌ |
| `BasicDice.cpp` | Single dice: `Number`(1)/`Sides`(6)/`Bonus`(1) | ❌ |
| `SubItem.cpp` | XML: `Name`/`Icon`/`Description` — a selectable sub-option of a feat/enhancement | gamedata selection metadata ❌ |

---

## Effect.cpp

- **Role.** Defines the `EffectType` enum (~250 entries; the *stat* an effect modifies, e.g. `Effect_AbilityBonus`, `Effect_MeleePower`, `Effect_PRR`) and the `AmountType` enum (how the `Amount` field is interpreted). Holds the per-effect data (`Effect.h:608-628`): `DisplayName`, `Type`, `Bonus` (bonus-type name), `Item` (string-list, meaning depends on AType), `AType`, `Amount` (double vector), `Value`, `StackSource`, flags `IsItemSpecific`/`Percent`/`Weapon1`/`Weapon2`/`ApplyAsItemEffect`/`Rare`, optional `RequirementsToBeActive`, `Rank`, `Cap`, `DamageDice`, `Damage`.
- **Key functions.** `TotalAmount(bool)` (`Effect.cpp:1139-1493`), `IsActive()` (`988-1004`), `EffectStacks()`/`AddEffectStack()`/`RevokeEffectStack()` (`1006-1029`), `StacksAsString()` (`1031-1132`), `GetPercentValue()`/`SetPercentValue()` (`1495-1503`), `CheckAType()` validation (`721+`).
- **Bonus type & stacking inputs.** `Bonus()` is the named bonus-type string; the actual stacking rule comes from `BonusTypes.xml` (looked up in the breakdown, see Bonus stacking). `HasValue()`/`Value()` and `HasPercent()` are used during de-duplication.
- **Percent.** The `Percent` `DL_FLAG` generates `HasPercent()`. Percent effects are NOT summed flat; `BreakdownItem::DoPercentageEffects` (`BreakdownItem.cpp:469-505`) computes `amount = int(baseTotal * TotalAmount/100)` against the pre-percent `baseTotal`, then calls `SetPercentValue(amount)` so the row can display it. Percent bonuses do not stack with each other in the multiplicative sense — each adds its own slice of the base total (matching live: two +X% HP each add X% of base).
- **ApplyAsItemEffect.** The `ApplyAsItemEffect` `DL_FLAG` generates `HasApplyAsItemEffect()`. It re-routes an otherwise-feat/enhancement effect into the *item* bucket so it obeys item HighestOnly stacking (`BreakdownItem.cpp:618-657`).
- **Bucketing (feat vs item vs other).** `BreakdownItem` keeps three lists: `m_otherEffects`, `m_effects` (feat/enhancement), `m_itemEffects`. `AddFeatEffect`/`AddEnhancementEffect`/`AddOtherEffect` push to `m_effects`/`m_otherEffects` UNLESS `HasApplyAsItemEffect()`, in which case they push to `m_itemEffects` (`BreakdownItem.cpp:618-652`). `AddItemEffect` always pushes to `m_itemEffects`. In `Total()` (`200-240`): `m_otherEffects` and `m_effects` are summed with `SumItems` directly (they **always stack** — no non-stacking removal), while `m_itemEffects` first goes through `RemoveInactive` → `RemoveNonStacking` → `RemoveTemporary` before summing. Then percent effects, then `Temporary`-typed effects are re-added on top.
- **IsActive.** `IsActive()` returns true unless the effect has a `RequirementsToBeActive` block, in which case it returns `RequirementsToBeActive().Met(build, build.Level()-1, true, slot, wtMain, wtOffhand)` (`Effect.cpp:1000`). Used for stance-gated / weapon-gated effects. `BreakdownItem::RemoveInactive` (`700-723`) applies the same test on item effects.
- **Stacks.** `m_stacks` increments per duplicate train. `RevokeEffectStack` zeroes all stacks for slider ATypes, else decrements (`1016-1029`).
- **Data source.** Effect XML inside Feats/Enhancements/Items/Sets/Destinies; bonus-type names resolved via `BonusTypes.xml`; abilities via `abilityTypeMap`/`abilitySnapshotTypeMap`; classes via `FindClass`; breakdowns via `FindBreakdown`.
- **V3 counterpart.** `effectParser.ts` — `resolveValue()` is the direct port of `TotalAmount()`; `parseEffect()`/`parseItemBuff()` produce `ParsedBonus[]` consumed by `bonus.ts`. `requirementsMet()` wraps `IsActive`-style gating.

### AmountType → formula table

`m_Amount` is a `double` vector; `m_stacks` is the trained stack count; `StackSource`/`Item` supply lookup keys; `Cap` clamps some abilities. All formulas from `Effect.cpp:1139-1493` (`MAX_BAB = 25`, `stdafx.h:66`).

| AType | StackSource / Item meaning | Formula (`TotalAmount`) | Line | V3 (`resolveValue`) |
| --- | --- | --- | --- | --- |
| `Simple` | — | `Amount[0] * stacks` | 1146-1160 | `effectParser.ts:347` |
| `BAB` | — | `min(BAB,25) ` as stacks → `Amount[0] * min(BAB,25)` | 1161-1184 | `:417` (`base * ctx.bab`, no 25 clamp) |
| `Stacks` | — | `Amount[min(stacks-1, size-1)]` (vector lookup by stack count) | 1185-1198 | `:456` |
| `TotalLevel` | — | `Amount[min(charLevel-1, size-1)] * stacks` | 1199-1213 | `:365` |
| `BaseClassLevel` | StackSource=class | `Amount[min(baseClassLevels, size-1)] * stacks` | 1214-1235 | `:351` |
| `ClassLevel` | StackSource=class | `Amount[min(classLevels, size-1)] * stacks` | 1236-1257 | `:351` |
| `ClassCasterLevel` | StackSource=class | `Amount[min(casterLevel, size-1)] * stacks`; caster level from `Breakdown_CasterLevel_First+class.Index()`, clamped `MAX_BUILDER_LEVEL` | 1280-1308 | `:351` (approximated via classLevels) |
| `SetBonusCount` | StackSource=set name | `Amount[min(setCount, size-1)] * stacks` | 1258-1279 | `:432` (`base * count`, not vector-indexed — APPROX) |
| `APCount` | StackSource=tree | `Amount[0] * APSpentInTree(tree)` | 1309-1315 | `:371` |
| `AbilityValue` | StackSource=ability | `AbilityAtLevel(ability, lastLevel, true)`; if not a normal ability, `SnapshotAbilityValue` | 1351-1365 | `:384` |
| `AbilityTotal` | StackSource=ability | `FindBreakdown(stat).Total()`, then `min(., Cap)` if `HasCap` | 1316-1331 | `:385` |
| `AbilityTotalIndex` | StackSource=ability | `total=breakdown.Total(); Amount[min(total, size)]`, then Cap | 1332-1350 | `:391` |
| `AbilityMod` | StackSource=ability | `BaseStatToBonus(breakdown.Total())` = `floor((score-10)/2)` | 1366-1382 | `:399` |
| `HalfAbilityMod` | StackSource=ability | `(int)(BaseStatToBonus(total)/2.0)` | 1383-1399 | `:405` |
| `ThirdAbilityMod` | StackSource=ability | `(int)(BaseStatToBonus(total)/3.0)` | 1400-1416 | `:411` |
| `FeatCount` | StackSource=feat (V2) | `Amount[min(FeatTrainedCount, size-1)] * stacks` | 1417-1429 | `:422` (reads Item[0], `base*count` — APPROX) |
| `Slider` / `SliderValue` | StackSource=slider | `Amount[0] * sliderPosition` (from StancesPane slider; falls back to stacks) | 1430-1447 | `:440` (`base * sliderValue`) |
| `SliderValueLookup` | StackSource=slider name | **V2 reads `ClassLevels(StackSource)` as index**: `Amount[min(classLevels, size-1)] * stacks` (note: code looks up class levels, not slider value — likely a V2 bug) | 1448-1468 | `:448` (uses slider value as index — DIVERGES from V2) |
| `Dice` / `CriticialDice` | — | returns 0 here; damage handled via `DamageDice`/weapon breakdown | 1469-1490 | `:341` returns null |
| `NotNeeded` / `Unknown` | — | 0 | default | `:337` null |

Notes: V2 `BaseStatToBonus` is `floor((score-10)/2)`; V3 `abilityModFromTotal` matches including negatives (`effectParser.ts:286-302`). The Item field for ability ATypes holds the *targets* (e.g. Trip/Sunder), NOT the ability — the ability comes from `StackSource`; an earlier V3 bug read Item[0] and is fixed (`effectParser.ts:376-383`).

---

## Requirement system

- **Composition (`RequirementsBase::Met`, `RequirementsBase.cpp:63-94`).** A `Requirements` object is met iff: every `Requires` entry is met (AND) **AND** every `RequiresOneOf` group is met (each group is OR-internally) **AND** every `RequiresNoneOf` group is met (each group requires that NONE of its members is met). Short-circuits on first failure. The signature carries `(build, level, includeTomes, slot, wtMainHand, wtOffhand)` so weapon/slot-aware requirements work.
- **`RequiresOneOf::Met`** (`RequiresOneOf.cpp:54-77`): `canTrain = false; for each req canTrain |= req.Met(...)` → true if ANY met.
- **`RequiresNoneOf::Met`** (`RequiresNoneOf.cpp:51-74`): `canTrain = true; for each req canTrain &= !req.Met(...)` → true only if NONE met.
- **`RequirementBlock::Met`** (`RequirementBlock.cpp:65-92`): older variant with `(build,level,includeTomes)` only (no slot/weapon); same AND/OneOf/NoneOf logic, NoneOf stored as a single optional object.
- **Variant entry points on `Requirement`** (`Requirement.cpp`): `Met` (full, `445`), `CanTrainEnhancement` (`493`, no item-in-slot/level-equipped checks; EnemyType/ItemTypeInSlot→false), `MetHardRequirements` (`534`, race/class/ability/feat only — skips skill/stance/enhancement, used to decide if something is *ever* trainable), `MetEnhancements` (`575`).
- **Data source.** `Requirements`/`RequiresOneOf`/`RequiresNoneOf` XML blocks embedded in Feats, Enhancements, Items, Effects (`RequirementsToBeActive`), and AutomaticAcquisition entries. Enum text via `requirementTypeMap` (`RequirementTypes.h:48-84`).
- **V3 counterpart.** `requirements.ts` `meetsRequirements` (`:161`) / `meetsOneOfGroup` (`:156`) / `meetsSingleRequirement` (`:76`); `effectParser.ts:evaluateRequirement` (`:60+`) is a parallel implementation for effect-activation gating. Known approximation: V3 `meetsRequirements` evaluates RequiresNoneOf with the same `meetsOneOfGroup` (OR) then negates with `.some()` — equivalent to V2's "none met".

### Requirement TYPES (`Requirement::Evaluate*`, `Requirement.cpp:622-1102`)

| RequirementType | Met when | Reads | Line |
| --- | --- | --- | --- |
| `Ability` | `AbilityAtLevel(Item[0]) >= Value` | Item=ability, Value | 622-631 |
| `AbilityGreaterCondition` | `value(Item[0]) > value(Item[1])` | Item=2 abilities | 633-645 |
| `Alignment` | build alignment ∈ Item list | Item=alignment names | 647-660 |
| `AlignmentType` | alignment matches option (Lawful/Chaotic/Good/Evil/TrueNeutral/PartNeutral) | Item=option | 662-706 |
| `BAB` | `BaseAttackBonus(level) >= Value` | Value | 708-717 |
| `BaseClass` | `baseClassLevels(Item[0]) >= Value` (or `>0` if no Value) | Item=class | 719-731 |
| `BaseClassAtLevel` | class-at-level == Item[0] (handles derived base class), optional exact `Value` | Item=class, Value | 733-778 |
| `BaseClassMinLevel` | `baseClassLevels >= Value` | Item=class, Value | 780-790 |
| `Class` | `classLevels(Item[0]) >= Value` (or `>0`) | Item=class | 792-804 |
| `ClassAtLevel` | classLevels==Value AND class-at-level==Item[0] (or just class-at-level) | Item=class | 806-825 |
| `ClassMinLevel` | `classLevels >= Value` | Item=class | 827-837 |
| `Enhancement` | `IsTrained(Item[0],Item[1])` and (Value→ ranks ≥ Value) | Item=enh[,selection], Value | 839-855 |
| `Exclusive` | `IsExclusiveEnhancement(Item[0]=id, Item[1]=group)` | Item=id+group | 857-868 |
| `Feat` | trained-count(Item[0]) ≥ needed OR specialFeatCount ≥ needed (granted feats DON'T count) | Item=feat, Value | 870-888 |
| `FeatAnySource` | trained-count ≥ needed, else `IsGrantedFeat` | Item=feat, Value | 890-911 |
| `GroupMember` / `WeaponClassMainHand` | main-hand weapon ∈ named group (handwraps special-case "One Handed") | Item=group | 913-935 |
| `GroupMember2` / `WeaponClassOffHand` | off-hand weapon ∈ named group | Item=group | 913-935 |
| `WeaponTypesEquipped` | wtMain==Item[0] (or All) [and wtOff==Item[1]] | Item=weapon type(s) | 937-956 |
| `ItemTypeInSlot` | item in slot has matching Weapon/Armor type (or slot Empty) | Item=slot+type | 958-990 |
| `ItemSlot` | passed-in `slot` matches | Item=slot | 1102+ |
| `Level` | `level >= Value-1` (Value 1-based) | Value | 992-1002 |
| `SpecificLevel` | `level >= Value-1` (same as Level) | Value | 1050-1060 |
| `MaterialType` | weapon in slot has material type | Item | 1083+ |
| `NotConstruct` | race is NOT a construct | build.Race | 1004-1011 |
| `RaceConstruct` | race IS a construct | build.Race | 1031-1038 |
| `Race` | build.Race ∈ Item list | Item=races | 1013-1029 |
| `Skill` | `SkillAtLevel(Item[0]) >= Value` | Item=skill, Value | 1040-1048 |
| `Stance` | `build.IsStanceActive(Item[0])` | Item=stance | 1062-1072 |
| `StartingWorld` | race.StartingWorld == Item[0] | Item=world | 1074-1081 |
| `EnemyType` | always `false` in `Met` (not modeled) | — | 467 |

---

## Bonus stacking

- **Role.** Decide which of several same-typed bonuses actually count. `Bonus` (`Bonus.h`) is one bonus-type definition: `Name` + `StackingType` ∈ {`StackingType_HighestOnly` ("Highest Only"), `StackingType_Always` ("Always")} (`Bonus.h:8-20`). `BonusTypesFile` (`BonusTypesFile.cpp`) loads `BonusTypes.xml` (root `<BonusTypes>`) into a `list<Bonus>`; `FindBonus(name)` resolves a name at runtime.
- **Mechanic (`BreakdownItem::RemoveNonStacking`, `BreakdownItem.cpp:725-786`).** Only applied to the **item** effect list. For each pair of effects with the same `Bonus()` name where that bonus is `HighestOnly`, and matching `Value`/`Percent` discriminators, the lesser-magnitude one is removed (`removeIt |= fabs(a.TotalAmount) <= fabs(b.TotalAmount)`) and parked in a non-stacking display list. `Always`-typed bonuses are never removed. Critically, `m_effects` (feats/enhancements) and `m_otherEffects` are summed WITHOUT this step — i.e. feat/enhancement bonuses always stack regardless of bonus type; only gear (`m_itemEffects` and `ApplyAsItemEffect`) obeys HighestOnly.
- **Special bonus name `Temporary`** is pulled out (`RemoveTemporary`, `788-811`) and added after percentage multipliers.
- **Data source.** `BonusTypes.xml`.
- **V3 counterpart.** `bonus.ts`: `initBonusTypes`/`buildExclusiveSet` ingest `BonusTypeEntry[]` (default "Highest Only"); `resolveBonus` (`:156`) groups by type and applies the rule — gear contributions (`fromGear`) keep only the highest positive + lowest negative, non-gear contributions always stack (mirrors V2's feat-list bypass; `bonus.ts:179-220`). Exclusive set built from any type whose Stacking ≠ "Always" (`:51-64`).

---

## AutomaticAcquisition

- **Role.** Drives feats granted automatically by class/race/level rather than chosen. It is a `RequirementsBase` subclass adding one flag: `IgnoreRequirements` (`AutomaticAcquisition.h` typo'd twin shows the property `DL_FLAG(_, IgnoreRequirements)`; the compiled class has it via the XML element). A feat carries a list of these in `AutomaticAssignment` (`Feat.h:63 DL_OBJECT_LIST(_, AutomaticAcquisition, AutomaticAssignment)`).
- **Which file is used.** `AutomaticAcquisition.cpp/.h` (correct spelling) is the one referenced by `Feat.h:8`, `Build.cpp:7`, and the `.vcxproj`. The typo'd `AutomaticAcquision.cpp/.h` (missing the second "si") is **not** in the project build and is dead/legacy — its header still defines the `IgnoreRequirements` property and `RequirementsBase`-based loader, which is what the real class behaves like at the XML layer.
- **Key function / mechanic (`Build::AutomaticFeats`, `Build.cpp:2493-2551`).** For each standard feat, iterate its `AutomaticAssignment()` entries: `acquire |= aa.Met(build, level, true, …)`. If acquired AND `!aa.HasIgnoreRequirements()` AND the feat `HasRequirementsToTrain()`, the feat's normal `RequirementsToTrain().Met(...)` must ALSO pass. Thus `IgnoreRequirements` short-circuits the secondary trainability check — this is how universal feats like Heroic Durability are granted to everyone at level 1 regardless of class/race prerequisites. Acquired feats are then capped by `MaxTimesAcquire()` (default 1). Race granted feats are added directly at level 0 (`2500-2509`); classes also expose `GetAutoFeats(classLevel)` (`2557+`).
- **Data source.** Feat XML `<AutomaticAssignment>` blocks; Race `<GrantedFeat>`; Class auto-feat lists.
- **V3 counterpart.** `webapp/src/lib/automaticFeats.ts` (`buildAutomaticFeatGroups`). Known approximation: V3 builds grouped automatic-feat lists for display/export; the granular `IgnoreRequirements` vs secondary-requirement gating is simplified.

---

## Composition & helper files (terser)

### Requirements.cpp / RequirementsBase.cpp / RequirementBlock.cpp
- **Role / Mechanic.** Covered above. `Requirements` is just `class Requirements : public RequirementsBase` (`Requirements.h`). `RequirementsBase` holds `m_Requires`/`m_OneOf`/`m_NoneOf` and provides `Met`, `MetHardRequirements`, `MetEnhancements`, `CanTrainEnhancement`, `GetExclusionGroup` (extracts the Exclusive id+group, `RequirementsBase.cpp:253-266`), and `CreateRequirementStrings` (tooltip text). **V3:** `requirements.ts`.

### RequiresOneOf.cpp / RequiresNoneOf.cpp
- **Role.** OR group / NOR group of `Requirement`s. **Mechanic:** see above (`RequiresOneOf.cpp:54-77`, `RequiresNoneOf.cpp:51-74`). **V3:** `requirements.ts` `meetsOneOfGroup`.

### ConditionalGroup.cpp
- **Role.** XML object: a `Group` string-list plus optional `RequirementsToUse` (`ConditionalGroup.h:27-29`). Used to pick which alternative set of grants/effects applies when a feat/enhancement has conditional branches. **Key functions:** SAX load only; no `Met` of its own (the `RequirementsToUse` sub-object is evaluated by callers). **V3:** partial in effects/ ❌.

### ExclusionGroup.cpp
- **Role.** Runtime record: `m_name` (group), `m_enhancementId` (the enhancement currently "owning" the group), `m_count` stacks (`ExclusionGroup.cpp:6-38`). Backs `Requirement_Exclusive`: `Build::IsExclusiveEnhancement` returns `isUs || !found` so only the claiming enhancement (or none) satisfies the group. **Data source:** `Effect_ExclusionGroup` effects. **V3:** `exclusionGroups.ts` `computeExclusionGroups` (`:22`).

### AutomaticAcquision.cpp (typo, NOT compiled)
- **Role.** Legacy duplicate of AutomaticAcquisition with a fuller body (loads `RequirementsBase_PROPERTIES` + `IgnoreRequirements`, `SetRequirement`). Not in the build; documents the intended XML shape. **V3:** ❌.

### ActiveEffect.cpp
- **Role.** `BaseActiveEffect`: a name + live stack count (`m_numStacksOfEffect`) for an effect instance currently applied; `AddStack`/`RemoveStack`/`SetNumStacks` (`ActiveEffect.cpp:6-41`). **V3:** runtime stacking inline ❌.

### StackTracking.cpp
- **Role.** Minimal `name` + integer `m_stacks` counter with `AddStack`/`RevokeStack` (`StackTracking.cpp`). Tracks how many sources contribute a named effect. **V3:** ❌ (inline counters).

### ActiveStances.cpp
- **Role.** Holds `m_Stances` (active stance names). `IsStanceActive(name)` linear-searches; special-cases `"LamanniaMode"` against the app flag (`ActiveStances.cpp:51-74`). `AddActiveStance`/`RevokeStance`. Backs `Requirement_Stance`. **V3:** stance state in build store ❌.

### WeaponGroupRequirements.cpp
- **Role.** Pairs a `WeaponType` with a `Requirements`; `RequirementsMet(build)` evaluates them with that weapon as the main-hand (`WeaponGroupRequirements.cpp:20-23`). Used to decide which weapons belong to a named group (e.g. "Falchion" ∈ "Heavy Blades"). **V3:** weapon group logic in `weapons/` ❌.

### ObserverSubject.cpp / .h
- **Role.** Templated Observer/Subject pattern (`Observer<T>`/`Subject<T>`); breakdowns attach as observers and are notified on change so totals recompute. Pure infrastructure. **V3:** ❌ (React state/selectors replace it).

### Dice.cpp / BasicDice.cpp / BaseDice.cpp / BonusDice.cpp
- **Role.** `Dice` is a multi-entry damage-dice object: `Number`/`Sides` (default 1d6) and optional `Bonus`/`Damage` vectors, each indexed (`Dice.cpp:53-78`, clamps index to size). `BasicDice` is a single `Number(1)/Sides(6)/Bonus(1)` element (`BasicDice.h:32-34`); `BaseDice` and `BonusDice` are `BasicDice` subclasses differing only by XML element name (`BaseDice.cpp`, `BonusDice.cpp`). Consumed by `Effect_*Dice` / `Amount_Dice`/`Amount_CriticialDice`. **V3:** weapon damage modeling in `weapons/` ❌.

### SubItem.cpp
- **Role.** XML object describing a selectable sub-option: `Name`/`Icon`/`Description` (`SubItem.h:26-28`). E.g. the choices under a "choose one" feat/enhancement. `VerifyObject` checks the icon file exists. **V3:** selection metadata in gamedata ❌.

---

## Cross-references

- **Breakdowns / how `TotalAmount()` and bucketed effects are summed into a final stat** → Section A (BreakdownItem / breakdown pane).
- **Data objects that *contain* Effects/Requirements** (Feat, Enhancement, Item, Set, EnhancementTree, Class, Race) → Sections D / E.
- `BonusTypes.xml`, feat/enhancement/item XML schemas → Section D/E (data files).
- Stance / slider runtime state consumed by `Amount_Slider*` and `Requirement_Stance` → Section A (UI panes) and build-state docs.
