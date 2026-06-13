// Customizable main page (V2 main-frame docking-panes parity): the user adds
// any panel as a window, drags it by its title bar, resizes it from the
// corner (native CSS resize), and the layout persists. "Reset Layout" matches
// V2's View → Reset Screen Layout.

import React, { lazy, Suspense, useEffect, useRef, useState } from 'react'

// Lazy panel registry — same components the nav routes render.
const REGISTRY: Record<string, React.LazyExoticComponent<React.ComponentType>> = {
  'Character Info': lazy(() => import('../builder/CharacterInfo')),
  'Race': lazy(() => import('../builder/RaceSelector')),
  'Classes': lazy(() => import('../builder/ClassSelector')),
  'Ability Scores': lazy(() => import('../builder/AbilityScores')),
  'Ability Level Ups': lazy(() => import('../builder/AbilityLevelUps')),
  'Stats': lazy(() => import('../builder/StatsPanel')),
  'Feats': lazy(() => import('../builder/FeatSlots')),
  'Automatic Feats': lazy(() => import('../builder/AutomaticFeats')),
  'Skills': lazy(() => import('../builder/Skills')),
  'Level Training': lazy(() => import('../builder/LevelTrainingPanel')),
  'Spells': lazy(() => import('../builder/SpellsPanel')),
  'Tomes': lazy(() => import('../builder/TomesPanel')),
  'Enhancements': lazy(() => import('../enhancements/EnhancementTreePanel')),
  'Epic Destinies': lazy(() => import('../epicdestinies/EpicDestiniesPanel')),
  'Reaper': lazy(() => import('../reaper/ReaperPanel')),
  'Gear': lazy(() => import('../items/GearPanel')),
  'Clickies': lazy(() => import('../items/ClickiesPanel')),
  'Breakdowns': lazy(() => import('../breakdowns/BreakdownsPanel')),
  'Combat': lazy(() => import('../combat/CombatPanel')),
  'DCs': lazy(() => import('../dc/DCPanel')),
  'Stances': lazy(() => import('../stances/StancesPanel')),
  'Self Buffs': lazy(() => import('../buffs/SelfBuffsPanel')),
  'Guild Buffs': lazy(() => import('../guildbuffs/GuildBuffsPanel')),
  'Past Lives': lazy(() => import('../pastlives/PastLivesPanel')),
  'Favor': lazy(() => import('../favor/FavorPanel')),
  'Filigrees': lazy(() => import('../filigree/FiligreePanel')),
  'Set Bonuses': lazy(() => import('../setbonuses/SetBonusesPanel')),
  'Bonuses': lazy(() => import('../bonuses/BonusesPanel')),
  'Notes': lazy(() => import('../notes/NotesPanel')),
  'Forum Export': lazy(() => import('../export/ForumExportPanel')),
}

interface Win {
  id: string
  panel: string
  x: number
  y: number
  w: number
  h: number
  /** Content zoom factor (window "scaling"). */
  zoom: number
}

const LAYOUT_KEY = 'ddo-builder-dashboard'

const DEFAULT_LAYOUT: Win[] = [
  { id: 'w1', panel: 'Character Info', x: 8, y: 8, w: 340, h: 260, zoom: 1 },
  { id: 'w2', panel: 'Classes', x: 8, y: 276, w: 340, h: 300, zoom: 1 },
  { id: 'w3', panel: 'Stats', x: 8, y: 584, w: 340, h: 320, zoom: 1 },
  { id: 'w4', panel: 'Feats', x: 356, y: 8, w: 560, h: 440, zoom: 1 },
  { id: 'w5', panel: 'Enhancements', x: 356, y: 456, w: 860, h: 520, zoom: 1 },
  { id: 'w6', panel: 'Breakdowns', x: 924, y: 8, w: 420, h: 440, zoom: 1 },
]

function readLayout(): Win[] {
  try {
    const raw = localStorage.getItem(LAYOUT_KEY)
    if (!raw) return DEFAULT_LAYOUT
    const parsed = JSON.parse(raw)
    if (Array.isArray(parsed) && parsed.every(w => w && typeof w.panel === 'string')) {
      return (parsed as Win[]).map(w => ({ ...w, zoom: w.zoom ?? 1 }))
    }
  } catch { /* fall through */ }
  return DEFAULT_LAYOUT
}

function writeLayout(wins: Win[]) {
  try { localStorage.setItem(LAYOUT_KEY, JSON.stringify(wins)) } catch { /* ignore */ }
}

let nextId = Date.now()

function DashboardWindow({
  win, onMove, onResize, onZoom, onClose, onFocus, z,
}: {
  win: Win
  z: number
  onMove: (x: number, y: number) => void
  onResize: (w: number, h: number) => void
  onZoom: (zoom: number) => void
  onClose: () => void
  onFocus: () => void
}) {
  const ref = useRef<HTMLDivElement>(null)
  const drag = useRef<{ startX: number; startY: number; baseX: number; baseY: number } | null>(null)

  // Persist native CSS resizes.
  useEffect(() => {
    const el = ref.current
    if (!el || typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(() => {
      const r = el.getBoundingClientRect()
      if (Math.abs(r.width - win.w) > 2 || Math.abs(r.height - win.h) > 2) {
        onResize(Math.round(r.width), Math.round(r.height))
      }
    })
    ro.observe(el)
    return () => ro.disconnect()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [win.w, win.h])

  function onPointerDown(e: React.PointerEvent) {
    drag.current = { startX: e.clientX, startY: e.clientY, baseX: win.x, baseY: win.y }
    ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
  }
  function onPointerMove(e: React.PointerEvent) {
    if (!drag.current) return
    const dx = e.clientX - drag.current.startX
    const dy = e.clientY - drag.current.startY
    onMove(Math.max(0, drag.current.baseX + dx), Math.max(0, drag.current.baseY + dy))
  }
  function onPointerUp() { drag.current = null }

  const Component = REGISTRY[win.panel]

  return (
    <div
      ref={ref}
      onMouseDown={onFocus}
      style={{
        position: 'absolute', left: win.x, top: win.y, width: win.w, height: win.h,
        zIndex: z,
        display: 'flex', flexDirection: 'column',
        background: 'var(--color-bg, #1c1c22)',
        border: '1px solid var(--color-border, #444)',
        borderRadius: '6px', boxShadow: '0 4px 16px rgba(0,0,0,0.45)',
        resize: 'both', overflow: 'hidden', minWidth: 220, minHeight: 120,
      }}
    >
      <div
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        style={{
          cursor: 'move', userSelect: 'none', touchAction: 'none',
          display: 'flex', alignItems: 'center', gap: '6px',
          padding: '4px 8px', fontSize: '12px', fontWeight: 600,
          background: 'var(--color-panel-header, #2a2a33)',
          borderBottom: '1px solid var(--color-border, #444)',
          flex: '0 0 auto',
        }}
      >
        <span style={{ flex: 1 }}>{win.panel}</span>
        <button type="button" title="Smaller content" style={{ padding: '0 5px' }}
          onClick={() => onZoom(Math.max(0.5, Math.round((win.zoom - 0.1) * 10) / 10))}>−</button>
        <span style={{ fontSize: '10px', opacity: 0.7 }}>{Math.round(win.zoom * 100)}%</span>
        <button type="button" title="Larger content" style={{ padding: '0 5px' }}
          onClick={() => onZoom(Math.min(2, Math.round((win.zoom + 0.1) * 10) / 10))}>+</button>
        <button type="button" title="Close window" style={{ padding: '0 6px' }} onClick={onClose}>×</button>
      </div>
      <div style={{ flex: 1, overflow: 'auto' }}>
        <div style={{ zoom: win.zoom } as React.CSSProperties}>
          {Component ? (
            <Suspense fallback={<p style={{ padding: '8px' }}>Loading…</p>}>
              <Component />
            </Suspense>
          ) : (
            <p style={{ padding: '8px' }}>Unknown panel "{win.panel}"</p>
          )}
        </div>
      </div>
    </div>
  )
}

export default function Dashboard() {
  const [wins, setWins] = useState<Win[]>(() => readLayout())
  const [order, setOrder] = useState<string[]>(() => readLayout().map(w => w.id))
  const [adding, setAdding] = useState('')

  function update(next: Win[]) {
    setWins(next)
    writeLayout(next)
  }

  function patch(id: string, p: Partial<Win>) {
    update(wins.map(w => (w.id === id ? { ...w, ...p } : w)))
  }

  function addWindow(panel: string) {
    if (!panel) return
    const id = `w${nextId++}`
    update([...wins, { id, panel, x: 40 + (wins.length % 5) * 30, y: 40 + (wins.length % 5) * 30, w: 480, h: 380, zoom: 1 }])
    setOrder(o => [...o, id])
  }

  function focus(id: string) {
    setOrder(o => [...o.filter(x => x !== id), id])
  }

  const maxY = Math.max(1000, ...wins.map(w => w.y + w.h + 40))

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{ display: 'flex', gap: '8px', alignItems: 'center', padding: '6px 8px', flexWrap: 'wrap' }}>
        <strong style={{ fontSize: '13px' }}>Main</strong>
        <select value={adding} onChange={e => { addWindow(e.target.value); setAdding('') }}>
          <option value="">+ Add window…</option>
          {Object.keys(REGISTRY).map(name => (
            <option key={name} value={name}>{name}</option>
          ))}
        </select>
        <button
          type="button"
          title="Restore the default window layout (V2 View → Reset Screen Layout)"
          onClick={() => { update(DEFAULT_LAYOUT); setOrder(DEFAULT_LAYOUT.map(w => w.id)) }}
        >
          Reset Layout
        </button>
        <span style={{ fontSize: '11px', opacity: 0.65 }}>
          Drag windows by their title bar; resize from the bottom-right corner; −/+ scales content.
        </span>
      </div>
      <div style={{ position: 'relative', flex: 1, overflow: 'auto' }}>
        <div style={{ position: 'relative', minHeight: maxY, minWidth: '100%' }}>
          {wins.map(w => (
            <DashboardWindow
              key={w.id}
              win={w}
              z={10 + order.indexOf(w.id)}
              onMove={(x, y) => patch(w.id, { x, y })}
              onResize={(wd, h) => patch(w.id, { w: wd, h })}
              onZoom={zoom => patch(w.id, { zoom })}
              onClose={() => { update(wins.filter(x => x.id !== w.id)); setOrder(o => o.filter(x => x !== w.id)) }}
              onFocus={() => focus(w.id)}
            />
          ))}
        </div>
      </div>
    </div>
  )
}
