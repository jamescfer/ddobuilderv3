import express from 'express'
import cors from 'cors'
import path from 'path'
import fs from 'fs'
import { exec } from 'child_process'
import dotenv from 'dotenv'
import {
  loadRaces, loadClasses, loadFeats, loadEnhancementTrees, loadSpells,
  loadWeaponGroups, loadStances, loadItems, loadAugments, loadSetBonuses,
  loadGuildBuffs, loadFiligreeSets, loadFiligreeBonuses, loadSelfAndPartyBuffs,
  loadPatrons, loadQuests, loadSentientGems,
} from './src/server/dataLoaders'

dotenv.config()

const app = express()
const PORT = process.env.PORT ? parseInt(process.env.PORT) : 3001
const DATA_DIR = path.resolve(process.env.DATA_FILES_PATH ?? '../Output/DataFiles')

app.use(cors())
app.use(express.json())

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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
// Data loader thunks (each closes over DATA_DIR so the shared module remains
// stateless and pure functions of dataDir).
// ---------------------------------------------------------------------------
const races = () => loadRaces(DATA_DIR)
const classes = () => loadClasses(DATA_DIR)
const feats = () => loadFeats(DATA_DIR)
const enhancementTrees = () => loadEnhancementTrees(DATA_DIR)
const spells = () => loadSpells(DATA_DIR)
const weaponGroups = () => loadWeaponGroups(DATA_DIR)
const stances = () => loadStances(DATA_DIR)
const items = () => loadItems(DATA_DIR)
const augments = () => loadAugments(DATA_DIR)
const setBonusesData = () => loadSetBonuses(DATA_DIR)
const guildBuffs = () => loadGuildBuffs(DATA_DIR)
const filigreeSets = () => loadFiligreeSets(DATA_DIR)
const filigreeBonuses = () => loadFiligreeBonuses(DATA_DIR)
const selfAndPartyBuffs = () => loadSelfAndPartyBuffs(DATA_DIR)
const patrons = () => loadPatrons(DATA_DIR)
const quests = () => loadQuests(DATA_DIR)
const sentientGems = () => loadSentientGems(DATA_DIR)

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', dataDir: DATA_DIR })
})

app.get('/api/version', (_req, res) => {
  let version = 'unknown'
  try {
    version = fs.readFileSync(path.resolve(__dirname, '..', 'VERSION'), 'utf-8').trim()
  } catch { /* fall through */ }
  res.json({ version })
})

app.get('/api/races', (_req, res) => {
  res.json(cached('races', races))
})

app.get('/api/classes', (_req, res) => {
  res.json(cached('classes', classes))
})

app.get('/api/feats', (_req, res) => {
  const allFeats = cached('feats', feats) as unknown as Array<Record<string, unknown>>
  const { group, acquire } = _req.query
  let result = allFeats
  if (group) result = result.filter(f => {
    const g = f['Group']
    return Array.isArray(g) ? g.includes(group) : g === group
  })
  if (acquire) result = result.filter(f => f['Acquire'] === acquire)
  res.json(result)
})

app.get('/api/enhancements', (_req, res) => {
  res.json(cached('enhancements', enhancementTrees))
})

app.get('/api/spells', (_req, res) => {
  res.json(cached('spells', spells))
})

app.get('/api/stances', (_req, res) => {
  res.json(cached('stances', stances))
})

app.get('/api/weapongroups', (_req, res) => {
  res.json(cached('weapongroups', weaponGroups))
})

app.get('/api/items', (_req, res) => {
  const allItems = cached('items', items) as unknown as Array<Record<string, unknown>>
  const { slot, minLevel, maxLevel } = _req.query
  let result = allItems
  if (slot && typeof slot === 'string') result = result.filter(i => {
    const s = i['EquipmentSlot'] as Record<string, unknown> | undefined
    return s && slot in s
  })
  if (minLevel) result = result.filter(i => Number(i['MinLevel'] ?? 0) >= Number(minLevel))
  if (maxLevel) result = result.filter(i => Number(i['MinLevel'] ?? 0) <= Number(maxLevel))
  res.json(result)
})

app.get('/api/augments', (_req, res) => {
  const allAugments = cached('augments', augments) as unknown as Array<Record<string, unknown>>
  const { type } = _req.query
  if (type) {
    res.json(allAugments.filter(a => a['Type'] === type))
  } else {
    res.json(allAugments)
  }
})

app.get('/api/item', (_req, res) => {
  const { name } = _req.query
  if (!name || typeof name !== 'string') {
    res.status(400).json({ error: 'name query parameter required' })
    return
  }
  const allItems = cached('items', items) as unknown as Array<Record<string, unknown>>
  const found = allItems.find(i => i['Name'] === name)
  res.json(found ?? null)
})

app.get('/api/setbonuses', (_req, res) => {
  res.json(cached('setbonuses', setBonusesData))
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
  const allItems = cached('items', items) as unknown as Array<Record<string, unknown>>
  // Collect set bonus type counts from matching items
  const counts = new Map<string, number>()
  for (const name of nameList) {
    const item = allItems.find(i => i['Name'] === name)
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
  res.json(cached('guildbuffs', guildBuffs))
})

app.get('/api/filigree', (_req, res) => {
  res.json(cached('filigree', filigreeSets))
})

app.get('/api/filigree-bonuses', (_req, res) => {
  res.json(cached('filigree-bonuses', filigreeBonuses))
})

app.get('/api/selfbuffs', (_req, res) => {
  res.json(cached('selfbuffs', selfAndPartyBuffs))
})

app.get('/api/patrons', (_req, res) => res.json(cached('patrons', patrons)))
app.get('/api/quests', (_req, res) => res.json(cached('quests', quests)))
app.get('/api/gems', (_req, res) => res.json(cached('gems', sentientGems)))

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
