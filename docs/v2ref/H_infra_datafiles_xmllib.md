# H. Infrastructure, Data Files & XML Framework

This chapter documents the V2 DDOBuilder (C++/MFC) plumbing that every higher-level
data class and panel sits on top of: the `XmlLib` SAX serialization framework and its
`DL_` macro DSL, the `GlobalSupportFunctions` global helper hub, the on-disk
`Output/DataFiles/` game-content layout, the small support/infra utilities, and the
legacy (V1) file-format readers. For each piece it notes the V3 (React/TS) counterpart
so a parity effort can find the equivalent.

Key fact for V3: every V2 data file is a hand-authored (or wiki-scraped) XML document
under `Output/DataFiles/`. V3 reads those *same* XML files at build/server time via
`webapp/src/server/dataLoaders.ts` using `fast-xml-parser`, so the file format is the
contract shared between the two codebases. V3 has no equivalent of the `DL_` macros — it
just parses the XML directly into typed objects.

---

## XmlLib & the DL_ serialization pattern

The XML library lives in `XmlLib/` (headers at the root, implementations in
`XmlLib/Src/`). It is a thin wrapper over MSXML SAX:

| File | Role |
| --- | --- |
| `XmlLib/SaxReader.h` / `Src/SaxReader.cpp` | Opens a file, drives a SAX parse, dispatches to a root `SaxContentElement`. Used as `SaxReader reader(&obj, L"RootName"); reader.Open(path);` (see `DDOBuilder.cpp:302`). |
| `XmlLib/SaxContentElement.h` / `Src/SaxContentElement.cpp` | Base class for every serializable object. Provides `StartElement`/`EndElement`/`Characters` SAX callbacks and the `HandleSimpleElement` / `HandleEnumElement` helpers the macros call. |
| `XmlLib/SaxWriter.h` / `Src/SaxWriter.cpp` | Writes XML back out: `StartElement`, `EndElement`, `WriteSimpleElement`, `WriteEnumElement`, `WriteEmptyElement`. |
| `XmlLib/SaxVector.h`, `XmlLib/SaxString.h`, `XmlLib/SaxAttributes.h` | Value helpers: space-separated numeric vectors (the `<Amount size="40">5 5 ...</Amount>` form), wide-string keys, attribute access. |
| `XmlLib/DLMacros.h` | The macro DSL (756 lines) that generates the accessors, member variables, init, SAX parse, validation, and write code for a class from a single property list. |

### How the DL_ macro pattern works

Every V2 data class declares a single `X_PROPERTIES(_)` macro listing its fields, then
expands that one list through several macro "modes" — `ACCESS`, `VARIABLE`, `DEFINE_NAME`,
`INIT`, `START`, `END`, `WRITE` — so the property list is written **once** and drives all
serialization concerns. The trailing `_` argument selects the mode.

Property kinds (all from `DLMacros.h`):

- `DL_STRING(_, Name)` / `DL_OPTIONAL_STRING` — `std::string` field ↔ `<Name>` element.
- `DL_SIMPLE(_, type, Name, default)` — scalar (`size_t`, `int`, `double`, `bool`) ↔ element. `DL_OPTIONAL_SIMPLE` / `DL_DEFAULT_SIMPLE` add a present-flag / fallback default.
- `DL_ENUM(_, EnumType, Name, defaultVal, enumMap)` — enum serialized via a name↔value `enumMapEntry` map (e.g. `alignmentTypeMap`). `DL_OPTIONAL_ENUM`, `DL_ENUM_LIST`.
- `DL_OBJECT(_, Type, Name)` — a single nested `SaxContentElement` child.
- `DL_OBJECT_LIST` / `DL_OBJECT_VECTOR` — repeated nested objects (a `std::list`/`std::vector`).
- `DL_VECTOR` / `DL_STRING_LIST` / `DL_STRING_VECTOR` — repeated scalars/strings.
- `DL_FLAG(_, Name)` — boolean presence flag, written as an empty element when set.

The class **header** uses two expansions (example: `GuildBuff.h:23`):

```cpp
#define GuildBuff_PROPERTIES(_) \
        DL_STRING(_, Name) \
        DL_STRING(_, Description) \
        DL_SIMPLE(_, size_t, Level, 0) \
        DL_OBJECT_LIST(_, Effect, Effects)

DL_DECLARE_ACCESS(GuildBuff_PROPERTIES)     // generates public getters + private Set_X
DL_DECLARE_VARIABLES(GuildBuff_PROPERTIES)  // generates m_Name, m_Level, m_has* ...
```

The class **.cpp** (`GuildBuff.cpp:8`) ties it together with `#define DL_ELEMENT GuildBuff`
and the remaining mode expansions:

```cpp
#define DL_ELEMENT GuildBuff
DL_DEFINE_NAMES(GuildBuff_PROPERTIES)   // const SaxString f_saxName = L"Name"; ...
GuildBuff::GuildBuff() : SaxContentElement(L"GuildBuff",1) { DL_INIT(GuildBuff_PROPERTIES) }
DL_DEFINE_ACCESS(GuildBuff_PROPERTIES)  // bodies of the getters/setters
// StartElement: DL_START(...) routes <Name>/<Effect> to the right member
// EndElement:   DL_END(...)   asserts required elements were present
// Write:        DL_WRITE(...) emits each element
```

So `<GuildBuff><Name>...</Name><Level>10</Level><Effect>...</Effect></GuildBuff>` round-trips
into `m_Name`, `m_Level`, and a `std::list<Effect> m_Effects` purely from the one property
list. Required vs optional is encoded by the `DL_` variant: plain `DL_*` asserts presence in
`DL_END` (`DL_GENERIC_MISSING`, `DLMacros.h:607`); `DL_OPTIONAL_*`/`DL_DEFAULT_*` track an
`m_has*` flag instead. This identical pattern is used by Class, Race, Feat, Item, Spell,
EnhancementTree, Augment, SetBonus, Patron, Stance, and every Legacy* class below.

V3 has no macro layer: `dataLoaders.ts` parses these same XML shapes directly into TS
interfaces (`webapp/src/types/`).

---

## GlobalSupportFunctions

`GlobalSupportFunctions.h` / `.cpp` (~1000 lines) is the global service locator: catalogue
accessors (lazy-loaded singletons of the parsed `Output/DataFiles/` content), name-based
`Find*` lookups, stat/breakdown enum mapping, and assorted UI/string utilities. Most-used:

| V2 helper (`GlobalSupportFunctions.cpp`) | Purpose | V3 location |
| --- | --- | --- |
| `Classes()`, `Races()`, `StandardFeats()`, `EnhancementTrees()`, `Spells()`, `Items()`, `Augments()`, `SetBonuses()`, `Stances()`, `Patrons()`, `GuildBuffs()`, `SentientGems()`, `WeaponGroups()`, `BonusTypes()`, `Filigrees()` | Lazy global catalogues, populated once from the XML data files | `loadAllCatalogues()` → `LoadedCatalogues` in `webapp/src/server/dataLoaders.ts:360`; passed down as props/context |
| `FindClass(name)` `:329`, `FindRace(name)` `:304`, `FindFeat(name)` `:232`, `FindItem(name)` `:198`, `FindBonus`, `FindPatron`, `FindQuest`, `FindSetBonus`, `FindAugmentByName`, `FindFiligreeByName`, `FindSentientGemByName` | Name → object lookups over the catalogues | Plain `Array.prototype.find(x => x.Name === name)` at call sites (e.g. `effects/sliders.ts:104`); no central hub |
| `FindEnhancement(internalName[, tree])`, `GetEnhancementTree(name)`, `ClassIndex`/`ClassFromIndex` | Enhancement-tree lookups | `webapp/src/lib/effects/*` traverse loaded trees directly |
| `BaseStatToBonus(ability)` `:501` | Ability score → modifier: `(score-10)/2`, rounding up for penalties | `abilityModifier()` `DCPanel.tsx:55`; `abilityModFromTotal()` `effectParser.ts:289` (`Math.floor((total-10)/2)`) |
| `StatToBreakdown(ability)` `:986`, `SkillToBreakdown`, `SchoolToBreakdown`, `SpellPowerToBreakdown`, `TacticalToBreakdown`, `CasterLevelSchoolToBreakdown`, `StatFromSkill`, `ArmorCheckPenalty_Multiplier` | Map enums → `BreakdownType` (and skill→stat) | Breakdown machinery in `webapp/src/lib/combat/` and `breakdowns` components (see chapter A) |
| `EnumEntryText<T>(t, map)` / `TextToEnumEntry<T>(name, map)` (templates, `.h:120/140`) | Generic enum ↔ string via `enumMapEntry` tables | Per-enum string literal unions / lookup tables in `webapp/src/types/` and `gamedata.ts` |
| `DataFolder()` `:951` | Resolves the `Output/DataFiles/` root next to the exe | `dataDir` argument threaded through every `load*` in `dataLoaders.ts` |
| `AddToIgnoreList` / `IsInIgnoreList` | Item ignore-list backed by `IgnoredList.xml` | not ported (no current V3 loader) |
| `ReplaceAll`, `ReplaceFirst`, `ExtractBlock`, `BreakUpLongLines`, `SearchForText`, `IsVowel`, `FormatExportData` | String utilities (esp. for forum export) | scattered in `webapp/src/lib/export/`, `v2Export.ts` |
| `GetMouseHook()`, `GetLog()`, `LoadImageFile`, `MakeGrayScale`, `GetDPIMultiplier`, `DefaultFont`, combobox/listctrl helpers | MFC/UI glue | N/A — replaced by React/DOM/CSS |

---

## Output/DataFiles layout

`Output/DataFiles/` is the root resolved by `DataFolder()`. XML game-content files plus
`*Images/` icon folders. The V3 loaders all live in `webapp/src/server/dataLoaders.ts`.

| Path | Contents | V3 loader (`dataLoaders.ts`) |
| --- | --- | --- |
| `Classes/*.class.xml` (28) | One `<Classes><Class>` per class; class feats, spell progression, etc. | `loadClasses()` `:64`; also mines automatic class feats `loadFeats()` `:85` |
| `Races/*.race.xml` (30) | `<Races><Race>`: racial abilities, feats, tomes | `loadRaces()` `:51` |
| `Feats.xml` | Master `<Feats><Feat>` list (standard/past-life/special feats) | `loadFeats()` `:76` |
| `EnhancementTrees/*.tree.xml` (115) | `<Enhancements><EnhancementTree>`: class/race/universal/destiny trees + `EnhancementTreeItem` | `loadEnhancementTrees()` `:106` |
| `Blank Trees/*.tree.xml` (5) | Empty tree templates (authoring scaffolds) | not loaded |
| `Spells.xml` | `<Spells><Spell>`: spell DCs, levels, effects | `loadSpells()` `:139` |
| `Items/*.item` (8487) | One `<Items><Item>` each: gear with slots/augments/effects (wiki-scraped) | `loadItems()` `:162` |
| `Augments/*.Augments.xml` (31) | `<Augments><Augment>` grouped by augment family (Diamond, Cannith, …) | `loadAugments()` `:176` |
| `SetBonuses.xml` | `<SetBonuses><SetBonus>`: gear/filigree set tiers | `loadSetBonuses()` `:190` |
| `FiligreeSets/*.Filigree.xml` (65) | `<Filigrees>` with `<Filigree>` items + `<SetBonus>` set bonuses | `loadFiligreeSets()` `:204` (filigrees) + `loadFiligreeBonuses()` `:216` (set bonuses) |
| `WeaponGroupings.xml` | `<WeaponGroups>` weapon-category membership | `loadWeaponGroups()` `:146` |
| `Stances.xml` | `<Stances><Stance>`: toggle stances + effects | `loadStances()` `:155` |
| `BonusTypes.xml` | `<BonusTypes><Bonus>`: stacking-rule bonus types | `loadBonusTypes()` `:284` |
| `AttackRates.xml` | `<AttackRates><Rate>`: weapon attack-rate table | `loadAttackRates()` `:271` |
| `ItemBuffs.xml` | `<Buffs><Buff>`: named item buffs | `loadItemBuffs()` `:313` |
| `ItemClickies.xml` | `<Spells><Spell>`: clicky item effects | `loadItemClickies()` `:327` |
| `SelfAndPartyBuffs.xml` | `<...>` optional self/party buffs | `loadSelfAndPartyBuffs()` `:228` |
| `GuildBuffs.xml` | `<GuildBuffs><GuildBuff>` (worked example above) | `loadGuildBuffs()` `:197` |
| `Patrons.xml` | `<Patrons><Patron>`: favor patrons + tiers | `loadPatrons()` `:237` |
| `Quests.xml` | `<Quests><Quest>`: quest/favor data | `loadQuests()` `:244` |
| `Challenges.xml` | `<Challenges><Challenge>` | `loadChallenges()` `:300` |
| `Sentient.gems.xml` | `<SentientGems><Gem>`: sentient-jewel data | `loadSentientGems()` `:251` |
| `GuildBuffs.xml`/`Stances.xml` (above) | — | — |
| `IgnoredList.xml` | User item ignore-list (`AddToIgnoreList` etc.) | not loaded |
| `Patrons.xml`, `Challenges.xml` (above) | — | — |
| `*Images/` (`ItemImages`, `SpellImages`, `EnhancementImages`, `FeatImages`, `ClassImages`, `FiligreeImages`, `AugmentImages`, `SentientGemImages`, `SetBonusImages`, `UIImages`) | PNG icon strips referenced by `<Icon>` fields | served as static assets, not parsed |

Note: of the catalogue files, `loadAllCatalogues()` `:360` wires in races, classes, feats,
trees, self/party buffs, augments, set bonuses, filigrees (+ bonuses), weapon groups,
spells, guild buffs, items, attack rates, bonus types, challenges, item buffs, item
clickies. Stances, Patrons, Quests, Sentient gems have loaders but are consumed separately;
`IgnoredList.xml` and the `Blank Trees/` scaffolds are not ported.

---

## Support/infra files

All in `DDOBuilder/`. These are framework utilities, not game-data classes.

| File | Role | V3 |
| --- | --- | --- |
| `GlobalSupportFunctions.cpp/.h` | Global helper hub (above) | `dataLoaders.ts` + scattered `lib/` helpers |
| `DDOLog.cpp/.h` | File logger; `DDO_LogOpen(exeDir)` creates `DDOBuilder.log` next to exe, thread-safe `DDO_LogWrite(level,file,line,fmt,...)` via macros | `console`/server logging |
| `CriticalSection.cpp/.h` | RAII `CriticalSection` + `CriticalSectionLock` mutex wrapper (a separate copy also in `XmlLib/Src/`) | N/A (JS single-threaded) |
| `ElapsedTimer.cpp/.h` | High-res stopwatch; `Reset()`, `operator double()` = ms since reset, `Pause()`/`Resume()` | `performance.now()` if needed |
| `LocalSettingsStore.cpp/.h` | `CLocalSettingsStore : CSettingsStore` — overrides registry settings to a local `.ini` (`IniFilename()`, `Open`/`Write`/`Read`) | browser `localStorage` / persisted store |
| `MouseHook.cpp/.h` | Windows mouse hook (`MouseProc`) for tooltip/hover rectangles; `SaveState()`/`RestoreState()` | DOM mouse events |
| `MemoryDC.cpp/.h` | `MfcControls::MemoryDC : CDC` double-buffering helper (blits to real DC on destruct) | N/A (browser compositing) |

## Data tooling (wiki scraping)

`WikiDownloader.cpp/.h` and `WikiItemFileProcessor.cpp/.h` build the 8487-file `Items/`
DB at a high level: `WikiDownloader` shells out to a bundled `wget` (path derived from the
exe location, `WikiDownloader.cpp:12`) to fetch DDO-wiki item pages; `WikiItemFileProcessor`
(a `SaxContentElement` whose root element is `Items`, `WikiItemFileProcessor.cpp:20`) parses
the downloaded/marked-up pages, resolves them against the live catalogues (Race/Class/Bonus/
SetBonus/ItemAugment/SpellSchool/EnergyTypes includes) and emits the per-item `.item` XML
files. This is an authoring/maintenance tool, not part of normal load. No V3 equivalent —
V3 consumes the already-generated `Items/*.item` files.

---

## Legacy file format

The Legacy* classes (`DDOBuilder/`) read the **V1** `.ddocp` character format (root element
`DDOCharacterData`), used only by `CDDOBuilderApp::OnFileImport()` (`DDOBuilder.cpp:294`) to
migrate old files: it loads a `LegacyCharacter` via `SaxReader(... L"DDOCharacterData")`
(`DDOBuilder.cpp:302`) then `ConvertToNewDataStructure()` (`DDOBuilder.cpp:1793`) translates
it into the current model. They use the same `DL_` macro pattern.

| File | Reads (V1 `<...>` shape) | Notes |
| --- | --- | --- |
| `LegacyCharacter.cpp/.h` | `<DDOCharacterData>` root: Name, Alignment, Race, AbilitySpend, tomes, per-level ability bumps (Level4..Level40), Class1-3, selected enhancement/destiny trees, `LevelTraining` list, `TrainedSpell`s, enhancement/reaper/destiny spend, gear setups, self/party buffs, notes (`LegacyCharacter.h:33`) | Top-level migration object |
| `LegacyEnhancementSelectedTrees.cpp/.h` | V1 `<...SelectedTrees>` chosen class/race enhancement trees | nested in LegacyCharacter |
| `LegacyDestinySelectedTrees.cpp/.h` | V1 destiny tree selections | nested |
| `LegacyEquippedGear.cpp/.h` | V1 `<GearSetups>` equipped-gear layout (`LegacyEquippedGear_PROPERTIES`, `.h:29`) | nested; references LegacyItem |
| `LegacyItem.cpp/.h` | V1 item: Name, `EquipmentSlot` Slots, `ItemAugment` Augments, `SlotUpgrade`s (`LegacyItem.h:25`) | per equipped item |
| `LegacySentientJewel.cpp/.h` | V1 sentient jewel + filigrees (`SentientJewel_PROPERTIES`, `.h:38`) | nested |

**V3 support:** `webapp/src/lib/v2Import.ts` imports the **V2** `.DDOBuild` format
(`<DDOBuilderCharacterData>/<Character>/<Life>/<Build>`), citing `Build.cpp`, `Life.cpp`,
`Character.cpp`, `EquippedGear.cpp`, `TrainedEnhancement.cpp` — i.e. the *current* V2 format,
**not** the V1 `.ddocp` legacy format. The Legacy* classes are V2's own one-way V1→V2
migration importer and have **no V3 counterpart**; V3 starts from the V2 format that the
Legacy importer's `ConvertToNewDataStructure` produces.

---

## Cross-references

- Chapter A (Breakdowns): consumers of `StatToBreakdown` / `*ToBreakdown` and `BaseStatToBonus`.
- Chapter B (Effect/Requirement engine): `Effect`/`Requirement` objects nested via `DL_OBJECT_LIST` in the data classes.
- Chapter C (Core model) / D (Data objects & Character): the `Class`/`Race`/`Feat`/`Build`/`Character`/`Life` classes that use the same `DL_` macro pattern and feed the catalogues.
- V3 entry points: `webapp/src/server/dataLoaders.ts` (XML → typed catalogues), `webapp/src/lib/v2Import.ts` (V2 `.DDOBuild` import), `webapp/src/lib/v2Export.ts` (export).
