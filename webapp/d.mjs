import { XMLParser } from 'fast-xml-parser'
import fs from 'fs'
const parser = new XMLParser({ ignoreAttributes:false, attributeNamePrefix:'', textNodeName:'#text', allowBooleanAttributes:true, parseAttributeValue:true, parseTagValue:true, trimValues:true, isArray:n=>['Spell','SpellDC','SpellDamage','Effect','ModAbility'].includes(n) })
const data = parser.parse(fs.readFileSync('../Output/DataFiles/Spells.xml','utf-8'))
const spells = data.Spells.Spell
// find DCs with CastingStatMod, ModAbility, Amount
let cs=0, ma=0, amt=0, multiSchool=0
for(const s of spells){
  for(const dc of (s.SpellDC||[])){
    if('CastingStatMod' in dc) cs++
    if(dc.ModAbility) ma++
    if('Amount' in dc) amt++
    if(Array.isArray(dc.School)) multiSchool++
  }
}
console.log('CastingStatMod present:',cs,'ModAbility:',ma,'Amount:',amt,'multiSchoolDC:',multiSchool)
// show a ModAbility example
const ex = spells.find(s=>(s.SpellDC||[]).some(d=>d.ModAbility))
console.log('ModAbility example DC:', JSON.stringify(ex?.SpellDC?.find(d=>d.ModAbility)))
const exa = spells.find(s=>(s.SpellDC||[]).some(d=>'Amount' in d))
console.log('Amount example DC:', JSON.stringify(exa?.SpellDC?.find(d=>'Amount' in d)))
