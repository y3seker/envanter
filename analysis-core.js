import { workbookValues, assertComplete, MOTIVATION_SKIP_REASON } from './core.js';
import { readWorkbook, expandedFormulas } from './workbook-reader.js';
import { setCell } from './excel.js';

export async function evaluationSurvey(survey,bytes) {
 const book=await readWorkbook(bytes), formulas={};
 if(book.sheets.length!==9||book.sheets[0].name!=='Giriş') throw Error('Orijinal 9 sayfalı Envanterler-Uygulama şablonunu seç.');
 for(const section of survey.sections) {
  const source=book.sheets[section.sheet-1], target=book.sheets[section.evaluationSheet-1];
  if(source.name!==section.sheetName||target.name!==section.evaluationSheetName) throw Error('Envanter şablonunun sayfa düzeni beklenenden farklı.');
  for(const q of section.questions) {
   if(source.cells[q.cell]?.value!=null) throw Error('Değerlendirme şablonu dolu. Maildeki boş Envanterler-Uygulama dosyasını seç.');
   const row=q.evaluationCell.match(/\d+$/)[0];
   if(parseInt(target.cells[`A${row}`]?.value)!==q.number) throw Error('Şablonun soru/hücre eşlemesi farklı.');
  }
  formulas[section.evaluationSheet]=expandedFormulas(target.cells);
 }
 if(Object.values(formulas).reduce((n,f)=>n+Object.keys(f).length,0)!==143) throw Error('Şablondaki değerlendirme formülleri beklenenden farklı.');
 return {...survey,formulas};
}
export function participantKey(state) {
 return [state.profile.name,state.profile.title].map(s=>s.normalize('NFC').trim().replace(/\s+/g,' ').toLocaleLowerCase('tr-TR')).join('\u0000');
}
export function teamRecord(survey,state,colorOverride='') {
 const s=workbookValues(survey,state);
 const d=s[5].G17,ind=s[5].H17,p=s[5].J17,t=s[5].K17;
 // Quadrants in the supplied behavior map. Ties remain visible rather than
 // arbitrarily assigning a personality/color to a participant.
 const areas=[['Mavi',ind*t],['Kırmızı',d*t],['Sarı',d*p],['Yeşil',ind*p]];
 const max=Math.max(...areas.map(x=>x[1]));
 const color=colorOverride.trim()||areas.filter(x=>x[1]===max).map(x=>x[0]).join(' / ');
 return [state.profile.name.trim(),state.profile.title.trim(),color,d,ind,p,t,s[3].E3,s[3].E5,s[3].E6,s[3].E4,s[3].E7,s[7].K6,s[7].K5,s[7].K7,s[7].K4,s[7].K8,s[9].F30];
}
export async function validateTeamTemplate(bytes) {
 const book=await readWorkbook(bytes),s=book.sheets[0];
 if(book.sheets.length!==1||s.name!=='Genel Data'||s.cells.A14?.value!=='ORTALAMA'||s.cells.A16?.value!=='Benim Profilim') throw Error('Maildeki boş EkipAnalizi.xlsx şablonunu seç.');
 const expected={A2:'İsim',B2:'Ünvan',C2:'Renk',D2:'Direkt',E2:'İndirekt',H2:'Güvenli',I2:'Agresif',J2:'Pasif-Agresif',K2:'Pasif',M2:'İlişki',N2:'Etkileme',O2:'Güvenlik',P2:'Başarı'};
 for(const [ref,label] of Object.entries(expected)) if(s.cells[ref]?.value!==label) throw Error('Ekip şablonunun sütunları beklenenden farklı.');
 for(let r=4;r<=13;r++) for(let c=0;c<18;c++) if(s.cells[`${String.fromCharCode(65+c)}${r}`]?.value!=null) throw Error('Ekip şablonu dolu; maildeki boş şablonu seç.');
 return book;
}
export async function createTeamWorkbook(survey,participants,template,leader=null) {
 if(!participants.length) throw Error('Önce en az bir ekip üyesi yükle.');
 if(participants.length>200) throw Error('Tek seferde en fazla 200 ekip üyesi desteklenir.');
 const keys=new Set();
 for(const p of participants) {
  assertComplete(survey,p.state);const key=participantKey(p.state);
  if(keys.has(key)) throw Error('Aynı kişi ekip listesinde birden fazla kez yer alıyor.');keys.add(key);
 }
 if(leader&&keys.has(participantKey(leader.state))) throw Error('Yönetici profili ekip listesinde de bulunuyor; ekipten kaldır.');
 const book=await validateTeamTemplate(template),sheet=book.sheets[0];
 const records=participants.map(p=>teamRecord(survey,p.state,p.color));
 const extra=Math.max(0,records.length-10), averageRow=14+extra, profileRow=16+extra;
 let xml=sheet.xml;
 const row13=/<row\b[^>]*\br="13"[^>]*>[\s\S]*?<\/row>/.exec(xml)[0];
 const shiftRef=ref=>ref.replace(/(\$?[A-Z]+\$?)(\d+)/g,(_,c,r)=>c+(Number(r)>=14?Number(r)+extra:r));
 if(extra) {
  xml=xml.replace(/(<row\b[^>]*\br=")(\d+)(")/g,(_,a,r,b)=>a+(Number(r)>=14?Number(r)+extra:r)+b);
  xml=xml.replace(/\b(r|ref|sqref|activeCell)="([^"]*)"/g,(_,attr,ref)=>`${attr}="${shiftRef(ref)}"`);
  const added=Array.from({length:extra},(_,i)=>row13.replace(/(\br="(?:[A-Z]+)?)(13)(")/g,(_,a,r,b)=>`${a}${14+i}${b}`)).join('');
  xml=xml.replace(`</row><row r="${averageRow}"`, `</row>${added}<row r="${averageRow}"`);
 }
 for(const [i,row] of records.entries()) for(const [c,value] of row.entries()) xml=setCell(xml,`${String.fromCharCode(65+c)}${4+i}`,value);
 for(let c=3;c<18;c++) {
  const col=String.fromCharCode(65+c), values=records.map(row=>row[c]).filter(value=>value!==null);
  const mean=values.length ? values.reduce((n,value)=>n+value,0)/values.length : '';
  const range=`${col}4:${col}${3+records.length}`;
  const formula=values.length===records.length ? `AVERAGE(${range})` : `IF(COUNT(${range})=0,"",AVERAGE(${range}))`;
  xml=setCell(xml,`${col}${averageRow}`,mean,formula);
 }
 if(leader) {
  const record=teamRecord(survey,leader.state,leader.color);
  for(let c=2;c<18;c++) xml=setCell(xml,`${String.fromCharCode(65+c)}${profileRow}`,record[c]);
  xml=setCell(xml,`A${profileRow+1}`,`${record[0]} · ${record[1]}`);
 }
 if (participants.some(p=>p.state.motivationSkipped) || leader?.state.motivationSkipped) {
  xml=setCell(xml,'S1','Katılım');xml=setCell(xml,'S2','Motivasyon durumu');
  for (const [i,p] of participants.entries()) xml=setCell(xml,`S${i+4}`,p.state.motivationSkipped ? MOTIVATION_SKIP_REASON : 'Yanıtlandı');
  const included=records.filter(row=>row[16]!==null).length;
  xml=setCell(xml,`S${averageRow}`,`Motivasyon ortalaması: ${included}/${records.length} kişi`);
  if(leader) xml=setCell(xml,`S${profileRow}`,leader.state.motivationSkipped ? MOTIVATION_SKIP_REASON : 'Yanıtlandı');
  xml=xml.replace('<col min="19" max="16384"', '<col min="19" max="19" width="52" customWidth="1"/><col min="20" max="16384"');
 }
 // Give the existing profile note a readable full-width line.
 const noteRow=profileRow+1;
 xml=xml.replace(/<mergeCells count="(\d+)">/,(_,count)=>`<mergeCells count="${Number(count)+1}"><mergeCell ref="A${noteRow}:R${noteRow}"/>`);
 xml=xml.replace(new RegExp(`(<row\\b[^>]*\\br="${noteRow}"[^>]*\\bht=")[^"]+`), '$1'+'32');
 xml=xml.replace(/<autoFilter\b[\s\S]*?<\/autoFilter>/,'').replace(/<sortState\b[\s\S]*?<\/sortState>/,'');
 xml=xml.replace(/(<col min="3" max="3" width=")[^"]+/, (_, prefix) => prefix + '22');
 xml=xml.replace(/orientation="portrait"/,'orientation="landscape" fitToWidth="1" fitToHeight="0"');
 book.zip.file(sheet.path,xml);
 let workbook=await book.read('xl/workbook.xml');
 workbook=workbook.replace(/<definedNames>[\s\S]*?<\/definedNames>/,'').replace(/<calcPr\b[^>]*\/>/,'<calcPr calcId="191029" fullCalcOnLoad="1" forceFullCalc="1" calcMode="auto"/>');
 book.zip.file('xl/workbook.xml',workbook);
 // Cached calculations are no longer valid after inserting rows.
 if(book.zip.file('xl/calcChain.xml')) {
  book.zip.remove('xl/calcChain.xml');
  for(const path of ['[Content_Types].xml','xl/_rels/workbook.xml.rels']) {
   const text=await book.read(path);book.zip.file(path,text.replace(/<(?:Override|Relationship)\b[^>]*calcChain[^>]*\/>/g,''));
  }
 }
 return {bytes:await book.zip.generateAsync({type:'uint8array',compression:'DEFLATE'}),filename:'Ekip-Analizi.xlsx'};
}
