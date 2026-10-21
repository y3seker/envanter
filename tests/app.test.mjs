import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import '../vendor/jszip.min.js';
import { emptyState, restoreState, validAnswer, profileIsValid, totalAnswered, workbookValues, evaluateSheet, downloadFilename } from '../core.js';
import { createWorkbook, setCell, updateBehaviorDrawing, updateControlDrawing } from '../excel.js';

const baseSurvey = JSON.parse(await readFile(new URL('../data/survey.json', import.meta.url), 'utf8'));
const template = await readFile(new URL('../private-fixtures/envanter-sablonu.xlsx', import.meta.url));
const { evaluationSurvey } = await import('../analysis-core.js');
const survey = await evaluationSurvey(baseSurvey, template);
const originalZip = await globalThis.JSZip.loadAsync(template);

function completeState(kind = 'A') {
  const state = emptyState(survey);
  state.profile = { name: 'Deneme Katılımcı', title: 'Test Uzmanı' };
  for (const section of survey.sections) for (const q of section.questions) state.answers[section.id][q.id] = section.kind === 'choice' ? kind : section.max;
  return state;
}

test('137 questions have unique ids and exact source/destination coverage', () => {
  assert.deepEqual(survey.sections.map(s => s.questions.length), [40, 28, 40, 29]);
  assert.equal(new Set(survey.sections.flatMap(s => s.questions.map(q => q.id))).size, 137);
  assert.equal(Object.values(survey.formulas).reduce((n, f) => n + Object.keys(f).length, 0), 143);
  for (const s of survey.sections) {
    assert.equal(new Set(s.questions.map(q => q.cell)).size, s.count);
    assert.equal(new Set(s.questions.map(q => q.evaluationCell)).size, s.count);
  }
});

test('scales and A/B answers reject out-of-range and wrong-type values', () => {
  for (const s of survey.sections) {
    for (const invalid of [null, undefined, '', 0, -1, 1.2, {}, true, '1', 'C', 'a']) assert.equal(validAnswer(s, invalid), false);
    if (s.kind === 'choice') { assert.ok(validAnswer(s, 'A')); assert.ok(validAnswer(s, 'B')); }
    else { assert.ok(validAnswer(s, 1)); assert.ok(validAnswer(s, s.max)); assert.equal(validAnswer(s, s.max + 1), false); }
  }
});

test('incomplete answers or missing identity prevent an export', async () => {
  await assert.rejects(createWorkbook(survey, emptyState(survey), template), /Ad-soyad/);
  const state = completeState();
  delete state.answers.control['control-29'];
  await assert.rejects(createWorkbook(survey, state, template), /tüm soruları/);
  assert.equal(profileIsValid({ name: ' ', title: 'A' }), false);
});

test('draft restores only known answers and clamps navigation', () => {
  const state = completeState(); state.step = 700; state.pages.communication = -100;
  state.answers.communication['communication-1'] = 9;
  state.answers.communication['invented-id'] = 3;
  state.answers.control['control-1'] = 'C';
  const restored = restoreState(survey, JSON.stringify(state));
  assert.equal(totalAnswered(survey, restored), 135);
  assert.equal(restored.step, 5);
  assert.equal(restored.pages.communication, 0);
  assert.equal(restored.answers.communication['invented-id'], undefined);
  assert.equal(totalAnswered(survey, restoreState(survey, '{broken')), 0);
});

test('maximum scores and all A/B choices match independent expectations', () => {
  for (const [choice, direct, indirect, people, task, control] of [['A', 14, 0, 14, 0, 11], ['B', 0, 14, 0, 14, 12]]) {
    const values = workbookValues(survey, completeState(choice));
    assert.deepEqual(['E3', 'E4', 'E5', 'E6', 'E7'].map(c => values[3][c]), [50, 50, 50, 50, 200]);
    assert.deepEqual(['G17', 'H17', 'J17', 'K17'].map(c => values[5][c]), [direct, indirect, people, task]);
    assert.deepEqual(['K4', 'K5', 'K6', 'K7', 'K8'].map(c => values[7][c]), [40, 40, 40, 40, 160]);
    assert.equal(values[9].F30, control);
  }
});

test('control assessment starts at row 1 and keeps the total row free of answers', () => {
  const section = survey.sections.find(s => s.id === 'control');
  const state = completeState('B');
  state.answers.control['control-1'] = 'A';
  const values = workbookValues(survey, state);
  for (const q of section.questions) assert.equal(q.evaluationCell, `D${q.number}`);
  assert.equal(values[8].D2, 'A');
  assert.equal(values[8].D30, 'B');
  assert.equal(values[9].D1, 1);
  assert.equal(values[9].D29, 2);
  assert.equal(values[9].D30, undefined);
});

test('formula evaluation follows dependencies and refuses unsupported expressions', () => {
  assert.deepEqual(evaluateSheet({ E1: 'SUM(D1:D2)', D2: 'IF(A1=1,7,8)', D1: 'A2' }, { A1: 1, A2: 3 }), { A1: 1, A2: 3, D1: 3, D2: 7, E1: 10 });
  assert.throws(() => evaluateSheet({ A1: 'NOW()' }, {}), /Desteklenmeyen/);
  assert.throws(() => evaluateSheet({ A1: 'A2', A2: 'A1' }, {}), /Döngüsel/);
  assert.throws(() => evaluateSheet({ A1: 'SUM(B1:B2)' }, {}), /bulunamadı/);
});

test('cell patches preserve style and XML-escape user content', () => {
  const xml = '<row r="1"><c r="B1" s="7"/><c r="C1" s="2" t="s"><v>2</v></c></row>';
  const changed = setCell(xml, 'B1', 'A&B <test> $&');
  assert.ok(changed.includes('s="7" t="inlineStr"'));
  assert.ok(changed.includes('A&amp;B &lt;test&gt; $&'));
  assert.ok(changed.includes('<c r="C1" s="2" t="s"><v>2</v></c>'));
  assert.ok(setCell(xml, 'D1', 2).includes('<c r="D1"><v>2</v></c>'));
  assert.throws(() => setCell(xml, 'D2', 2), /bulunamadı/);
});

test('behavior map follows all four score directions', async () => {
  const original = await originalZip.file('xl/drawings/drawing5.xml').async('string');
  const changed = updateBehaviorDrawing(original, { G17: 8, H17: 6, J17: 4, K17: 10 });
  assert.ok(changed.includes('<xdr:from><xdr:col>20</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>12</xdr:row>'));
  assert.ok(changed.includes('<xdr:to><xdr:col>34</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>26</xdr:row>'));
});

test('control indicator stays on the original 0–23 axis, including its wider last column', async () => {
  const original = await originalZip.file('xl/drawings/drawing8.xml').async('string');
  const columns = survey.drawingLayout.control.columns;
  const widths = columns.map(c => c.hidden ? 0 : Math.floor((256 * c.width + Math.floor(128 / 7)) / 256 * 7) * 9525);
  const start = widths.slice(0, 8).reduce((a, b) => a + b, 0) + 370345;
  const end = widths.slice(0, 14).reduce((a, b) => a + b, 0) + 2608720;
  for (const score of [0, 11, 12, 23]) {
    const drawing = updateControlDrawing(original, score, columns);
    const shape = drawing.match(/<xdr:twoCellAnchor\b[^>]*>[\s\S]*?name="Isosceles Triangle 6"[\s\S]*?<\/xdr:twoCellAnchor>/)[0];
    const anchor = shape.slice(shape.lastIndexOf('<xdr:twoCellAnchor'));
    const position = tag => {
      const match = new RegExp(`<xdr:${tag}><xdr:col>(\\d+)<\\/xdr:col><xdr:colOff>(\\d+)<\\/xdr:colOff>`).exec(anchor);
      const [col, offset] = [Number(match[1]), Number(match[2])];
      assert.ok(offset >= 0 && offset < widths[col]);
      return widths.slice(0, col).reduce((a, b) => a + b, 0) + offset;
    };
    const center = (position('from') + position('to')) / 2;
    assert.ok(Math.abs(center - (start + (end - start) * score / 23)) < 1);
    assert.ok(center >= start && center <= end);
  }
});

test('download filenames preserve Turkish, remove path characters, and use Istanbul date', () => {
  assert.equal(downloadFilename({ name: '  Şule / Işık: <test>  ' }, new Date('2026-10-20T22:30:00Z')), 'RiseUp-Şule-Işık-test-2026-10-21.xlsx');
});

test('real exports preserve every package entry and all non-edited parts byte for byte', async () => {
  const output = new URL('../test-output/', import.meta.url);
  await mkdir(output, { recursive: true });
  const allowed = new Set(['xl/workbook.xml', 'xl/drawings/drawing1.xml', 'xl/drawings/drawing5.xml', 'xl/drawings/drawing8.xml', 'xl/charts/chart1.xml', ...Array.from({ length: 8 }, (_, i) => `xl/worksheets/sheet${i + 2}.xml`)]);
  const fixtures = ['A', 'B', 'mixed'];
  for (const fixture of fixtures) {
    const state = completeState(fixture === 'B' ? 'B' : 'A');
    if (fixture === 'mixed') {
      state.profile = { name: 'Örnek & <Katılımcı> $&', title: '=Uzman / Ar-Ge' };
      for (const s of survey.sections) for (const q of s.questions) state.answers[s.id][q.id] = s.kind === 'choice' ? (q.number % 3 ? 'B' : 'A') : (q.number * 7 % s.max) + 1;
    }
    const result = await createWorkbook(survey, state, template);
    const zip = await globalThis.JSZip.loadAsync(result.bytes);
    const entries = Object.keys(originalZip.files).filter(k => !originalZip.files[k].dir);
    assert.deepEqual(Object.keys(zip.files).filter(k => !zip.files[k].dir).sort(), entries.sort());
    for (const entry of entries) if (!allowed.has(entry)) assert.deepEqual(await zip.file(entry).async('uint8array'), await originalZip.file(entry).async('uint8array'), entry);
    await writeFile(new URL(`${fixture}.xlsx`, output), result.bytes);
    await writeFile(new URL(`${fixture}.json`, output), JSON.stringify(state));
  }
  console.log(`Export fixtures: ${fileURLToPath(output)}`);
});

test('result charts match independent scoring expectations and control endpoints', async () => {
  const { resultScores, resultsHtml } = await import('../results.js');
  const state = completeState('A');
  assert.deepEqual(resultScores(survey, state), {
    communication: [50, 50, 50, 50], behavior: [14, 0, 14, 0],
    motivation: [40, 40, 40, 40], control: 11,
  });
  const keys = {2:'B',3:'A',4:'A',5:'A',6:'B',7:'B',9:'B',10:'A',11:'A',12:'A',13:'A',15:'A',16:'B',17:'B',18:'B',20:'B',21:'B',22:'A',23:'B',25:'B',26:'A',28:'A',29:'B'};
  for (const maximum of [false, true]) {
    for (const [n, answer] of Object.entries(keys)) state.answers.control[`control-${n}`] = maximum ? answer : answer === 'A' ? 'B' : 'A';
    assert.equal(resultScores(survey, state).control, maximum ? 23 : 0);
    const html = resultsHtml(survey, state);
    assert.ok(html.includes(`circle cx="${maximum ? 410 : 30}" cy="27"`));
    assert.ok(!html.includes('NaN'));
  }
  delete state.answers.control['control-29'];
  assert.throws(() => resultsHtml(survey, state), /tüm soruları/);
});
