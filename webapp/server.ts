import express from 'express'
import cors from 'cors'
import path from 'path'
import fs from 'fs'
import { glob } from 'glob'
import { XMLParser } from 'fast-xml-parser'
import dotenv from 'dotenv'

dotenv.config()

const app = express()
const PORT = process.env.PORT ? parseInt(process.env.PORT) : 3001
const DATA_DIR = path.resolve(process.env.DATA_FILES_PATH ?? '../Output/DataFiles')

app.use(cors())
app.use(express.json())

// ---------------------------------------------------------------------------
// XML parser config
// ---------------------------------------------------------------------------
const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '',
  textNodeName: '#text',
  allowBooleanAttributes: true,
  parseAttributeValue: true,
  parseTagValue: true,
  trimValues: true,
  isArray: (name) => [
    'Race', 'Class', 'Feat', 'Effect', 'Requirement', 'RequiresOneOf',
    'RequiresNoneOf', 'Group', 'Item', 'EnhancementTree', 'EnhancementTreeItem',
    'EnhancementSelection', 'Selector', 'FeatSlot', 'AutomaticFeats',
    'Feats', 'ClassSkill', 'Alignment', 'Augment', 'Buff', 'ItemAugment',
    'SetBonus', 'Gem', 'Stance', 'Spell', 'Patron', 'Quest', 'GuildBuff',
    'GrantedFeat', 'ClassFeat', 'RacialFeat', 'WeaponGroup', 'OptionalBuff',
  ].includes(name),
})

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function readXml(filePath: string): unknown {
  const xml = fs.readFileSync(filePath, 'utf-8')
  return parser.parse(xml)
}

function parseAmount(raw: unknown): number[] {
  if (raw == null) return []
  if (typeof raw === 'number') return [raw]
  if (typeof raw === 'string') return raw.split(' ').map(Number)
  if (typeof raw === 'object' && raw !== null && '#text' in raw) {
    const text = (raw as Record<string, unknown>)['#text']
    return typeof text === 'string' ? text.split(' ').map(Number) : [Number(text)]
  }
  return []
}

// Simple in-memory cache
const cache = new Map<string, unknown>()

function cached<T>(key: string, loader: () => T): T {
  if (!cache.has(key)) cache.set(key, loader())
  return cache.get(key) as T
}

// ---------------------------------------------------------------------------
// Data loaders
// ---------------------------------------------------------------------------
function loadRaces() {
  const dir = path.join(DATA_DIR, 'Races')
  const files = fs.readdirSync(dir).filter(f => f.endsWith('.race.xml'))
  return files.flatMap(f => {
    try {
      const parsed = readXml(path.join(dir, f)) as { Races?: { Race?: unknown[] } }
      return (parsed?.Races?.Race ?? []) as unknown[]
    } catch { return [] }
  })
}

function loadClasses() {
  const dir = path.join(DATA_DIR, 'Classes')
  const files = fs.readdirSync(dir).filter(f => f.endsWith('.class.xml'))
  return files.flatMap(f => {
    try {
      const parsed = readXml(path.join(dir, f)) as { Classes?: { Class?: unknown[] } }
      return (parsed?.Classes?.Class ?? []) as unknown[]
    } catch { return [] }
  })
}

function loadFeats() {
  try {
    const parsed = readXml(path.join(DATA_DIR, 'Feats.xml')) as { Feats?: { Feat?: unknown[] } }
    return (parsed?.Feats?.Feat ?? []) as unknown[]
  } catch { return [] }
}

function loadEnhancementTrees() {
  const dir = path.join(DATA_DIR, 'EnhancementTrees')
  const files = fs.readdirSync(dir).filter(f => f.endsWith('.tree.xml'))
  return files.flatMap(f => {
    try {
      const parsed = readXml(path.join(dir, f)) as { Enhancements?: { EnhancementTree?: unknown[] } }
      return (parsed?.Enhancements?.EnhancementTree ?? []) as unknown[]
    } catch { return [] }
  })
}

function loadSpells() {
  try {
    const parsed = readXml(path.join(DATA_DIR, 'Spells.xml')) as { Spells?: { Spell?: unknown[] } }
    return (parsed?.Spells?.Spell ?? []) as unknown[]
  } catch { return [] }
}

function loadStances() {
  try {
    const parsed = readXml(path.join(DATA_DIR, 'Stances.xml')) as { Stances?: { Stance?: unknown[] } }
    return (parsed?.Stances?.Stance ?? []) as unknown[]
  } catch { return [] }
}

function loadItems() {
  const dir = path.join(DATA_DIR, 'Items')
  const files = fs.readdirSync(dir).filter(f => f.endsWith('.item'))
  return files.flatMap(f => {
    try {
      const parsed = readXml(path.join(dir, f)) as { Items?: { Item?: unknown[] } }
      const items = parsed?.Items?.Item
      if (!items) return []
      return (Array.isArray(items) ? items : [items]) as unknown[]
    } catch { return [] }
  })
}

function loadAugments() {
  const dir = path.join(DATA_DIR, 'Augments')
  const files = fs.readdirSync(dir).filter(f => f.endsWith('.augments.xml'))
  return files.flatMap(f => {
    try {
      const parsed = readXml(path.join(dir, f)) as { Augments?: { Augment?: unknown[] } }
      return (parsed?.Augments?.Augment ?? []) as unknown[]
    } catch { return [] }
  })
}

function loadSetBonuses() {
  try {
    const parsed = readXml(path.join(DATA_DIR, 'SetBonuses.xml')) as { SetBonuses?: { SetBonus?: unknown[] } }
    return (parsed?.SetBonuses?.SetBonus ?? []) as unknown[]
  } catch { return [] }
}

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', dataDir: DATA_DIR })
})

app.get('/api/races', (_req, res) => {
  res.json(cached('races', loadRaces))
})

app.get('/api/classes', (_req, res) => {
  res.json(cached('classes', loadClasses))
})

app.get('/api/feats', (_req, res) => {
  const feats = cached('feats', loadFeats) as Array<Record<string, unknown>>
  const { group, acquire } = _req.query
  let result = feats
  if (group) result = result.filter(f => {
    const g = f['Group']
    return Array.isArray(g) ? g.includes(group) : g === group
  })
  if (acquire) result = result.filter(f => f['Acquire'] === acquire)
  res.json(result)
})

app.get('/api/enhancements', (_req, res) => {
  res.json(cached('enhancements', loadEnhancementTrees))
})

app.get('/api/spells', (_req, res) => {
  res.json(cached('spells', loadSpells))
})

app.get('/api/stances', (_req, res) => {
  res.json(cached('stances', loadStances))
})

app.get('/api/items', (_req, res) => {
  const items = cached('items', loadItems) as Array<Record<string, unknown>>
  const { slot, minLevel, maxLevel } = _req.query
  let result = items
  if (slot && typeof slot === 'string') result = result.filter(i => {
    const s = i['EquipmentSlot'] as Record<string, unknown> | undefined
    return s && slot in s
  })
  if (minLevel) result = result.filter(i => Number(i['MinLevel'] ?? 0) >= Number(minLevel))
  if (maxLevel) result = result.filter(i => Number(i['MinLevel'] ?? 0) <= Number(maxLevel))
  res.json(result)
})

app.get('/api/augments', (_req, res) => {
  const augments = cached('augments', loadAugments) as Array<Record<string, unknown>>
  const { type } = _req.query
  if (type) {
    res.json(augments.filter(a => a['Type'] === type))
  } else {
    res.json(augments)
  }
})

app.get('/api/item', (_req, res) => {
  const { name } = _req.query
  if (!name || typeof name !== 'string') {
    res.status(400).json({ error: 'name query parameter required' })
    return
  }
  const items = cached('items', loadItems) as Array<Record<string, unknown>>
  const found = items.find(i => i['Name'] === name)
  res.json(found ?? null)
})

app.get('/api/setbonuses', (_req, res) => {
  res.json(cached('setbonuses', loadSetBonuses))
})

// Serve React build in production
if (process.env.NODE_ENV === 'production') {
  app.use(express.static(path.join(__dirname, 'dist')))
  app.get('*', (_req, res) => {
    res.sendFile(path.join(__dirname, 'dist', 'index.html'))
  })
}

app.listen(PORT, () => {
  console.log(`DDO Builder API running on http://localhost:${PORT}`)
  console.log(`Data directory: ${DATA_DIR}`)
})

export default app
