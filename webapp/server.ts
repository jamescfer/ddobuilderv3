import express from 'express'
import cors from 'cors'
import path from 'path'
import fs from 'fs'
import { exec } from 'child_process'
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
    'ClassSkill', 'Alignment', 'Augment', 'Buff', 'ItemAugment',
    'SetBonus', 'Gem', 'Stance', 'Spell', 'Patron', 'Quest', 'GuildBuff',
    'GrantedFeat', 'ClassFeat', 'RacialFeat', 'WeaponGroup', 'OptionalBuff',
    'Filigree',
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
  const out: unknown[] = []
  // Standard feats
  try {
    const parsed = readXml(path.join(DATA_DIR, 'Feats.xml')) as { Feats?: { Feat?: unknown[] } }
    const feats = parsed?.Feats?.Feat ?? []
    out.push(...(Array.isArray(feats) ? feats : [feats]))
  } catch { /* no Feats.xml */ }
  // Class-defined feats (Epic Destiny feats live in Epic.class.xml / Legendary.class.xml etc.)
  const classDir = path.join(DATA_DIR, 'Classes')
  try {
    const classFiles = fs.readdirSync(classDir).filter(f => f.endsWith('.class.xml'))
    for (const f of classFiles) {
      try {
        const parsed = readXml(path.join(classDir, f)) as { Classes?: { Class?: unknown } }
        const classes = parsed?.Classes?.Class
        const classList = Array.isArray(classes) ? classes : classes ? [classes] : []
        for (const cls of classList) {
          const classFeats = (cls as Record<string, unknown>)?.Feat
          if (!classFeats) continue
          const list = Array.isArray(classFeats) ? classFeats : [classFeats]
          out.push(...list)
        }
      } catch { /* skip bad file */ }
    }
  } catch { /* no Classes dir */ }
  return out
}

function loadEnhancementTrees() {
  const dir = path.join(DATA_DIR, 'EnhancementTrees')
  const files = fs.readdirSync(dir).filter(f => f.endsWith('.tree.xml'))
  return files.flatMap(f => {
    try {
      const parsed = readXml(path.join(dir, f)) as { Enhancements?: { EnhancementTree?: unknown[] } }
      const trees = (parsed?.Enhancements?.EnhancementTree ?? []) as Record<string, unknown>[]
      // fast-xml-parser represents self-closing empty tags like <IsReaperTree/> as ""
      // Normalize these to explicit booleans so client-side filtering is unambiguous
      return trees.map(tree => ({
        ...tree,
        IsReaperTree: 'IsReaperTree' in tree ? true : undefined,
        IsEpicDestiny: 'IsEpicDestiny' in tree ? true : undefined,
        IsRacialTree: 'IsRacialTree' in tree ? true : undefined,
      }))
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

function loadGuildBuffs() {
  try {
    const parsed = readXml(path.join(DATA_DIR, 'GuildBuffs.xml')) as { GuildBuffs?: { GuildBuff?: unknown[] } }
    return (parsed?.GuildBuffs?.GuildBuff ?? []) as unknown[]
  } catch { return [] }
}

function loadFiligreeSets() {
  const dir = path.join(DATA_DIR, 'FiligreeSets')
  const files = fs.readdirSync(dir).filter(f => f.endsWith('.Filigree.xml'))
  return files.flatMap(f => {
    try {
      const parsed = readXml(path.join(dir, f)) as { Filigrees?: { Filigree?: unknown[] } }
      return (parsed?.Filigrees?.Filigree ?? []) as unknown[]
    } catch { return [] }
  })
}

function loadFiligreeBonuses() {
  const dir = path.join(DATA_DIR, 'FiligreeSets')
  const files = fs.readdirSync(dir).filter(f => f.endsWith('.Filigree.xml'))
  return files.flatMap(f => {
    try {
      const parsed = readXml(path.join(dir, f)) as { Filigrees?: { SetBonus?: unknown[] } }
      return (parsed?.Filigrees?.SetBonus ?? []) as unknown[]
    } catch { return [] }
  })
}

function loadSelfAndPartyBuffs() {
  try {
    const parsed = readXml(path.join(DATA_DIR, 'SelfAndPartyBuffs.xml')) as { SelfAndPartyBuffs?: { OptionalBuff?: unknown[] } }
    return (parsed?.SelfAndPartyBuffs?.OptionalBuff ?? []) as unknown[]
  } catch { return [] }
}

function loadPatrons() {
  try {
    const parsed = readXml(path.join(DATA_DIR, 'Patrons.xml')) as { Patrons?: { Patron?: unknown[] } }
    return (parsed?.Patrons?.Patron ?? []) as unknown[]
  } catch { return [] }
}

function loadQuests() {
  try {
    const parsed = readXml(path.join(DATA_DIR, 'Quests.xml')) as { Quests?: { Quest?: unknown[] } }
    return (parsed?.Quests?.Quest ?? []) as unknown[]
  } catch { return [] }
}

function loadSentientGems() {
  try {
    const parsed = readXml(path.join(DATA_DIR, 'Sentient.gems.xml')) as { SentientGems?: { Gem?: unknown[] } }
    return (parsed?.SentientGems?.Gem ?? []) as unknown[]
  } catch { return [] }
}

function loadItemBuffs() {
  try {
    const parsed = readXml(path.join(DATA_DIR, 'ItemBuffs.xml')) as { Buffs?: { Buff?: unknown[] } }
    return (parsed?.Buffs?.Buff ?? []) as unknown[]
  } catch { return [] }
}

function loadWeaponGroups() {
  try {
    const parsed = readXml(path.join(DATA_DIR, 'WeaponGroupings.xml')) as { WeaponGroupings?: { WeaponGroup?: unknown[] } }
    return (parsed?.WeaponGroupings?.WeaponGroup ?? []) as unknown[]
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

app.get('/api/item-setbonuses', (req, res) => {
  const { names } = req.query
  if (!names || typeof names !== 'string') {
    res.json([])
    return
  }
  const nameList = names.split(',').map(n => n.trim()).filter(Boolean)
  if (nameList.length === 0) {
    res.json([])
    return
  }
  const items = cached('items', loadItems) as Array<Record<string, unknown>>
  // Collect set bonus type counts from matching items
  const counts = new Map<string, number>()
  for (const name of nameList) {
    const item = items.find(i => i['Name'] === name)
    if (!item) continue
    const sb = item['SetBonus']
    if (!sb) continue
    const sbList = Array.isArray(sb) ? sb : [sb]
    for (const type of sbList) {
      if (typeof type === 'string') {
        counts.set(type, (counts.get(type) ?? 0) + 1)
      }
    }
  }
  const result = Array.from(counts.entries()).map(([type, count]) => ({ type, count }))
  res.json(result)
})

app.get('/api/guildbuffs', (_req, res) => {
  res.json(cached('guildbuffs', loadGuildBuffs))
})

app.get('/api/filigree', (_req, res) => {
  res.json(cached('filigree', loadFiligreeSets))
})

app.get('/api/filigree-bonuses', (_req, res) => {
  res.json(cached('filigree-bonuses', loadFiligreeBonuses))
})

app.get('/api/selfbuffs', (_req, res) => {
  res.json(cached('selfbuffs', loadSelfAndPartyBuffs))
})

app.get('/api/patrons', (_req, res) => res.json(cached('patrons', loadPatrons)))
app.get('/api/quests', (_req, res) => res.json(cached('quests', loadQuests)))
app.get('/api/gems', (_req, res) => res.json(cached('gems', loadSentientGems)))
app.get('/api/itembuffs', (_req, res) => res.json(cached('itembuffs', loadItemBuffs)))
app.get('/api/weapongroups', (_req, res) => res.json(cached('weapongroups', loadWeaponGroups)))

// ---------------------------------------------------------------------------
// Auto-update routes
// ---------------------------------------------------------------------------

const REPO_DIR = path.resolve(__dirname, '..', '..') // project root

function runGit(args: string): Promise<string> {
  return new Promise((resolve, reject) => {
    exec(`git -C "${REPO_DIR}" ${args}`, (err, stdout, stderr) => {
      if (err) reject(stderr || err.message)
      else resolve(stdout.trim())
    })
  })
}

app.get('/api/update/check', async (_req, res) => {
  try {
    const branch = await runGit('rev-parse --abbrev-ref HEAD')
    await runGit(`fetch origin ${branch}`)
    const behind = await runGit(`rev-list HEAD..origin/${branch} --count`)
    const count = parseInt(behind, 10) || 0
    if (count === 0) {
      res.json({ upToDate: true, commits: [] })
      return
    }
    const log = await runGit(`log HEAD..origin/${branch} --oneline`)
    const commits = log.split('\n').filter(Boolean)
    res.json({ upToDate: false, commits })
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

app.post('/api/update/apply', async (_req, res) => {
  res.json({ started: true })
  try {
    const branch = await runGit('rev-parse --abbrev-ref HEAD')
    exec(
      `git -C "${REPO_DIR}" pull origin ${branch} && cd "${path.join(REPO_DIR, 'webapp')}" && npm run build`,
      (err, _stdout, stderr) => {
        if (err) {
          console.error('Update failed:', stderr)
        } else {
          console.log('Update complete — restarting…')
          setTimeout(() => process.exit(0), 500)
        }
      }
    )
  } catch (err) {
    console.error('Update apply failed:', err)
  }
})

// ---------------------------------------------------------------------------
// Auto-update cron (every 15 minutes)
// ---------------------------------------------------------------------------
function scheduleAutoUpdate() {
  setInterval(async () => {
    try {
      const branch = await runGit('rev-parse --abbrev-ref HEAD')
      await runGit(`fetch origin ${branch}`)
      const behind = await runGit(`rev-list HEAD..origin/${branch} --count`)
      const count = parseInt(behind, 10) || 0
      if (count > 0) {
        console.log(`[auto-update] ${count} commit(s) behind — pulling and rebuilding…`)
        exec(
          `git -C "${REPO_DIR}" pull origin ${branch} && cd "${path.join(REPO_DIR, 'webapp')}" && npm run build`,
          (err, _stdout, stderr) => {
            if (err) console.error('[auto-update] failed:', stderr)
            else { console.log('[auto-update] done — restarting…'); setTimeout(() => process.exit(0), 500) }
          }
        )
      }
    } catch { /* network error or not a git repo — ignore */ }
  }, 15 * 60 * 1000)
}

if (process.env.NODE_ENV === 'production') {
  scheduleAutoUpdate()
}

// Serve image assets from the DDO data directory
const IMAGE_DIRS = ['FeatImages', 'EnhancementImages', 'ClassImages', 'UIImages', 'AugmentImages', 'FiligreeImages', 'ItemImages', 'SetBonusImages', 'SpellImages', 'SentientGemImages']
for (const dir of IMAGE_DIRS) {
  const imgPath = path.join(DATA_DIR, dir)
  if (fs.existsSync(imgPath)) {
    app.use(`/images/${dir}`, express.static(imgPath))
  }
}

// Flat ItemImages lookup: /images/ItemImages/<name>.png searches all subdirectories
const itemImagesDir = path.join(DATA_DIR, 'ItemImages')
if (fs.existsSync(itemImagesDir)) {
  const itemImageSubdirs = fs.readdirSync(itemImagesDir)
    .filter(d => fs.statSync(path.join(itemImagesDir, d)).isDirectory())
  app.get('/images/ItemImages/:name', (req, res, next) => {
    const name = req.params.name
    for (const sub of itemImageSubdirs) {
      const fp = path.join(itemImagesDir, sub, name)
      if (fs.existsSync(fp)) return res.sendFile(fp)
    }
    next()
  })
}

// Serve React build in production
if (process.env.NODE_ENV === 'production') {
  app.use(express.static(path.join(__dirname, '..', 'dist')))
  app.get('*', (_req, res) => {
    res.sendFile(path.join(__dirname, '..', 'dist', 'index.html'))
  })
}

app.listen(PORT, () => {
  console.log(`DDO Builder API running on http://localhost:${PORT}`)
  console.log(`Data directory: ${DATA_DIR}`)
})

export default app
