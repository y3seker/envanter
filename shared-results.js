import { inspectShareToken, tokenFromHash, openShareToken } from './share.js';
import { evaluationSurvey } from './analysis-core.js';
import { resultsHtml } from './results.js';
import { mountCharacter } from './character-viewer.js';

const gate = document.querySelector('#share-gate');
const preview = document.querySelector('#person-preview');
let disposeCharacter = () => {};
let survey, token, request = 0, evaluatedRequest;

async function evaluatedSurvey() {
  if (!evaluatedRequest) evaluatedRequest = (async () => {
    const response = await fetch('./assets/envanter-sablonu.xlsx', { cache: 'no-store' });
    if (!response.ok) throw new Error('Sonuç şablonu yüklenemedi. Bağlantını kontrol edip tekrar dene.');
    return evaluationSurvey(survey, new Uint8Array(await response.arrayBuffer()));
  })().catch(error => { evaluatedRequest = null; throw error; });
  return evaluatedRequest;
}

function failure(error) {
  gate.hidden = false;
  gate.innerHTML = '<h1>Sonuçlar açılamadı.</h1><p id="result-error" role="alert"></p><button id="retry-results" class="button secondary" type="button">Tekrar dene</button><p><a href="./">Envanter ana sayfasına dön</a></p>';
  gate.querySelector('#result-error').textContent = error.message || 'Linki kontrol edip tekrar dene.';
  gate.querySelector('#retry-results').addEventListener('click', init);
}

async function showResults(password = '', attempt = ++request) {
  const state = await openShareToken(survey, token, password);
  const evaluated = await evaluatedSurvey();
  if (attempt !== request) return;
  preview.innerHTML = resultsHtml(evaluated, state);
  gate.replaceChildren(); gate.hidden = true;
  document.title = `${state.profile.name} · Envanter sonuçları`;
  disposeCharacter(); disposeCharacter = mountCharacter(preview.querySelector('.character-panel'));
}

function passwordForm() {
  gate.innerHTML = `<span class="eyebrow">PAROLALI PAYLAŞIM</span><h1>Bu sonuçlar parola ile korunuyor.</h1><p>Linki paylaşan kişinin belirlediği parolayı gir.</p>
    <form id="unlock-results"><div class="field"><label for="result-password">Paylaşım parolası</label><input id="result-password" type="password" autocomplete="off" required maxlength="128" aria-describedby="unlock-error"></div>
    <p id="unlock-error" class="error-message" role="alert"></p><button class="button primary" type="submit">Sonuçları aç ↗</button></form>`;
  const form = gate.querySelector('form');
  const input = form.querySelector('input');
  form.addEventListener('submit', async event => {
    event.preventDefault();
    const attempt = ++request, button = form.querySelector('button');
    button.disabled = true; input.disabled = true; button.textContent = 'Sonuçlar açılıyor…';
    form.querySelector('#unlock-error').textContent = '';
    try { await showResults(input.value, attempt); }
    catch (error) {
      if (attempt !== request) return;
      form.querySelector('#unlock-error').textContent = error.message;
      input.disabled = false; input.select(); input.focus();
    } finally { button.disabled = false; input.disabled = false; button.textContent = 'Sonuçları aç ↗'; }
  });
  input.focus();
}

async function init() {
  const attempt = ++request;
  disposeCharacter(); disposeCharacter = () => {};
  preview.replaceChildren(); gate.hidden = false; document.body.classList.remove('report-presenting');
  document.title = 'Paylaşılan sonuçlar · Envanter';
  gate.innerHTML = '<h1>Sonuçlar hazırlanıyor…</h1><p role="status">Paylaşım linki kontrol ediliyor.</p>';
  try {
    token = tokenFromHash(location.hash);
    const response = await fetch('./data/survey.json', { cache: 'no-store' });
    if (!response.ok) throw new Error('Sorular yüklenemedi. Bağlantını kontrol edip tekrar dene.');
    survey = await response.json();
    if (attempt !== request) return;
    if (inspectShareToken(token).passwordProtected) passwordForm();
    else await showResults('', attempt);
  } catch (error) { if (attempt === request) failure(error); }
}

// Report section navigation must preserve #r=… so copying the address or
// refreshing after visiting a chart still opens the same shared results.
document.addEventListener('click', event => {
  const anchor = event.target.closest('a[href^="#"]');
  if (anchor) { event.preventDefault(); document.getElementById(anchor.getAttribute('href').slice(1))?.scrollIntoView({ behavior: 'auto' }); }
  const button = event.target.closest('[data-report-focus]');
  if (!button) return;
  const active = document.body.classList.toggle('report-presenting');
  button.setAttribute('aria-pressed', String(active)); button.textContent = active ? '↙ Normal görünüme dön' : '↗ Sunum görünümü';
  preview.scrollIntoView({ behavior: 'auto' });
});
window.addEventListener('keydown', event => { if (event.key === 'Escape' && document.body.classList.contains('report-presenting')) preview.querySelector('[data-report-focus]')?.click(); });
window.addEventListener('hashchange', init);
window.addEventListener('pagehide', () => disposeCharacter());
window.addEventListener('pageshow', event => { if (event.persisted) { disposeCharacter(); disposeCharacter = mountCharacter(preview.querySelector('.character-panel')); } });
init();
