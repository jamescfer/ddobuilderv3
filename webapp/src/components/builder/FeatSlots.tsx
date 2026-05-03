import { useEffect, useState } from 'react'
import { api } from '../../api'
import { useCharacter } from '../../context/CharacterContext'
import type { DDOClass, Feat } from '../../types/ddo'
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

function getOptions(featType: string, feats: Feat[]): Feat[] {
  if (featType === 'Heroic') {
    return feats.filter(f => {
      const groups = Array.isArray(f.Group) ? f.Group : f.Group ? [f.Group] : []
      return groups.includes('Feat') || groups.includes('General Feat')
    })
  }
  return feats.filter(f => {
    const groups = Array.isArray(f.Group) ? f.Group : f.Group ? [f.Group] : []
    return groups.some(g => g.toLowerCase().includes(featType.toLowerCase()))
  })
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
              const options = getOptions(slot.featType, feats)
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
