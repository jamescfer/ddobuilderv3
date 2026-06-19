// V2 LogPane parity: runtime-only session log of significant build actions.
// Not persisted to localStorage or .DDOBuild — cleared on page refresh, matching V2.

import React, { createContext, useCallback, useContext, useState } from 'react'
import type { LogEntry } from '../lib/buildLog'
import { actionToLogMessage, makeLogEntry } from '../lib/buildLog'

interface BuildLogContextValue {
  entries: LogEntry[]
  addLog: (message: string) => void
  clearLog: () => void
  /** Intercepts an action before it's dispatched, logging it if appropriate. */
  logAction: (action: { type: string; [k: string]: unknown }) => void
}

const BuildLogContext = createContext<BuildLogContextValue>({
  entries: [],
  addLog: () => {},
  clearLog: () => {},
  logAction: () => {},
})

export function BuildLogProvider({ children }: { children: React.ReactNode }) {
  const [entries, setEntries] = useState<LogEntry[]>([])

  const addLog = useCallback((message: string) => {
    setEntries(prev => [...prev, makeLogEntry(message)])
  }, [])

  const clearLog = useCallback(() => setEntries([]), [])

  const logAction = useCallback((action: { type: string; [k: string]: unknown }) => {
    const msg = actionToLogMessage(action as never)
    if (msg) setEntries(prev => [...prev, makeLogEntry(msg)])
  }, [])

  return (
    <BuildLogContext.Provider value={{ entries, addLog, clearLog, logAction }}>
      {children}
    </BuildLogContext.Provider>
  )
}

export function useBuildLog() {
  return useContext(BuildLogContext)
}
