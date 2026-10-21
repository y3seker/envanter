import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import '../vendor/jszip.min.js';
import { emptyState } from '../core.js';
import { createAnswerWorkbook, importAnswers } from '../answers.js';
import { evaluationSurvey, createTeamWorkbook, teamRecord, participantKey } from '../analysis-core.js';
import { createWorkbook, setCell } from '../excel.js';
import { readWorkbook } from '../workbook-reader.js';
const root=new URL('../',import.meta.url);
const survey=JSON.parse(await readFile(new URL('data/survey.json',root),'utf8'));
const answerTemplate=await readFile(new URL('assets/cevap-sablonu.xlsx',root));
const evaluationTemplate=await readFile(new URL('private-fixtures/envanter-sablonu.xlsx',root));
const teamTemplate=await readFile(new URL('private-fixtures/ekip-sablonu.xlsx',root));
const evaluated=await evaluationSurvey(survey,evaluationTemplate);
await mkdir(new URL('test-output/',root),{recursive:true});
function stateFor(i=1) {
 const state=emptyState(survey);state.profile={name:`Kişi ${i} & <Örnek>`,title:'=Uzman'};
 for(const s of survey.sections)for(const q of s.questions)state.answers[s.id][q.id]=s.kind==='choice'?((q.number+i)%2?'A':'B'):(q.number+i)%s.max+1;
 return state;
}
test('participant files contain only identity and 137 answers, and round-trip to the original evaluated format',async()=>{
 const state=stateFor(), answer=await createAnswerWorkbook(survey,state,answerTemplate);
 const book=await readWorkbook(answer.bytes);
 assert.deepEqual(book.sheets.map(s=>s.name),['Katılımcı',...survey.sections.map(s=>s.sheetName)]);
 assert.ok(!Object.keys(book.zip.files).some(n=>/chart|drawing|calcChain/i.test(n)));
 for(const sheet of book.sheets) for(const cell of Object.values(sheet.cells)) assert.equal(cell.formula,null);
 assert.equal(survey.formulas,undefined);
 const imported=await importAnswers(survey,answer.bytes);
 assert.deepEqual(imported.profile,state.profile);assert.deepEqual(imported.answers,state.answers);
 const full=await createWorkbook(evaluated,imported,evaluationTemplate);
 const legacy=await importAnswers(survey,full.bytes);
 assert.deepEqual(legacy.profile,state.profile);assert.deepEqual(legacy.answers,state.answers);
 await writeFile(new URL('test-output/answers.xlsx',root),answer.bytes);
 await writeFile(new URL('test-output/roundtrip.xlsx',root),full.bytes);
 await writeFile(new URL('test-output/roundtrip.json',root),JSON.stringify(state));
});
test('invalid/missing answers, formula answers, and changed question numbers are rejected',async()=>{
 const answer=await createAnswerWorkbook(survey,stateFor(),answerTemplate);
 for(const [ref,value,formula] of [['D2',9,null],['D2','',null],['D2',2,'1+1'],['A2',99,null]]) {
  const zip=await globalThis.JSZip.loadAsync(answer.bytes),path='xl/worksheets/sheet2.xml';
  zip.file(path,setCell(await zip.file(path).async('string'),ref,value,formula));
  await assert.rejects(importAnswers(survey,await zip.generateAsync({type:'uint8array'})));
 }
 await assert.rejects(evaluationSurvey(survey,answer.bytes));
});
test('team column order matches the supplied template, including communication and motivation reordering',()=>{
 const row=teamRecord(evaluated,stateFor());
 assert.equal(row.length,18);
 assert.deepEqual(row.slice(3,7),[9,5,5,9]);
 assert.equal(row[11],row.slice(7,11).reduce((a,b)=>a+b));
 assert.equal(row[16],row.slice(12,16).reduce((a,b)=>a+b));
 assert.equal(row[2],'Kırmızı');
 const upper=stateFor();upper.profile={name:'  KİŞİ 1 & <ÖRNEK> ',title:'=UZMAN'};
 assert.equal(participantKey(upper),participantKey(stateFor()));
});
test('team export supports 1, 10, 11 and 25 people, shifts the profile safely and excludes it from averages',async()=>{
 for(const count of [1,10,11,25]) {
  const people=Array.from({length:count},(_,i)=>({state:stateFor(i+1),color:i===0?'Özel renk':''}));
  const leader={state:stateFor(999),color:''};
  const file=await createTeamWorkbook(evaluated,people,teamTemplate,leader),book=await readWorkbook(file.bytes);
  const cells=book.sheets[0].cells,extra=Math.max(0,count-10),avg=14+extra;
  assert.equal(cells[`A${avg}`].value,'ORTALAMA');assert.equal(cells[`A${16+extra}`].value,'Benim Profilim');
  for(let i=0;i<count;i++)assert.equal(cells[`A${i+4}`].value,people[i].state.profile.name);
  const records=people.map(p=>teamRecord(evaluated,p.state,p.color));
  for(let c=3;c<18;c++) {
   const col=String.fromCharCode(65+c),cell=cells[`${col}${avg}`];
   assert.equal(cell.formula,`AVERAGE(${col}4:${col}${3+count})`);
   assert.equal(cell.value,records.reduce((s,r)=>s+r[c],0)/count);
  }
  assert.equal(cells.C4.value,'Özel renk');
  assert.equal(cells[`R${16+extra}`].value,teamRecord(evaluated,leader.state)[17]);
  await writeFile(new URL(`test-output/team-${count}.xlsx`,root),file.bytes);
  await writeFile(new URL(`test-output/team-${count}.json`,root),JSON.stringify({people,leader}));
 }
 await assert.rejects(createTeamWorkbook(evaluated,[],teamTemplate));
 const p={state:stateFor(),color:''};
 await assert.rejects(createTeamWorkbook(evaluated,[p,p],teamTemplate),/birden fazla/);
 await assert.rejects(createTeamWorkbook(evaluated,[p],teamTemplate,p),/ekip listesinde/);
});
