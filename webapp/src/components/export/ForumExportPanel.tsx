import { useState } from 'react'
import { useCharacter } from '../../context/CharacterContext'
import type { CharacterBuild, Ability } from '../../types/ddo'
import styles from './ForumExportPanel.module.css'

// ---------------------------------------------------------------------------
// Ability score helpers
// ---------------------------------------------------------------------------

const ABILITY_ABBREVS: Record<Ability, string> = {
  Strength: 'STR',
  Dexterity: 'DEX',
  Constitution: 'CON',
  Intelligence: 'INT',
  Wisdom: 'WIS',
  Charisma: 'CHA',
}

const ABILITIES: Ability[] = ['Strength', 'Dexterity', 'Constitution', 'Intelligence', 'Wisdom', 'Charisma']

function modifier(score: number): string {
  const mod = Math.floor((score - 10) / 2)
  return mod >= 0 ? `+${mod}` : String(mod)
}

// ---------------------------------------------------------------------------
// BBCode export generator
// ---------------------------------------------------------------------------

function generateExport(build: CharacterBuild): string {
  const lines: string[] = []

  // Header
  lines.push(`[b]Character Name[/b]: ${build.name || '(unnamed)'}`)
  lines.push(`[b]Race[/b]: ${build.race || '(none)'} | [b]Alignment[/b]: ${build.alignment || '(none)'}`)

  // Classes
  const activeClasses = build.classes
    .filter(c => c.name && c.levels > 0)
    .map(c => `${c.name} ${c.levels}`)
  lines.push(`[b]Classes[/b]: ${activeClasses.length > 0 ? activeClasses.join(' / ') : '(none)'}`)
  lines.push(`[b]Total Level[/b]: ${build.totalLevel}`)
  lines.push('')

  // Ability scores
  lines.push('[b]Ability Scores[/b] (Base / Tome / Total):')
  for (const ability of ABILITIES) {
    const base = build.baseAbilities[ability] ?? 8
    const tome = build.abilityTomes[ability] ?? 0
    const total = base + tome
    const abbrev = ABILITY_ABBREVS[ability]
    lines.push(`${abbrev}: ${base} / +${tome} / ${total} (${modifier(total)})`)
  }
  lines.push('')

  // Feats
  const featEntries = Object.entries(build.featChoices).filter(([, v]) => v)
  if (featEntries.length > 0) {
    lines.push('[b]Feats[/b]:')
    featEntries
      .slice()
      .sort(([a], [b]) => {
        // Sort by level number if key starts with a level
        const aLevel = parseInt(a.match(/^(\d+)/)?.[1] ?? '0', 10)
        const bLevel = parseInt(b.match(/^(\d+)/)?.[1] ?? '0', 10)
        if (aLevel !== bLevel) return aLevel - bLevel
        return a.localeCompare(b)
      })
      .forEach(([slotKey, featName]) => {
        lines.push(`  ${slotKey}: ${featName}`)
      })
    lines.push('')
  }

  // Gear
  const gearEntries = Object.entries(build.gear).filter(([, v]) => v)
  if (gearEntries.length > 0) {
    lines.push('[b]Gear[/b]:')
    gearEntries
      .slice()
      .sort(([a], [b]) => a.localeCompare(b))
      .forEach(([slot, item]) => {
        lines.push(`  ${slot}: ${item}`)
      })
    lines.push('')
  }

  // Past Lives
  const pastLifeEntries = Object.entries(build.pastLives).filter(([, count]) => count > 0)
  if (pastLifeEntries.length > 0) {
    lines.push('[b]Past Lives[/b]:')
    const pastLifeStr = pastLifeEntries
      .slice()
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([source, count]) => `${source} x${count}`)
      .join(', ')
    lines.push(`  ${pastLifeStr}`)
    lines.push('')
  }

  // Notes
  if (build.notes && build.notes.trim()) {
    lines.push('[b]Notes[/b]:')
    lines.push(build.notes.trim())
    lines.push('')
  }

  lines.push('Built with DDO Builder v3')

  return lines.join('\n')
}

// ---------------------------------------------------------------------------
// ForumExportPanel
// ---------------------------------------------------------------------------

export default function ForumExportPanel() {
  const { build } = useCharacter()
  const [copied, setCopied] = useState(false)

  const exportText = generateExport(build)

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(exportText)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // Fallback: select the textarea
    }
  }

  return (
    <div className="panel">
      <div className="panel-header">Forum Export</div>
      <div className={`panel-body ${styles.body}`}>
        <div className={styles.toolbar}>
          <button
            type="button"
            className={`${styles.copyBtn} ${copied ? styles.copied : ''}`}
            onClick={handleCopy}
          >
            {copied ? 'Copied!' : 'Copy to Clipboard'}
          </button>
          <span className={styles.hint}>
            Paste into DDO forums or any BBCode-compatible forum.
          </span>
        </div>
        <textarea
          className={styles.textarea}
          value={exportText}
          readOnly
          spellCheck={false}
        />
      </div>
    </div>
  )
}
