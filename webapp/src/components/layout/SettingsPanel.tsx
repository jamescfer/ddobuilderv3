// V2 Settings menu parity panel. The four behaviour toggles V2 keeps in the
// registry, plus management of the ignore list (V2 IgnoredList.xml + user
// edits). V2-only desktop settings (Lamannia data dir, DPI scaling, MFC
// theme, log level, file associations) are not applicable to the webapp.

import { useState } from 'react'
import { useSettings } from '../../context/SettingsContext'

export default function SettingsPanel() {
  const { settings, update, ignoredSet, toggleIgnored } = useSettings()
  const [newIgnored, setNewIgnored] = useState('')

  const toggles: Array<{ key: 'showEpicOnly' | 'showUnavailable' | 'ignoreListActive' | 'autoSelectSingleOption' | 'autoSave'; label: string; help: string }> = [
    {
      key: 'showEpicOnly',
      label: 'Show only Epic feats for Epic feat slots',
      help: 'Epic feat slots hide heroic (Standard-group) feats that could otherwise be re-taken.',
    },
    {
      key: 'showUnavailable',
      label: 'Show Unavailable Feats',
      help: 'Selection lists include feats whose requirements are not met (and ignore-listed feats).',
    },
    {
      key: 'ignoreListActive',
      label: 'Ignore Lists Active',
      help: 'Hide ignore-listed feats/items from selection lists.',
    },
    {
      key: 'autoSave',
      label: 'Auto-save',
      help: 'Save the current character automatically shortly after every change.',
    },
    {
      key: 'autoSelectSingleOption',
      label: 'Auto Select Single Option Enhancements',
      help: 'Buying an enhancement whose selector has exactly one option picks it automatically.',
    },
  ]

  const ignored = [...ignoredSet].sort()

  return (
    <div className="panel">
      <div className="panel-header">Settings</div>
      <div className="panel-body" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        {toggles.map(t => (
          <label key={t.key} style={{ display: 'flex', gap: '8px', alignItems: 'baseline' }}>
            <input
              type="checkbox"
              checked={settings[t.key]}
              onChange={e => update({ [t.key]: e.target.checked })}
            />
            <span>
              {t.label}
              <div style={{ fontSize: '11px', opacity: 0.7 }}>{t.help}</div>
            </span>
          </label>
        ))}

        <div>
          <strong>Ignore list</strong> ({ignored.length} entries)
          <div style={{ display: 'flex', gap: '6px', margin: '6px 0' }}>
            <input
              placeholder="Add a feat/item name to ignore…"
              value={newIgnored}
              onChange={e => setNewIgnored(e.target.value)}
            />
            <button
              type="button"
              disabled={!newIgnored.trim()}
              onClick={() => { toggleIgnored(newIgnored.trim()); setNewIgnored('') }}
            >
              Add
            </button>
          </div>
          <div style={{ maxHeight: '240px', overflow: 'auto', fontSize: '12px' }}>
            {ignored.map(name => (
              <div key={name} style={{ display: 'flex', justifyContent: 'space-between', gap: '8px', padding: '1px 0' }}>
                <span>{name}</span>
                <button type="button" title="Remove from ignore list" onClick={() => toggleIgnored(name)}>×</button>
              </div>
            ))}
          </div>
        </div>

        <div style={{ fontSize: '11px', opacity: 0.6 }}>
          V2 desktop-only settings (Lamannia data directory, DPI scaling, window
          theme, log level, file associations) have no webapp equivalent.
        </div>
      </div>
    </div>
  )
}
