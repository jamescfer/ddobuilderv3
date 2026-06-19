// V2 LogPane parity: displays a session-only log of significant build actions.
// Matches V2's CLogPane: timestamped list, Clear button, Copy-to-clipboard button.

import React, { useRef } from 'react'
import { useBuildLog } from '../../context/BuildLogContext'

function formatTimestamp(iso: string): string {
  const d = new Date(iso)
  const hh = d.getHours().toString().padStart(2, '0')
  const mm = d.getMinutes().toString().padStart(2, '0')
  const ss = d.getSeconds().toString().padStart(2, '0')
  return `${hh}:${mm}:${ss}`
}

export default function BuildHistoryPanel() {
  const { entries, clearLog } = useBuildLog()
  const listRef = useRef<HTMLDivElement>(null)

  function copyToClipboard() {
    const text = [...entries]
      .reverse()
      .map(e => `[${formatTimestamp(e.timestamp)}] ${e.message}`)
      .join('\n')
    navigator.clipboard.writeText(text).catch(() => {
      // Fallback for environments without clipboard API
      const ta = document.createElement('textarea')
      ta.value = text
      document.body.appendChild(ta)
      ta.select()
      document.execCommand('copy')
      document.body.removeChild(ta)
    })
  }

  const reversed = [...entries].reverse()

  return (
    <div className="panel">
      <div className="panel-header" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <span style={{ flex: 1 }}>Build Log</span>
        <button
          type="button"
          title="Copy log to clipboard (V2 Edit → Copy Log to Clipboard)"
          style={{ fontSize: '11px', padding: '1px 6px' }}
          onClick={copyToClipboard}
          disabled={entries.length === 0}
        >
          Copy
        </button>
        <button
          type="button"
          title="Clear log (V2 Edit → Clear Log)"
          style={{ fontSize: '11px', padding: '1px 6px' }}
          onClick={clearLog}
          disabled={entries.length === 0}
        >
          Clear
        </button>
      </div>
      <div
        ref={listRef}
        className="panel-body"
        style={{ fontFamily: 'monospace', fontSize: '12px', lineHeight: '1.5', overflowY: 'auto' }}
      >
        {reversed.length === 0 ? (
          <div style={{ color: 'var(--color-muted, #888)', padding: '4px 0' }}>
            No actions logged yet. Make a change to see entries here.
          </div>
        ) : (
          reversed.map((entry, i) => (
            <div
              key={i}
              style={{
                padding: '1px 0',
                borderBottom: '1px solid var(--color-border-faint, #2a2a33)',
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
              }}
            >
              <span style={{ color: 'var(--color-muted, #888)', marginRight: '6px' }}>
                [{formatTimestamp(entry.timestamp)}]
              </span>
              {entry.message}
            </div>
          ))
        )}
      </div>
    </div>
  )
}
