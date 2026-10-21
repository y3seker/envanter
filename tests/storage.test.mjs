import test from 'node:test';
import assert from 'node:assert/strict';
import { saveDraft, loadDraft, clearDraft } from '../storage.js';
import { DRAFT_KEY } from '../core.js';
const memory = () => { const values = new Map(); return { getItem: k => values.get(k) ?? null, setItem: (k,v) => values.set(k,v), removeItem: k => values.delete(k) }; };
const blocked = { getItem() { throw Error(); }, setItem() { throw Error(); }, removeItem() { throw Error(); } };
test('draft survives a new session and preserves answers and current page', () => {
  const localStorage = memory();
  const draft = { answers: { communication: { 'communication-1': 4 } }, step: 1, pages: { communication: 3 } };
  assert.equal(saveDraft(draft, { localStorage }), true);
  assert.deepEqual(JSON.parse(loadDraft({ localStorage, sessionStorage: memory() })), draft);
});
test('legacy migration preserves data and does not overwrite a persistent draft', () => {
  const browser = { localStorage: memory(), sessionStorage: memory() };
  browser.sessionStorage.setItem(DRAFT_KEY, 'legacy');
  assert.equal(loadDraft(browser), 'legacy');
  assert.equal(browser.sessionStorage.getItem(DRAFT_KEY), null);
  browser.sessionStorage.setItem(DRAFT_KEY, 'stale');
  assert.equal(loadDraft(browser), 'legacy');
  assert.equal(clearDraft(browser), true);
  assert.equal(loadDraft(browser), null);
});
test('storage failures retain legacy data and report save/clear failure', () => {
  const browser = { localStorage: blocked, sessionStorage: memory() };
  browser.sessionStorage.setItem(DRAFT_KEY, 'legacy');
  assert.equal(loadDraft(browser), 'legacy');
  assert.equal(browser.sessionStorage.getItem(DRAFT_KEY), 'legacy');
  assert.equal(saveDraft({}, browser), false);
  assert.equal(clearDraft(browser), false);
});
