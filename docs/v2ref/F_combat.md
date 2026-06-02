# F. Combat / DPS System

This section documents how V2 DDOBuilder models melee/ranged combat and DPS, and
how much of it the V3 webapp ports.

**Overview / V2 vs V3 contrast.** V2 was *designed* as a full attack-chain
simulator: a `Build` owns named `AttackChain`s (ordered lists of `Attack`
actions — Basic Attack, cleaves, etc.), each `Attack` has an `ExecutionTime`,
`Cooldown` and `AttackBonus`/`FollowOn` sub-effects, and `CDPSPane`
(`DPSPane.cpp`) walks the chain over a timeline, applying timed `AttackBuff`s and
calling per-style evaluators (`EvaluateTWF/THF/SWF/Ranged/Handwraps/SwordAndBoard`).
**Critically, that simulator is unfinished in V2:** all six per-style evaluators
are stubs returning `0.0` (`DPSPane.cpp:990-1060`), and `AttackEntry::Initialise`
only reads a partial subset of breakdown values, with most weapon-dice/offhand
fields commented out (`AttackEntry.cpp:44-81`). The real, *working* combat math in
V2 lives in the **weapon breakdown items** (the `BreakdownItemWeapon*` family),
which compute to-hit and per-swing damage as observer-driven effect sums.

V3 deliberately does **not** port the chain simulator. Instead
`webapp/src/lib/combat/attackEntry.ts` is a documented **single-weapon DPR
estimator**: one pure function consumes the build stats map plus weapon info and
produces hit chance, crit chance, per-hit/crit damage, main/offhand DPR and an
estimated DPS. It folds in the genuinely-working V2 breakdown formulas (to-hit
pipeline, damage pipeline, crit range/multiplier, doublestrike, offhand,
helpless, strikethrough, PRR/fortification) but as closed-form expected-value
math rather than a timestep simulation.

## File index

| File | Role | V3 counterpart |
|------|------|----------------|
| `Attack.cpp` / `Attack.h` | XML model of one attack action (name, icon, cooldown, execution time, `ThisAttack`/`FollowOn` AttackBonus) + stack counter | `build.attackChains` entries (strings only); no per-attack timing in V3 |
| `AttackBonus.cpp` | Trivial XML wrapper element used by `Attack` for its attack/damage sub-bonuses | not ported (chain sim not ported) |
| `AttackBuff.cpp` | Timed combat buff (`BuffType`, value, startTime, duration) with `Expired()` | not ported |
| `AttackChain.cpp` / `AttackChain.h` | Ordered named list of attack-action names; add/remove/reorder | `AttackChainsEditor` in `CombatPanel.tsx:183-230`; `build.attackChains` map |
| `AttackEntry.cpp` | Snapshots breakdown values feeding a chain swing (partial — many fields stubbed) | `buildAttackEntry()` in `attackEntry.ts` (reimplemented as closed form) |
| `BreakdownItemWeaponAttackBonus.cpp` | **To-hit pipeline** (working) | `attackEntry.ts:113-135` + `useBuildStats.ts:1393-1407` |
| `BreakdownItemWeaponDamageBonus.cpp` | **Damage pipeline** (working) | `attackEntry.ts:107-111,163-164` |
| `BreakdownItemWeaponCriticalThreatRange.cpp` | Keen / Improved Critical threat-range doubling | `attackEntry.ts:138-140` (partial) |
| `BreakdownItemWeaponCriticalMultiplier.cpp` | Crit multiplier (standard + 19-20 variant) | `attackEntry.ts:141` |
| `BreakdownItemOffhandDoublestrike.cpp` | Offhand doublestrike = 50% (65% w/ PTWF) of mainhand | `attackEntry.ts:160-162` (simplified) |
| `BreakdownItemWeapon.cpp` | Holder of one weapon's dice + sub-breakdowns | Section A; `WeaponInfo`/`weaponInfoFromItem` |
| `BreakdownItemWeaponEffects.cpp` | Routes weapon effects to per-hand breakdowns | Section A |
| `DPSPane.cpp` | Chain-DPS UI + timeline driver (evaluators stubbed) | `CombatPanel.tsx` (estimator UI, no timeline) |

---

## Attack.cpp / Attack.h

**Role.** XML wrapper for a single attack action. Properties (`Attack.h:30-37`):
`Name`, `Description`, `Icon`, optional `Cooldown` (vector of doubles),
`ExecutionTime` (default 0.0), and two optional `AttackBonus` sub-objects
`ThisAttack` and `FollowOn`. Also carries a runtime `m_stacks` counter
(`Stacks/AddStack/RevokeStack`, `Attack.cpp:76-89`).

**Pipeline.** No combat math here — it is pure data. `SetCooldown` is guarded so
only `"Basic Attack"` may have its cooldown set (`Attack.cpp:91-106`); other
attacks log an error. `ExecutionTime()` is what `DPSPane` advances the timeline
by per chain step (`DPSPane.cpp:960`), defaulting to the Basic Attack time when
zero (`DPSPane.cpp:617`).

**V3 counterpart.** None of the timing/cooldown/follow-on model is ported. V3
keeps only the *names* of attacks in `build.attackChains`.

**Ported? / gaps.** Not ported. Cooldown, execution time, ThisAttack/FollowOn
bonuses, and stack tracking are all absent in V3.

## AttackBonus.cpp

**Role.** A near-empty `SaxContentElement` subclass (`AttackBonus.cpp:17-48`)
used as the type of `Attack`'s `ThisAttack`/`FollowOn` members. Holds whatever
attack/damage modifiers an attack action applies.

**V3 counterpart / gaps.** Not ported — only relevant to the unported chain sim.

## AttackBuff.cpp

**Role.** A timed combat buff: `m_eType` (BuffType), `m_value`, `m_startTime`,
`m_duration` (`AttackBuff.cpp:6-12`). `Expired(timePoint)` returns true once
`startTime + duration < timePoint` (`AttackBuff.cpp:18-22`). `DPSPane` maintains
a `std::list<AttackBuff>` and prunes expired entries each step via
`DropTimedOutBuffs` (`DPSPane.cpp:1062-1077`).

**V3 counterpart / gaps.** Not ported. V3 has no notion of time-windowed combat
buffs; all bonuses are treated as always-on in the stats map.

## AttackChain.cpp / AttackChain.h

**Role.** Ordered, named list of attack-action names (`Name` + `Attacks` string
list, `AttackChain.h:27-29`). `AddAttack(name, insertLoc)` /
`RemoveAttackAt(loc)` use `std::advance` on the list iterator to insert/erase at
a position (`AttackChain.cpp:62-81`). A build owns multiple chains and an
"active" one (`pBuild->GetActiveAttackChain()`, used at `DPSPane.cpp:951`).

**Pipeline.** No math. It is the script the (stubbed) simulator would have
walked: `for (acit : ac.Attacks()) { EvaluateAttack(...); timePoint += ExecutionTime }`
(`DPSPane.cpp:953-963`).

**V3 counterpart.** `AttackChainsEditor` (`CombatPanel.tsx:183-230`) renders
`build.attackChains` as comma-separated editable name lists, dispatching
`SET_ATTACK_CHAIN` / `DELETE_ATTACK_CHAIN`. This is data-parity only — the chains
are not consumed by the DPR estimator.

**Ported? / gaps.** The data model and editor are ported; the *use* of chains for
DPS is not (V3 estimates a single repeated swing, not a chain).

## AttackEntry.cpp / AttackEntry.h

**Role.** "Tracks the damage setup for a given attack in the AttackChain… not
saved, generated on the fly" (`AttackEntry.h:1-4`). `Initialise()` snapshots
current breakdown `Total()`s into member fields via `GetBreakdownValue(type)`
(`AttackEntry.cpp:83-88`, which is just `FindBreakdown(type)->Total()`).

**Fields actually gathered** (`AttackEntry.cpp:44-81`):
melee — `Breakdown_MeleePower`, `Breakdown_DoubleStrike`,
`Breakdown_DamageAbilityMultiplier`, `Breakdown_HelplessDamage`; ranged —
`Breakdown_RangedPower`, `Breakdown_DoubleShot`; THF — `Breakdown_Strikethrough`;
TWF offhand — `Breakdown_DoublestrikeOffhand`,
`Breakdown_DamageAbilityMultiplierOffhand`. **Everything else is commented out**:
weapon dice, weapon W, damage/crit bonuses, crit range/multiplier, vorpal,
alacrity, missiles-per-shot, offhand attack chance, offhand dice/bonuses
(`AttackEntry.cpp:56-80`, header fields `AttackEntry.h:22-53`). So even the data
layer for the chain sim was never finished.

**V3 counterpart.** `buildAttackEntry()` in `attackEntry.ts` is the spiritual
port. Its header comment cites `AttackEntry.cpp:44-81` and reads the same
concepts from `stats.total(...)`: `melee.power`, `melee.doublestrike`,
`melee.damageAbilityMult`, `helpless`, `melee.strikethrough`, `offhand.attack`,
`offhand.doublestrike` (`attackEntry.ts:93-105`). Unlike V2 it *also* implements
weapon dice (`avgDie`, `attackEntry.ts:55-57,108`), damage, crit and offhand math
that V2 left stubbed.

**Ported? / gaps.** Field-gathering concept ported and *extended*. V3 has no
ranged-specific path (no `ranged.power`/doubleshot consumption in the estimator),
no missiles-per-shot, no vorpal, no weapon alacrity.

## BreakdownItemWeaponAttackBonus.cpp — To-hit pipeline (WORKING)

**Role.** Computes a weapon's attack bonus as a sum of `Effect`s built in
`CreateOtherEffects()` (`:48-218`). Two modes: normal to-hit
(`!m_bCriticalEffects`) and crit-confirm bonus.

**Formula (normal mode), in order added:**
1. **Base Attack Bonus** from `Breakdown_BAB` if `> 0` (`:57-69`).
2. **Non-proficiency penalty −4** if `!IsWeaponInGroup("Proficiency", weapon)`
   (`:71-80`).
3. **Negative levels −1 each**: `-1.0 * negLevels` from
   `Breakdown_NegativeLevels` (`:83-97`).
4. **Armor check penalty**: `-max(0, ACP.Total())` — ACP can never be a bonus
   (`:103-115`).
5. **Weapon enchantment**: the per-hand `Breakdown_WeaponEnchantment` from the
   `BreakdownItemWeaponEffects` holder (`:118-137`).
6. **Ability bonus**: `LargestStatBonus()` picks the best allowed stat (Str by
   default, plus any granted by `Effect_Weapon_AttackAbility`/`…Class`), then
   `BaseStatToBonus(stat.Total())` (`:139-159`).
7. **TWF attack penalty** (only when stance "Two Weapon Fighting" active,
   `:161-191`): `-4` main/off if `Two Weapon Fighting` feat trained, else `-6`
   main / `-10` off (`m_bOffhandWeapon ? -10 : -6`); **+2** if the off-hand
   weapon is in group `"Light"` *or* `Oversized Two Weapon Fighting` is trained.

In crit mode it instead adds the weapon's standard `Breakdown_WeaponAttackBonus`
(`:193-216`). The breakdown re-runs `CreateOtherEffects` on class change, feat
train/revoke of TWF/OTWF, and any observed stat/effect change (`:307-552`).

**V3 counterpart.** `attackEntry.ts:113-135` plus `useBuildStats.ts:1393-1407`.
`rawAttackBonus = bab + meleeToHit + abilityMod + nonProfPenalty`
(`attackEntry.ts:118`), where `meleeToHit = melee.toHit + melee.attack`
(`:101`). The −1/neg-level and clamped-ACP penalties are added to `melee.attack`
in `useBuildStats.ts:1398-1407` (explicitly citing `BreakdownItemWeaponAttackBonus.cpp:82-115`).
Non-proficiency `−4` is `opts.nonProficient ? -4 : 0` (`:117`). The full TWF block
is `attackEntry.ts:123-135`: `-4`/`-6` main, `-4`/`-10` off, `+2` for light/OTWF
— matching V2 line-for-line. Weapon enchantment to-hit is folded into the
`melee.toHit`/`melee.attack` aggregate via Section A/B effect handling.

**Ported? / gaps.** To-hit pipeline is ported faithfully (BAB, ability, weapon
enchant, −4 non-prof, TWF −4/−6/−10 +2, ACP, neg-levels). Gap: V2's
`LargestStatBonus()` multi-stat selection and weapon-specific
`Effect_Weapon_AttackAbility` grants are simplified in V3 to a single
Str/Dex `attackModifier` (`useBuildStats.ts:1038-1043`).

## BreakdownItemWeaponDamageBonus.cpp — Damage pipeline (WORKING)

**Role.** Computes per-swing flat damage bonus. `CreateOtherEffects()` (`:44-144`).

**Formula (normal mode):**
1. **Ability × DamageAbilityMultiplier**: `LargestStatBonus()` →
   `bonus = BaseStatToBonus(stat.Total())`, then multiply by the multiplier from
   `Breakdown_DamageAbilityMultiplier` (mainhand) or
   `Breakdown_DamageAbilityMultiplierOffhand` (offhand) — `:54-71`. Final value is
   `(int)(bonus * multiplier)`, labelled e.g. "150% of Ability bonus (Strength)"
   (`:76-95`). The multiplier itself (1.5 THF, 0.5 offhand TWF, 1.0 one-hand,
   etc.) is supplied by the universal **"Attack" feat** via
   `Breakdown_DamageAbilityMultiplier[Offhand]` (the same Attack feat that sets
   base helpless/strikethrough — see V3 note below).
2. **Weapon enchantment**: per-hand `Breakdown_WeaponEnchantment` (`:98-117`).

Crit mode adds the standard `Breakdown_WeaponDamageBonus` base instead
(`:119-142`). Re-evaluated on the same observer hooks as the attack-bonus class.

**V3 counterpart.** `attackEntry.ts:107-111` for main hand:
`baseDamage = weaponDie + meleeDamage + abilityMod * damageAbilMult`, where
`damageAbilMult = stats.total('melee.damageAbilityMult') || 1` (`:96`) and
`meleeDamage = stats.total('melee.damage')` (`:102`, the Str mod added in
`useBuildStats.ts:1042` + weapon enchant via Section A). Off-hand uses
`abilityMod * (damageAbilMult / 2)` (`attackEntry.ts:164`) — V3 hard-halves the
multiplier for the off hand rather than reading a separate
`DamageAbilityMultiplierOffhand` breakdown. Melee Power scales the result:
`hitDmgRaw = (baseDamage + sneakBonus) * (1 + meleePower/100)` (`:93-111`).

**Ported? / gaps.** Ability×multiplier + weapon enchant + weapon dice all ported.
Gaps: separate offhand multiplier breakdown collapsed to `/2`; crit-specific
*damage bonus* breakdown (extra damage that only applies on crits) is not
modelled — V3 crit damage is just `baseDamage * critMult` (`:143`).

## BreakdownItemWeaponCriticalThreatRange.cpp

**Role.** Threat range. `Value()` formats it as `(21 - total)-20`
(`:29-42`). Keen / Improved Critical (`Effect_Weapon_Keen` /
`Effect_Weapon_KeenDamageType`) each add **one stacking copy** of the weapon's
base critical range (`WeaponBaseCriticalRange(Weapon())`), and they do **not**
stack with each other (same `"Keen"` bonus type, `:131-211`). Counts guard
against double-applying (`m_keenCount`, `m_improvedCriticalCount`).

**V3 counterpart.** `attackEntry.ts:138-140`:
`threatFaces = max(1, weapon.critThreatRange + baseCrit)` where
`baseCrit = stats.total('melee.crit.range')`. `weapon.critThreatRange` is a face
count (`WeaponInfo.critThreatRange`, `useBuildStats.ts:59`); CombatPanel displays
`21 - critThreatRange`-20 (`CombatPanel.tsx:136`).

**Ported? / gaps.** Base range + additive feat range ported. Gap: the Keen-vs-
Improved-Critical *non-stacking* / base-range-doubling rule is not modelled — V3
treats `melee.crit.range` as a simple additive of threat faces.

## BreakdownItemWeaponCriticalMultiplier.cpp

**Role.** Two breakdowns: `Breakdown_WeaponCriticalMultiplier` (standard) and
`Breakdown_WeaponCriticalMultiplier19To20`. The 19-20 variant seeds itself with
the standard multiplier as its "Base" (`:52-66`) so 19-20 multiplier effects
stack on top. `Value()` is the integer multiplier (`:40-45`).

**V3 counterpart.** `attackEntry.ts:141`:
`critMult = weapon.critMultiplier + baseCritMult`
(`baseCritMult = stats.total('melee.crit.multiplier')`).

**Ported? / gaps.** Standard multiplier + additive bonus ported. Gap: the
*separate 19-20 multiplier* (DDO weapons that crit harder on 19-20 than on
lower threat faces, e.g. falchion/greataxe) is collapsed to a single multiplier
in V3.

## BreakdownItemOffhandDoublestrike.cpp

**Role.** Offhand doublestrike derived from mainhand. If
`Perfect Two Weapon Fighting` trained: `mainhand * 0.65`; else `mainhand / 2`
(`:50-77`). Observes `Breakdown_DoubleStrike` and recomputes on PTWF
train/revoke (`:86-119`).

**V3 counterpart.** `attackEntry.ts:160-162`: off-hand swing chance =
`min(1, TWF_OFFHAND_CHANCE[tier] + offhand.attack + offhand.doublestrike)` with
`TWF_OFFHAND_CHANCE = [0, .20, .40, .60, .80, 1.00]` keyed by TWF feat tier
(`:53`).

**Ported? / gaps.** Concept ported but **mechanic differs**: V2 derives offhand
doublestrike as a fraction of *mainhand* doublestrike (50% / 65% PTWF); V3 uses a
fixed per-tier offhand *attack* chance table (TWF=20% … Perfect=100%) and treats
`offhand.doublestrike` as a flat additive on top. The PTWF 65%-of-mainhand rule
is not reproduced.

## BreakdownItemWeapon.cpp / BreakdownItemWeaponEffects.cpp (cross-ref → A)

**Role.** `BreakdownItemWeapon` is the per-hand holder: stores the weapon's
`BasicDice` and owns the damage/crit-damage/multiplier sub-breakdowns
(`BreakdownItemWeapon.cpp:17-115`); weapon dice are shown as text, not a
breakdown (`:103-104`). `BreakdownItemWeaponEffects` is the routing holder
(`Breakdown_WeaponEffectHolder`) whose `GetWeaponBreakdown(bMainhand, type)` the
attack/damage classes call to fetch the right per-hand sub-breakdown
(used at `BreakdownItemWeaponAttackBonus.cpp:118-137`,
`BreakdownItemWeaponDamageBonus.cpp:99-117`).

**Do not re-document fully — owned by Section A (breakdowns).** V3: weapon dice
and crit fields are captured by `WeaponInfo` / `weaponInfoFromItem`
(`useBuildStats.ts:54-63,571-584`); effect routing to per-hand keys is Section
B's effect engine.

## DPSPane.cpp

**Role (high level).** The combat tab UI: lists attack actions discovered from
items that grant an `"Attack"` (`:242`), defaults the chain to a single
`"Basic Attack"` (`:503-505`), computes the Basic Attack cooldown from style +
BAB (`:673-695`), and edits the active `AttackChain` (`:900-908`). The DPS driver
`CalculateAttackChainDPS()` (`:911-968`) selects an `AttackType` from the active
stance (TWF/THF/SWF/Ranged/Unarmed/SwordAndBoard, `:926-949`), then for each
attack in the chain calls `EvaluateAttack` and advances `timePoint` by
`ExecutionTime`.

**Key finding.** `EvaluateAttack` dispatches to six per-style evaluators
(`:970-988`) — **all of which are empty stubs returning `0.0`**
(`EvaluateTWF/THF/SWF/Ranged/Handwraps/SwordAndBoard`, `:990-1060`). So in V2 the
chain-DPS feature never produced real numbers; the functional combat math is
entirely in the weapon breakdown items.

**V3 counterpart.** `CombatPanel.tsx`. It does *not* port the timeline or the
attack-discovery/cooldown machinery. It derives a single combat style via
`pickCombatStyleName` (`attackRate.ts:40-51`), looks up attacks/round from
`AttackRates.xml` via `lookupAttacksPerMinute` (`attackRate.ts:14-34`,
APM÷10 → attacks/round, `CombatPanel.tsx:102-104`), and calls the closed-form
`buildAttackEntry` once, displaying hit/crit chance, hit/crit damage, main/off
DPR, total DPR and estimated DPS (`CombatPanel.tsx:155-168`). Foe AC/PRR/Fort and
Helpless are user inputs (`:44-47, 140-152`).

---

## Parity gaps (combat mechanics missing or simplified in V3)

- **Attack-chain timeline simulator: not ported** (and was stubbed in V2 anyway —
  `DPSPane.cpp:990-1060`). V3 estimates one repeated swing, not an ordered chain
  with per-attack execution times, cooldowns, or `FollowOn` bonuses.
- **Timed combat buffs (`AttackBuff`): not ported.** All bonuses are always-on.
- **Attack rate / animation:** V3 reads `AttackRates.xml` for attacks-per-round
  but the V2 per-style cooldown formula and BAB-keyed breakpoints
  (`DPSPane.cpp:673-695`) are reduced to a backward-scan lookup
  (`attackRate.ts:24-31`).
- **Offhand doublestrike model differs:** V2 = 50%/65%(PTWF) of mainhand
  doublestrike (`BreakdownItemOffhandDoublestrike.cpp:58-69`); V3 = fixed per-TWF-
  tier offhand chance table + flat additive (`attackEntry.ts:53,160-162`).
- **Crit detail loss:** no separate 19-20 critical multiplier
  (`BreakdownItemWeaponCriticalMultiplier.cpp` 19-20 variant), no crit-only
  *damage bonus* breakdown, and Keen/Improved-Critical non-stacking base-range
  doubling (`BreakdownItemWeaponCriticalThreatRange.cpp:131-211`) is reduced to a
  plain additive threat-face count.
- **Offhand damage multiplier** uses hard `/2` (`attackEntry.ts:164`) instead of
  V2's dedicated `DamageAbilityMultiplierOffhand` breakdown.
- **Multi-stat attack/damage stat selection** (`LargestStatBonus()` +
  `Effect_Weapon_AttackAbility`/`DamageAbility` grants) collapsed to a single
  Str/Dex `attackModifier` (`useBuildStats.ts:1038-1043`).
- **Ranged path** (`Breakdown_RangedPower`, doubleshot, missiles-per-shot) is
  gathered in V2's `AttackEntry` but not consumed by V3's melee-oriented
  estimator.
- **Fortification approximation:** V3 mitigates only the crit portion of damage
  proportionally (`attackEntry.ts:170-176`), a heuristic, not DDO's exact
  fortification-vs-crit-chance roll.
- **Helpless / Strikethrough base values** are V3 additions (the universal
  "Attack" feat's `+50%` helpless damage and `+20%` strikethrough are hard-seeded
  in `useBuildStats.ts:1139-1144`), matching V2's `Breakdown_HelplessDamage` /
  `Breakdown_Strikethrough` intent; strikethrough applies only to two-handed in
  V3 (`attackEntry.ts:152`).

## Cross-references

- **Weapon breakdown items** (`BreakdownItemWeapon.cpp`,
  `BreakdownItemWeaponEffects.cpp`, and the per-hand damage/dice plumbing) →
  fully documented in **Section A (Breakdowns)**.
- **Effect routing / `AType` matching** that decides which weapon effects feed
  the attack/damage breakdowns (`Effect_Weapon_Attack`, `Effect_Weapon_Damage`,
  `Effect_Weapon_Keen`, `Effect_Weapon_AttackAbility`, the
  `…Class`/`…DamageType` family seen in `AffectsUs()`
  (`BreakdownItemWeaponAttackBonus.cpp:220-280`,
  `BreakdownItemWeaponDamageBonus.cpp:146-204`)) → **Section B (Effect /
  Requirement engine)**.
