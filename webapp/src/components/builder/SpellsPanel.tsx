import { useEffect, useState } from 'react'
import { useCharacter } from '../../context/CharacterContext'
import styles from './SpellsPanel.module.css'

// Raw spell shape from /api/spells
interface RawSpell {
  Name: string
  School?: string
  Level?: Record<string, number>
  Description?: string
}

// Full casters: spell level cap = floor((classLevel + 1) / 2)
const FULL_CASTERS = new Set([
  'Cleric', 'Wizard', 'Sorcerer', 'Druid', 'Favored Soul', 'Artificer',
])

// Half casters: spell level cap = floor(classLevel / 3) + 1, max 4
const HALF_CASTERS = new Set(['Bard', 'Paladin', 'Ranger'])

function spellLevelCap(className: string, classLevel: number): number {
  if (FULL_CASTERS.has(className)) {
    return Math.floor((classLevel + 1) / 2)
  }
  if (HALF_CASTERS.has(className)) {
    return Math.min(4, Math.floor(classLevel / 3) + 1)
  }
  return 0
}

interface SpellsByLevel {
  [spellLevel: number]: RawSpell[]
}

interface ClassSpells {
  className: string
  byLevel: SpellsByLevel
}

function buildClassSpells(
  classes: { name: string; levels: number }[],
  allSpells: RawSpell[],
): ClassSpells[] {
  const result: ClassSpells[] = []

  for (const bc of classes) {
    if (!bc.name || bc.levels === 0) continue
    const cap = spellLevelCap(bc.name, bc.levels)
    if (cap === 0) continue

    const byLevel: SpellsByLevel = {}
    for (const spell of allSpells) {
      if (!spell.Level) continue
      const spellLevel = spell.Level[bc.name]
      if (spellLevel === undefined || spellLevel < 1 || spellLevel > cap) continue
      if (!byLevel[spellLevel]) byLevel[spellLevel] = []
      byLevel[spellLevel].push(spell)
    }

    if (Object.keys(byLevel).length > 0) {
      result.push({ className: bc.name, byLevel })
    }
  }

  return result
}

export default function SpellsPanel() {
  const { build } = useCharacter()
  const [allSpells, setAllSpells] = useState<RawSpell[]>([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<string | null>(null)

  useEffect(() => {
    setLoading(true)
    fetch('/api/spells')
      .then(r => r.json())
      .then((data: RawSpell[]) => {
        setAllSpells(Array.isArray(data) ? data : [])
      })
      .catch(() => setAllSpells([]))
      .finally(() => setLoading(false))
  }, [])

  const classSpells = buildClassSpells(build.classes, allSpells)

  // Keep active tab in sync when classes change
  const tabNames = classSpells.map(cs => cs.className)
  const resolvedTab = tabNames.includes(activeTab ?? '') ? activeTab! : (tabNames[0] ?? null)

  const activeData = classSpells.find(cs => cs.className === resolvedTab)

  const hasSpellcasters = build.classes.some(bc => {
    if (!bc.name || bc.levels === 0) return false
    return spellLevelCap(bc.name, bc.levels) > 0
  })

  return (
    <div className="panel">
      <div className="panel-header">Spells</div>
      <div className="panel-body">
        {loading ? (
          <p className={styles.empty}>Loading spells…</p>
        ) : !hasSpellcasters ? (
          <p className={styles.empty}>No spellcasting classes selected.</p>
        ) : classSpells.length === 0 ? (
          <p className={styles.empty}>No spells available at current class levels.</p>
        ) : (
          <>
            {tabNames.length > 1 && (
              <div className={styles.tabs}>
                {tabNames.map(name => (
                  <button
                    key={name}
                    className={`${styles.tab} ${name === resolvedTab ? styles.tabActive : ''}`}
                    onClick={() => setActiveTab(name)}
                  >
                    {name}
                  </button>
                ))}
              </div>
            )}
            {activeData && (
              <div className={styles.spellList}>
                {Object.keys(activeData.byLevel)
                  .map(Number)
                  .sort((a, b) => a - b)
                  .map(lvl => (
                    <div key={lvl} className={styles.levelGroup}>
                      <div className={styles.levelHeader}>Level {lvl}</div>
                      {activeData.byLevel[lvl]
                        .slice()
                        .sort((a, b) => a.Name.localeCompare(b.Name))
                        .map(spell => (
                          <div key={spell.Name} className={styles.spellRow}>
                            <span className={styles.spellName}>{spell.Name}</span>
                            {spell.School && (
                              <span className={styles.spellSchool}>{spell.School}</span>
                            )}
                          </div>
                        ))}
                    </div>
                  ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
