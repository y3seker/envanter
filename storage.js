import { DRAFT_KEY } from './core.js';

export function saveDraft(state, browser = globalThis) {
  try {
    browser.localStorage.setItem(DRAFT_KEY, JSON.stringify(state));
    return true;
  } catch { return false; }
}

export function loadDraft(browser = globalThis) {
  let raw = null;
  try { raw = browser.localStorage.getItem(DRAFT_KEY); } catch { /* Try legacy storage. */ }
  if (raw !== null) return raw;
  try {
    raw = browser.sessionStorage.getItem(DRAFT_KEY);
    if (raw !== null) {
      // Remove the old copy only after the persistent write succeeds.
      browser.localStorage.setItem(DRAFT_KEY, raw);
      browser.sessionStorage.removeItem(DRAFT_KEY);
    }
  } catch { /* Return the legacy draft even if migration is blocked. */ }
  return raw;
}

export function clearDraft(browser = globalThis) {
  let cleared = true;
  for (const name of ['localStorage', 'sessionStorage']) {
    try { browser[name].removeItem(DRAFT_KEY); } catch { cleared = false; }
  }
  return cleared;
}
