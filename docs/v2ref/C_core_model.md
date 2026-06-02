# C. Core Build / Character Model

The V2 in-memory model is a three-level SAX-serialized document tree:

```
Character            (top document; ability tomes, special feats, content-I-dont-own)
  └─ Life[]          (one "life" = a TR incarnation: race, alignment, ability/skill tomes, special feats)
       └─ Build[]    (an actual planned build: classes, levels, feats, skills, enhancements, gear …)
```

Each level is a `XmlLib::SaxContentElement` + `Subject<…Observer>`. Persistence is declarative: every
class defines a `<Class>_PROPERTIES(_)` X-macro listing the fields that round-trip to/from XML; the
`DL_DECLARE_ACCESS`/`DL_DECLARE_VARIABLES` macros expand it into member variables + `Has*/Get*/Set*`
accessors, and `DL_DEFINE_NAMES`/`DL_START`/`DL_INIT` in the `.cpp` wire them to the SAX reader/writer.
The element name is the `f_saxElementName[]` literal (or a ctor-supplied name for parameterized base classes).

- **`Character`** owns the lives, the six ability tomes (`Str/Dex/Con/Int/Wis/Cha Tome`), a `SkillTomes`
  block, character-wide `SpecialFeats` (past-life / favor feats), guild level + apply flag, the
  `ContentIDontOwn` adventure-pack list, and the **active life/build indices** (`ActiveLifeIndex`,
  `ActiveBuildIndex`). `Character.h:100-114`.
- **`Life`** owns name/race/alignment, its own ability tomes + `SkillTomes` (the *active* tome source —
  Character-level tomes are legacy/aggregate), per-life `SpecialFeats`, the `Builds[]`, self/party buffs,
  monitored breakdowns, and the heroic `Level4..Level40` ability level-up defaults. Also computes bonus
  racial/universal/destiny action points. `Life.h:106-124`.
- **`Build`** is the workhorse: classes, per-level training, ability spend, skills, feats, spells,
  enhancement/destiny/reaper spend, stances, gear sets, weapon groups, quests, attack chains. `Build.h:369-401`.

`Character::ActiveBuild()` resolves `m_uiActiveLifeIndex` → `m_uiActiveBuildIndex` (`Character.cpp:493`);
`SetActiveBuild` (`Character.cpp:273`) swaps the active build and calls `Build::BuildNowActive()`.

## File index

| File | Stores | V3 counterpart |
| --- | --- | --- |
| `Character.h/.cpp` | Document root: lives[], char ability tomes, `SkillTomes`, char `SpecialFeats`, guild level/apply, `ContentIDontOwn`, active life/build index | `CharacterDocument` (`types/ddo.ts:558`); `multiLife.ts` |
| `Life.h/.cpp` | One incarnation: name/race/alignment, life ability + skill tomes, life `SpecialFeats`, builds[], self/party buffs, level-up defaults, bonus AP | `Life` (`types/ddo.ts:546`); `multiLife.ts` |
| `Build.h/.cpp` | The planned build (everything below) | `CharacterBuild` (`types/ddo.ts:407`); consumed by `useBuildStats.ts` |
| `LevelTraining.cpp` | Per-character-level: class, skill points avail/spent, `TrainedFeat[]`, `TrainedSkill[]` | `levelClasses[]`, `skillRanksByLevel`, `featChoices` on `CharacterBuild`; `levelProgression.ts` |
| `AbilitySpend.cpp` | Point-buy: `AvailableSpend` (default 28), per-ability spend, `Champion` flag | `baseAbilities`, `purchasedPoints` |
| `SkillTomes.cpp` | 21 named skill tome values | `skillTomes` (Build + Life) |
| `TrainedFeat.cpp` | A trained feat: name, alternate-feat, type, level-trained, swap-warning flag | `featChoices`, `alternateFeats` |
| `TrainedSkill.cpp` | A skill enum trained at a level (1 rank marker) | folded into `skillRanksByLevel` |
| `TrainedSpell.cpp` | Class + spell-level + spell name | `trainedSpells` |
| `TrainedEnhancement.cpp` | Enhancement name, selection, ranks, tier-5 flag | values inside `enhancementChoices`/`enhancementSelections` (& destiny/reaper) |
| `TrainedFiligree.cpp` | Filigree name + rare flag | `filigreeSlots` / `artifactFiligreeSlots` |
| `FeatSlot.cpp` | A feat slot: level, feat-type, singular/auto-populate flags, update-list | `FeatSlot` (`types/ddo.ts:59`) |
| `CompletedQuest.cpp` | Quest name, level, difficulty enum | `completedQuests`, `questDifficulty` |
| `FavorEntry.cpp` | Quest favor: heroic/epic/legendary tiers | not modeled (favor not yet ported) |
| `EquippedGear.cpp` | A named gear set: 21 slot Item refs + filigree slots + ability snapshots | `gear`, `namedGearSets`, `activeGearSetName` |
| `EquipmentSlot.cpp` | Bit-flags marking which inventory slots an item occupies | `Item` slot metadata (`types/ddo.ts:205`) |
| `Gem.cpp` | Sentient gem descriptor (name/desc/icon) | `SentientGemState` (`types/ddo.ts:531`) |
| `ItemAugment.cpp` | An augment slot: type, selected augment, level idx, values, item-specific augments | `augmentChoices`, `ItemAugment` (`types/ddo.ts:191`) |
| `SlotUpgrade.cpp` | Upgrade slot: type + allowed upgrade types | item-upgrade metadata |
| `SelectedTrees.cpp` | Base: ordered `TreeName[]` + optional `Tier5Tree` | `selectedDestinyTrees`, pinned trees |
| `SelectedEnhancementTrees.cpp` | Legacy ordered enhancement tree list | superseded by `Enhancement_SelectedTrees` |
| `Enhancement_SelectedTrees.cpp` | (derives SelectedTrees) chosen heroic enh trees | `enhancementPinned` |
| `Destiny_SelectedTrees.cpp` | (derives SelectedTrees) chosen destiny trees + tier-5 | `selectedDestinyTrees`, `activeEpicDestiny` |
| `Reaper_SelectedTrees.cpp` | (derives SelectedTrees) reaper trees | reaper trees in `reaperChoices` |
| `SpendInTree.cpp` | Base: tree name, version, `TrainedEnhancement[]` | one `Record<itemName,ranks>` in `enhancementChoices`/`destinyChoices`/`reaperChoices` |
| `EnhancementSpendInTree.cpp` | (derives SpendInTree) heroic AP spend in a tree | `enhancementChoices[tree]` |
| `DestinySpendInTree.cpp` | (derives SpendInTree) destiny spend in a tree | `destinyChoices[tree]` |
| `EpicDestinySpendInTree.cpp` | Standalone destiny-spend variant (own props) | `destinyChoices` |
| `ReaperSpendInTree.cpp` | (derives SpendInTree) reaper spend | `reaperChoices[tree]` |
| `EnhancementSelection.cpp` | A selector option: name/desc/icon, clickie, min-spent, ranks, reqs, stances/attacks/effects/DCs | `EnhancementSelection` (`types/ddo.ts:138`) |
| `AutomaticFeats.cpp` | Class auto-feat list keyed by level (data-side cache shape) | `automaticFeats.ts`; `AutomaticFeat` (`types/ddo.ts:91`) |
| `FeatsListObject.cpp` | A list of `TrainedFeat` (used for special/favor feats) | `string[]` in `Life.specialFeats` / `featChoices` |

Element names verified from `f_saxElementName[]`: `Character`, `Life`, `Build`, `LevelTraining`,
`AbilitySpend`, `SkillTomes`, `TrainedFeat`, `TrainedSkill`, `TrainedSpell`, `TrainedEnhancement`,
`FeatSlot`, `CompletedQuest`, `FavorEntry`, `EquippedGear`, `Gem`, `ItemAugment`, `SlotUpgrade`,
`SelectedEnhancementTrees`, `Destiny_SelectedTrees`, `Enhancement_SelectedTrees`, `Reaper_SelectedTrees`,
`EnhancementSpendInTree`, `DestinySpendInTree`, `EpicDestinySpendInTree`, `ReaperSpendInTree`,
`EnhancementSelection`, `AutomaticFeats`. `TrainedFiligree`, `EquipmentSlot`, `SelectedTrees`,
`FeatsListObject`, and `SpendInTree` receive their element name via constructor argument (base/parameterized
classes), so the on-disk tag is whatever the caller passes (e.g. `SpecialFeats`, `FavorFeats`).

---

## Build.cpp

Single 6735-line class. Responsibility map (line ranges are def starts):

| Area | Lines | What it does | V3 location |
| --- | --- | --- | --- |
| **SAX load/save** | `StartElement` 107, `EndElement` 119, `Write` 185, `LoadComplete` 192 | XML round-trip of `Build_PROPERTIES`; `LoadComplete` fixes pointers & legacy data | `v2Import.ts:334`, `v2Export.ts:373` |
| **Activation** | `BuildNowActive` 294 | The master "make this build live" pass: resets AP tallies (`m_racialTreeSpend`/`m_universalTreeSpend`/`m_classTreeSpend`/`m_destinyTreeSpend` 317-351), re-runs `UpdateFeats`, re-applies every feat/enhancement/spell/gear/guild effect, recomputes ability snapshots | `useBuildStats.computeBuildStats` 1614 (recompute-on-read instead of mutate) |
| **Level/name/race/alignment** | `SetLevel` 424, `SetName` 482, `SetRace` 501, `SetAlignment` 521, `CheckClasses` 6642 | Build-level scalars; `SetLevel` grows/shrinks `m_Levels` and revokes lost-level feats | `CharacterBuild.totalLevel/epicLevels/legendaryLevels`, `race`, `alignment`; `levelProgression.ts` |
| **Class training** | `SetClass1/2/3` 831/882/932, `SetClass(level,…)` 976, `RevokeClass` 1015, `Class` 1043, `SwapClasses` 1258 | The three "favoured" class slots + the authoritative per-level `m_Levels[].Class`. `m_cachedClassLevels[MAX_GAME_LEVEL]` (map class→count) is the fast lookup, rebuilt by `UpdateCachedClassLevels` 6384 | `classes[3]` + `levelClasses[]`; `aggregateLevelClasses`/`getLevelClasses` in `levelProgression.ts` |
| **Class-level queries** | `ClassLevels(level)` 1190 / `(ct,level)` 1203, `BaseClassLevels` 1153/1169, `ClassAtLevel` 1226, `BaseClassAtLevel` 1238, `BaseAttackBonus` 1106, `AbilityAtLevel` 1125, `LevelData` 1097 | Count class levels up to a char level (reads `m_cachedClassLevels`); BAB = sum of per-class truncated fractions (1117-1119) | `classLevelsAtLevel` 65 + `classBAB` in `useBuildStats.ts:131` |
| **Ability spend / tomes** | `BaseAbilityValue` 3119, `SpendOnAbility` 3127, `DetermineBuildPoints` 3189, `BuildPointsPastLifeCount` 3165, `SetAbilityLevelUp` 3039, `AbilityLevelUp` 3099, `LevelUpsAtLevel` 1299, `Str..ChaTome` 3009-3034, `TomeAtLevel` 3002 | Point-buy via `m_BuildPoints` (AbilitySpend); 8 + race + spend + level-ups + tome (`AbilityAtLevel` 1130-1150). Tome timing rule (U37P1) noted at 1136-1144 | `baseAbilities`, `abilityLevelUps`, `purchasedPoints`; `abilityAtLevel`/`tomeCapAtLevel` in `levelProgression.ts` |
| **Skills** | `IsClassSkill` 1893, `SpendSkillPoint` 1917, `RevokeSkillPoint` 1939, `MaxSkillForLevel` 1962, `SpentAtLevel` 1999, `SkillAtLevel` 2019, `UpdateSkillPoints` 2067/2084 | Per-level skill-point spend stored in `LevelTraining`; class-skill ×1, cross-class ×0.5 caps | `skillRanksByLevel`, `skillRanks`; skill totals in `useBuildStats.ts` |
| **Feat training** | `TrainFeat` 1621, `TrainAlternateFeat` 1611, `IsFeatTrainable` 1497, `TrainableFeats` 1434, `TrainableFeatTypeAtLevel` 1054, `CurrentFeats` 1468, `GetTrainedFeat` 1411, `FeatTrainedCount` 1402, `RevokeLostLevelFeats` 1346, `VerifyTrainedFeats` 2103 | Feat-slot model: slot types per level from class/race `FeatSlot`s; eligibility via `Requirements.Met` | `featChoices`, `alternateFeats`; `automaticFeats.ts`, `requirements.ts` |
| **Auto feats** | `AutomaticFeats` 2493, `UpdateFeats` 2437/2451, `AutoTrainSingleSelectionFeats` 2576, `IsGrantedFeat` 1388 | **Auto-acquisition driver** (2493): race granted feats at L1, then every standard feat whose `AutomaticAssignment` requirements are `Met`, then class-specific `GetAutoFeats(classLevel)`; respects `MaxTimesAcquire` | `automaticFeats.ts` (`computeAutomaticFeats`) |
| **Spells** | `UpdateSpells` 2215, `TrainedSpells` 2245, `FixedSpells` 2264, `TrainSpell` 2288, `RevokeSpell` 2306, `IsSpellTrained` 2342, `ApplySpellEffects` 2364-2410, `AdditionalClassSpell` 6241, `AppendSpellListAdditions` 6256, `Bonus(Max)CasterLevels(School)` 6272-6383 | Per class+level known/fixed spells; spell-list additions from effects (`m_additionalSpells`); caster-level bonus effect lists (`m_spellCasterLevels` etc.) | `trainedSpells`, `spellMetamagics`; `lib/spells` |
| **Enhancement spend** | `Enhancement_SetSelectedTrees` 3403/3408, `Enhancement_TrainEnhancement` 3444, `Enhancement_RevokeEnhancement` 3518, `Enhancement_ResetEnhancementTree` 3371, `IsEnhancementTrained` 3606, `IsExclusiveEnhancement` 3617, `ApplyEnhancementEffects` 3638, `RevokeEnhancementEffects` 3714 | Heroic AP trees; spend stored in `m_EnhancementTreeSpend` (EnhancementSpendInTree); exclusion groups in `m_exclusiveEnhancements` | `enhancementChoices`, `enhancementSelections`, `exclusionGroups.ts` |
| **Destiny spend** | `Destiny_SetSelectedTrees` 3885/3890, `Destiny_TrainEnhancement` 3902, `Destiny_RevokeEnhancement` 3966, `Destiny_ResetEnhancementTree` 4030 | Epic destiny trees in `m_DestinyTreeSpend` (DestinySpendInTree) | `destinyChoices`, `destinySelections`, `activeEpicDestiny`; `destiny.ts` |
| **Reaper spend** | `Reaper_TrainEnhancement` 4065, `Reaper_RevokeEnhancement` 4112, `Reaper_ResetEnhancementTree` 4163 | Reaper trees in `m_ReaperTreeSpend` (ReaperSpendInTree); unlimited AP | `reaperChoices` |
| **AP accounting** | `AvailableActionPoints` 1727, `BonusRacialActionPoints` 1785, `BonusUniversalActionPoints` 1790, `APSpentInTree` 1795, `FindSpendInTree` 2732/2778, `RemoveTreeSpend` 2824 | Per-tree-type AP budget = level×4 + bonus − cross-tree spend (1734-1781); destiny APs from `Breakdown_DestinyPoints` | AP math in enhancement panels / `useBuildStats.ts` |
| **Spend lookup** | `IsTrained` 1806, `IsEnhancementTrained` 3606 | Find a `TrainedEnhancement` across all spend lists | reads of `*Choices` maps |
| **Stances** | `ActivateStance` 3791, `DeactivateStance` 3814, `DisableStance` 3831, `IsStanceActive` 3847, `StanceSliderChanged` 3880, `UpdateGreensteelStances` 6535 | `m_Stances` (ActiveStances); `IsStanceActive` (3847) also queries the StancesPane and special-cases `%`-slider stances and `FavoredWeapon` (needs ½ Favored-Soul levels) | `sliderValues`, stance handling in `lib/effects` + `useBuildStats.ts` |
| **Gear sets** | `AddGearSet` 4196, `DeleteGearSet` 4214, `SetActiveGearSet` 4290, `ActiveGearSet` 4309, `GetGearSet` 4274, `UpdateActiveGearSet` 4620, `SetGear` 4650, `ClearGearInSlot` 4719, `SetNumFiligrees` 4314, `SetGearSetSnapshot` 4345, `SnapshotAbilityValue` 4361, `UpdateGearToLatestVersions` 4390, `VerifyGear` 2614 | Named `m_GearSetups` (EquippedGear); `ActiveGear` is the live one; ability snapshots for "what-if" gear swaps | `gear`, `namedGearSets`, `activeGearSetName`, `namedGearAugments` |
| **Gear/item effects** | `ApplyGearEffects` 4824, `RevokeGearEffects` 4748, `ApplyItem` 4853, `RevokeItem` 5039, `ApplyAugment` 4925, `RevokeAugment` 5111, `ApplyFiligree` 5225, `RevokeFiligree` 4777, `ApplyWeaponEffects` 5557, `ApplyArmorEffects`, `ApplyItemEffect` 6105 | Push/pull effects as gear changes; set bonuses tracked in `m_setBonusStacks` (`AddSetBonusStack` 5315, `ActiveSets` 5368, `SetBonusCount` 5373) | gear effect parsing in `useBuildStats.ts` + `lib/effects` |
| **Weapon groups** | `SetupDefaultWeaponGroups` 5386, `IsWeaponInGroup` 5393, `AddWeaponToGroup` 5407, `MergeGroups` 5495, `MainHandWeapon` 5535, `OffhandWeapon` 5546 | `m_weaponGroups`; effects can add/merge weapon types into named groups | `lib/weapons`, `allWeaponGroups` input |
| **Guild / self+party buffs** | `ApplyGuildBuffs` 5967, `GuildLevelChange` 6060, `ApplySelfAndPartyBuffs` 6090, `NotifyOptionalBuff` 6065, `RevokeOptionalBuff` 6078 | Guild-level buff effects; `m_previousGuildLevel` diff; toggled self/party buffs | `guildLevel`, `applyGuildBuffs`, `activeBuffs`; `allGuildBuffs`/`allSelfBuffs` |
| **Special feats** | `TrainSpecialFeat` 3253, `RevokeSpecialFeat` 3305, `GetSpecialFeatTrainedCount` 3247, `VerifySpecialFeats`, `SpecialFeats` 1603 | Past-life/favor feats in `m_FavorFeats` (FeatsListObject) plus Life/Character special feats | `Life.specialFeats`, `pastLives` |
| **Quests / favor** | `SetQuestsCompletions` 6125 | `m_CompletedQuests` (CompletedQuest list) → favor totals | `completedQuests`, `questDifficulty` |
| **Attack chains** | `AddAttackChain` 6562, `DeleteAttackChain` 6573, `UpdateAttackChain` 6614, `GetActiveAttackChain` 6629 | Named DPS attack sequences in `m_AttackChains` | `attackChains` |
| **Notifications (observer)** | `Notify*` 536-826, 2663-2978, BreakdownObserver `UpdateTotalChanged` 6409 | ~40 `Notify*` calls fan out every state change to UI/breakdown observers; `UpdateTotalChanged` keeps ability snapshots current | replaced by React state + `CharacterContext.tsx` reducer + `useMemo` recompute |
| **Legacy migration** | `UpdateLegacyTrees` 6701, `LoadComplete` 192 | Convert old enhancement/destiny tree layouts on load | migration in `CharacterContext.migrateLoad` 96 |

Internal AP-tally members (`m_racialTreeSpend`, `m_universalTreeSpend`, `m_classTreeSpend`,
`m_destinyTreeSpend`) and `m_cachedClassLevels[MAX_GAME_LEVEL]` are the two pieces of derived
state that V3 recomputes on read rather than caching (`Build.h:497-506`).

---

## LevelTraining
- **Stores:** the training done at one character level — optional `Class`, `SkillPointsAvailable`,
  `SkillPointsSpent`, `TrainedFeat[]`, `TrainedSkill[]`. `LevelTraining.h:43-48`.
- **Key functions:** `LevelTraining.cpp` ctor/`StartElement` 25; accessed via `Build::m_Levels`
  (`Build.h:375`) and `Build::LevelData` (`Build.cpp:1097`).
- **XML element:** `LevelTraining`.
- **V3 counterpart:** decomposed into `levelClasses[]`, `skillRanksByLevel`, and `featChoices` on
  `CharacterBuild`; class-level math in `levelProgression.ts`.

## AbilitySpend
- **Stores:** point-buy state — `Champion` flag, `AvailableSpend` (default 28), six per-ability spends.
  `AbilitySpend.h:37-45`.
- **Key functions:** consumed via `Build::m_BuildPoints` — `BaseAbilityValue` (`Build.cpp:3119`),
  `SpendOnAbility` (3127), `DetermineBuildPoints` (3189).
- **XML element:** `AbilitySpend` (single `DL_OBJECT` `BuildPoints`, `Build.h:374`).
- **V3 counterpart:** `baseAbilities` + `purchasedPoints`.

## SkillTomes
- **Stores:** 21 named skill-tome integers. `SkillTomes.h:24-45`.
- **Key functions:** `Life::SkillTomeValue` (`Life.cpp`), `Build::SkillTomeValue` (`Build.cpp:2984`).
- **XML element:** `SkillTomes` (lives at Character level in XML; also a Life member `m_SkillTomes`).
- **V3 counterpart:** `skillTomes: Record<string,number>`.

## TrainedFeat
- **Stores:** `FeatName`, optional `AlternateFeatName`, `Type`, `LevelTrainedAt`, `FeatSwapWarning`.
  `TrainedFeat.h:30-35`.
- **Key functions:** created in `Build::TrainFeat` (`Build.cpp:1621`), `TrainAlternateFeat` (1611).
- **XML element:** `TrainedFeat`.
- **V3 counterpart:** `featChoices` (slotKey→feat) + `alternateFeats`.

## TrainedSkill
- **Stores:** a single `Skill` enum (one trained rank marker). `TrainedSkill.h:21-22`.
- **XML element:** `TrainedSkill`.
- **V3 counterpart:** folded into per-level counts in `skillRanksByLevel`.

## TrainedSpell
- **Stores:** `Class`, `Level` (spell level), `SpellName`. `TrainedSpell.h:24-27`.
- **Key functions:** `Build::TrainSpell` (`Build.cpp:2288`), `TrainedSpells` (2245).
- **XML element:** `TrainedSpell` (`DL_OBJECT_VECTOR TrainedSpells`, `Build.h:376`).
- **V3 counterpart:** `trainedSpells: Record<class, Record<level, string[]>>`.

## TrainedEnhancement
- **Stores:** `EnhancementName`, optional `Selection`, `Ranks`, `IsTier5`. `TrainedEnhancement.h:34-38`.
- **Key functions:** held inside `SpendInTree::m_Enhancements`; matched by `Build::IsTrained`
  (`Build.cpp:1806`).
- **XML element:** `TrainedEnhancement`.
- **V3 counterpart:** the `itemName→ranks` and `itemName→selection` entries inside
  `enhancementChoices`/`enhancementSelections` (and destiny/reaper equivalents).

## TrainedFiligree
- **Stores:** filigree `Name` + `Rare` flag. `TrainedFiligree.h:25-27`.
- **XML element:** constructor-supplied (used for `Filigrees`/`ArtifactFiligrees`).
- **V3 counterpart:** `filigreeSlots` / `artifactFiligreeSlots`.

## FeatSlot
- **Stores:** `Level`, `FeatType`, `Singular`, `AutoPopulate`, `FeatUpdateList[]`. `FeatSlot.h:28-33`.
- **Key functions:** produced by `Build::TrainableFeatTypeAtLevel` (`Build.cpp:1054`); `AutoPopulate`
  drives `AutoTrainSingleSelectionFeats` (2576).
- **XML element:** `FeatSlot`.
- **V3 counterpart:** `FeatSlot` (`types/ddo.ts:59`).

## CompletedQuest
- **Stores:** `Name`, `Level`, `Difficulty` enum. `CompletedQuest.h:24-27`.
- **Key functions:** `Build::SetQuestsCompletions` (`Build.cpp:6125`).
- **XML element:** `CompletedQuest`.
- **V3 counterpart:** `completedQuests` + `questDifficulty`.

## FavorEntry
- **Stores:** `Quest` + heroic/epic/legendary `FavorType` enums. `FavorEntry.h:23-27`.
- **XML element:** `FavorEntry`.
- **V3 counterpart:** not yet ported (favor tracking absent in V3).

## EquippedGear
- **Stores:** a named gear set — `Name`, 21 optional `Item` slots (Helmet…Ring1/2, cosmetics), optional
  `Personality`, `NumFiligrees`, `Filigrees[]`, `ArtifactFiligrees[]`, six ability snapshots.
  `EquippedGear.h:63-95`.
- **Key functions:** `Build::AddGearSet` (`Build.cpp:4196`), `ActiveGearSet` (4309), `SetGear` (4650),
  `SnapshotAbilityValue` (4361).
- **XML element:** `EquippedGear` (`DL_OBJECT_LIST GearSetups`, `Build.h:387`; `ActiveGear` names the live one).
- **V3 counterpart:** `gear`, `namedGearSets`, `namedGearAugments`, `activeGearSetName`.

## EquipmentSlot
- **Stores:** 20 boolean flags marking which inventory slots an item fills. `EquipmentSlot.h:26-46`.
- **XML element:** constructor-supplied.
- **V3 counterpart:** slot metadata on `Item` (`types/ddo.ts:205`).

## Gem (Sentient Gem)
- **Stores:** `Name`, `Description`, optional `Icon`. `Gem.h:31-34`.
- **XML element:** `Gem`.
- **V3 counterpart:** `SentientGemState` (`types/ddo.ts:531`).

## ItemAugment
- **Stores:** `Type`, optional `SelectedAugment`, `SelectedLevelIndex`, `Value`, `Value2`,
  `ItemSpecificAugments[]`. `ItemAugment.h:37-43`.
- **Key functions:** applied by `Build::ApplyAugment` (`Build.cpp:4925`).
- **XML element:** `ItemAugment`.
- **V3 counterpart:** `augmentChoices`; `ItemAugment` (`types/ddo.ts:191`).

## SlotUpgrade
- **Stores:** `Type` + allowed `UpgradeType[]`. `SlotUpgrade.h:25-27`.
- **XML element:** `SlotUpgrade`.
- **V3 counterpart:** item-upgrade metadata.

## SelectedTrees (base)
- **Stores:** ordered `TreeName[]` + optional `Tier5Tree`. `SelectedTrees.h:34-36`.
- **XML element:** constructor-supplied; subclasses `Destiny_SelectedTrees`, `Enhancement_SelectedTrees`,
  `Reaper_SelectedTrees` set fixed names.
- **V3 counterpart:** `selectedDestinyTrees`/`enhancementPinned`.

## SelectedEnhancementTrees (legacy)
- **Stores:** ordered enhancement `TreeName[]`. `SelectedEnhancementTrees.h:28-29`.
- **XML element:** `SelectedEnhancementTrees`.
- **V3 counterpart:** superseded by `Enhancement_SelectedTrees`; migrated on load.

## Destiny_SelectedTrees / Enhancement_SelectedTrees / Reaper_SelectedTrees
- **Stores:** inherit `SelectedTrees` (ordered tree names; destiny adds tier-5). Headers only declare ctors.
- **Key functions:** set via `Build::Destiny_SetSelectedTrees` (3885), `Enhancement_SetSelectedTrees`
  (3403), and per-tree `*_SwapTrees` (1703/1711/1719).
- **XML elements:** `Destiny_SelectedTrees`, `Enhancement_SelectedTrees`, `Reaper_SelectedTrees`
  (`Build.h:378-380`).
- **V3 counterpart:** `selectedDestinyTrees`, `activeEpicDestiny`, `unlockedDestinyTrees`,
  `enhancementPinned`.

## SpendInTree (base) + Enhancement/Destiny/Reaper variants
- **Stores:** `TreeName`, `TreeVersion`, `TrainedEnhancement[]`. `SpendInTree.h:48-51`.
  `EpicDestinySpendInTree` declares the same props standalone (`EpicDestinySpendInTree.h:34-37`).
- **Key functions:** `Spent()` AP total; located via `Build::FindSpendInTree` (`Build.cpp:2732/2778`),
  totals summed in `BuildNowActive` (328-351) into the per-type AP tallies.
- **XML elements:** `EnhancementSpendInTree`, `DestinySpendInTree`, `EpicDestinySpendInTree`,
  `ReaperSpendInTree` (`Build.h:381-383`); base `SpendInTree` name is ctor-supplied.
- **V3 counterpart:** `enhancementChoices`/`destinyChoices`/`reaperChoices` (each `tree→item→ranks`).

## EnhancementSelection
- **Stores:** a selector option — `Name`, `Description`, `Icon`, `Clickie`, `MinSpent`, `Ranks`,
  optional `RequirementsToTrain`, plus `Stances[]`, `Attacks[]`, `Effects[]`, `EffectDC[]`.
  `EnhancementSelection.h:45-57`.
- **XML element:** `EnhancementSelection`.
- **V3 counterpart:** `EnhancementSelection` (`types/ddo.ts:138`); selection picks stored in
  `enhancementSelections`/`destinySelections`.

## AutomaticFeats
- **Stores:** a `Level` + list of `Feats` granted at that level (data-side shape). `AutomaticFeats.h:27-29`.
- **Key functions:** consumed by the runtime driver `Build::AutomaticFeats` (`Build.cpp:2493`) via class
  `GetAutoFeats(classLevel)`.
- **XML element:** `AutomaticFeats`.
- **V3 counterpart:** `automaticFeats.ts`; `AutomaticFeat` (`types/ddo.ts:91`).

## FeatsListObject
- **Stores:** a `TrainedFeat[]` (`Feats`). `FeatsListObject.h:40-41`.
- **Key functions:** used for `Character::SpecialFeats`, `Life::SpecialFeats`, `Build::m_FavorFeats`
  (`Build.h:389`); `Character::AddSpecialFeats` (`Character.h:89`).
- **XML element:** constructor-supplied (tag is the field name, e.g. `SpecialFeats`, `FavorFeats`).
- **V3 counterpart:** `Life.specialFeats: string[]` + `pastLives`.

---

## V3 mapping summary

- **`types/ddo.ts`** — `CharacterDocument` (558), `Life` (546), `CharacterBuild` (407) mirror the V2 tree.
  V2's per-level `LevelTraining` is flattened into parallel maps (`levelClasses[]`, `skillRanksByLevel`,
  `featChoices`); enhancement/destiny/reaper `SpendInTree`s become `*Choices` records. `emptyBuild` (582)
  is the default-shaped build.
- **`lib/multiLife.ts`** — `wrapLegacy` (30) lifts a flat `CharacterBuild[]` into a single-Life
  `CharacterDocument`; `flattenDocument` (61) and `isCharacterDocument` (72) bridge old/new save shapes;
  `promoteBuildToLife` (84) clones a build into a new Life.
- **`lib/v2Import.ts`** — `importV2Build` (334) reads the V2 XML. **Documented gap (F1):** it only reads the
  *active* life+build — it picks `lifeRaw[ActiveLifeIndex]` (339-345) and `buildArr[ActiveBuildIndex]`
  (347-353), discarding all other lives/builds in the file. Full multi-life import is not implemented.
  It also reconstructs class composition from the 34 `LevelTraining` entries (heroic 1-20 / epic 21-30 /
  legendary 31-34, lines 387-393).
- **`lib/v2Export.ts`** — `exportV2Build` (373) writes a single build back to V2 XML (inverse of import;
  same single-active-build scope).
- **`lib/levelProgression.ts`** — heroic/epic/legendary caps (14-16), `getLevelClasses`/
  `aggregateLevelClasses` (24/45) reconcile `classes[3]` ↔ `levelClasses[]`, `classLevelsAtLevel` (65)
  ≈ `Build::ClassLevels`, `abilityAtLevel`/`tomeCapAtLevel`/`allAbilitiesAtLevel` (144/162/173) ≈
  `Build::AbilityAtLevel`/tome rules.
- **`context/CharacterContext.tsx`** — React reducer holding the active build; `migrateLoad` (96) +
  helpers (`migrateLevelClasses` 87, `migrateFiligreeSlots` 75, `migrateSentientGem`) play the role of
  `Build::LoadComplete`/`UpdateLegacyTrees`. `CharacterProvider` (496) / `useCharacter` (505) are the
  public API. Notifications are replaced by React state propagation (no observer fan-out).
- **`hooks/useBuildStats.ts`** — consumes a `CharacterBuild` + static data (`BuildStatsInput` 69) and
  recomputes all stats functionally. `buildStatMap` (618) accumulates typed bonuses from feats, enhancements,
  gear, set bonuses, filigrees, stances, guild/self buffs; `computeBuildStats` (1614) / `useBuildStats`
  (1638) expose `resolve`/`total`/`keys`/`weapon`. This replaces V2's mutate-on-change
  `BuildNowActive`/`Apply*Effects` model with recompute-on-read.

---

## Cross-references

- **Effect application & stacking** (`Apply*Effects`, bonus-type stacking) → **doc B** (effect engine):
  V3 `lib/effectParser.ts`, `lib/bonus.ts`, `lib/effects/`.
- **Static data objects** referenced here (`Class`, `Race`, `Feat`, `EnhancementTree`, `Item`, `Augment`,
  `SetBonus`, `Spell`, `Stance`) → **docs D/E** (data objects / data files).
- **Breakdowns / `BreakdownItem` / `UpdateTotalChanged`** (the snapshot + total machinery `BuildNowActive`
  hooks into) → **doc A** (breakdowns); V3 equivalent is the `ResolvedStat`/`StatMap` layer in
  `useBuildStats.ts`.
