import { assertComplete, downloadFilename, emptyState } from './core.js';
import { setCell } from './excel.js';
import { readWorkbook, xmlText } from './workbook-reader.js';

export async function createAnswerWorkbook(survey,state,template) {
 assertComplete(survey,state);
 const zip=await globalThis.JSZip.loadAsync(template);
 let identity=await zip.file('xl/worksheets/sheet1.xml').async('string');
 identity=setCell(identity,'B2',state.profile.name.trim());identity=setCell(identity,'B3',state.profile.title.trim());
 zip.file('xl/worksheets/sheet1.xml',identity);
 for(const [i,section] of survey.sections.entries()) {
  const path=`xl/worksheets/sheet${i+2}.xml`;let xml=await zip.file(path).async('string');
  for(const q of section.questions) xml=setCell(xml,`D${q.number+1}`,state.answers[section.id][q.id]);
  zip.file(path,xml);
 }
 return {bytes:await zip.generateAsync({type:'uint8array',compression:'DEFLATE'}),filename:downloadFilename(state.profile).replace(/^RiseUp-/, 'Envanter-Cevaplar-')};
}

export async function importAnswers(survey,bytes) {
 const book=await readWorkbook(bytes);const state=emptyState(survey);
 const identity=book.sheets.find(s=>s.name==='Katılımcı');
 const modern=identity?.cells.B4?.value==='envanter-answers-v1';
 if(identity&&!modern) throw Error('Cevap dosyasının sürümü desteklenmiyor.');
 if(modern) {
  state.profile={name:identity.cells.B2?.value,title:identity.cells.B3?.value};
  if(identity.cells.B2?.formula!==null||identity.cells.B3?.formula!==null) throw Error('Kimlik alanında formül olamaz.');
 } else {
  if(!book.sheets.some(s=>s.name==='Giriş')||!book.zip.file('xl/drawings/drawing1.xml')) throw Error('Envanter cevap dosyası tanınmadı.');
  const drawing=await book.read('xl/drawings/drawing1.xml');
  const texts=[...drawing.matchAll(/<a:p\b[^>]*>([\s\S]*?)<\/a:p>/g)].map(m=>xmlText(m[1]));
  state.profile={name:texts.find(t=>t.startsWith('Ad- Soyad:'))?.slice(10).trim(),title:texts.find(t=>t.startsWith('Unvan:'))?.slice(6).trim()};
 }
 for(const section of survey.sections) {
  const sheet=book.sheets.find(s=>s.name===section.sheetName);if(!sheet) throw Error(`Eksik sayfa: ${section.sheetName}`);
  for(const q of section.questions) {
   const ref=modern?`D${q.number+1}`:q.cell;
   if(modern && sheet.cells[`A${q.number+1}`]?.value!==q.number) throw Error(`${section.title}: soru sırası değiştirilmiş.`);
   const cell=sheet.cells[ref];
   if(cell?.formula!==null) throw Error(`${section.title}, soru ${q.number}: cevap eksik veya formül içeriyor.`);
   let value=cell.value;
   if(section.kind==='scale'&&typeof value==='string'&&/^[1-5]$/.test(value)) value=Number(value);
   state.answers[section.id][q.id]=value;
  }
 }
 assertComplete(survey,state);
 return state;
}
