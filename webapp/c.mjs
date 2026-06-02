import { XMLParser } from 'fast-xml-parser'
import fs from 'fs'
const parser = new XMLParser({ ignoreAttributes:false, attributeNamePrefix:'', textNodeName:'#text', allowBooleanAttributes:true, parseAttributeValue:true, parseTagValue:true, trimValues:true, isArray:n=>['Class','ClassSpell'].includes(n) })
const data = parser.parse(fs.readFileSync('../Output/DataFiles/Classes/Wizard.class.xml','utf-8'))
const cls = data.Classes.Class[0]
console.log('keys:', Object.keys(cls).filter(k=>/spell|Spell/i.test(k)))
console.log('ClassSpell count:', Array.isArray(cls.ClassSpell)?cls.ClassSpell.length:typeof cls.ClassSpell)
console.log('sample:', JSON.stringify(cls.ClassSpell?.[0]))
