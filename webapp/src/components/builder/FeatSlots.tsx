import { useEffect, useState } from 'react'
import { api } from '../../api'
import { useCharacter } from '../../context/CharacterContext'
import type { BuildClass, CharacterBuild, DDOClass, Feat, Requirement, RequiresOneOf } from '../../types/ddo'
import styles from './FeatSlots.module.css'

interface SlotEntry {
  key: string
  level: number
  featType: string
  className: string
}

function buildSlots(classes: { name: string; levels: number }[], allClasses: DDOClass[]): SlotEntry[] {
  const slots: SlotEntry[] = []
  const universalLevels = [1, 3, 6, 9, 12, 15, 18]
  universalLevels.forEach(lvl => {
    slots.push({ key: `heroic-${lvl}`, level: lvl, featType: 'Heroic', className: 'Universal' })
  })
  for (const bc of classes) {
    if (!bc.name || bc.levels === 0) continue
    const cls = allClasses.find(c => c.Name === bc.name)
    if (!cls?.FeatSlot) continue
    cls.FeatSlot.forEach((fs, idx) => {
      if (fs.Level <= bc.levels) {
        slots.push({
          key: `${bc.name}-${fs.Level}-${fs.FeatType}-${idx}`,
          level: fs.Level,
          featType: fs.FeatType,
          className: bc.name,
        })
      }
    })
  }
  slots.sort((a, b) => a.level - b.level || a.className.localeCompare(b.className))
  return slots
}

// ---------------------------------------------------------------------------
// BAB helpers (mirrors StatsPanel logic)
// ---------------------------------------------------------------------------
function babPerLevel(babStr: string | undefined): number {
  switch (babStr) {
    case 'Full': return 1
    case '3/4': return 0.75
    case '1/2': return 0.5
    default: return 0.75
  }
}

function totalBAB(classes: BuildClass[], allClasses: DDOClass[]): number {
  return classes.reduce((sum, bc) => {
    if (!bc.name || !bc.levels) return sum
    const cls = allClasses.find(c => c.Name === bc.name)
    return sum + Math.floor(bc.levels * babPerLevel(cls?.BAB))
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
    case 'Level':
      return build.totalLevel >= value
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

  // ALL Requirement entries must pass (AND)
  if (reqs.Requirement) {
    const list = Array.isArray(reqs.Requirement) ? reqs.Requirement : [reqs.Requirement]
    if (!list.every(r => meetsSingleRequirement(r, build, allClasses))) return false
  }

  // RequiresOneOf: at least one group must have >=1 passing requirement
  if (reqs.RequiresOneOf) {
    const groups = Array.isArray(reqs.RequiresOneOf) ? reqs.RequiresOneOf : [reqs.RequiresOneOf]
    if (!groups.every(g => meetsOneOfGroup(g, build, allClasses))) return false
  }

  // RequiresNoneOf: none of the requirements in any group may pass
  if (reqs.RequiresNoneOf) {
    const groups = Array.isArray(reqs.RequiresNoneOf) ? reqs.RequiresNoneOf : [reqs.RequiresNoneOf]
    if (groups.some(g => meetsOneOfGroup(g, build, allClasses))) return false
  }

  return true
}

// ---------------------------------------------------------------------------
// Option filtering
// ---------------------------------------------------------------------------
function getOptions(featType: string, feats: Feat[], build: CharacterBuild, allClasses: DDOClass[]): Feat[] {
  let filtered: Feat[]
  if (featType === 'Heroic') {
    filtered = feats.filter(f => {
      const groups = Array.isArray(f.Group) ? f.Group : f.Group ? [f.Group] : []
      return groups.includes('Feat') || groups.includes('General Feat')
    })
  } else {
    filtered = feats.filter(f => {
      const groups = Array.isArray(f.Group) ? f.Group : f.Group ? [f.Group] : []
      return groups.some(g => g.toLowerCase().includes(featType.toLowerCase()))
    })
  }
  return filtered.filter(f => meetsRequirements(f, build, allClasses))
}

export default function FeatSlots() {
  const { build, dispatch } = useCharacter()
  const [allClasses, setAllClasses] = useState<DDOClass[]>([])
  const [feats, setFeats] = useState<Feat[]>([])

  useEffect(() => {
    api.classes().then(setAllClasses)
    api.feats().then(setFeats)
  }, [])

  const slots = buildSlots(build.classes, allClasses)

  return (
    <div className="panel">
      <div className="panel-header">Feat Slots</div>
      <div className="panel-body">
        {slots.length === 0 ? (
          <p className={styles.empty}>Select a race and classes to see feat slots.</p>
        ) : (
          <div className={styles.list}>
            {slots.map(slot => {
              const options = getOptions(slot.featType, feats, build, allClasses)
              return (
                <div key={slot.key} className={styles.slot}>
                  <div className={styles.slotMeta}>
                    <span className={styles.slotLevel}>Lv {slot.level}</span>
                    <span className={styles.slotType}>{slot.featType}</span>
                    {slot.className !== 'Universal' && (
                      <span className={styles.slotClass}>{slot.className}</span>
                    )}
                  </div>
                  <select
                    value={build.featChoices[slot.key] ?? ''}
                    onChange={e => dispatch({ type: 'SET_FEAT', slotKey: slot.key, featName: e.target.value })}
                    className={styles.select}
                  >
                    <option value="">— Choose Feat —</option>
                    {options.map(f => (
                      <option key={f.Name} value={f.Name}>{f.Name}</option>
                    ))}
                  </select>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
