# V3 ↔ V2 Parity TODO

Tracking the remaining gaps between the V2 MFC application (`DDOBuilder/`,
~244 `.cpp` files, ~100k lines C++) and the V3 React webapp
(`webapp/`, ~97 source files, ~17k lines TS). Updated as gaps close.

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
| 39 | **V2 `.DDOBuild` exporter** — new `lib/v2Export.ts` `exportV2Build()` serialises a V3 build back to V2 `<DDOBuilderCharacterData>/<Character>/<Life>/<Build>` XML so builds edited in V3 can be re-opened in V2. Wired into `usePersistence` as an "Export .DDOBuild" button. Element-name fidelity per `Character.h`/`Life.h`/`Build.h` `*_PROPERTIES` macros (tomes, `AbilitySpend` reconstructed from scores via `POINT_BUY_COSTS`, per-level `LevelTraining` with `TrainedFeat`/`TrainedSkill`, `EnhancementName`/`Selection`/`Ranks`, `*_SelectedTrees`, `EquippedGear` with index-preserving augment padding). Before this, V3 could read V2 files but never write them. | this PR |
| 40 | **Genuine round-trip test** — `__tests__/v2RoundTripExport.test.ts` imports a real `.DDOBuild`, exports it, re-imports, and asserts every V3-modeled field survives (identity, classes, abilities, tomes, feats, per-level skills, enhancement/destiny/reaper spend, gear + augments + named sets, stances, notes, guild, past lives). The old `v2RoundTrip*` tests only imported + computed stats — they never re-serialised. | this PR |
| 41 | **`CompletedQuests` import node-bug fix** — V2 stores `<CompletedQuests>` on the `Build` node (`Build.h`), but `v2Import.ts` read it from the `Life` node, so quest completions never imported. Now reads from `buildNode`. | this PR |
| 42 | **AC dex cap includes `Effect_MaxDexBonus`** — V2 `BreakdownItemMDB` sums the armor's printed `MaximumDexterityBonus` AND every `Effect_MaxDexBonus` (armor-mastery enhancements, etc.) into one `Breakdown_MaxDexBonus->Total()`. V3 only used the printed item value, so enhancements that raise the dex-to-AC cap were ignored. Now adds the resolved `mdb` stat to the armor cap (no double-count — the printed field is not part of the `mdb` stat). | this PR |
| 43 | **N1 — AC percentage armor/shield bonuses + armor enchantment** — `Effect_ArmorACBonus`/`Effect_ACBonusShield` now route to dedicated `armorACPercent`/`shieldACPercent` stats; `useBuildStats` applies them as a **percentage** of (armor + armor-enchantment) / shield AC (`trunc()` per V2 `BreakdownItemAC.cpp:115-157`), gating the shield % on an equipped shield. Also folds the armor enchantment (`armor.enchantment`, previously a dangling unused stat) into AC — V2 registers `Effect_EnchantArmor` directly on the AC breakdown. Was: flat AC points + dropped enchantment. | this PR |
| 44 | **N2 (partial) — combat to-hit penalties** — `useBuildStats` now emits the −1/neg-level and armor-check-penalty to-hit penalties into `melee.attack`/`ranged.attack`; `attackEntry.ts` adds the −4 non-proficiency penalty and the per-hand Two Weapon Fighting penalty (−4 with TWF feat else −6 main / −10 off, +2 for a light off-hand or Oversized TWF), and the off-hand now rolls against its own (larger-penalty) attack bonus. `CombatPanel` wires the off-hand weapon, light-weapon detection (weapon groups) and Oversized TWF. Matches V2 `BreakdownItemWeaponAttackBonus.cpp:70-191`. Remaining: weapon-proficiency *detection* (the `nonProficient` flag is plumbed but `CombatPanel` assumes proficiency — needs the proficiency-group engine). | this PR |
| 45 | **N4 — FvS/Sorcerer SP multiplier scope** — the `1 + (FvS+Sorc)/min(level,20)` multiplier now applies **only to gear-sourced** spell points (`fromGear` SP), matching V2 `BreakdownItem::Total` which calls `SumItems(m_itemEffects, /*bApplyMultiplier*/ true)` while class/casting-ability/feat SP use `false`. The Sorc/FvS class SP tables are already larger than Wizard/Cleric (base doubling baked into the data). V3 had been multiplying the whole subtotal, over-counting class + ability SP. | this PR |
| 46 | **N3 — corrected, not a bug** — re-reading `BreakdownItem::Total` (line 207, `SumItems(m_effects, false)`) shows V2 applies `RemoveNonStacking` **only** to `m_itemEffects` (gear); feat/enhancement effects always stack. That is exactly V3's `fromGear` model, so V3's False Life handling already matches V2. The old "highest-only across ALL sources" claim misread the C++; no change made. | this PR |

---

## ⚠️ Methodology caveat (read before trusting "Done")

The `parityPass*` unit tests and `scripts/v2DiffReport.ts` assert V3's **own**
computed numbers — they are self-consistency checks, **not** golden values
captured from the running C++ app. `v2DiffReport.ts` prints a single V3 column,
not a V2-vs-V3 diff. So "verified via regression tests" means "stable and
internally consistent," not "byte-for-byte equal to V2." A real V2-golden
comparison harness (item **G1** below) is the highest-leverage way to make all
future parity claims trustworthy.

---

## File compatibility with V2 `.DDOBuild` files

The user's headline requirement: V3 must read **and write** V2 files and behave
like V2. Import + a build-skeleton exporter now exist (Done #15, #38–#41).
Remaining read/write-fidelity gaps:

- ❌ **F1 — Multi-life / multi-build import.** `importV2Build` collapses the
  whole `Character → Life[] → Build[]` tree to the *active* life's *active*
  build (`v2Import.ts:339-349`); all other lives and builds are silently
  dropped with no warning. The model to hold them already exists
  (`CharacterDocument`/`Life` in `ddo.ts:543-567`, helpers in `multiLife.ts`)
  but the importer never produces a document. Fix: import every life/build,
  preserve `ActiveLifeIndex`/`ActiveBuildIndex`, and have the exporter emit all
  of them.
- 🟡 **F2 — Gear-effect embedding in the exporter.** V2 stores the *full* item
  definition (all `<Buff>` effects) inside each `<EquippedGear>` slot and trusts
  the embedded copy on load (it does not re-resolve by name). `exportV2Build`
  currently emits `<Name>` + augments only, so a V3-exported file re-opens in V2
  with the right item names but no item effects until re-resolved. Fix: pass the
  item catalogue to the exporter and emit each equipped item's full definition.
- ❌ **F3 — Dropped Build fields that carry real effects.** Import drops
  `<FavorFeats>` (House Deneith/Twelve/etc. favor rewards — populated in the
  example files), `<TrainedSpells>` (caster spell selections), stance slider
  values (`build.sliderValues` never populated — V2 `StanceSliderChanged`),
  `<AttackChains>`/`<ActiveAttackChain>`, and `<GearSetSnapshot>` + the
  `<Snapshot*>` ability values. Targets exist in `ddo.ts`
  (`trainedSpells:496`, `attackChains:525`, `sliderValues:494`).
- ❌ **F4 — `ContentIDontOwn` + Life-level `SpecialFeats`.** `ContentIDontOwn`
  (Character-level) and Life-level `SpecialFeats` (beyond past lives) are not
  imported; `CharacterDocument.contentIDontOwn` and `Life.specialFeats` stay
  empty.
- 🟡 **F5 — Past-life Type round-trip.** The exporter reconstructs past-life
  feat `<Type>` from the class/race name (best-effort). Counts round-trip, but a
  rich V2 `SpecialFeats` list (Granted, Favor, etc.) is not fully reproduced.
  Pairs with F3/F4.

---

## High-priority remaining — numerical correctness

- ✅ **N1 — AC percentage armor/shield bonuses** — fixed (Done #43).
- 🟡 **N2 — Combat to-hit penalties** — TWF / ACP / negative-level penalties
  fixed; the off-hand now rolls against its own attack bonus (Done #44).
  *Remaining:* weapon-proficiency **detection** — the `nonProficient` flag is
  plumbed through `attackEntry`, but `CombatPanel` always assumes proficiency.
  Closing it needs an `IsWeaponInGroup("Proficiency", weapon)` engine (weapon
  groups + the character's proficiency feats / class auto-grants).
- ✅ **N3 — False Life** — *not a bug* (Done #46). V2's `BreakdownItem::Total`
  only applies highest-only to gear (`m_itemEffects`); feat/enhancement False
  Life always stacks — exactly V3's `fromGear` model. The earlier claim
  misread the C++.
- ✅ **N4 — FvS/Sorcerer SP multiplier scope** — fixed (Done #45). The
  multiplier applies to gear SP only, matching V2.
- ❌ **N5 — Hireling stat passthrough.** V2 has hireling sliders driving a
  hireling sub-build; V3 surfaces them in BreakdownsPanel but doesn't compute a
  hireling.

### Tooling
- ❌ **G1 — Real V2-golden comparison harness.** Replace the one-sided
  `scripts/v2DiffReport.ts` with a tool that diffs V3's output against captured
  V2 numbers (e.g. exported from V2's BreakdownsPane), so "parity" claims become
  verifiable instead of self-referential. This unblocks trustworthy validation
  of every numerical item above.

---

## High-priority remaining — effect parser coverage

- 🟡 **E1 — `SLA` (Spell-Like Ability)** — the SLA *list* is now auto-derived
  (`sla.<spellName>` markers + `BuildStats.slaList` + forum export, #74). Charge
  *consumption* is still not simulated (runtime-only, out of scope for a stat
  planner).
- 🟡 **Non-stance runtime gates** (EnemyType, MaterialType, Skill, …) remain
  conservative-pass in the stat planner — intentional (runtime-only), tracked
  here for completeness.

---

## High-priority remaining — UI features

- ❌ **U1 — Multi-life / multi-build document UI.** The running app state is a
  single flat `CharacterBuild` (`CharacterContext.tsx`), persistence is a flat
  localStorage array, and V2 import keeps only the active build. V2's core model
  is a Character document with a left-rail life picker and per-life build
  snapshots. Pairs with **F1**. Highest-impact UI gap.
- ❌ **U2 — Twists of Fate editor.** Epic-destiny twisting (fate-point spend to
  twist abilities from other destinies) has no UI — "Twist of Fate" appears only
  in `lib/export/sections.ts`, not in `EpicDestiniesPanel.tsx`. `twistChoices`
  exists on the model but is not editable.
- 🟡 **U3 — Reaper AP not persisted.** `ReaperPanel.tsx:62-63` keeps the reaper
  AP budget as session-only React state; selections persist via `reaperChoices`
  but the budget resets, unlike V2 where reaper XP/AP is part of the saved build.
- 🟡 **U4 — Spells known-per-level limit.** `SpellsPanel.tsx` lets you check any
  number of spells per level (it caps the spell *level* but not the *count* of
  known spells per level), reading more like a full spellbook than V2's limited
  known-spell selection.
- 🟡 **U5 — Granted / Special / Automatic feats consolidated.** V2 has three
  panes (Automatic/Granted/Special); V3 folds them into one `AutomaticFeats.tsx`.
- 🟡 **U6 — Build comparison scope.** V3 compares two *saved* builds via dropdown
  (`BuildCompare.tsx`); V2 compares simultaneously-active builds within a life.
- ❌ **U7 — Per-level training UI** — flat list at L4/L8/… rather than V2's
  `LevelTraining` view of feats/skills/spells trained at a specific level.
- ❌ **U8 — Spell metamagic class-gating** — V3 lists metamagics per spell but
  doesn't enforce class-specific availability (Wizard Maximize @L3, Sorc @L4…).
- ❌ **U9 — Content-ownership filtering UI** (`ContentPane`), Find-Gear-by-effect
  (`FindGearDialog`), help docs / tooltips — no equivalents in V3.

---

## High-priority remaining — forum export

- ❌ **X1 — Image embedding** — V2 export inserts `[img]` tags for class /
  destiny / racial icons. V3 export is text-only.

---

## Medium-priority remaining

### Subsystems V3 hasn't ported
- ❌ **Combat simulator with attack chains** — V2 `AttackChain.cpp` /
  `Attack.cpp` models a per-swing rotation (main / off / cleave / strikethrough)
  and a `BreakdownItemWeaponEffects` holder chain; V3 has a single-weapon
  expected-DPR estimator only.
- ❌ **Gear optimizer / auto-equip** — V2's "auto-equip" searches the item DB
  for the best stat result given a goal. Multi-day port.
- ❌ **Settings dialog** — DPI scaling, auto-update, log-level, data-files-path,
  file associations. V3 has none.
- ❌ **Build version migration** — V2 has `Build version="1"`; V3's localStorage
  version is `_v: 2`. Need a migration path for older `_v` saves.

### Data-file edge cases
- ❌ **Item slot edge cases** — two ring slots, trinket-via-augment, etc.
- ❌ **Cosmetic gear effects** — V2 ignores cosmetic stat effects but shows them;
  V3 ignores them entirely.
- ❌ **Sentient gem augment / personality buffs** — `majorAugment`/`minorAugment`
  are wired (#53) but personality buffs aren't.
- ❌ **Filigree set bonuses with conditional triggers** — V2 has triggered set
  bonuses (e.g. on-crit); V3 always-on.

### Editor tools (intentionally out of parity scope)
- ➖ **Item / enhancement-tree / spell / race / class editors** — V2 ships
  data-authoring dialogs that write back to XML. V3 reads V2's XML directly; to
  add content, edit V2's data files and refresh. Not on the parity path.

---

## Low-priority polish

- ❌ **Keyboard shortcuts** (V2 `KeybindEditor`), **print layout**, **auto-save
  toggle**, **recent-files menu**, **drag-and-drop / file-association import**.
  None present in V3.

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

Open the same `.DDOBuild` file in V2 (Windows) and diff visually. **Note:**
`v2DiffReport.ts` currently prints only V3's own numbers — until item **G1**
lands, you must compare against V2 by eye. For file-format work, prefer the
round-trip guard `webapp/src/__tests__/v2RoundTripExport.test.ts`
(import → `exportV2Build` → re-import → field equality).

---

## Out-of-scope by design

These V2 features won't be ported because they don't make sense in a webapp:

- ➖ Native MFC dialogs (replaced by React UI)
- ➖ Windows registry settings (replaced by `localStorage`)
- ➖ DPI scaling (CSS handles this for free)
- ➖ Win32 file-association handlers
- ➖ Data-authoring editors (V3 is a player tool, not a content tool)

---

*Maintained by the parity-pass series. See PRs #53–#74 and the Done table
above for completed items. Last full V2↔V3 review: 2026-06 — section-by-section
breakdown comparison closing the verified numerical-correctness gaps: AC
percentage armor/shield bonuses + armor enchantment (N1), combat to-hit TWF /
ACP / negative-level penalties (N2, partial — proficiency detection pending),
and the FvS/Sorcerer SP multiplier scope (N4); plus correcting the N3 False
Life claim, which was a misreading of V2's `m_effects`/`m_itemEffects` split.*
