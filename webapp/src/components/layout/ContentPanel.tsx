// V2 ContentPane parity (ContentPane.cpp): per-adventure-pack ownership
// toggles. Unchecked packs go into the Character document's contentIDontOwn
// list (V2 Character::SetContentIDontOwn); items from those packs are hidden
// from item-selection lists (ItemSelectDialog.cpp:312-318). The list
// round-trips .DDOBuild files (F4).

import { useEffect, useState } from 'react'
import { api } from '../../api'
import { useDocument } from '../../context/DocumentContext'

export default function ContentPanel() {
  const { doc, setDoc } = useDocument()
  const [packs, setPacks] = useState<string[]>([])
  const [filter, setFilter] = useState('')

  useEffect(() => {
    api.adventurePacks().then(setPacks).catch(() => setPacks([]))
  }, [])

  const dontOwn = new Set(doc.contentIDontOwn ?? [])

  function toggle(pack: string) {
    const next = dontOwn.has(pack)
      ? (doc.contentIDontOwn ?? []).filter(p => p !== pack)
      : [...(doc.contentIDontOwn ?? []), pack]
    setDoc({ ...doc, contentIDontOwn: next })
  }

  function setAll(owned: boolean) {
    setDoc({ ...doc, contentIDontOwn: owned ? [] : [...packs] })
  }

  const visible = packs.filter(p => !filter || p.toLowerCase().includes(filter.toLowerCase()))

  return (
    <div className="panel">
      <div className="panel-header">Content I Own</div>
      <div className="panel-body" style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        <p style={{ fontSize: '12px', opacity: 0.8, margin: 0 }}>
          Untick adventure packs you do not own — their items are hidden from
          gear selection lists. Stored with the character and round-trips V2
          .DDOBuild files.
        </p>
        <div style={{ display: 'flex', gap: '6px', alignItems: 'center', flexWrap: 'wrap' }}>
          <input
            placeholder="Filter packs…"
            value={filter}
            onChange={e => setFilter(e.target.value)}
          />
          <button type="button" onClick={() => setAll(true)}>Own all</button>
          <button type="button" onClick={() => setAll(false)}>Own none</button>
          <span style={{ fontSize: '11px', opacity: 0.7 }}>
            {packs.length - dontOwn.size} of {packs.length} packs owned
          </span>
        </div>
        <div style={{ columnWidth: '260px', maxHeight: '60vh', overflow: 'auto' }}>
          {visible.map(pack => (
            <label key={pack} style={{ display: 'block', fontSize: '12px', padding: '1px 0', breakInside: 'avoid' }}>
              <input
                type="checkbox"
                checked={!dontOwn.has(pack)}
                onChange={() => toggle(pack)}
              />{' '}
              {pack}
            </label>
          ))}
          {visible.length === 0 && <p style={{ fontSize: '12px' }}>No packs match.</p>}
        </div>
      </div>
    </div>
  )
}
