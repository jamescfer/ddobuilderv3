import { XMLParser } from 'fast-xml-parser'
import fs from 'fs'
const parser = new XMLParser({ ignoreAttributes:false, attributeNamePrefix:'', textNodeName:'#text', allowBooleanAttributes:true, parseAttributeValue:true, parseTagValue:true, trimValues:true, isArray:n=>['Spell','SpellDC','SpellDamage','Effect'].includes(n) })
const data = parser.parse(fs.readFileSync('../Output/DataFiles/Spells.xml','utf-8'))
const spells = data.Spells.Spell
// How is spell level stored? Look for <Level> anywhere
const withLevel = spells.filter(s=>s.Level!==undefined)
console.log('spells total:', spells.length, 'with Level field:', withLevel.length)
console.log('sample Level values:', withLevel.slice(0,3).map(s=>({n:s.Name, L:s.Level})))
// check how class/level association exists
console.log('Fireball full:', JSON.stringify(spells.find(s=>/Fireball/.test(s.Name)),null,1).slice(0,600))
