import { useEffect, useState } from 'react'
import { api } from '../../api'
import { useCharacter } from '../../context/CharacterContext'
import type { CharacterBuild, DDOClass, Feat, Race, Requirement } from '../../types/ddo'
import { buildSnapshotAtCharacterLevel } from '../../lib/levelProgression'
import { meetsRequirements as sharedMeetsRequirements } from '../../lib/requirements'
import { buildSlots } from '../../lib/levelTraining'
import type { SlotEntry } from '../../lib/levelTraining'
import DdoIcon from '../DdoIcon'
import styles from './FeatSlots.module.css'

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

      // Otherwise: match feat group to slot type (V2 behavior, Build.cpp:1523-1527)
      const featGroups = Array.isArray(f.Group) ? f.Group : f.Group ? [f.Group] : []
      if (slotMatchesFeat(slot.featType, featGroups)) return true

      // V2 Build.cpp:1528-1538: ConditionalGroup adds extra group memberships when
      // its RequirementsToUse (here the nested Requirements) are met.
      const cg = f.ConditionalGroup
      if (cg) {
        const condGroups = Array.isArray(cg.Group) ? cg.Group : cg.Group ? [cg.Group] : []
        if (condGroups.length > 0
          && slotMatchesFeat(slot.featType, condGroups)
          && sharedMeetsRequirements(cg.Requirements, { build: snap, allClasses, race })) {
          return true
        }
      }
      return false
    })
    .map(f => ({ feat: f, prereqsMet: sharedMeetsRequirements(f.Requirements, { build: snap, allClasses, race }) }))
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
