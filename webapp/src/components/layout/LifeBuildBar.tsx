import type { CSSProperties } from 'react'
import { useCharacter } from '../../context/CharacterContext'
import { useDocument } from '../../context/DocumentContext'
import {
  syncBuildIntoDocument,
  setActiveBuild,
  findActiveBuild,
  addLifeToDocument,
  addBuildToLife,
  deleteLifeFromDocument,
  deleteBuildFromDocument,
  renameLife,
} from '../../lib/multiLife'
import type { CharacterDocument } from '../../types/ddo'

// U1 — V2 Character → Life → Build picker (V2's left-rail life tree).
//
// Renders the lives of the current Character document as one row of tabs and
// the builds of the active life as a second row. Every operation first syncs
// the live-edited active build back into the document so nothing is lost on
// switch (V2 edits the active build in place; siblings are stored snapshots).

const rowStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '4px',
  flexWrap: 'wrap',
  padding: '2px 0',
}

const labelStyle: CSSProperties = {
  fontSize: '10px',
  textTransform: 'uppercase',
  opacity: 0.7,
  minWidth: '38px',
}

const tabStyle = (active: boolean): CSSProperties => ({
  fontSize: '11px',
  padding: '2px 8px',
  cursor: 'pointer',
  borderRadius: '3px',
  border: active ? '1px solid var(--color-accent, #c9a86a)' : '1px solid transparent',
  fontWeight: active ? 600 : 400,
})

export default function LifeBuildBar() {
  const { build, dispatch } = useCharacter()
  const { doc, setDoc } = useDocument()

  /** Applies a document transform on the synced doc and loads its active build. */
  function apply(transform: (synced: CharacterDocument) => CharacterDocument) {
    const next = transform(syncBuildIntoDocument(doc, build))
    setDoc(next)
    const target = findActiveBuild(next)
    if (target && target.id !== build.id) {
      dispatch({ type: 'LOAD_BUILD', build: target })
    }
  }

  const activeLife = doc.lives.find(l => l.id === doc.activeLifeId) ?? doc.lives[0]

  function handleRenameLife(lifeId: string, current: string) {
    const name = window.prompt('Life name:', current)
    if (name && name.trim()) apply(d => renameLife(d, lifeId, name.trim()))
  }

  function handleDeleteLife(lifeId: string, name: string) {
    if (doc.lives.length <= 1) return
    if (window.confirm(`Delete life "${name}" and all its builds?`)) {
      apply(d => deleteLifeFromDocument(d, lifeId))
    }
  }

  function handleDeleteBuild(buildId: string, name: string) {
    if ((activeLife?.builds.length ?? 0) <= 1) return
    if (window.confirm(`Delete build "${name}"?`)) {
      apply(d => deleteBuildFromDocument(d, doc.activeLifeId, buildId))
    }
  }

  return (
    <div style={{ borderTop: '1px solid var(--color-border, #444)', marginTop: '4px', paddingTop: '4px' }}>
      <div style={rowStyle}>
        <span style={labelStyle}>Lives</span>
        {doc.lives.map(life => {
          const active = life.id === doc.activeLifeId
          return (
            <span
              key={life.id}
              style={tabStyle(active)}
              title={`${life.race} — ${life.builds.length} build(s). Double-click to rename.`}
              onClick={() => { if (!active) apply(d => setActiveBuild(d, life.id, '')) }}
              onDoubleClick={() => handleRenameLife(life.id, life.name)}
            >
              {life.name}
              {active && doc.lives.length > 1 && (
                <span
                  title="Delete this life"
                  style={{ marginLeft: '5px', opacity: 0.6, cursor: 'pointer' }}
                  onClick={e => { e.stopPropagation(); handleDeleteLife(life.id, life.name) }}
                >
                  ×
                </span>
              )}
            </span>
          )
        })}
        <button
          type="button"
          title="Add a new life (fresh level-1 build)"
          onClick={() => apply(addLifeToDocument)}
        >
          + Life
        </button>
      </div>
      <div style={rowStyle}>
        <span style={labelStyle}>Builds</span>
        {(activeLife?.builds ?? []).map(b => {
          const isCurrent = b.id === doc.activeBuildId
          // The stored copy of the active build is stale between edits; show
          // the live values for it.
          const shown = isCurrent ? build : b
          return (
            <span
              key={b.id}
              style={tabStyle(isCurrent)}
              title={`${shown.name} (level ${shown.totalLevel + (shown.epicLevels ?? 0) + (shown.legendaryLevels ?? 0)})`}
              onClick={() => { if (!isCurrent) apply(d => setActiveBuild(d, activeLife!.id, b.id)) }}
            >
              {shown.name}
              {isCurrent && (activeLife?.builds.length ?? 0) > 1 && (
                <span
                  title="Delete this build"
                  style={{ marginLeft: '5px', opacity: 0.6, cursor: 'pointer' }}
                  onClick={e => { e.stopPropagation(); handleDeleteBuild(b.id, shown.name) }}
                >
                  ×
                </span>
              )}
            </span>
          )
        })}
        <button
          type="button"
          title="Add a copy of the current build to this life (level snapshot)"
          onClick={() => apply(d => addBuildToLife(d, d.activeLifeId, findActiveBuild(d)))}
        >
          + Build
        </button>
      </div>
    </div>
  )
}
