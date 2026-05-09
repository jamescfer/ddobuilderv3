import { useEffect, useState } from 'react'
import { api } from '../../api'
import { useCharacter } from '../../context/CharacterContext'
import type { CharacterBuild, DDOClass, Feat, Race, Requirement, RequiresOneOf } from '../../types/ddo'
import {
  abilityAtLevel,
  buildSnapshotAtCharacterLevel,
  characterLevelForClassLevel,
  classLevelsAtLevel,
  getLevelClasses,
  tomeCapAtLevel,
} from '../../lib/levelProgression'
import DdoIcon from '../DdoIcon'
import styles from './FeatSlots.module.css'

interface SlotEntry {
  key: string
  /**
   * Display & ordering level. For race/class/epic/legendary slots this is the
   * resolved character level (V2 parity); for the universal heroic slots it is
   * the character level the slot is awarded at.
   */
  level: number
  /**
   * V2 parity: the *class-internal* level at which the slot is granted (e.g.
   * Fighter Bonus Feat at class level 4). For race/universal slots this
   * equals `level`; for class slots it differs from `level` if the class is
   * not taken at every character level.
   */
  classLevel: number
  featType: string
  className: string
  featUpdateList?: string[]   // whitelist from class XML FeatUpdateList
}

// V2 behavior: feats with <Group>X</Group> can be trained in slots whose
// FeatType is X. The "Heroic" universal slot is treated as type "Standard".
// "Epic Feat" slots additionally allow Standard-group feats (heroic feats
// can be re-taken as Epic feats).
function slotMatchesFeat(slotType: string, featGroups: string[]): boolean {
  const matchType = slotType === 'Heroic' ? 'Standard' : slotType
  if (featGroups.includes(matchType)) return true
  if (matchType === 'Epic Feat' && featGroups.includes('Standard')) return true
  return false
}

function toArray<T>(v: T | T[] | undefined): T[] {
  if (v == null) return []
  return Array.isArray(v) ? v : [v]
}

function buildSlots(
  build: CharacterBuild,
  allClasses: DDOClass[],
  allRaces: Race[],
): SlotEntry[] {
  const slots: SlotEntry[] = []
  const epicLevels = build.epicLevels ?? 0
  const legendaryLevels = build.legendaryLevels ?? 0

  // 1. Race feat slots (e.g. Human Bonus Feat at char level 1)
  const race = allRaces.find(r => r.Name === build.race)
  toArray(race?.FeatSlot).forEach((fs, idx) => {
    const featUpdateList = fs.FeatUpdateList
      ? toArray(fs.FeatUpdateList).filter(Boolean)
      : undefined
    slots.push({
      key: `race-${fs.Level}-${fs.FeatType}-${idx}`,
      level: fs.Level,
      classLevel: fs.Level,
      featType: fs.FeatType,
      className: build.race,
      featUpdateList: featUpdateList?.length ? featUpdateList : undefined,
    })
  })

  // 2. Universal standard feats (heroic levels 1, 3, 6, 9, 12, 15, 18)
  const universalLevels = [1, 3, 6, 9, 12, 15, 18]
  universalLevels.forEach(lvl => {
    slots.push({ key: `heroic-${lvl}`, level: lvl, classLevel: lvl, featType: 'Heroic', className: 'Universal' })
  })

  // 3. Class-specific heroic feat slots — position at the *character level*
  //    where the Nth level of that class is taken (V2 parity).
  for (const bc of build.classes) {
    if (!bc.name || bc.levels === 0) continue
    const cls = allClasses.find(c => c.Name === bc.name)
    if (!cls?.FeatSlot) continue
    toArray(cls.FeatSlot).forEach((fs, idx) => {
      if (fs.Level > bc.levels) return
      const charLevel = characterLevelForClassLevel(build, bc.name, fs.Level)
      if (!charLevel) return
      const featUpdateList = fs.FeatUpdateList
        ? toArray(fs.FeatUpdateList).filter(Boolean)
        : undefined
      slots.push({
        key: `${bc.name}-${fs.Level}-${fs.FeatType}-${idx}`,
        level: charLevel,
        classLevel: fs.Level,
        featType: fs.FeatType,
        className: bc.name,
        featUpdateList: featUpdateList?.length ? featUpdateList : undefined,
      })
    })
  }

  // 4. Epic feat slots — Epic.class.xml; epic class level N → character level 20+N
  if (epicLevels > 0) {
    const epicClass = allClasses.find(c => c.Name === 'Epic')
    toArray(epicClass?.FeatSlot).forEach((fs, idx) => {
      if (fs.Level <= epicLevels) {
        const featUpdateList = fs.FeatUpdateList
          ? toArray(fs.FeatUpdateList).filter(Boolean)
          : undefined
        slots.push({
          key: `epic-${fs.Level}-${fs.FeatType}-${idx}`,
          level: 20 + fs.Level,
          classLevel: fs.Level,
          featType: fs.FeatType,
          className: 'Epic',
          featUpdateList: featUpdateList?.length ? featUpdateList : undefined,
        })
      }
    })
  }

  // 5. Legendary feat slots — Legendary.class.xml; legendary class level N → character level 30+N
  if (legendaryLevels > 0) {
    const legendaryClass = allClasses.find(c => c.Name === 'Legendary')
    toArray(legendaryClass?.FeatSlot).forEach((fs, idx) => {
      if (fs.Level <= legendaryLevels) {
        const featUpdateList = fs.FeatUpdateList
          ? toArray(fs.FeatUpdateList).filter(Boolean)
          : undefined
        slots.push({
          key: `legendary-${fs.Level}-${fs.FeatType}-${idx}`,
          level: 30 + fs.Level,
          classLevel: fs.Level,
          featType: fs.FeatType,
          className: 'Legendary',
          featUpdateList: featUpdateList?.length ? featUpdateList : undefined,
        })
      }
    })
  }

  slots.sort((a, b) => a.level - b.level || a.className.localeCompare(b.className))
  return slots
}

// ---------------------------------------------------------------------------
// BAB helpers — parse class BAB array (e.g. "0 1 2 3 ... 20")
// ---------------------------------------------------------------------------
function classBABAtLevel(cls: DDOClass | undefined, levels: number): number {
  if (!cls?.BAB) return Math.floor(levels * 0.75)
  const arr = String(cls.BAB).trim().split(/\s+/).map(Number)
  // BAB array is 0-indexed from level 0: arr[0]=0, arr[1]=1, etc.
  return arr[levels] ?? arr[arr.length - 1] ?? Math.floor(levels * 0.75)
}

function totalBAB(build: CharacterBuild, allClasses: DDOClass[]): number {
  // V2 parity: BAB sums each class's contribution based on the levels the
  // character actually has in that class (counted from the per-level array,
  // which the snapshot truncates for "BAB at level N" queries).
  const lc = getLevelClasses(build)
  const counts: Record<string, number> = {}
  for (const c of lc) if (c) counts[c] = (counts[c] ?? 0) + 1
  let sum = 0
  for (const [name, levels] of Object.entries(counts)) {
    const cls = allClasses.find(c => c.Name === name)
    sum += classBABAtLevel(cls, levels)
  }
  return sum
}

// ---------------------------------------------------------------------------
// Prerequisite checking
// ---------------------------------------------------------------------------
function meetsSingleRequirement(req: Requirement, build: CharacterBuild, allClasses: DDOClass[], race?: Race): boolean {
  const item = Array.isArray(req.Item) ? req.Item[0] : req.Item ?? ''
  const value = req.Value ?? 0

  switch (req.Type) {
    case 'Ability': {
      // V2 parity: ability score at the snapshot's character level (counts
      // only level-up bonuses awarded by then, with the tome cap applied
      // and the racial modifier folded in).
      const charLvl = Math.max(1, build.totalLevel || 1)
      const tomeRaw = (build.abilityTomes ?? {})[item as keyof CharacterBuild['abilityTomes']] ?? 0
      const tome = Math.min(tomeRaw, tomeCapAtLevel(charLvl))
      const racial = race ? Number((race as unknown as Record<string, unknown>)[item] ?? 0) || 0 : 0
      const score = abilityAtLevel(build, item as 'Strength', charLvl, racial, tome)
      return score >= value
    }
    case 'BAB':
      return totalBAB(build, allClasses) >= value
    case 'Feat': {
      const chosen = Object.values(build.featChoices)
      return chosen.includes(item)
    }
    case 'Race':
      return build.race === item
    case 'Class':
      return build.classes.some(c => c.name === item && c.levels > 0)
    case 'ClassLevel': {
      const bc = build.classes.find(c => c.name === item)
      return (bc?.levels ?? 0) >= value
    }
    case 'ClassMinLevel': {
      // V2 ClassMinLevel checks any single class meets the level. The
      // `item` field encodes the class name (or empty / "Any" → any class).
      if (!item || item === 'Any') {
        return build.classes.some(c => c.levels >= value)
      }
      const bc = build.classes.find(c => c.name === item)
      return (bc?.levels ?? 0) >= value
    }
    case 'BaseClassMinLevel': {
      // Class with name == item, OR any class whose BaseClass == item
      return classLevelsAtLevel(build, item, build.totalLevel || 20, allClasses, true) >= value
    }
    case 'Level':
      return build.totalLevel >= value
    case 'SpecificLevel':
      // V2 Requirement::EvaluateSpecificLevel — character level meets the
      // exact level (1-based Value vs the snapshot's totalLevel).
      return build.totalLevel >= value
    case 'Stance':
      // V2 evaluates stances against active stance state. The snapshot
      // doesn't model stance toggling at training time, so accept it.
      return true
    case 'EnemyType':
      // V2 Requirement_EnemyType — runtime combat condition; treat as met
      // for prerequisite display.
      return true
    case 'Skill':
      // V2 Requirement_Skill — depends on per-level skill ranks which
      // aren't tracked per-level in V3. Surface as met to avoid false
      // negatives until the per-level skill model is in place.
      return true
    case 'StartingWorld':
      return true
    default:
      return true
  }
}

function meetsOneOfGroup(group: RequiresOneOf, build: CharacterBuild, allClasses: DDOClass[], race?: Race): boolean {
  const reqs = Array.isArray(group.Requirement) ? group.Requirement : [group.Requirement]
  return reqs.some(r => meetsSingleRequirement(r, build, allClasses, race))
}

function meetsRequirements(feat: Feat, build: CharacterBuild, allClasses: DDOClass[], race?: Race): boolean {
  const reqs = feat.Requirements
  if (!reqs) return true

  if (reqs.Requirement) {
    const list = Array.isArray(reqs.Requirement) ? reqs.Requirement : [reqs.Requirement]
    if (!list.every(r => meetsSingleRequirement(r, build, allClasses, race))) return false
  }

  if (reqs.RequiresOneOf) {
    const groups = Array.isArray(reqs.RequiresOneOf) ? reqs.RequiresOneOf : [reqs.RequiresOneOf]
    if (!groups.every(g => meetsOneOfGroup(g, build, allClasses, race))) return false
  }

  if (reqs.RequiresNoneOf) {
    const groups = Array.isArray(reqs.RequiresNoneOf) ? reqs.RequiresNoneOf : [reqs.RequiresNoneOf]
    if (groups.some(g => meetsOneOfGroup(g, build, allClasses, race))) return false
  }

  return true
}

// ---------------------------------------------------------------------------
// Prerequisite label formatting
// ---------------------------------------------------------------------------
function formatReq(req: Requirement): string {
  const item = Array.isArray(req.Item) ? req.Item[0] : req.Item ?? ''
  const val = req.Value ?? 0
  switch (req.Type) {
    case 'Ability': return `${item} ${val}+`
    case 'BAB': return `BAB ${val}+`
    case 'Feat': return item
    case 'Race': return `Race: ${item}`
    case 'Class': return `Class: ${item}`
    case 'ClassLevel': return `${item} ${val}+`
    case 'ClassMinLevel': return item ? `${item} ${val}+` : `Any class ${val}+`
    case 'BaseClassMinLevel': return `${item} ${val}+`
    case 'Level': return `Level ${val}+`
    case 'SpecificLevel': return `Level ${val}`
    case 'Skill': return `${item} ${val}+ ranks`
    case 'Stance': return `Stance: ${item}`
    default: return ''
  }
}

function formatPrerequisites(feat: Feat): string {
  const reqs = feat.Requirements
  if (!reqs) return ''
  const parts: string[] = []
  if (reqs.Requirement) {
    const list = Array.isArray(reqs.Requirement) ? reqs.Requirement : [reqs.Requirement]
    list.forEach(r => { const s = formatReq(r); if (s) parts.push(s) })
  }
  if (reqs.RequiresOneOf) {
    const groups = Array.isArray(reqs.RequiresOneOf) ? reqs.RequiresOneOf : [reqs.RequiresOneOf]
    groups.forEach(g => {
      const sub = (Array.isArray(g.Requirement) ? g.Requirement : [g.Requirement])
        .map(formatReq).filter(Boolean)
      if (sub.length) parts.push(sub.join(' or '))
    })
  }
  return parts.length ? `Requires: ${parts.join(', ')}` : ''
}

// ---------------------------------------------------------------------------
// Build snapshot at a specific slot's level (V2 parity)
// ---------------------------------------------------------------------------
// Returns the build "as it looked" right before the character was about to
// gain feats at this slot. Class levels come from levelClasses[0..slot.level-1]
// — exact, not proportional. Feat choices include only those trained at an
// earlier character-level slot.
function buildSnapshotForSlot(
  slot: SlotEntry,
  slots: SlotEntry[],
  build: CharacterBuild,
): CharacterBuild {
  // Class levels: snapshot the per-level array up to (and including) this slot's
  // character level. For class-specific slots the slot level *is* the level the
  // owning class hits the relevant class-level, so the included entry is correct.
  const snap = buildSnapshotAtCharacterLevel(build, slot.level)

  // Feat choices: only feats trained in a strictly-earlier slot count. Same-
  // level slots (e.g. two heroic feats at level 1) cannot satisfy each other.
  const featChoices: Record<string, string> = {}
  for (const [key, value] of Object.entries(build.featChoices)) {
    if (!value || key === slot.key) continue
    const other = slots.find(s => s.key === key)
    if (!other) continue
    if (other.level < slot.level) {
      featChoices[key] = value
    }
  }

  return { ...snap, featChoices }
}

// ---------------------------------------------------------------------------
// Option filtering
// ---------------------------------------------------------------------------
interface FeatOption {
  feat: Feat
  prereqsMet: boolean
}

function getOptions(
  slot: SlotEntry,
  slots: SlotEntry[],
  feats: Feat[],
  build: CharacterBuild,
  allClasses: DDOClass[],
  race?: Race,
): FeatOption[] {
  // Snapshot of the build state just before this slot is chosen
  const snap = buildSnapshotForSlot(slot, slots, build)

  // Exclude already-chosen feats in other slots (use FULL build for exclusion
  // so feats taken later are still blocked from being double-taken)
  const chosenElsewhere = new Set(
    Object.entries(build.featChoices)
      .filter(([k, v]) => k !== slot.key && v)
      .map(([, v]) => v)
  )

  const updateList = slot.featUpdateList

  return feats
    .filter(f => {
      if (chosenElsewhere.has(f.Name)) return false
      if (f.Acquire && f.Acquire !== 'Train') return false

      // If the slot has an explicit FeatUpdateList, it's the authoritative whitelist
      if (updateList && updateList.length > 0) {
        return updateList.includes(f.Name)
      }

      // Otherwise: match feat group to slot type (V2 behavior)
      const featGroups = Array.isArray(f.Group) ? f.Group : f.Group ? [f.Group] : []
      return slotMatchesFeat(slot.featType, featGroups)
    })
    .map(f => ({ feat: f, prereqsMet: meetsRequirements(f, snap, allClasses, race) }))
    .sort((a, b) => {
      if (a.prereqsMet !== b.prereqsMet) return a.prereqsMet ? -1 : 1
      return a.feat.Name.localeCompare(b.feat.Name)
    })
}

// ---------------------------------------------------------------------------
// Icon picker modal
// ---------------------------------------------------------------------------
interface IconPickerProps {
  options: FeatOption[]
  current: string
  onSelect: (name: string) => void
  onClose: () => void
}

function IconPicker({ options, current, onSelect, onClose }: IconPickerProps) {
  const [search, setSearch] = useState('')
  const [showLocked, setShowLocked] = useState(false)

  const lowerSearch = search.toLowerCase()
  const available = options.filter(o => o.prereqsMet && (!search || o.feat.Name.toLowerCase().includes(lowerSearch)))
  const locked = options.filter(o => !o.prereqsMet && (!search || o.feat.Name.toLowerCase().includes(lowerSearch)))
  const visible = showLocked ? [...available, ...locked] : available

  return (
    <div className={styles.pickerOverlay} onClick={onClose}>
      <div className={styles.pickerModal} onClick={e => e.stopPropagation()}>
        <div className={styles.pickerHeader}>
          <input
            className={styles.pickerSearch}
            placeholder="Search feats…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            autoFocus
          />
          {locked.length > 0 && (
            <button
              className={`${styles.lockedToggle} ${showLocked ? styles.lockedToggleOn : ''}`}
              onClick={() => setShowLocked(v => !v)}
              title={showLocked ? 'Hide feats with unmet prerequisites' : 'Show feats with unmet prerequisites'}
            >
              {locked.length} locked
            </button>
          )}
          <button className={styles.pickerClose} onClick={onClose}>✕</button>
        </div>
        <div className={styles.pickerGrid}>
          {visible.map(({ feat: f, prereqsMet }) => {
            const prereqLine = formatPrerequisites(f)
            const tooltip = [
              f.Name,
              f.Description ?? '',
              prereqLine,
            ].filter(Boolean).join('\n\n')
            return (
              <button
                key={f.Name}
                className={[
                  styles.pickerItem,
                  f.Name === current ? styles.pickerItemActive : '',
                  !prereqsMet ? styles.pickerItemLocked : '',
                ].join(' ')}
                title={tooltip}
                onClick={prereqsMet ? () => { onSelect(f.Name); onClose() } : undefined}
                style={!prereqsMet ? { cursor: 'default' } : undefined}
              >
                <DdoIcon
                  category="FeatImages"
                  name={f.Icon ?? f.Name}
                  size={32}
                  className={styles.pickerIcon}
                />
                <span className={styles.pickerName}>{f.Name}</span>
                {!prereqsMet && <span className={styles.pickerLockBadge}>🔒</span>}
              </button>
            )
          })}
          {visible.length === 0 && (
            <div className={styles.pickerEmpty}>No feats match your search.</div>
          )}
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------
export default function FeatSlots() {
  const { build, dispatch } = useCharacter()
  const [allClasses, setAllClasses] = useState<DDOClass[]>([])
  const [allRaces, setAllRaces] = useState<Race[]>([])
  const [feats, setFeats] = useState<Feat[]>([])
  const [openSlotKey, setOpenSlotKey] = useState<string | null>(null)

  useEffect(() => {
    api.classes().then(setAllClasses)
    api.races().then(setAllRaces)
    api.feats().then(setFeats)
  }, [])

  const slots = buildSlots(build, allClasses, allRaces)

  const openSlot = openSlotKey ? slots.find(s => s.key === openSlotKey) : null
  const currentRace = allRaces.find(r => r.Name === build.race)
  const pickerOptions = openSlot
    ? getOptions(openSlot, slots, feats, build, allClasses, currentRace)
    : []

  return (
    <div className="panel">
      <div className="panel-header">Feat Slots</div>
      <div className="panel-body">
        {slots.length === 0 ? (
          <p className={styles.empty}>Select a race and classes to see feat slots.</p>
        ) : (
          <div className={styles.list}>
            {slots.map(slot => {
              const chosen = build.featChoices[slot.key] ?? ''
              const chosenFeat = feats.find(f => f.Name === chosen)
              const hoverTitle = chosen
                ? `${chosen}${chosenFeat?.Description ? '\n\n' + chosenFeat.Description : ''}`
                : 'Click to choose a feat'
              return (
                <div key={slot.key} className={styles.slot}>
                  <span className={styles.slotLevel}>Lv {slot.level}</span>
                  <span className={styles.slotType} title={slot.featType}>
                    {slot.featType.replace(' Feat', '')}
                  </span>
                  {slot.className !== 'Universal' && slot.className !== 'Epic' && slot.className !== 'Legendary' && (
                    <span className={styles.slotClass}>{slot.className}</span>
                  )}
                  <button
                    className={`${styles.featPickerBtn} ${chosen ? styles.featPickerBtnChosen : ''}`}
                    onClick={() => setOpenSlotKey(slot.key)}
                    title={hoverTitle}
                  >
                    {chosen ? (
                      <>
                        <DdoIcon
                          category="FeatImages"
                          name={chosenFeat?.Icon ?? chosen}
                          size={22}
                          className={styles.chosenIcon}
                        />
                        <span className={styles.chosenName}>{chosen}</span>
                      </>
                    ) : (
                      <span className={styles.emptySlotLabel}>Choose…</span>
                    )}
                  </button>
                  {chosen && (
                    <button
                      className={styles.clearBtn}
                      onClick={() => dispatch({ type: 'SET_FEAT', slotKey: slot.key, featName: '' })}
                      title="Clear feat"
                    >✕</button>
                  )}
                </div>
              )
            })}
          </div>
        )}

        {openSlotKey && openSlot && (
          <IconPicker
            options={pickerOptions}
            current={build.featChoices[openSlotKey] ?? ''}
            onSelect={name => dispatch({ type: 'SET_FEAT', slotKey: openSlotKey, featName: name })}
            onClose={() => setOpenSlotKey(null)}
          />
        )}
      </div>
    </div>
  )
}
