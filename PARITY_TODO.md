# V3 ↔ V2 Parity TODO

Tracking the remaining gaps between the V2 MFC application (`DDOBuilder/`,
~519 source files, ~100k lines C++) and the V3 React webapp
(`webapp/`, ~70 source files, ~16k lines TS). Updated as gaps close.

Status legend:
- ✅ Done
- 🟡 In progress / partial
- ❌ Not started
- ➖ Not applicable to a webapp port

When closing an item, move it under the **Done** section near the top with
the PR number, so this file doubles as a changelog.

---

## Done

| # | Area | PR |
|---|---|---|
| 1 | Per-level class progression (`build.levelClasses`, V2 `m_Levels`) | #53 |
| 24 | BonusTypes stacking rules driven by `BonusTypes.xml` — `initBonusTypes()` replaces hard-coded `EXCLUSIVE` set; `useStaticBundle` and CLI wire it at startup | #56 |
| 2 | Feat-slot prerequisite snapshot uses exact per-level state | #53 |
| 3 | Builder version line in sidebar | #53 |
| 4 | Shared `lib/requirements.ts` engine (FeatSlots + EnhancementTreePanel both use it) | #53 |
| 5 | Per-item enhancement Requirement checks | #53 |
| 6 | Epic / Legendary HP at half hit-die per level | #53 |
| 7 | CON-mod HP applied at total-character-level scope | #53 |
| 8 | Fate-point HP / SP @ L20+; negative-level HP / save penalty | #53 |
| 9 | StatsPanel BAB sums full per-class table | #53 |
| 10 | Skills first-level ×4 multiplier reads `levelClasses[0]` | #53 |
| 11 | Tome cap unified through `tomeCapAtLevel` (uses overall level) | #53 |
| 12 | AbilityLevelUps unlock through L40 (heroic + epic + legendary) | #53 |
| 13 | TomesPanel skill tomes go to +7 | #53 |
| 14 | Forum export: SpecialFeats / FeatSelectionsNoSkills / Bonuses sections | #53 |
| 15 | V2 `.DDOBuild` XML importer | #53 |
| 16 | Pure `computeBuildStats` (CLI-callable) | #53 |
| 17 | `scripts/v2DiffReport.ts` side-by-side diff CLI | #53 |
| 18 | Shared `dataLoaders.ts` module (server + CLI + tests share it) | #54 |
| 19 | Data-aware diff CLI (loads real XML catalogues) | #54 |
| 20 | Round-trip tests against `YingsMonk.DDOBuild` fixture | #54 |
| 21 | Per-character-level skill rank UI (Per Level grid view) | #55 |
| 22 | New XML loaders: AttackRates / BonusTypes / Challenges / ItemBuffs / ItemClickies | #55 |
| 23 | Challenges wired into Favor panel | #55 |
| 25 | Ki / Turn Undead / Song breakdowns — `BaseClassLevel`/`ClassLevel` AType uses `Amount[classLevel]` (array index) not `Amount[0]*classLevel`; Centered stance derived for cloth-armor Monk; Turn Undead base level from Cleric/Paladin class levels added to `turnUndead.levelBonus` and `turnUndead.diceBonus` | #57 |
| 26 | ExclusionGroup enforcement — `computeExclusionGroups()` derives group→claimant map from trained enhancements; `Exclusive` requirement type in `requirements.ts` now evaluates against that map (passes for owner or unclaimed group, fails for conflicts); conservative pass preserved when map is not provided | #62 |
| 27 | SaveBonusAbility ability substitution — `parseEffect` now correctly emits `save.{Fort\|Reflex\|Will}.ability.{Ability}` markers for feats like Force of Personality (CHA→Will) and Insightful Reflexes (INT→Reflex); `useBuildStats` Phase 2 picks the highest-modifier ability per save (V2 `LargestStatBonus()` parity) | #63 |
| 28 | Per-level cross-class skill .5-rank display — `lib/skillDisplay.ts` exports `perLevelRankDisplay`, `perLevelRankCap`, and `displayRankToTrained`; `PerLevelGrid` in `Skills.tsx` now shows 0.5-increment displayed ranks, correct `(N+3)/2` cap, and `step=0.5` inputs for cross-class skills (V2 BreakdownItemSkill parity) | #64 |
| 29 | SimpleGear forum export slot order + augments — `simpleGear` section now sorts slots in V2's canonical `Inventory_Arrows..Inventory_Weapon2` enum order and emits augment choices (type: name) per item slot, matching V2 `ForumExportDlg.cpp::ExportGear` | #65 |
| 30 | Spell DC multi-source stacking — `parseItemBuff` now handles `SchoolFocusNumber` (school-specific DC bonus, e.g. "+3 Insightful Enchantment DC") and `SpellFocusNumber` (universal DC bonus, e.g. "+1 Profane all DCs") item buff types; both were silently dropped (default: return []). DCPanel double-count removed: `spellFocusBonus` manual feat-name lookup eliminated; DC bonuses now come solely from `stats.total('dc.*')` (V2 `SpellDC.cpp:119-128` parity). | #66 |
| 31 | Caster level universal item bonuses — `computeCasterLevel` now adds `cl.All` and `computeMaxCasterLevel` now adds `maxCl.All`; equipment that grants "+N Caster Levels" with no class/school restriction (emits `cl.All` via `parseEffect`/`parseItemBuff`) was previously silently discarded (V2 `Spell.cpp:174-228` parity). | #67 |
| 32 | Eldritch blast dice scaling — `resolveBonus` now tracks `fromGear` on each `RawBonus` and applies "Highest Only" stacking only to gear contributions; feat/enhancement contributions always stack (V2 `BreakdownItem.cpp::m_effects` vs `m_itemEffects` parity). Auto-feats granted multiple times (e.g. `Warlock: Eldritch Blast Damage` ×5 at L4/8/12/16/20) and Pact Damage (×10) now correctly accumulate their full dice totals (6d8 + 10d6 at L20). | #68 |
| 33 | AlternateGearLayouts forum export — slots now sort in V2 canonical inventory order (not alphabetical); augments stored per named gear set in new `namedGearAugments` field and emitted per item slot matching V2 `ForumExportDlg.cpp::ExportGear`; V2 import populates `namedGearAugments` for each gear set; `SAVE_GEAR_SET`/`LOAD_GEAR_SET` context actions persist and restore augments with each named set. | #69 |
| 34 | AttackRates in Combat panel — `lib/combat/attackRate.ts` exports `lookupAttacksPerMinute` (scans backward through the sparse BAB table) and `pickCombatStyleName` (maps TWF/THF/SWF/Shield/Unarmed setup to V2 style strings); `CombatPanel` now fetches `/api/attack-rates` and passes `attacksPerRound = APM / 10` to `buildAttackEntry`, replacing the hardcoded default of 5. | #70 |
| 35 | Stance requirement evaluation against activeBuffs — `RequirementContext` gains an optional `activeBuffs?: string[]` field; the `Stance` case in `meetsSingleRequirement` now checks `ctx.activeBuffs.includes(item)` when the field is provided, and passes conservatively when it is absent (V2 `Requirement.cpp:1062-1072 EvaluateStance` parity). | #71 |
| 36 | Reaper XP required for n RAPs — `reaperXpRequired(n)` in `lib/v2Formulas.ts` implements V2 `ReaperEnhancementsPane.cpp:248-255` loop (sum of first n odd numbers = n²); `ReaperPanel` now shows "Requires Nk Reaper XP" next to RAPs spent, matching V2's panel title. | #72 |
| 37 | Player-toggled stances in effect-context stances — `buildStatMap` now merges `build.activeBuffs` into `ctxStances` so all 1 000+ enhancement effects gated on non-armor stances (Mountain Stance, Favored Weapon, Power Attack, Rage, Two Handed Fighting, Action Boost, …) correctly fire or not based on the player's current stance selection (V2 `Build::IsStanceActive` parity). | #73 |
| 38 | SLA list auto-derived from SpellLikeAbility effects — `parseEffect` now emits `sla.<spellName>` markers for `SpellLikeAbility` effects (feats, race grants, enhancements, augments); `BuildStats.slaList` exposes the sorted list of derived SLA names; forum export `slas` section now uses `stats.slaList` instead of the manual `build.slaCharges` fallback, matching V2 `CSLAControl`/`ForumExportDlg::AddSLAs` parity. | #74 |

---

## High-priority remaining

### Numerical correctness (fix as user reports specific mismatches)

- ✅ **BonusTypes stacking rules** — `lib/bonus.ts` now reads stacking rules
  from `BonusTypes.xml` via `initBonusTypes()`. The hard-coded fallback
  remains for environments where the XML is unavailable. (#56)
- ✅ **AttackRates in Combat panel** — `lib/combat/attackRate.ts` provides
  `lookupAttacksPerMinute` (backward-scan through sparse BAB table) and
  `pickCombatStyleName` (maps TWF/THF/SWF/Shield/Unarmed to V2 style strings);
  `CombatPanel` fetches `/api/attack-rates` and derives `attacksPerRound = APM / 10`
  (6-second round, 10 rounds/min) from the XML table, replacing the hardcoded
  default of 5. (#70)
- ✅ **Save bonus edge cases** — Divine Grace cap and Half-Elf Lesser Divine
  Grace (#56); SaveBonusAbility ability substitution (Force of Personality,
  Insightful Reflexes, Insightful Fortitude, Domain of Strength feats) (#63).
  "Reaper-only Diehard" and "Mantle saves" do not exist in V2
  `BreakdownItemSave.cpp` — those TODO entries were inaccurate.
- ✅ **Spell DC: per-school stacking** — `SchoolFocusNumber` and
  `SpellFocusNumber` item buff types now wire to `dc.<school>` and `dc.All`
  respectively in `parseItemBuff`; DCPanel double-count of Spell Focus feats
  removed. Multi-source stacking (Feat + Equipment + Insightful + Profane)
  verified correct via new regression tests. (#66)
- ✅ **Caster level universal item bonuses** — `computeCasterLevel` now adds
  `cl.All` and `computeMaxCasterLevel` now adds `maxCl.All`; equipment that
  grants "+N Caster Levels" with no class/school restriction was previously
  silently discarded. Class/school/spell-specific paths were already correct.
  (V2 `Spell.cpp:174-228` parity). (#67)
- ✅ **Skill cross-class .5-rank display** — `lib/skillDisplay.ts` provides
  `perLevelRankDisplay` / `perLevelRankCap` / `displayRankToTrained`; the
  `PerLevelGrid` in `Skills.tsx` now shows 0.5-increment ranks, correct
  `(N+3)/2` cap, and `step=0.5` inputs for cross-class skills. (#64)
- ✅ **Reaper points awarded by quest difficulty** — `reaperXpRequired(n)` in
  `lib/v2Formulas.ts` computes n² (matching V2 `ReaperEnhancementsPane.cpp:248-255`
  loop: sum of odd numbers 1+3+5+…); `ReaperPanel` now shows "Requires Nk Reaper XP"
  in the header and budget note, matching V2's panel display. (#72)
- ✅ **Eldritch blast dice scaling** — `resolveBonus` now tracks `fromGear` per
  `RawBonus` and applies "Highest Only" only within gear contributions; feat/
  enhancement contributions always stack (V2 `BreakdownItem.cpp::m_effects`
  parity). Repeated auto-feat grants like `Warlock: Eldritch Blast Damage` ×5
  and `Pact Damage` ×10 now produce correct 6d8 + 10d6 totals at L20. (#68)
- ✅ **Ki / Turn Undead / Song breakdowns** — `BaseClassLevel`/`ClassLevel`
  AType now uses `Amount[classLevel]` array index (not multiply). Centered
  stance added for cloth-armor Monks. Turn Undead base level from
  Cleric/Dark Apostate/Paladin class levels wired into `turnUndead.levelBonus`
  and `turnUndead.diceBonus`. (#57)
- ❌ **Hireling stat passthrough** — V2 has hireling sliders; V3 surfaces
  them in BreakdownsPanel but doesn't drive a hireling sub-build.

### Effect parser coverage

- ✅ **Stance requirement evaluation** — `RequirementContext` now accepts
  `activeBuffs?: string[]`; the `Stance` case in `meetsSingleRequirement`
  evaluates strictly against that list when provided, passes conservatively
  when absent (V2 `Requirement.cpp:1062 EvaluateStance` parity). (#71)
  `Skill` and `EnemyType` remain permissive (runtime-only conditions).

- ✅ **`SLA` (Spell-Like Ability)** effects — `parseEffect` now emits
  `sla.<spellName>` markers for `SpellLikeAbility` effects; `BuildStats.slaList`
  exposes the sorted derived SLA name list; forum export `slas` section uses
  `stats.slaList` (V2 `CSLAControl`/`ForumExportDlg::AddSLAs` parity). Charge
  consumption is not simulated (runtime-only, out of scope for a stat planner). (#74)
- ✅ **`Slider` effects with stance gating** — `buildStatMap` now merges
  `build.activeBuffs` into `ctxStances`; all Stance-gated SliderValue effects
  (e.g. Blessed Purpose / Favored Weapon) now correctly fire. (#73)
  Non-stance gates (EnemyType, MaterialType, etc.) remain conservative-pass
  (runtime-only, not tracked in the stat planner — intentional).
- ✅ **`ExclusionGroup`** — `computeExclusionGroups()` in `lib/exclusionGroups.ts`
  derives a `groupName → InternalName` map from trained enhancements; the
  `Exclusive` requirement type in `lib/requirements.ts` now evaluates against
  that map (passes for the owning enhancement or an unclaimed group, fails for
  conflicting enhancements). Passes conservatively when the map is not supplied
  to preserve backward compatibility. (#62)

### UI features

- ❌ **Multi-life document UI** — `Life`/`CharacterDocument` storage exists
  (#53) but the UI is single-build focused. V2 has a left-rail life picker
  with collapsible build snapshots per life.
- 🟡 **Build comparison** — works for the active build vs one saved build;
  V2 supports comparing across lives within a document.
- ❌ **Per-level UI for level-up bonuses** — currently a flat list at L4 /
  L8 / etc.; V2's `LevelTraining` UI shows feats / skills / spells trained
  at a specific level.
- ❌ **Spell metamagic gating** — V3 lists metamagics per spell but
  doesn't enforce class-specific availability (e.g. Wizards can use
  Maximize at L3, Sorcerers at L4 etc.).
- ❌ **Help documents / tooltips** — V2 has `Help/` HTML; V3 has none.

### Forum export

- ✅ **`SimpleGear`** (FES_SimpleGear) — slots now sort in V2's canonical
  `Inventory_Arrows..Inventory_Weapon2` enum order; augment choices are
  emitted per item as `type: name` lines, matching V2 `ForumExportDlg.cpp::ExportGear`. (#65)
- ✅ **`AlternateGearLayouts`** — slots now sort in V2 canonical inventory
  order; `namedGearAugments` field stores augments per named gear set;
  forum export emits augments per item slot matching V2 `ExportGear`. (#69)
- ❌ **Image embedding** — V2 export inserts `[img]` tags for class /
  destiny / racial icons. V3 export is text-only.

---

## Medium-priority remaining

### Subsystems V3 hasn't ported

- ❌ **Combat simulator with attack chains** — V2 `AttackChain.cpp`
  models a rotation of attacks (e.g. main / off / cleave / strikethrough).
  V3 has a single-weapon DPR estimator only.
- ❌ **Gear optimizer / auto-equip** — V2's "auto-equip" searches the
  item DB for the highest stat result given a goal. Multi-day port.
- ❌ **Settings dialog** — DPI scaling, auto-update toggles, log-level,
  data-files-path, file associations. V3 has none.
- ❌ **Build version migration** — V2 has explicit `Build version="1"`;
  V3's localStorage version is `_v: 2`. Need a migration path for users
  who saved on older `_v` values.

### Data file edge cases

- ❌ **Item slot edge cases** — V2 supports two ring slots (`Ring1` /
  `Ring2`), two trinket-via-augment, etc. V3 rebases ring slots but doesn't
  surface every edge case.
- ❌ **Cosmetic gear effects** — V2 ignores cosmetic stat effects but
  shows them in display. V3 ignores them entirely.
- ❌ **Sentient gem augment effects** — the `majorAugment` /
  `minorAugment` are wired (#53) but the personality buffs aren't.
- ❌ **Filigree set bonuses with conditional triggers** — V2 has
  triggered set bonuses (e.g. on-crit). V3 always-on.

### Editor tools (V2 has, V3 doesn't)

- ➖ **Item editor** — V2 ships a full item-edit dialog that writes back
  to XML. Out of scope for V3 (data-authoring tool, not a player tool).
- ➖ **Enhancement tree editor** — same scope.
- ➖ **Spell / race / class editors** — same scope.

These are intentionally not on the parity path since V3 reads V2's XML
files directly; if the user wants to add an item, they can edit V2's data
files and refresh.

---

## Low-priority polish

- ❌ **Keyboard shortcuts** — V2 `KeybindEditor` lets users rebind UI
  actions. V3 has none.
- ❌ **Print layout** — V2 supports printing the build summary.
- ❌ **Auto-save** — V3 saves explicitly via toolbar; V2 has periodic
  auto-save toggles.
- ❌ **Recent files menu** — V3 has a single saved-builds list; V2 has
  a most-recently-used file menu.
- ❌ **Drag-and-drop import** — V3 uses a file-picker; V2 supports OS
  file-association double-click + drag-drop.

---

## Methodology — how to close a parity gap

1. Pick an item from the list above (favour user-reported numerical
   mismatches).
2. Add a regression test: load `YingsMonk.DDOBuild` (or the user-supplied
   build) via `importV2Build`, run `computeBuildStats`, assert the
   expected V2-parity number.
3. Run the test → see it fail.
4. Fix the v3 implementation.
5. Run the test → see it pass.
6. Move the item to the **Done** table with the PR number.

The CLI helper for running V3 against a V2 build:

```sh
cd webapp
npx tsx scripts/v2DiffReport.ts ../Output/Example\ Builds/YingsMonk.DDOBuild
```

Open the same `.DDOBuild` file in V2 (Windows) and diff visually.

---

## Out-of-scope by design

These V2 features won't be ported because they don't make sense in a webapp:

- ➖ Native MFC dialogs (replaced by React UI)
- ➖ Windows registry settings (replaced by `localStorage`)
- ➖ DPI scaling (CSS handles this for free)
- ➖ Win32 file-association handlers
- ➖ Data-authoring editors (V3 is a player tool, not a content tool)

---

*Maintained by the parity-pass series. See PRs #53–#74 for completed items.*
