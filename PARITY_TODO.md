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

---

## High-priority remaining

### Numerical correctness (fix as user reports specific mismatches)

- ✅ **BonusTypes stacking rules** — `lib/bonus.ts` now reads stacking rules
  from `BonusTypes.xml` via `initBonusTypes()`. The hard-coded fallback
  remains for environments where the XML is unavailable. (#56)
- ❌ **AttackRates in Combat panel** — `AttackRates.xml` is loaded but the
  `CombatPanel` DPS sim still uses synthesised attack-per-minute numbers.
- 🟡 **Save bonus edge cases** — Strong/Weak base progression is correct
  (#53). Missing: full Divine Grace cap (V2 `BreakdownItemSave.cpp:484-510`),
  Half-Elf Lesser Divine Grace (`BreakdownItemSave.cpp:520-549`),
  Reaper-only Diehard, Mantle saves.
- ❌ **Spell DC: per-school stacking** — `dc.<school>` stat-key works for
  feat focus, but multi-source DC stacking (Implement, Arcane Augmentation,
  set bonuses) needs verification against V2 `SpellDC.cpp:62-129`.
- ❌ **Caster level item bonuses** — V2 `Spell.cpp:174-228` adds class CL,
  school CL, spell CL. V3 reads them from stats but item-set CL bonuses
  aren't all wired.
- 🟡 **Skill cross-class .5-rank display** — totals correct; per-level grid
  shows trained levels (not displayed ranks). Need a "show .5 rank" mode.
- ❌ **Reaper points awarded by quest difficulty** — V2 awards Reaper XP
  per quest; V3 has a manual slider only.
- ❌ **Eldritch blast dice scaling** — V2 `BreakdownItemEldritchBlast.cpp`
  has the per-class-level scaling; V3 needs a dedicated breakdown.
- ❌ **Ki / Turn Undead / Song breakdowns** — sections exist in
  BreakdownsPanel but several stat keys still resolve to 0 because feats
  that grant them aren't yet wired through the parser.
- ❌ **Hireling stat passthrough** — V2 has hireling sliders; V3 surfaces
  them in BreakdownsPanel but doesn't drive a hireling sub-build.

### Effect parser coverage

- 🟡 **Permissive types**: `Skill`, `Stance`, `EnemyType` accept-by-default
  in `lib/requirements.ts` for prereq display. They should evaluate against
  the actual snapshot when sufficient state is tracked.
- ❌ **`SLA` (Spell-Like Ability)** effects are partial — caster level +
  charges + recharge are read but charge consumption isn't simulated.
- ❌ **`Slider` effects with non-stance gating** — most stance-gated
  sliders work; non-stance gates (e.g. enemy-type) are still TODO.
- ❌ **`ExclusionGroup`** — V2 marks effects exclusive within a named group
  (e.g. `SDItemDefense`). V3 doesn't enforce these yet.

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

- 🟡 **`SimpleGear`** (FES_SimpleGear) is present but doesn't sort like
  V2 `ForumExportDlg.cpp:1841`.
- ❌ **`AlternateGearLayouts`** is present but doesn't include the augment
  list per slot.
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

*Maintained by the parity-pass series. See PRs #53, #54, #55 for completed
items.*
