# G. UI Layer (MFC Panes / Dialogs / Controls)

## Overview

V2 DDOBuilder is a Windows **MFC** desktop app. Its UI is built from docking **panes**
(`CDockablePane`/`CDDOFormView` subclasses), modal **dialogs**, and a large set of custom
owner-drawn **controls/buttons**. The app shell (`CDDOBuilderApp` / `CMainFrame` /
`CDDOBuilderDoc`) creates/persists the panes and owns the single `Character` document.

In V3 (React/TS, `webapp/src/`) the docking panes map roughly 1:1 onto React **panels**
under `webapp/src/components/<area>/`, mounted by `layout/Layout.tsx` + `layout/Sidebar.tsx`.

Most of the MFC code is pure **rendering / event plumbing** (➖ N/A for parity — React
re-implements the view from scratch). A handful of UI files, however, embed real **game
logic** that the parity effort MUST port (forum-text generation, auto weapon/race stance
activation, feat-slot availability, skill-point spend grid). These are flagged below and
listed in the callout at the end.

The reusable shells (`CDDOFormView`, `CCustomDockablePane`, `CCustomTabbedPane`) and every
button/static/checkbox subclass are MFC look-and-feel only and have **no** V3 analog beyond
generic React/CSS.

---

## Panes

| Pane | Edits/Displays | Logic? | V3 component |
|------|----------------|--------|--------------|
| ClassAndFeatPane | Class-per-level grid + build level combo; hosts FeatsClassControl | thin (delegates to FeatsClassControl) | `builder/ClassSelector.tsx`, `builder/FeatSlots.tsx` |
| BuildsPane | List of builds/lives in the character; add/clone/select active build | thin | `layout/BuildCompare.tsx` + builder header (`builder/CharacterInfo.tsx`) |
| ContentPane | Owned content/expansion packs gating availability | thin | (build settings; no dedicated panel) ➖ |
| AutomaticFeatsPane | Read-only list of feats auto-granted by class/race/level | display | `builder/AutomaticFeats.tsx` |
| GrantedFeatsPane | Read-only list of feats granted by enhancements/destinies/items | display | (folded into `builder/AutomaticFeats.tsx`) ➖ |
| SpecialFeatsPane | Past-life / favor / tome / special feat toggles | thin | `pastlives/PastLivesPanel.tsx` |
| SkillsPane | Per-level skill-point spend grid; hosts SkillSpendControl | **YES — spend grid lives in SkillSpendControl** | `builder/Skills.tsx` |
| StancesPane | Active stances; auto weapon/race/Greensteel stances | **YES — auto-activation + incompatible-stance logic** | `stances/StancesPanel.tsx` |
| SelfAndPartyBuffsPane | Toggle self/party situational buffs | thin (toggles `Build` buffs) | `buffs/SelfBuffsPanel.tsx` (+ `guildbuffs/GuildBuffsPanel.tsx`) |
| EnhancementsPane | Class enhancement trees spend UI | thin (trees in EnhancementTreeDialog/Control) | `enhancements/EnhancementTreePanel.tsx` |
| ReaperEnhancementsPane | Reaper enhancement trees spend UI | thin | `reaper/ReaperPanel.tsx` |
| EpicDestiniesPane | Epic destiny trees spend UI | thin | `epicdestinies/EpicDestiniesPanel.tsx` |
| DestinyPane | Destiny tree selection / fate points context | thin | `epicdestinies/EpicDestiniesPanel.tsx` (+ `filigree/FiligreePanel.tsx`) |
| SpellsPane | Known/prepared spells per level; hosts SpellsControl | thin | `builder/SpellsPanel.tsx` |
| EquipmentPane | Equipped gear slots; launches gear dialogs | thin (gear logic in dialogs/Item model) | `items/GearPanel.tsx` (+ `items/ClickiesPanel.tsx`) |
| BreakdownsPane | Tree of every computed stat breakdown (the math viewer) | display (math comes from BreakdownItem layer) | `breakdowns/BreakdownsPanel.tsx` |
| BonusesPane | Set bonuses / named bonus stacking summary | display | `bonuses/BonusesPanel.tsx` (+ `setbonuses/SetBonusesPanel.tsx`) |
| DCPane | Spell/effect DC summary table | display | `dc/DCPanel.tsx` |
| DPSPane | DPS scores per named attack chain; add/delete chains | thin (DPS computed in model; chain CRUD here) | `combat/CombatPanel.tsx` |
| FavorPane | Favor totals & rewards progress; hosts FavorListCtrl | display | `favor/FavorPanel.tsx` |
| NotesPane | Free-text build notes | display/edit | `notes/NotesPanel.tsx` |
| LogPane | App log / message output | display | ➖ no equivalent (dev log) |
| CustomDockablePane | Base docking-pane shell (background/erase) | ➖ N/A | ➖ (`layout/Layout.tsx` shell) |
| CustomTabbedPane | Tabbed container for grouped panes | ➖ N/A | ➖ (sidebar tabs) |

---

## Dialogs

| Dialog | Purpose | V3 |
|--------|---------|----|
| ForumExportDlg | Builds the BBCode/plain-text forum export of the whole build | `export/ForumExportPanel.tsx` |
| FeatSelectionDialog | Pick a feat for a feat slot (icon grid, left=train/right=info) | feat picker in `builder/FeatSlots.tsx` |
| SelectionSelectDialog | Pick an enhancement/destiny "selector" sub-choice | tree selection in `enhancements/EnhancementTreePanel.tsx` |
| EnhancementTreeDialog | Spend points in a single class enhancement tree | `enhancements/TreeGrid.tsx` |
| DestinyTreeDialog | Spend points in a single epic destiny tree | `epicdestinies/EpicDestiniesPanel.tsx` |
| InventoryDialog | Manage equipped gear set across all slots | `items/GearPanel.tsx` |
| ItemSelectDialog | Choose an item for one gear slot | item picker in `items/GearPanel.tsx` |
| FindGearDialog | Search/filter items to find gear by effect | search UI in `items/GearPanel.tsx` |
| GearSetNameDialog | Name/rename a saved gear set | inline rename in `items/GearPanel.tsx` |
| CItemImageDialog | View/pick an item's icon image | ➖ no equivalent |
| CWeaponImageDialog | View/pick a weapon's icon image | ➖ no equivalent |
| AttackChainNameDialog | Name a DPS attack chain | inline in `combat/CombatPanel.tsx` |
| WikiLinkDlg | Open/show the DDO wiki link for an item/feat | external link in UI ➖ |
| AboutDlg | About box (version) | ➖ no equivalent |
| DDODialog | Base dialog class (shared init / NewDocument msg) | ➖ N/A |

---

## Custom controls & app shell

| File | Purpose | V3 |
|------|---------|----|
| DDOBuilder.cpp | `CDDOBuilderApp` app entry: InitInstance, LoadData, theApp | `webapp/src/main.tsx`/`App.tsx` (app bootstrap) |
| DDOBuilderDoc.cpp | `CDDOBuilderDoc`: owns the `Character`, serialize/open/save | build store / persistence ➖ |
| DDOBuilderView.cpp | Main document view scaffold | `layout/Layout.tsx` ➖ |
| DDOFormView.cpp | Base form-view for panes (scroll/erase/new-doc plumbing) | ➖ N/A |
| MainFrm.cpp | `CMainFrame`: creates/docks/persists all panes, menus, toolbars | `layout/Layout.tsx` + `layout/Sidebar.tsx` ➖ |
| stdafx.cpp | Precompiled header | ➖ N/A |
| FeatsClassControl.cpp | Per-level class+feat grid; computes available feat slots via `TrainableFeatTypeAtLevel`, launches FeatSelectionDialog | `builder/FeatSlots.tsx` (logic — see callout) |
| SkillSpendControl.cpp | Per-level skill-point spend grid (allocate/validate points) | `builder/Skills.tsx` (logic) |
| SpellsControl.cpp | Known/prepared spell slot grid renderer | `builder/SpellsPanel.tsx` ➖ |
| SLAControl.cpp | Spell-like-abilities list renderer | folded into spells ➖ |
| AutomaticFeatListControl.cpp | List renderer for auto-granted feats | `builder/AutomaticFeats.tsx` ➖ |
| GrantedFeatListControl.cpp | List renderer for granted feats | ➖ N/A |
| FavorListCtrl.cpp | Favor-by-patron list renderer | `favor/FavorPanel.tsx` ➖ |
| FavorProgressBar.cpp | Favor-reward progress bar | ➖ N/A |
| TreeListCtrl.cpp | Generic tree+columns control (breakdowns tree) | ➖ N/A (React tree) |
| TreeListHeaderCtrl.cpp | Header for TreeListCtrl | ➖ N/A |
| SortHeaderCtrl.cpp | Sortable list header | ➖ N/A |
| OutlookControl.cpp | Outlook-style collapsible group bar | ➖ N/A (sidebar) |
| InfoTip.cpp / InfoTipItem.cpp | Rich hover tooltips (icon + formatted text) | React tooltip/`common` ➖ |
| ComboBoxTooltip.cpp | Combo box with per-item tooltips | ➖ N/A |
| CDDOVisualManager.cpp | App skin / visual theme manager | CSS theme ➖ |
| Selector.cpp/.h | **Data model** (not a widget): maps a selection name → icon | enhancement/selection model ➖ |
| EnableBuddyButton.cpp | Button that enables/disables a buddy control | ➖ N/A |
| EnhancementSelectionButton.cpp | Owner-drawn button for an enhancement choice | ➖ N/A |
| SetBonusButton.cpp | Owner-drawn set-bonus button | `setbonuses/SetBonusesPanel.tsx` ➖ |
| StanceButton.cpp | Owner-drawn stance toggle button | `stances/StancesPanel.tsx` ➖ |
| DCButton.cpp | Owner-drawn DC display button | `dc/DCPanel.tsx` ➖ |
| IconButton.cpp | Generic icon button | ➖ N/A |
| CMFCButtonEx.cpp / MFCButtonMMRelay.cpp | MFC button subclasses (theming/message relay) | ➖ N/A |
| MFCCheckBox.cpp / MFCStaticEx.cpp | Themed checkbox / static text | ➖ N/A |
| DelayedListBox.cpp | List box with deferred/lazy population | ➖ N/A |

---

## UI files that hold real logic

These UI files are NOT just rendering — they embed game logic that V3 must reproduce:

- **ForumExportDlg.cpp** — Generates the entire forum-post text from the build. Entry
  `PopulateExport()` (`ForumExportDlg.cpp:192`) walks every section via the `Add*` methods
  (e.g. `AddConsolidatedFeats` `:736`, `AddSkills` `:890`, `AddEnhancements` `:1217`,
  `ExportGear` `:1771`), then `ConvertToPlainText()` (`:2154`) strips BBCode. → `export/ForumExportPanel.tsx`.
- **StancesPane.cpp** — Auto-activates weapon-type, race, and Greensteel "Dominance" stances
  and enforces incompatible-stance deactivation. Dynamic auto stances built at
  `StancesPane.cpp:294` (weapons), `:329` (races), `:356` (Greensteel); incompatible handling
  in `UpdateStanceActivated` `StancesPane.cpp:481`; Greensteel dominance toggling at `:1093`+.
  → `stances/StancesPanel.tsx`.
- **FeatsClassControl.cpp** — Computes which feat slots are available per level
  (`TrainableFeatTypeAtLevel`, populated into `m_availableFeats` at `FeatsClassControl.cpp:222`)
  and drives feat training via FeatSelectionDialog. → `builder/FeatSlots.tsx`.
- **FeatSelectionDialog.cpp / SelectionSelectDialog.cpp** — Drive the actual feat /
  enhancement-selection picking (allowed-choice filtering, left-click trains, right-click info).
  → feat picker in `builder/FeatSlots.tsx`, selection in `enhancements/EnhancementTreePanel.tsx`.
- **SkillSpendControl.cpp** — Skill-point spend grid: allocates and validates skill points
  per level. → `builder/Skills.tsx`.
- **DPSPane.cpp** — Attack-chain CRUD and per-chain DPS score display (chain definition lives
  here; the DPS math itself is in the compute layer). → `combat/CombatPanel.tsx`.

---

## Cross-references

- Stance activation / incompatible stances and the underlying `Build::ActivateStance` /
  `DeactivateStance` → see the **Build / Character** computational section.
- Feat-slot availability (`TrainableFeatTypeAtLevel`) and feat training → **Feats** section.
- Skill-point spend rules → **Skills** section.
- Breakdown tree / BonusesPane / DCPane data → **Effects & Breakdowns** computational section.
- Forum export reuses every computed value → all compute sections (it is a read-only view).
- Gear dialogs → **Items / Gear** section (Item model holds the logic, dialogs are pickers).
