import { XMLParser } from 'fast-xml-parser'
import fs from 'fs'
const parser = new XMLParser({ ignoreAttributes:false, attributeNamePrefix:'', textNodeName:'#text', allowBooleanAttributes:true, parseAttributeValue:true, parseTagValue:true, trimValues:true, isArray:n=>['Spell','SpellDC','SpellDamage','Effect'].includes(n) })
const data = parser.parse(fs.readFileSync('../Output/DataFiles/Spells.xml','utf-8'))
const spells = data.Spells.Spell
const f = spells.find(s=>s.Name && /Fireball/.test(s.Name))
console.log('Fireball Empower:', JSON.stringify(f?.Empower), 'Maximize:', JSON.stringify(f?.Maximize), 'Heighten:', JSON.stringify(f?.Heighten))
console.log('keys with metamagic:', Object.keys(f||{}).filter(k=>['Empower','Maximize','Heighten','Quicken','Enlarge','Embolden','Extend','Intensify','Accelerate','EmpowerHealing'].includes(k)))
console.log('SpellDC:', JSON.stringify(f?.SpellDC))
console.log('School:', JSON.stringify(f?.School), 'Level:', JSON.stringify(f?.Level))
