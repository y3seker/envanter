import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import '../vendor/jszip.min.js';
import { emptyState, answersComplete } from '../core.js';
import { createShareToken, openShareToken, inspectShareToken, tokenFromHash, createShareUrl } from '../share.js';
import { evaluationSurvey } from '../analysis-core.js';
import { resultScores, resultsHtml } from '../results.js';

const survey = JSON.parse(await readFile(new URL('../data/survey.json', import.meta.url), 'utf8'));
const evaluated = await evaluationSurvey(survey, await readFile(new URL('../assets/envanter-sablonu.xlsx', import.meta.url)));
function completeState(seed = 0) {
  const state = emptyState(survey);
  state.profile = { name: 'Örnek Şule Işık <&>', title: 'Yazılım Geliştirme Müdürü' };
  for (const s of survey.sections) for (const q of s.questions) state.answers[s.id][q.id] = s.kind === 'choice' ? ((q.number + seed) % 2 ? 'A' : 'B') : (q.number + seed) % s.max + 1;
  return state;
}

test('all 137 answers round-trip in one small encrypted token, with identical scores', async () => {
  for (let seed = 0; seed < 5; seed++) {
    const state = completeState(seed);
    const token = await createShareToken(survey, state);
    assert.match(token, /^[A-Za-z0-9_-]+$/);
    assert.ok(token.length < 350, `token too large: ${token.length}`);
    assert.deepEqual(inspectShareToken(token), { passwordProtected: false });
    const restored = await openShareToken(survey, token);
    assert.deepEqual(restored.profile, state.profile);
    assert.deepEqual(restored.answers, state.answers);
    assert.equal(answersComplete(survey, restored), true);
    assert.deepEqual(resultScores(evaluated, restored), resultScores(evaluated, state));
    assert.match(resultsHtml(evaluated, restored), /Örnek Şule Işık &lt;&amp;&gt;/);
    assert.ok(!Buffer.from(token, 'base64url').includes(Buffer.from(state.profile.name)));
  }
});

test('optional password protects the data and is never included in the link', async () => {
  const state = completeState();
  const password = 'Kişinin seçtiği parola 123!';
  const token = await createShareToken(survey, state, password);
  assert.equal(inspectShareToken(token).passwordProtected, true);
  await assert.rejects(openShareToken(survey, token), /parolayı gir/);
  await assert.rejects(openShareToken(survey, token, 'yanlış'), /Parola yanlış/);
  const restored = await openShareToken(survey, token, password);
  assert.deepEqual(restored.answers, state.answers);
  assert.deepEqual(restored.profile, state.profile);
  assert.ok(!Buffer.from(token, 'base64url').includes(Buffer.from(password)));
  const repeated = await createShareToken(survey, state, password);
  assert.notEqual(repeated, token);
  assert.deepEqual((await openShareToken(survey, repeated, password)).answers, state.answers);
});

test('skipped motivation never leaks preserved draft answers or produces scores', async () => {
  const state = completeState(); state.motivationSkipped = true;
  const token = await createShareToken(survey, state);
  const restored = await openShareToken(survey, token);
  assert.equal(restored.motivationSkipped, true);
  assert.deepEqual(restored.answers.motivation, {});
  assert.equal(answersComplete(survey, restored), true);
  assert.equal(resultScores(evaluated, restored).motivation, null);
  assert.ok(token.length < (await createShareToken(survey, completeState())).length);
});

test('both A/B extremes and scale endpoints retain every answer', async () => {
  for (const maximum of [false, true]) {
    const state = completeState();
    for (const s of survey.sections) for (const q of s.questions) state.answers[s.id][q.id] = s.kind === 'choice' ? (maximum ? 'B' : 'A') : maximum ? s.max : 1;
    assert.deepEqual((await openShareToken(survey, await createShareToken(survey, state))).answers, state.answers);
  }
});

test('link generation rejects incomplete forms and invalid profile or password values', async () => {
  await assert.rejects(createShareToken(survey, emptyState(survey)), /ad-soyad/i);
  const state = completeState(); delete state.answers.control['control-29'];
  await assert.rejects(createShareToken(survey, state), /eksik/);
  for (const profile of [{ name: 'x'.repeat(81), title: 'Uzman' }, { name: 'Örnek\nKişi', title: 'Uzman' }]) {
    await assert.rejects(createShareToken(survey, { ...completeState(), profile }), /ad-soyad/i);
  }
  await assert.rejects(createShareToken(survey, completeState(), 'x'.repeat(129)), /128/);
});

test('maximum Unicode identity sizes still fit a compact link', async () => {
  const state = completeState(); state.profile = { name: '漢'.repeat(80), title: '語'.repeat(100) };
  const url = await createShareUrl(survey, state, { baseUrl: 'https://example.com/envanter/' });
  assert.ok(url.length < 1100);
  assert.deepEqual((await openShareToken(survey, tokenFromHash(new URL(url).hash))).profile, state.profile);
});

test('the share URL preserves the project subdirectory and contains no query data', async () => {
  for (const baseUrl of ['https://example.com/envanter/', 'https://example.com/envanter/index.html?assignment=secret']) {
    const url = new URL(await createShareUrl(survey, completeState(), { baseUrl }));
    assert.equal(url.pathname, '/envanter/sonuc.html');
    assert.equal(url.search, '');
    assert.deepEqual((await openShareToken(survey, tokenFromHash(url.hash))).answers, completeState().answers);
  }
});

test('malformed, huge, duplicated, truncated or unsupported links fail cleanly', async () => {
  for (const token of ['', '!', 'a', 'a'.repeat(4097), Buffer.from([2, 0, ...new Uint8Array(120)]).toString('base64url')]) {
    assert.throws(() => inspectShareToken(token), /geçersiz/);
  }
  const token = await createShareToken(survey, completeState());
  for (const hash of ['', '#report-behavior', `#r=${token}&r=${token}`]) assert.throws(() => tokenFromHash(hash), /geçersiz/);
  await assert.rejects(openShareToken(survey, token.slice(0, -12)));
});

test('changes to the encrypted answers, key, nonce or authentication tag are detected', async () => {
  const token = await createShareToken(survey, completeState());
  const bytes = Buffer.from(token, 'base64url');
  for (const index of [3, 36, 65, bytes.length - 1]) {
    const changed = Buffer.from(bytes); changed[index] ^= 1;
    await assert.rejects(openShareToken(survey, changed.toString('base64url')), /bozulmuş/);
  }
});

test('changed survey wording, ordering or version cannot silently reinterpret old answers', async () => {
  const token = await createShareToken(survey, completeState());
  for (const kind of ['version', 'order', 'wording']) {
    const changed = structuredClone(survey);
    if (kind === 'version') changed.version++;
    if (kind === 'order') changed.sections[0].questions.reverse();
    if (kind === 'wording') changed.sections[0].questions[0].text += ' changed';
    await assert.rejects(openShareToken(changed, token), /farklı bir soru sürümü/);
  }
});
