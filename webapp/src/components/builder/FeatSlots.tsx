import { useEffect, useState } from 'react'
import { api } from '../../api'
import { useCharacter } from '../../context/CharacterContext'
import type { BuildClass, CharacterBuild, DDOClass, Feat, Race, Requirement, RequiresOneOf } from '../../types/ddo'
import DdoIcon from '../DdoIcon'
import styles from './FeatSlots.module.css'

interface SlotEntry {
  key: string
  level: number
  featType: string
  className: string
  featUpdateList?: string[]   // whitelist from class XML FeatUpdateList
}

// Fallback group-based filter (used when FeatUpdateList is absent)
const FEAT_TYPE_TO_GROUPS: Record<string, string[]> = {
  'Heroic':                              ['Standard'],
  'Epic Feat':                           ['Epic Feat'],
  'Legendary Feat':                      ['Epic Feat'],
  'Epic Destiny Feat':                   ['Epic Feat'],
  'Dark Gift Upgrade':                   ['Dark Gift Upgrade', 'Standard'],
  'Alter Dark Gift':                     ['Alter Dark Gift', 'Standard'],
  'Fighter Bonus Feat':                  ['Standard', 'Martial'],
  'Artificer Bonus Feat':               ['Standard'],
  'Alchemist Bonus Feat':               ['Standard'],
  'Monk Bonus':                          ['Standard', 'Martial'],
  'Bonus Magical Feat':                  ['Arcane', 'Divine', 'Primal'],
  'Rogue Special Ability':               ['User'],
  'Metamagic Feat':                      ['Metamagics'],
  'Human Bonus Feat':                    ['Human Bonus Feat', 'Standard'],
  'Purple Dragon Knight Bonus Feat':    ['Purple Dragon Knight Bonus Feat', 'Standard'],
  'Deity':                               ['Deity'],
  'Follower Of':                         ['Follower Of'],
  'Child Of':                            ['Child Of'],
  'Beloved Of':                          ['Beloved Of'],
  'Domain Feat':                         ['Divine'],
}

function toArray<T>(v: T | T[] | undefined): T[] {
  if (v == null) return []
  return Array.isArray(v) ? v : [v]
}

function buildSlots(
  classes: { name: string; levels: number }[],
  allClasses: DDOClass[],
  allRaces: Race[],
  currentRace: string,
  epicLevels: number,
  legendaryLevels: number,
): SlotEntry[] {
  const slots: SlotEntry[] = []

  // 1. Race feat slots (e.g. Human Bonus Feat at char level 1)
  const race = allRaces.find(r => r.Name === currentRace)
  toArray(race?.FeatSlot).forEach((fs, idx) => {
    const featUpdateList = fs.FeatUpdateList
      ? toArray(fs.FeatUpdateList).filter(Boolean)
      : undefined
    slots.push({
      key: `race-${fs.Level}-${fs.FeatType}-${idx}`,
      level: fs.Level,
      featType: fs.FeatType,
      className: currentRace,
      featUpdateList: featUpdateList?.length ? featUpdateList : undefined,
    })
  })

  // 2. Universal standard feats (heroic levels 1-20 only)
  const universalLevels = [1, 3, 6, 9, 12, 15, 18]
  universalLevels.forEach(lvl => {
    slots.push({ key: `heroic-${lvl}`, level: lvl, featType: 'Heroic', className: 'Universal' })
  })

  // 3. Class-specific heroic feat slots
  for (const bc of classes) {
    if (!bc.name || bc.levels === 0) continue
    const cls = allClasses.find(c => c.Name === bc.name)
    if (!cls?.FeatSlot) continue
    toArray(cls.FeatSlot).forEach((fs, idx) => {
      if (fs.Level <= bc.levels) {
        const featUpdateList = fs.FeatUpdateList
          ? toArray(fs.FeatUpdateList).filter(Boolean)
          : undefined
        slots.push({
          key: `${bc.name}-${fs.Level}-${fs.FeatType}-${idx}`,
          level: fs.Level,
          featType: fs.FeatType,
          className: bc.name,
          featUpdateList: featUpdateList?.length ? featUpdateList : undefined,
        })
      }
    })
  }

  // 4. Epic feat slots — read from Epic.class.xml; epic class level N → character level 20+N
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
          featType: fs.FeatType,
          className: 'Epic',
          featUpdateList: featUpdateList?.length ? featUpdateList : undefined,
        })
      }
    })
  }

  // 5. Legendary feat slots — read from Legendary.class.xml; legendary class level N → character level 30+N
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

function totalBAB(classes: BuildClass[], allClasses: DDOClass[]): number {
  return classes.reduce((sum, bc) => {
    if (!bc.name || !bc.levels) return sum
    const cls = allClasses.find(c => c.Name === bc.name)
    return sum + classBABAtLevel(cls, bc.levels)
  }, 0)
}

// ---------------------------------------------------------------------------
// Prerequisite checking
// ---------------------------------------------------------------------------
function meetsSingleRequirement(req: Requirement, build: CharacterBuild, allClasses: DDOClass[]): boolean {
  const item = Array.isArray(req.Item) ? req.Item[0] : req.Item ?? ''
  const value = req.Value ?? 0

  switch (req.Type) {
    case 'Ability': {
      const score = build.baseAbilities[item as keyof typeof build.baseAbilities]
      return score !== undefined && score >= value
    }
    case 'BAB':
      return totalBAB(build.classes, allClasses) >= value
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
      return build.classes.some(c => c.levels >= value)
    }
    case 'BaseClassMinLevel': {
      const bc = build.classes.find(c => c.name === item)
      return (bc?.levels ?? 0) >= value
    }
    case 'Level':
      return build.totalLevel >= value
    case 'Skill':
    case 'StartingWorld':
      return true
    default:
      return true
  }
}

function meetsOneOfGroup(group: RequiresOneOf, build: CharacterBuild, allClasses: DDOClass[]): boolean {
  const reqs = Array.isArray(group.Requirement) ? group.Requirement : [group.Requirement]
  return reqs.some(r => meetsSingleRequirement(r, build, allClasses))
}

function meetsRequirements(feat: Feat, build: CharacterBuild, allClasses: DDOClass[]): boolean {
  const reqs = feat.Requirements
  if (!reqs) return true

  if (reqs.Requirement) {
    const list = Array.isArray(reqs.Requirement) ? reqs.Requirement : [reqs.Requirement]
    if (!list.every(r => meetsSingleRequirement(r, build, allClasses))) return false
  }

  if (reqs.RequiresOneOf) {
    const groups = Array.isArray(reqs.RequiresOneOf) ? reqs.RequiresOneOf : [reqs.RequiresOneOf]
    if (!groups.every(g => meetsOneOfGroup(g, build, allClasses))) return false
  }

  if (reqs.RequiresNoneOf) {
    const groups = Array.isArray(reqs.RequiresNoneOf) ? reqs.RequiresNoneOf : [reqs.RequiresNoneOf]
    if (groups.some(g => meetsOneOfGroup(g, build, allClasses))) return false
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
    case 'ClassMinLevel': return `Any class ${val}+`
    case 'BaseClassMinLevel': return `${item} ${val}+`
    case 'Level': return `Level ${val}+`
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
// Option filtering
// ---------------------------------------------------------------------------
interface FeatOption {
  feat: Feat
  prereqsMet: boolean
}

function getOptions(
  slot: SlotEntry,
  feats: Feat[],
  build: CharacterBuild,
  allClasses: DDOClass[],
): FeatOption[] {
  // Exclude already-chosen feats in other slots
  const chosenElsewhere = new Set(
    Object.entries(build.featChoices)
      .filter(([k, v]) => k !== slot.key && v)
      .map(([, v]) => v)
  )

  const updateList = slot.featUpdateList

  return feats
    .filter(f => {
      if (chosenElsewhere.has(f.Name)) return false

      // If the slot has an explicit FeatUpdateList, it's the authoritative whitelist
      if (updateList && updateList.length > 0) {
        return updateList.includes(f.Name)
      }

      // Fallback: filter by Group
      const groups = FEAT_TYPE_TO_GROUPS[slot.featType] ?? ['Standard']
      const featGroups = Array.isArray(f.Group) ? f.Group : f.Group ? [f.Group] : []
      return featGroups.some(g => groups.includes(g))
    })
    .map(f => ({ feat: f, prereqsMet: meetsRequirements(f, build, allClasses) }))
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

  const slots = buildSlots(
    build.classes,
    allClasses,
    allRaces,
    build.race,
    build.epicLevels ?? 0,
    build.legendaryLevels ?? 0,
  )

  const openSlot = openSlotKey ? slots.find(s => s.key === openSlotKey) : null
  const pickerOptions = openSlot
    ? getOptions(openSlot, feats, build, allClasses)
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
