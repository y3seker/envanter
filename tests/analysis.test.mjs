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
const evaluationTemplate=await readFile(new URL('assets/envanter-sablonu.xlsx',root));
const teamTemplate=await readFile(new URL('assets/ekip-sablonu.xlsx',root));
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

test('new starters can skip only motivation; draft, both exports and import preserve the explicit reason',async()=>{
 const {restoreState,answersComplete,requiredQuestionCount,totalAnswered,MOTIVATION_SKIP_REASON}=await import('../core.js');
 const state=stateFor(70);state.motivationSkipped=true;
 // Keep previously entered answers in the draft, but never export them while skipped.
 const restored=restoreState(survey,JSON.stringify(state));
 assert.equal(restored.motivationSkipped,true);
 assert.deepEqual(restored.answers.motivation,state.answers.motivation);
 assert.equal(answersComplete(survey,restored),true);
 assert.equal(requiredQuestionCount(survey,restored),97);assert.equal(totalAnswered(survey,restored),97);
 const answer=await createAnswerWorkbook(survey,state,answerTemplate), book=await readWorkbook(answer.bytes);
 assert.equal(book.sheets[0].cells.B5.value,MOTIVATION_SKIP_REASON);
 for(let r=2;r<=41;r++)assert.equal(book.sheets[3].cells[`D${r}`].value,null);
 const imported=await importAnswers(survey,answer.bytes);
 assert.equal(imported.motivationSkipped,true);assert.deepEqual(imported.answers.motivation,{});
 const full=await createWorkbook(evaluated,imported,evaluationTemplate), evaluatedBook=await readWorkbook(full.bytes);
 assert.equal(evaluatedBook.zip.file('xl/calcChain.xml'),null);
 for(const ref of ['K4','K5','K6','K7','K8']) {
  assert.equal(evaluatedBook.sheets[6].cells[ref].value,null);
  assert.equal(evaluatedBook.sheets[6].cells[ref].formula,null);
 }
 assert.equal((await importAnswers(survey,full.bytes)).motivationSkipped,true);
 const scores=teamRecord(evaluated,imported);assert.deepEqual(scores.slice(12,17),[null,null,null,null,null]);
 const {resultsHtml}=await import('../results.js');assert.match(resultsHtml(evaluated,imported),/Puan hesaplanmadı/);
 imported.motivationSkipped=false;assert.equal(answersComplete(survey,imported),false);
 imported.motivationSkipped=true;delete imported.answers.control['control-1'];
 await assert.rejects(createAnswerWorkbook(survey,imported,answerTemplate));
 const zip=await globalThis.JSZip.loadAsync(answer.bytes), path='xl/worksheets/sheet4.xml';
 zip.file(path,setCell(await zip.file(path).async('string'),'D2',3));
 await assert.rejects(importAnswers(survey,await zip.generateAsync({type:'uint8array'})),/Atlanan motivasyon/);
 await writeFile(new URL('test-output/skipped-answers.xlsx',root),answer.bytes);
 await writeFile(new URL('test-output/skipped-full.xlsx',root),full.bytes);
});

test('team motivation averages exclude skipped people and remain blank when everyone skips',async()=>{
 const skipped=stateFor(80);skipped.motivationSkipped=true;
 const completed=stateFor(81), expected=teamRecord(evaluated,completed);
 for(const allSkipped of [false,true]) {
  const people=allSkipped?[{state:skipped}]:[{state:skipped},{state:completed}];
  const file=await createTeamWorkbook(evaluated,people,teamTemplate,{state:{...stateFor(82),motivationSkipped:true}}),book=await readWorkbook(file.bytes),cells=book.sheets[0].cells;
  for(let c=12;c<=16;c++) {
   const col=String.fromCharCode(65+c);
   assert.equal(cells[`${col}4`].value,null);
   assert.equal(cells[`${col}14`].value,allSkipped?'':expected[c]);
   assert.match(cells[`${col}14`].formula,/IF\(COUNT/);
   assert.equal(cells[`${col}16`].value,null);
  }
  assert.match(cells.S14.value,allSkipped?/0\/1 kişi/:/1\/2 kişi/);
  assert.ok(cells.H4.value>0);assert.ok(cells.R4.value>=0);
  await writeFile(new URL(`test-output/skipped-team-${allSkipped?'all':'mixed'}.xlsx`,root),file.bytes);
 }
});
