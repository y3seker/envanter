import { createShareUrl } from './share.js';
import { evaluationSurvey } from './analysis-core.js';
import { profileIsValid, answersComplete } from './core.js';

export function mountSharePanel(after, survey, state) {
  after.insertAdjacentHTML('afterend', `<section class="profile-panel share-card" aria-labelledby="share-title">
    <div class="panel-title"><h2 id="share-title">Sonuçlarını bir linkle paylaş.</h2><small>Excel göndermeden</small></div>
    <p>Sonuçlarını ve grafiklerini açabilir veya bir linkle paylaşabilirsin. Link yalnızca adını, unvanını ve sonuç puanlarını içerir; tek tek cevapların paylaşılmaz.</p>
    <div class="field"><label for="share-password">Parola (isteğe bağlı)</label><input id="share-password" type="password" autocomplete="new-password" maxlength="128" placeholder="Parolasız paylaşmak için boş bırak" aria-describedby="share-help"></div>
    <p class="form-hint" id="share-help">Parola koymazsan linki bilen herkes sonuçlarını açabilir. Parola seçersen alıcıya ayrıca ilet.</p>
    <div class="share-actions"><button class="button secondary" id="view-results" type="button">Sonuçları gör <span aria-hidden="true">→</span></button><button class="button primary" id="copy-share-link" type="button">Paylaşım linkini kopyala <span aria-hidden="true">↗</span></button></div>
    <p id="share-status" class="form-hint" role="status" aria-live="polite"></p><p id="share-error" class="error-message" role="alert"></p>
    <div id="share-link-field" class="field" hidden><label for="share-link">Paylaşım linkin</label><input id="share-link" type="text" readonly spellcheck="false" autocomplete="off"><p class="form-hint">Linkin bir kopyası burada. Bu alanı seçip elle de kopyalayabilirsin.</p></div>
  </section>`);
  const panel = after.nextElementSibling;
  const button = panel.querySelector('#copy-share-link');
  const viewButton = panel.querySelector('#view-results');
  const password = panel.querySelector('#share-password');
  const status = panel.querySelector('#share-status');
  const error = panel.querySelector('#share-error');
  const field = panel.querySelector('#share-link-field');
  const link = panel.querySelector('#share-link');
  let evaluatedRequest;
  async function shareUrl(snapshot, selectedPassword) {
    if (!profileIsValid(snapshot.profile)) throw new Error('Önce ad-soyad ve unvan bilgilerini tamamla.');
    if (!answersComplete(survey, snapshot)) throw new Error('Paylaşmadan önce eksik yanıtlarını tamamla.');
    if (!evaluatedRequest) evaluatedRequest = (async () => {
      const response = await fetch('./assets/envanter-sablonu.xlsx', { cache: 'no-store' });
      if (!response.ok) throw new Error('Sonuç şablonu yüklenemedi. Bağlantını kontrol edip tekrar dene.');
      return evaluationSurvey(survey, new Uint8Array(await response.arrayBuffer()));
    })().catch(error => { evaluatedRequest = null; throw error; });
    return createShareUrl(await evaluatedRequest, snapshot, { password: selectedPassword });
  }
  function setBusy(busy) {
    button.disabled = busy; viewButton.disabled = busy; password.disabled = busy;
  }
  link.addEventListener('click', () => link.select());
  password.addEventListener('input', () => { field.hidden = true; link.value = ''; status.textContent = ''; error.textContent = ''; });
  viewButton.addEventListener('click', async () => {
    setBusy(true); viewButton.textContent = 'Sonuçlar hazırlanıyor…'; error.textContent = '';
    try {
      const url = link.value || await shareUrl(structuredClone(state), password.value);
      if (panel.isConnected) window.location.assign(url);
    } catch (e) { error.textContent = e.message || 'Sonuçlar açılamadı. Tekrar dene.'; }
    finally { setBusy(false); viewButton.textContent = 'Sonuçları gör →'; }
  });
  button.addEventListener('click', async () => {
    setBusy(true);
    button.textContent = 'Link hazırlanıyor…'; status.textContent = ''; error.textContent = ''; field.hidden = true;
    const protectedLink = password.value.length > 0;
    try {
      const pendingUrl = shareUrl(structuredClone(state), password.value);
      // Start clipboard.write during the click gesture, before password derivation
      // finishes, to preserve clipboard access in Safari as well as Chromium.
      let copying;
      try {
        if (navigator.clipboard?.write && globalThis.ClipboardItem) {
          copying = navigator.clipboard.write([new ClipboardItem({ 'text/plain': pendingUrl.then(url => new Blob([url], { type: 'text/plain' })) })]).then(() => true, () => false);
        }
      } catch { /* Manual copying remains available when clipboard access is denied. */ }
      const url = await pendingUrl;
      link.value = url; field.hidden = false;
      let copied = copying ? await copying : false;
      if (!copying && navigator.clipboard?.writeText) {
        try { await navigator.clipboard.writeText(url); copied = true; } catch { /* Show the selectable link below. */ }
      }
      status.textContent = copied ? `Link kopyalandı.${protectedLink ? ' Seçtiğin parolayı alıcıya ayrıca ilet.' : ' Linki bilen herkes sonuçlarını açabilir.'}` : 'Link hazır. Aşağıdaki alanı seçip linki kopyala.';
      if (!copied && panel.isConnected) { link.focus(); link.select(); }
    } catch (e) { error.textContent = e.message || 'Paylaşım linki hazırlanamadı. Tekrar dene.'; }
    finally { setBusy(false); button.textContent = 'Paylaşım linkini kopyala ↗'; }
  });
}
