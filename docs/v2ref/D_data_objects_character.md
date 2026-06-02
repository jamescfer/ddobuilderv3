# D. Data Objects — Character/Build Content

V2 reference for the C++ classes that load and represent the static XML catalogues used
to build a character: **classes, races, feats, stances, weapon groups, enhancement trees**.
File citations are `File.cpp:line` against `DDOBuilder/`. Sample XML is in `Output/DataFiles/`.

## Overview — the DL_ serialization pattern and `*File.cpp` loaders

Every catalogue object is an `XmlLib::SaxContentElement` subclass whose fields are declared
once via an `X_PROPERTIES(_)` X-macro list in the `.h`, then expanded by macros in the `.cpp`:

- `DL_DECLARE_ACCESS` / `DL_DECLARE_VARIABLES` generate the `m_Field`, `m_hasField`,
  `Field()` getter, `HasField()` presence test, and `Set_Field()` setter
  (e.g. `Class.h:108-109`, used as `m_Name`, `Name()`, `HasBaseClass()`).
- In the `.cpp`: `DL_DEFINE_NAMES`, `DL_INIT` (ctor), `DL_START`/`DL_END` (SAX
  StartElement/EndElement), `DL_WRITE` (round-trip save), `DL_DEFINE_ACCESS`
  (e.g. `Class.cpp:40,55,71,80,86`).
- DL macro variants seen here: `DL_STRING`, `DL_OPTIONAL_STRING`, `DL_STRING_LIST`,
  `DL_SIMPLE(type,default)`, `DL_OPTIONAL_SIMPLE`, `DL_FLAG` (presence-only bool),
  `DL_VECTOR`/`DL_OPTIONAL_VECTOR` (space-separated `size="n"` array), `DL_ENUM`/
  `DL_ENUM_LIST` (string↔enum via a `*TypeMap`), `DL_OBJECT_LIST`/`DL_OPTIONAL_OBJECT`/
  `DL_OBJECT_VECTOR` (nested SaxContentElement children).

**Loaders.** Each `XFile.cpp` is a SAX root handler: `StartElement` peeks the child name,
constructs the leaf object, `SaxElementIsSelf` matches, and the object is pushed into a
`std::list` and returned as the sub-handler (e.g. `ClassFile.cpp:45-66`). Roots:
`Classes` (`ClassFile.cpp:11`), `Races` (`RaceFile.cpp:11`), `Feats` (`FeatsFile.cpp:9`),
`Stances` (`StancesFile.cpp:11`), `WeaponGroupings` (`WeaponGroupFile.cpp:11`),
`Enhancements` (`EnhancementsFile.cpp:11`). `EnhancementsFile` is multi-file: it globs
`*.tree.xml` in a directory (`EnhancementsFile.cpp:26-47`). Classes and Races are also
multi-file, loaded by `MultiFileObjectLoader<T>` over `*.class.xml` / `*.race.xml`
(`DDOBuilder.cpp:435,449`); Feats/Stances/WeaponGroupings are single files
(`DDOBuilder.cpp:473,936,1064`).

## File index

| File | Represents | XML source | V3 counterpart |
|------|------------|------------|----------------|
| `Class.cpp/.h` | One playable class | `Classes/*.class.xml` `<Class>` | `DDOClass` (`types/ddo.ts:96`), `loadClasses` (`dataLoaders.ts:64`), `lib/levelProgression.ts` |
| `ClassFile.cpp` | `<Classes>` loader | `Classes/*.class.xml` | `loadClasses` (`dataLoaders.ts:64`) |
| `ClassSpell.cpp/.h` | A class's spell-list entry | `<ClassSpells>` in class XML | (spell data → section E) |
| `Race.cpp/.h` | One race | `Races/*.race.xml` `<Race>` | `Race` (`types/ddo.ts:65`), `loadRaces` (`dataLoaders.ts:51`) |
| `RaceFile.cpp` | `<Races>` loader | `Races/*.race.xml` | `loadRaces` (`dataLoaders.ts:51`) |
| `Feat.cpp/.h` | One feat | `Feats.xml` `<Feat>` + inline `<Feat>` in class/race XML | `Feat` (`types/ddo.ts:122`), `loadFeats` (`dataLoaders.ts:76`) |
| `FeatsFile.cpp` | `<Feats>` loader (→ `map<name,Feat>`) | `Feats.xml` | `loadFeats` (`dataLoaders.ts:76`) |
| `Stance.cpp/.h` | One stance toggle | `Stances.xml` `<Stance>` + inline in feats/enh | `Stance` (`types/ddo.ts:254`), `loadStances` (`dataLoaders.ts:155`) |
| `StanceGroup.cpp/.h` | Runtime UI group of mutually-exclusive stances | (not serialized) | (UI/runtime, not a loader) |
| `StancesFile.cpp` | `<Stances>` loader | `Stances.xml` | `loadStances` (`dataLoaders.ts:155`) |
| `WeaponGroup.cpp/.h` | A named weapon grouping + membership test | `WeaponGroupings.xml` `<WeaponGroup>` | `WeaponGroupSpec` + `deriveWeaponClasses` (`lib/weapons/groups.ts`), `loadWeaponGroups` (`dataLoaders.ts:146`) |
| `WeaponGroupFile.cpp` | `<WeaponGroupings>` loader | `WeaponGroupings.xml` | `loadWeaponGroups` (`dataLoaders.ts:146`) |
| `WeaponData.cpp/.h` | Runtime per-attack damage scratch (not serialized) | — | (combat calc, not catalogue) |
| `EnhancementTree.cpp/.h` | One enhancement/destiny/racial/reaper tree | `EnhancementTrees/*.tree.xml` `<EnhancementTree>` | `EnhancementTree` (`types/ddo.ts:166`), `loadEnhancementTrees` (`dataLoaders.ts:106`) |
| `EnhancementTreeItem.cpp/.h` | One node (cell) in a tree | `<EnhancementTreeItem>` | `EnhancementTreeItem` (`types/ddo.ts:146`) |
| `EnhancementsFile.cpp` | multi-file `<Enhancements>` loader | `EnhancementTrees/*.tree.xml` | `loadEnhancementTrees` (`dataLoaders.ts:106`) |

---

## Class (`Class.cpp/.h`)

- **Represents** one playable class (e.g. Fighter, Monk). Archetypes use `BaseClass`
  (`GetBaseClass()` returns `BaseClass()` if present else `Name()`, `Class.cpp:90-98`).
- **Fields** (`Class_PROPERTIES`, `Class.h:64-106`): `Name`, optional `BaseClass`,
  `Description`, `ClassSpecificFeatType` (string list, e.g. Monk "Monk Bonus"),
  `SmallIcon`/`LargeIcon`, `SkillPoints` (int/level), `HitPoints` (int/level),
  `ClassSkill` (SkillType list), `Alignment` (allowed alignments / `Any`),
  `Fortitude`/`Reflex`/`Will` (each a `ClassSaveType` enum: `Type1`/`Type2`/`None`),
  `SpellPointsPerLevel` (21-vector), `CastingStat` (AbilityType list), `AutoBuySkill`,
  `NotHeroic` flag, `Level1..Level20` (each an optional vector = spell slots per spell
  level at that class level), `BAB` (21-double vector), `ClassSpells` (`ClassSpell` list),
  `AutoFeats` (`AutomaticFeats` list), `FeatSlots` (`FeatSlot` list), `ClassFeats`
  (inline `Feat` list — see below).
- **Key accessors:**
  - `HitPoints()` / `SkillPoints()` — raw per-level value; `SkillPoints(race,int,level)`
    computes total: base + racial bonus + INT mod, min 1, ×4 at level 0 (`Class.cpp:170-202`).
  - `BAB()` — the 21-element vector (index 0 = level 0); verified to size `MAX_CLASS_LEVEL+1`
    (`Class.cpp:128-132`).
  - `ClassSave(SaveType,level)` — Type1 = `floor(level/3)`, Type2 = `2+floor(level/2)`,
    None = 0 (`Class.cpp:221-247`).
  - `SpellPointsAtLevel(level)` — indexes `SpellPointsPerLevel` (`Class.cpp:278-286`).
  - `SpellSlotsAtLevel(level)` — dispatches to `Level1..20` vectors (`Class.cpp:140-168`);
    `MaxSpellLevel(classLevel)` finds highest non-zero slot (`Class.cpp:533-544`).
  - `ClassCastingStat()` — single stat if one listed; else picks the AbilityType with the
    highest current breakdown total (e.g. FavoredSoul CHA/WIS) (`Class.cpp:249-276`).
  - `GetAutoFeats(level)` — returns the `Feats()` name list from the matching `AutoFeats`
    entry (`Class.cpp:546-557`); `AutomaticFeats` = `{Level, Feats[]}` (`AutomaticFeats.h:27-29`).
  - `AddFeatSlots(build,classLevel,...)` — emits the `FeatSlot`s for that class level;
    honours `Singular` (add only if not already granted at a lower level) (`Class.cpp:337-373`).
    `FeatSlot` = `{Level, FeatType, Singular?, AutoPopulate?, FeatUpdateList[]}` (`FeatSlot.h:28-33`).
  - `IsClassSkill(skill)` (`Class.cpp:401-411`); `CanTrainClass(alignment)` (`Class.cpp:204-219`).
  - `ImprovedHeroicDurabilityFeats()` — **dynamically synthesizes** feats not in any XML:
    for non-`NotHeroic` classes, creates "Improved Heroic Durability (Name 5/10/15)" with a
    `Requirement_ClassAtLevel` auto-acquisition (`Class.cpp:375-399`).
  - `CreateSpellLists()` / `Spells()` / `FindSpell()` — build per-spell-level lists from
    `ClassSpells`; negative `Level` = auto/fixed spell (`Class.cpp:457-531`).
- **XML:** `Classes/<Name>.class.xml`, root `<Classes>` → `<Class>`. Saves use `Type2`,
  BAB string `0 0.75 1.50 ...`, `SpellPointsPerLevel size="21"` (e.g. Monk `Class XML:36-48`).
- **Inline class feats:** A `<Class>` may contain `<Feat>` children parsed into
  `ClassFeats` (`Class.h:106`). Monk defines "AC Bonus: Wisdom", "Abundant Step", etc.
  inline (`Output/DataFiles/Classes/Monk.class.xml:204-240`), and references them by name
  in `<AutomaticFeats><Feats>` (`Monk.class.xml:48`). V3 `loadFeats` merges these inline
  class `<Feat>`s into the global feat list (`dataLoaders.ts:84-102`).
- **V3:** `DDOClass` (`types/ddo.ts:96-117`) carries `BAB`/`SpellPointsPerLevel` as raw
  space-separated strings; `CastingStat` can be a list (note at `ddo.ts:110-112`); the
  per-level save/BAB/auto-feat math lives in `lib/levelProgression.ts`.

## ClassSpell (`ClassSpell.cpp/.h`)

- **Represents** one entry in a class's spell list. Fields (`ClassSpell.h:24-29`):
  `Name`, `Level` (int; negative = auto-granted), optional `Cost`, `MaxCasterLevel`,
  `Cooldown`. Also defines a lightweight non-serialized `FixedSpell` value type
  (`ClassSpell.h:35-73`). Resolved against the global spell catalogue in
  `Class::CreateSpellLists` (`Class.cpp:457-472`). Spell objects themselves → **section E**.

## Race (`Race.cpp/.h`)

- **Represents** one race / iconic. Fields (`Race_PROPERTIES`, `Race.h:35-56`): `Name`,
  `ShortName`, `Description`, `IsConstruct` flag, `StartingWorld` enum, `NoPastLife` flag,
  `BuildPoints` (4-vector for TR tiers, validated `==4` in `Race.cpp:71-74`), optional
  `IconicClass`, `RaceSpecificFeat` (`FeatSlot` list), optional per-ability modifiers
  `Strength..Charisma`, optional `SkillPoints` (bonus skill pts/heroic level), optional
  single `Skill`/`Ability` (for racial-PL feat generation), `AutoBuySkill`, `RacialFeats`
  (inline `Feat` list), `GrantedFeat` (string list, auto-granted at level 1).
- **Key accessors:**
  - `RacialModifier(ability)` — returns the per-ability `+/-` modifier if present
    (`Race.cpp:121-134`).
  - `IsIconic()` = `HasIconicClass()` (`Race.cpp:84-87`).
  - `AddFeatSlots(level,...)` — emits `RaceSpecificFeat` slots for that level (1-based in
    file) (`Race.cpp:89-102`).
  - `ClearRacialFeats()` (`Race.cpp:136-139`).
- **Notable:** absent `IconicClass` + present `Skill`/`Ability` are used elsewhere to
  auto-generate the racial past-life and "Racial Completionist" feats (header note
  `Race.cpp:32-34`). `GrantedFeat` is a plain name list; the named feats may be defined
  inline in the same race XML (e.g. Drow `<GrantedFeat>Drow Spell Resistance</GrantedFeat>`
  + matching `<Feat>` `Output/DataFiles/Races/Drow.race.xml:15-36`).
- **XML:** `Races/<Name>.race.xml`, root `<Races>` → `<Race>`.
- **V3:** `Race` (`types/ddo.ts:65-85`), `loadRaces` (`dataLoaders.ts:51-62`). Inline race
  `<Feat>`s are *not* currently folded into `loadFeats` (only class ones are — see
  `dataLoaders.ts:84-102`); flagged as a possible parity gap.

## Feat (`Feat.cpp/.h`)

- **Represents** one feat (trainable, automatic, or granted). Fields (`Feat_PROPERTIES`,
  `Feat.h:54-69`): `Name`, `Description`, `SubItems` (`SubItem` list — sub-feat options),
  `Icon`, `Group` (string list — which selectable feat-type pools it belongs to),
  optional `ConditionalGroups`, optional `Sphere` (Arcane/Divine/Martial/Primal for epic
  PLs), optional `RequirementsToTrain` (a `Requirements` object → **section B**),
  `AutomaticAssignment` (`AutomaticAcquisition` list — conditions under which the feat is
  auto-granted), `Acquire` (`FeatAcquisitionType` enum: `Train`/`Automatic`/...),
  `MaxTimesAcquire` (default 1), `Attacks`, `Stances`, `DCs`, `Effects` (the effect-engine
  payload → **section B**).
- **Key accessors / behaviour:**
  - `Acquire()` + `Group()` — `VerifyObject` requires `Train` feats to have ≥1 Group
    (`Feat.cpp:172-177`).
  - `EndElement` post-processing: every `Effect` without a `DisplayName` is stamped with
    the feat's `Name()` (`Feat.cpp:96-104`); `SetName` re-stamps too (`Feat.cpp:246-254`).
  - `CreateRequirementStrings(build,...)` delegates to `RequirementsToTrain` (`Feat.cpp:149-164`).
  - Dynamic-feat helpers: `SetName`, `AddAutomaticAcquisition` (wraps a `Requirement` in an
    `AutomaticAcquisition`, `Feat.cpp:256-261`), `SetRequirements` — used by
    `Class::ImprovedHeroicDurabilityFeats` and racial-PL generation. Has an explicit copy
    ctor that must mirror all fields (`Feat.cpp:28-56`).
- **XML:** `Feats.xml` root `<Feats>` → `<Feat>`; plus inline `<Feat>` inside class/race XML.
- **V3:** `Feat` (`types/ddo.ts:122-133`), `loadFeats` (`dataLoaders.ts:76-104`) which
  unions `Feats.xml` with class-XML inline feats.

## Stance (`Stance.cpp/.h`) and StanceGroup (`StanceGroup.cpp/.h`)

- **Stance — Represents** a toggleable combat stance/state. Fields (`Stance_PROPERTIES`,
  `Stance.h:33-40`): `Name`, `Icon`, `Description`, optional `Group` (the mutual-exclusion
  group name), `AutoControlled` flag (state driven by requirements, not user-clickable —
  needs `ActiveRequirements`), optional `ActiveRequirements` (`Requirements`),
  `IncompatibleStance` (string list of stances disabled while active). Stances are also
  emitted inline by feats and enhancements (`Feat.h:67`, `EnhancementTreeItem.h:99`).
- **StanceGroup — Represents** a *runtime* UI grouping (not XML-serialized;
  `StanceGroup.h:10`) of stances sharing a `Group` name, with single-selection enforcement
  (`m_bSingleSelection`) via `DeactivateOtherStancesExcept` (`StanceGroup.h:26`). Matching
  is by `Group` name + `Name`.
- **XML:** `Stances.xml` root `<Stances>` → `<Stance>`.
- **V3:** `Stance` (`types/ddo.ts:254`), `loadStances` (`dataLoaders.ts:155`).

## WeaponGroup / WeaponGroupRequirements (`WeaponGroup.cpp/.h`)

- **Represents** a named set of weapon types (e.g. "Martial", "Simple", "Favored
  Weapons"). Fields (`WeaponGroup_PROPERTIES`, `WeaponGroup.h:41-43`): `Name`, `Weapon`
  (a `WeaponType` enum list). Two non-serialized runtime additions:
  `m_weaponsWithRequirements` (weapons that count only if `Requirements` are met) and
  `m_mergedGroups` (other group names whose membership is inherited) (`WeaponGroup.h:50-51`).
- **Matching:** `HasWeapon(wt,build)` — true if `wt` is in the static list, OR in a
  conditional `WeaponGroupRequirements` whose `RequirementsMet(build)` (`WeaponGroup.cpp:84-93`,
  `WeaponGroupRequirements.h:13`), OR present in any merged group via
  `build.IsWeaponInGroup` (`WeaponGroup.cpp:94-103`). The plain `HasWeapon(wt)` is a simple
  list scan (`WeaponGroup.cpp:64-75`).
- **XML:** `WeaponGroupings.xml` root `<WeaponGroupings>` → `<WeaponGroup>` with `<Weapon>`
  children (`Output/DataFiles/WeaponGroupings.xml:3-23`). The conditional/merge additions
  are produced at runtime by effects (AddGroupWeapon / MergeGroups), not stored in the XML.
- **V3:** `WeaponGroupSpec` + `deriveWeaponClasses(...)` in `lib/weapons/groups.ts`, which
  models the same three layers — static `<Weapon>` membership, `RuntimeGroupAdd`, and
  `RuntimeGroupMerge` iterated to a fixed point for transitive merges (`groups.ts:12-64`).
  Loader `loadWeaponGroups` (`dataLoaders.ts:146`).

## WeaponData (`WeaponData.cpp/.h`)

- **Represents** runtime per-attack damage scratch state (dice, W, damage/crit bonuses,
  threat range, multipliers, alacrity) — explicitly *not* serialized ("generated on the
  fly", `WeaponData.h:3-4`). Belongs to the combat-calc path, not the catalogue;
  no direct V3 catalogue counterpart.

## EnhancementTree (`EnhancementTree.cpp/.h`)

- **Represents** one enhancement tree (class tree, archetype, racial, reaper, universal,
  epic destiny). Fields (`EnhancementTree_PROPERTIES`, `EnhancementTree.h:47-58`): `Name`,
  `Version`, optional `RequirementsToTrain` (`Requirements` → typically a `Class`
  requirement), boolean flags `IsEpicDestiny`/`IsRacialTree`/`IsReaperTree`/
  `IsUniversalTree`/`Legacy`, `Icon`, `Background`, `Items` (`EnhancementTreeItem` list).
- **Key accessors:** `GetTree(name)` static lookup; `FindEnhancementItem(name)`,
  `FindItemByPosition(x,y)`; `MeetRequirements(build,level)` (tree-level gating);
  static `GetEnhancementEffects(tree,enh,selection,rank)` resolves to the item then
  `item->GetEffects(selection,rank)` (`EnhancementTree.cpp:235-249`). `UpdateLegacyInfo`
  handles legacy renaming.
- **XML:** `EnhancementTrees/<Tree>.tree.xml`, root `<Enhancements>` → `<EnhancementTree>`;
  tree-level `<Requirements>` is usually a single `Class` requirement (e.g.
  `Output/DataFiles/EnhancementTrees/Barbarian_FrenziedBerserker.tree.xml:5-10`).
- **V3:** `EnhancementTree` (`types/ddo.ts:166-177`); `loadEnhancementTrees`
  (`dataLoaders.ts:106-137`) globs `*.tree.xml` and normalises the self-closing flag
  tags (`<Tier5/>`, `<Clickie/>`, `<IsReaperTree/>` etc.) — which the XML parser delivers
  as `""` — into explicit booleans (`dataLoaders.ts:117-133`).

## EnhancementTreeItem (`EnhancementTreeItem.cpp/.h`)

- **Represents** one node/cell in a tree. Fields (`EnhancementTreeItem_PROPERTIES`,
  `EnhancementTreeItem.h:82-104`): `Name`, `InternalName` (stable id used by trained-state
  tracking), `Description`, `Icon`, `XPosition`/`YPosition` (grid cell — tier ≈ column),
  `CostPerRank` (vector — AP cost per rank), `Ranks` (default 1), `MinSpent` (AP that must
  already be spent in this tree to unlock — encodes the tier gate), `Clickie` flag,
  arrow-drawing flags (`ArrowLeft/Right/Up`, `LongArrowUp`, `ExtraLongArrowUp`), `Tier5`
  flag, `Stances`, optional `RequirementsToTrain`, optional `Selections` (a `Selector`),
  `Attacks`, `Effects`, `EffectDC`.
- **Selectors:** `Selector` = `{Exclusions[], Selections: EnhancementSelection[]}`
  (`Selector.h:47-49`). Each `EnhancementSelection` (`EnhancementSelection.h:45-57`) carries
  its own `Name`/`Description`/`Icon`/`CostPerRank`/`Clickie`/`MinSpent`/`Ranks`/
  `RequirementsToTrain`/`Stances`/`Attacks`/`Effects`/`EffectDC`. When a node has a
  selector, the per-selection values override the node defaults — see how `Cost`,
  `ItemCosts`, `MinSpent`, `Ranks`, `GetEffects`, `GetStances`, `Attacks` all fall through
  to `m_Selections.*(selection,...)` when `selection != ""` (`EnhancementTreeItem.cpp:445-618`).
- **Cost / ranks:** `Cost(selection,rank)` indexes `CostPerRank[rank]` (clamps to `[0]`),
  overridden by the selection (`EnhancementTreeItem.cpp:445-464`); `CostVaries` detects
  non-uniform per-rank costs (`:426-443`); `ItemCosts` returns the whole vector (`:466-478`).
- **Per-rank effects:** `GetEffects(selection,rank)` returns selection effects plus node
  `m_Effects` that either have no `Rank` or whose `Rank()==rank`, stamping `DisplayName`
  from the node/selection name (`EnhancementTreeItem.cpp:486-523`).
- **Gating:** `MeetRequirements`/`IsAllowed` check `RequirementsToTrain` and `MinSpent <=
  spentInTree` (`:112-220`). `CanTrain` checks: not at max ranks, `spentInTree >=
  MinSpent`, selector has a trainable option, dependent enhancements have enough ranks,
  and enough available AP for `Cost` (`:253-281`). `IsTier5Blocked` enforces the "only one
  tree may take Tier-5s" rule, scoped separately for epic-destiny vs. normal/universal
  trees (racial/reaper exempt) (`:222-251`).
- **V3:** `EnhancementTreeItem` (`types/ddo.ts:146-164`) including `Selector` /
  `EnhancementSelection` (`ddo.ts:138-144,162`) and the `Tier5` flag note.

## Cross-references

- **Effects engine** (`Effect`, `DC`, `Attack`, `ConditionalGroup`, `SubItem`,
  `Requirements`/`Requirement`, `AutomaticAcquisition`) → **section B**. These appear here
  as `DL_OBJECT_LIST` members of Feat / EnhancementTreeItem / Class.
- **Build/Character runtime model** (`Build`, trained-enhancement state, `SpendInTree`,
  breakdowns, action-point pools) → **section C**. Class/tree accessors above take a
  `const Build&` to resolve current state.
- **Spells and items data objects** (`Spell` resolved by `ClassSpell`, `Item`, `Augment`,
  `SetBonus`) → **section E**.
