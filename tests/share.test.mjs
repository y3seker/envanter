import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import '../vendor/jszip.min.js';
import { emptyState } from '../core.js';
import { createShareToken, openShareToken, inspectShareToken, tokenFromHash, createShareUrl } from '../share.js';
import { evaluationSurvey } from '../analysis-core.js';
import { resultScores, resultsHtml, scoreReportHtml } from '../results.js';

const survey = JSON.parse(await readFile(new URL('../data/survey.json', import.meta.url), 'utf8'));
const evaluated = await evaluationSurvey(survey, await readFile(new URL('../assets/envanter-sablonu.xlsx', import.meta.url)));
const legacy = JSON.parse(await readFile(new URL('./fixtures/share-v1.json', import.meta.url), 'utf8'));
function completeState(seed = 0) {
  const state = emptyState(survey);
  state.profile = { name: 'Örnek Şule Işık <&>', title: 'Yazılım Geliştirme Müdürü' };
  for (const s of survey.sections) for (const q of s.questions) state.answers[s.id][q.id] = s.kind === 'choice' ? ((q.number + seed) % 2 ? 'A' : 'B') : (q.number + seed) % s.max + 1;
  return state;
}
const create = (state = completeState(), password = '') => createShareToken(evaluated, state, password);
const open = (token, password = '') => openShareToken(null, token, password);
const expectedReport = state => ({ profile: state.profile, scores: resultScores(evaluated, state), motivationSkipped: state.motivationSkipped });

async function plainPayload(token) {
  const bytes = Buffer.from(token, 'base64url');
  const key = await crypto.subtle.importKey('raw', bytes.subarray(2, 34), 'AES-GCM', false, ['decrypt', 'encrypt']);
  const payload = new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: bytes.subarray(34, 46), additionalData: bytes.subarray(0, 2) }, key, bytes.subarray(46)));
  return { bytes, key, payload };
}
async function replacePayload(packet, payload) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: packet.bytes.subarray(0, 2) }, packet.key, payload);
  return Buffer.concat([packet.bytes.subarray(0, 34), iv, new Uint8Array(ciphertext)]).toString('base64url');
}

test('new links contain only identity and 13 scores and render exactly the original report', async () => {
  for (let seed = 0; seed < 5; seed++) {
    const state = completeState(seed);
    const token = await create(state);
    assert.match(token, /^[A-Za-z0-9_-]+$/);
    assert.ok(token.length < 250, `token too large: ${token.length}`);
    assert.deepEqual(inspectShareToken(token), { passwordProtected: false, format: 2 });
    const report = await open(token);
    assert.deepEqual(report, expectedReport(state));
    assert.equal(Object.hasOwn(report, 'answers'), false);
    assert.equal(scoreReportHtml(report.profile, report.scores), resultsHtml(evaluated, state));
    assert.match(scoreReportHtml(report.profile, report.scores), /Örnek Şule Işık &lt;&amp;&gt;/);
    const { payload } = await plainPayload(token);
    const metadata = Buffer.from(JSON.stringify([state.profile.name, state.profile.title]));
    assert.equal(payload.length, 3 + metadata.length + 13);
    assert.deepEqual(Buffer.from(payload.subarray(3, 3 + metadata.length)), metadata);
    assert.deepEqual(Array.from(payload.subarray(3 + metadata.length)), [...report.scores.communication, ...report.scores.behavior, ...report.scores.motivation, report.scores.control]);
  }
});

test('new score-only links are shorter than the previously generated answer links', async () => {
  const token = await create();
  const protectedToken = await create(completeState(), 'Eski link parolası');
  assert.ok(token.length <= legacy.plain.length - 40);
  assert.ok(protectedToken.length <= legacy.protected.length - 40);
  console.log(`Example link data: ${legacy.plain.length} → ${token.length} characters; password-protected: ${legacy.protected.length} → ${protectedToken.length}.`);
});

test('optional password protects score snapshots and is never included in the link', async () => {
  const state = completeState(), password = 'Kişinin seçtiği parola 123!';
  const token = await create(state, password);
  assert.equal(inspectShareToken(token).passwordProtected, true);
  await assert.rejects(open(token), /parolayı gir/);
  await assert.rejects(open(token, 'yanlış'), /Parola yanlış/);
  assert.deepEqual(await open(token, password), expectedReport(state));
  assert.ok(!Buffer.from(token, 'base64url').includes(Buffer.from(password)));
  const repeated = await create(state, password);
  assert.notEqual(repeated, token);
  assert.deepEqual(await open(repeated, password), expectedReport(state));
});

test('skipped motivation retains no draft answers and displays no motivation scores', async () => {
  const state = completeState(); state.motivationSkipped = true;
  const token = await create(state), report = await open(token);
  assert.deepEqual(report, expectedReport(state));
  assert.equal(Object.hasOwn(report, 'answers'), false);
  assert.equal(report.scores.motivation, null);
  assert.match(scoreReportHtml(report.profile, report.scores), /Puan hesaplanmadı/);
  assert.equal(scoreReportHtml(report.profile, report.scores), resultsHtml(evaluated, state));
  assert.ok(token.length < (await create()).length);
});

test('scale endpoints and both A/B extremes keep identical chart geometry and scores', async () => {
  for (const maximum of [false, true]) {
    const state = completeState();
    for (const s of survey.sections) for (const q of s.questions) state.answers[s.id][q.id] = s.kind === 'choice' ? (maximum ? 'B' : 'A') : maximum ? s.max : 1;
    const report = await open(await create(state));
    assert.deepEqual(report.scores, resultScores(evaluated, state));
    assert.equal(scoreReportHtml(report.profile, report.scores), resultsHtml(evaluated, state));
  }
});

test('link generation rejects incomplete forms and invalid identity or password values', async () => {
  await assert.rejects(create(emptyState(survey)), /ad-soyad/i);
  const state = completeState(); delete state.answers.control['control-29'];
  await assert.rejects(create(state), /eksik/);
  for (const profile of [{ name: 'x'.repeat(81), title: 'Uzman' }, { name: 'Örnek\nKişi', title: 'Uzman' }]) await assert.rejects(create({ ...completeState(), profile }), /ad-soyad/i);
  await assert.rejects(create(completeState(), 'x'.repeat(129)), /128/);
});

test('maximum Unicode identity sizes still fit a compact URL with no query data', async () => {
  const state = completeState(); state.profile = { name: '漢'.repeat(80), title: '語'.repeat(100) };
  for (const baseUrl of ['https://example.com/envanter/', 'https://example.com/envanter/index.html?assignment=secret']) {
    const url = new URL(await createShareUrl(evaluated, state, { baseUrl }));
    assert.ok(url.href.length < 1000);
    assert.equal(url.pathname, '/envanter/sonuc.html'); assert.equal(url.search, '');
    assert.deepEqual((await open(tokenFromHash(url.hash))).profile, state.profile);
  }
});

test('malformed, huge, duplicated, truncated or unsupported links fail cleanly', async () => {
  for (const token of ['', '!', 'a', 'a'.repeat(4097), Buffer.from([3, 0, ...new Uint8Array(120)]).toString('base64url')]) assert.throws(() => inspectShareToken(token), /geçersiz/);
  const token = await create();
  for (const hash of ['', '#report-behavior', `#r=${token}&r=${token}`]) assert.throws(() => tokenFromHash(hash), /geçersiz/);
  await assert.rejects(open(token.slice(0, -12)));
});

test('changes to the format, encrypted scores, key, nonce or tag are detected', async () => {
  const token = await create(), bytes = Buffer.from(token, 'base64url');
  for (const index of [0, 3, 36, 65, bytes.length - 1]) {
    const changed = Buffer.from(bytes); changed[index] ^= 1;
    await assert.rejects(open(changed.toString('base64url')), /bozulmuş|geçersiz/);
  }
});

test('authenticated snapshots still reject out-of-range scores and invalid structures', async () => {
  const packet = await plainPayload(await create());
  const scoreStart = 3 + (packet.payload[1] << 8 | packet.payload[2]);
  for (const [index, value] of [[scoreStart, 51], [scoreStart, 9], [scoreStart + 4, 15], [scoreStart + 4, 0], [scoreStart + 8, 41], [packet.payload.length - 1, 24], [0, 2], [1, 255]]) {
    const changed = packet.payload.slice(); changed[index] = value;
    await assert.rejects(open(await replacePayload(packet, changed)), /geçersiz/);
  }
  await assert.rejects(open(await replacePayload(packet, packet.payload.slice(0, -1))), /geçersiz/);
});

test('new result snapshots survive question, version and scoring changes without reinterpretation', async () => {
  const state = completeState(), token = await create(state), expected = expectedReport(state);
  const changed = structuredClone(evaluated);
  changed.version++; changed.sections[0].questions.reverse(); changed.formulas = {};
  assert.deepEqual(await openShareToken(changed, token), expected);
  assert.deepEqual(await openShareToken(null, token), expected);
});

test('previously created plain, password-protected and skipped-motivation v1 links still open', async () => {
  assert.equal(inspectShareToken(legacy.plain).format, 1);
  for (const [token, password, skipped] of [[legacy.plain, '', false], [legacy.protected, 'Eski link parolası', false], [legacy.skipped, '', true]]) {
    const expected = completeState(); expected.motivationSkipped = skipped;
    const state = await openShareToken(survey, token, password);
    assert.deepEqual(state.profile, expected.profile);
    assert.deepEqual(resultScores(evaluated, state), resultScores(evaluated, expected));
    assert.equal(resultsHtml(evaluated, state), resultsHtml(evaluated, expected));
  }
  await assert.rejects(openShareToken(survey, legacy.protected, 'yanlış'), /Parola yanlış/);
});

test('legacy links retain their original survey-mismatch protection', async () => {
  for (const kind of ['version', 'order', 'wording']) {
    const changed = structuredClone(survey);
    if (kind === 'version') changed.version++;
    if (kind === 'order') changed.sections[0].questions.reverse();
    if (kind === 'wording') changed.sections[0].questions[0].text += ' changed';
    await assert.rejects(openShareToken(changed, legacy.plain), /farklı bir soru sürümü/);
  }
});

test('the shared results entry point renders new links without fetching questions, workbooks or accessing storage', async t => {
  const state = completeState(), token = await create(state);
  const { promise: rendered, resolve, reject } = Promise.withResolvers();
  let html = '', fetches = 0;
  const preview = {
    set innerHTML(value) { html = value; resolve(); },
    replaceChildren() { html = ''; }, querySelector() { return null; },
  };
  const gate = {
    hidden: false,
    set innerHTML(value) { if (value.includes('id="result-error"')) reject(new Error('Result loading entered its error screen.')); },
    replaceChildren() {}, querySelector() { return { addEventListener() {}, set textContent(value) { reject(new Error(value)); } }; },
  };
  const document = { querySelector: selector => selector === '#share-gate' ? gate : preview, body: { classList: { remove() {} } }, addEventListener() {}, title: '' };
  const names = ['window', 'document', 'location', 'fetch', 'localStorage', 'sessionStorage'];
  const previous = names.map(name => [name, Object.getOwnPropertyDescriptor(globalThis, name)]);
  t.after(() => { for (const [name, descriptor] of previous) { if (descriptor) Object.defineProperty(globalThis, name, descriptor); else delete globalThis[name]; } });
  for (const [name, value] of Object.entries({ window: { addEventListener() {} }, document, location: { hash: `#r=${token}` }, fetch: async () => { fetches++; throw Error('No report data should be fetched.'); } })) Object.defineProperty(globalThis, name, { configurable: true, writable: true, value });
  for (const name of ['localStorage', 'sessionStorage']) Object.defineProperty(globalThis, name, { configurable: true, get() { throw Error('Shared results must not access the form draft.'); } });
  const timeout = setTimeout(() => reject(new Error('Shared results did not render.')), 2000);
  t.after(() => clearTimeout(timeout));
  await import('../shared-results.js?score-only-test');
  await rendered;
  assert.equal(html, resultsHtml(evaluated, state));
  assert.equal(gate.hidden, true);
  assert.equal(fetches, 0);
  assert.equal(document.title, `${state.profile.name} · Envanter sonuçları`);
});
