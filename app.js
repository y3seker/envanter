import { PAGE_SIZE, DRAFT_KEY, emptyState, restoreState, validAnswer, profileIsValid, answeredCount, totalAnswered, missingQuestions } from './core.js';
import { createWorkbook } from './excel.js';

const content = document.querySelector('#content');
const nav = document.querySelector('#step-nav');
const live = document.querySelector('#live-status');
const main = document.querySelector('#main');
const escape = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
let survey, state, storageAvailable = true, downloadedUrl;
let activeTemplateRequest;

function save() {
  try { sessionStorage.setItem(DRAFT_KEY, JSON.stringify(state)); }
  catch { storageAvailable = false; }
  const label = document.querySelector('#saved-label');
  if (label) label.textContent = storageAvailable ? 'Bu sekmede kaydedildi' : 'Yenilemeden tamamla';
}

function status(message) { live.textContent = message; }
function progress() { return totalAnswered(survey, state); }
function stepName() { return state.step === 0 ? 'Başlamadan önce' : state.step === 5 ? 'Gözden geçir' : survey.sections[state.step - 1].title; }

function renderNav() {
  const steps = [{ title: 'Seni tanıyalım', detail: 'Başlamadan önce', complete: profileIsValid(state.profile) }, ...survey.sections.map(s => ({ title: s.title, detail: `${answeredCount(s, state)} / ${s.count} soru`, complete: answeredCount(s, state) === s.count })), { title: 'Gözden geçir & indir', detail: 'Son bir kontrol', complete: state.downloaded }];
  nav.innerHTML = `<ol class="step-list">${steps.map((s, i) => `<li><button type="button" class="step-button ${s.complete ? 'complete' : ''}" data-step="${i}" ${state.step === i ? 'aria-current="step"' : ''} aria-label="${i + 1}. ${s.title}, ${s.detail}"><span class="step-index" aria-hidden="true">${s.complete ? '✓' : String(i + 1).padStart(2, '0')}</span><span><span class="step-name">${s.title}</span><span class="step-detail">${s.detail}</span></span><span class="step-arrow" aria-hidden="true">${state.step === i ? '›' : ''}</span></button></li>`).join('')}</ol><div class="mobile-progress"><strong>${escape(stepName())}</strong><span>${progress()} / ${survey.totalQuestions} soru</span></div><div class="overall-progress"><div class="progress-track" role="progressbar" aria-label="Toplam ilerleme" aria-valuemin="0" aria-valuemax="${survey.totalQuestions}" aria-valuenow="${progress()}"><div class="progress-fill" id="total-progress-fill"></div></div><p><span>Toplam ilerleme</span><span>${progress()} / ${survey.totalQuestions}</span></p></div>`;
  // Width uses a CSS custom property through the CSSOM; no inline HTML script.
  document.querySelector('#total-progress-fill').style.width = `${progress() / survey.totalQuestions * 100}%`;
}

function header(label) {
  return `<div class="content-header"><span class="eyebrow">${label}</span><span class="saved-label"><span class="status-dot"></span><span id="saved-label">${storageAvailable ? 'Bu sekmede kaydedildi' : 'Yenilemeden tamamla'}</span></span></div>`;
}

function welcome() {
  content.innerHTML = `${header('EKİP ENVANTERLERİ')}<section class="hero-card" aria-labelledby="welcome-title"><div class="welcome-main"><div><span class="eyebrow">KENDİNİ TANI. BİRLİKTE GELİŞ.</span><h1 id="welcome-title">Her güçlü ekip,<br>birbirini tanıyarak<br>başlar.</h1><p>Çalışma tarzını, iletişimini ve seni harekete geçirenleri keşfet. Dört kısa envanterle ekibinin gelişimine katkıda bulun.</p></div><div class="growth-art" aria-hidden="true"><div class="art-disc"></div><div class="art-orbit"></div><div class="art-orbit second"></div><div class="art-step s1"></div><div class="art-step s2"></div><div class="art-step s3"></div><span class="art-spark">✳</span><span class="art-caption">BİRLİKTE DAHA İLERİ</span></div></div><div class="welcome-facts"><div class="fact"><span class="fact-icon" aria-hidden="true">◷</span><span><b>Kendi hızında</b><small>Ara verip devam edebilirsin</small></span></div><div class="fact"><span class="fact-icon" aria-hidden="true">▤</span><span><b>4 envanter · 137 soru</b><small>Adım adım ilerle</small></span></div><div class="fact"><span class="fact-icon" aria-hidden="true">↧</span><span><b>Sonunda Excel’ini indir</b><small>Yöneticinle kendin paylaş</small></span></div></div></section><form id="profile-form" novalidate><section class="profile-panel"><div class="panel-title"><h2>Önce seni tanıyalım</h2><small>İki alan da gerekli</small></div><div class="profile-fields"><div class="field"><label for="full-name">Adın ve soyadın</label><input id="full-name" name="name" autocomplete="name" placeholder="Ad Soyad" required minlength="2" maxlength="80" value="${escape(state.profile.name)}"></div><div class="field"><label for="job-title">Unvanın</label><input id="job-title" name="title" autocomplete="organization-title" placeholder="Örn. Yazılım Geliştirici" required minlength="2" maxlength="100" value="${escape(state.profile.title)}"></div></div><p class="form-hint">Bu bilgiler, indireceğin Excel dosyasında yer alacak.</p><div id="profile-error" class="error-message" role="alert"></div></section><div class="privacy-note"><span class="lock" aria-hidden="true">◇</span><span>Bu bir performans değerlendirmesi değil. Yanıtların bu sekmede tutulur ve sunucuya gönderilmez. Son adımda dosyanı indirip yöneticinle sen paylaşacaksın.</span></div><div class="bottom-actions"><p class="bottom-help">Kendini olduğun gibi yansıtman yeterli.</p><button type="submit" class="button primary">${progress() ? 'Kaldığım yerden devam et' : 'Hadi başlayalım'}<span class="arrow" aria-hidden="true">↗</span></button></div></form>`;
}

function questionHtml(section, q) {
  const selected = state.answers[section.id]?.[q.id];
  const choice = section.kind === 'choice';
  const title = choice ? 'Sana daha yakın olan ifadeyi seç.' : q.text;
  const options = choice ? ['A', 'B'] : Array.from({ length: section.max }, (_, i) => i + 1);
  return `<fieldset class="question-card" id="question-${q.id}"><legend><span class="question-number" aria-hidden="true">${String(q.number).padStart(2, '0')}</span><span><span class="sr-only">Soru ${q.number}. </span>${escape(title)}</span></legend><div class="answers ${choice ? 'choice' : section.max === 4 ? 'four' : ''}">${options.map((value, i) => `<label class="answer-label"><input type="radio" name="${q.id}" value="${value}" data-section="${section.id}" ${selected === value ? 'checked' : ''} required>${choice ? `<span class="option-letter" aria-hidden="true">${value}</span><span class="option-text">${escape(q.options[i])}</span>` : `<span class="answer-value">${value}</span><span class="answer-caption">${escape(section.labels[i])}</span>`}</label>`).join('')}</div></fieldset>`;
}

function questionnaire() {
  const section = survey.sections[state.step - 1];
  const page = state.pages[section.id] || 0;
  const first = page * PAGE_SIZE;
  const questions = section.questions.slice(first, first + PAGE_SIZE);
  const lastPage = first + PAGE_SIZE >= section.count;
  content.innerHTML = `${header(`BÖLÜM ${state.step} / 4`)}<div class="survey-title"><h1>${section.title}</h1><p class="survey-description">${escape(section.instruction)}</p></div><div class="section-progress"><div class="progress-track" role="progressbar" aria-label="${section.title} ilerleme" aria-valuemin="0" aria-valuemax="${section.count}" aria-valuenow="${answeredCount(section, state)}"><div class="progress-fill" id="section-progress-fill"></div></div><span id="section-count">${answeredCount(section, state)} / ${section.count} cevaplandı</span></div>${section.kind === 'scale' ? `<div class="scale-guide"><span>${section.max === 5 ? 'Kendi davranışlarını değerlendir.' : 'Şirketimde birlikte çalıştığım kişiler…'}</span><span>1 = Hiçbir zaman · ${section.max} = Her zaman</span></div>` : ''}<div class="question-list">${questions.map(q => questionHtml(section, q)).join('')}</div><div id="question-error" class="error-message" role="alert"></div><div class="page-navigation"><span class="page-caption">${first + 1}–${Math.min(first + PAGE_SIZE, section.count)} / ${section.count} soru · Sayfa ${page + 1} / ${Math.ceil(section.count / PAGE_SIZE)}</span><div class="page-controls"><button class="button secondary" type="button" data-action="previous"><span aria-hidden="true">←</span>Geri</button><button class="button primary" type="button" data-action="next">${lastPage ? state.step === 4 ? 'Gözden geçir' : 'Sonraki envanter' : 'Sonraki sorular'}<span aria-hidden="true">→</span></button></div></div>`;
  document.querySelector('#section-progress-fill').style.width = `${answeredCount(section, state) / section.count * 100}%`;
}

function review() {
  const complete = progress() === survey.totalQuestions && profileIsValid(state.profile);
  content.innerHTML = `${header('SON ADIM · GÖZDEN GEÇİR')}<section class="review-header"><span class="eyebrow">${complete ? 'KENDİN İÇİN GÜZEL BİR ADIM ATTIN' : 'BİTİRMEYE BİRKAÇ ADIM KALDI'}</span><h1>${complete ? 'Tamamlandı.<br>Şimdi sıra paylaşmakta.' : 'Son bir kontrol yapalım.'}</h1><p>${complete ? 'Yanıtların hazır. Excel dosyanı indir ve yöneticinle paylaş. Dosyan, orijinal envanter şablonunda hazırlanacak.' : 'Aşağıdaki bölümlerden eksik bilgilerini tamamlayabilirsin. Excel’ini tüm soruları cevapladıktan sonra indirebilirsin.'}</p></section><div class="review-identity"><div><strong>${escape(state.profile.name.trim() || 'Ad-soyad eksik')}</strong><span>${escape(state.profile.title.trim() || 'Unvan eksik')}</span></div><button type="button" class="text-button" data-step="0">Bilgilerimi düzenle</button></div><div class="review-grid">${survey.sections.map((s, i) => { const count = answeredCount(s, state); return `<section class="review-item"><div class="review-item-header"><h2>${s.title}</h2><span class="count-pill ${count === s.count ? '' : 'missing'}">${count === s.count ? '✓ ' : ''}${count} / ${s.count}</span></div><button class="text-button" type="button" data-review="${i}">${count === s.count ? 'Yanıtları gözden geçir' : `${s.count - count} eksik yanıtı tamamla`}<span aria-hidden="true"> ↗</span></button></section>`; }).join('')}</div><section class="download-card"><div><h2>Yanıtların tek bir Excel dosyasında.</h2><p>Değerlendirme sekmeleri de otomatik doldurulur.<br>İndirdiğin .xlsx dosyasını yöneticine iletmen yeterli.</p></div><button class="button primary" id="download-button" type="button">Excel dosyamı indir<span class="arrow" aria-hidden="true">↓</span></button></section><div id="download-error" class="error-message" role="alert"></div><div id="download-success" ${state.downloaded ? '' : 'hidden'} class="download-success" role="status">Dosyan hazırlandı ve indirme başlatıldı. İndirmeler klasörünü kontrol edip Excel dosyanı yöneticinle paylaşabilirsin.<br><button class="text-button" id="finish-button" type="button">Bu sekmedeki bilgilerimi temizle</button></div><div class="download-steps"><span><b>1</b> Excel dosyanı indir</span><span><b>2</b> İndirdiğin dosyayı kontrol et</span><span><b>3</b> Yöneticinle paylaş</span></div>`;
}

function render({ focus = false } = {}) {
  renderNav();
  if (state.step === 0) welcome(); else if (state.step === 5) review(); else questionnaire();
  document.title = `${stepName()} · Rise Up`;
  if (focus) {
    main.focus({ preventScroll: true });
    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
    window.scrollTo({ top: window.innerWidth <= 760 ? main.offsetTop - 16 : 0, behavior: reduce ? 'instant' : 'smooth' });
  }
}

function go(step, page) {
  state.step = step;
  if (page !== undefined && step > 0 && step < 5) state.pages[survey.sections[step - 1].id] = page;
  save(); render({ focus: true });
}

function showQuestionError(questions) {
  const error = document.querySelector('#question-error');
  error.textContent = `Devam etmek için bu sayfadaki ${questions.length} eksik soruyu cevapla.`;
  for (const q of questions) {
    const card = document.getElementById(`question-${q.id}`);
    card.classList.add('invalid');
    card.querySelectorAll('input').forEach(input => { input.setAttribute('aria-invalid', 'true'); input.setAttribute('aria-describedby', 'question-error'); });
  }
  const first = document.querySelector(`#question-${questions[0].id} input`);
  first.focus();
  first.closest('fieldset').scrollIntoView({ block: 'center', behavior: 'smooth' });
}

function templateBytes() {
  if (!activeTemplateRequest) activeTemplateRequest = fetch('./assets/envanter-sablonu.xlsx').then(r => {
    if (!r.ok) throw new Error('Excel şablonuna ulaşılamadı. İnternet bağlantını kontrol edip tekrar dene.');
    return r.arrayBuffer();
  }).catch(e => { activeTemplateRequest = null; throw e; });
  return activeTemplateRequest;
}

async function download() {
  const error = document.querySelector('#download-error');
  if (!profileIsValid(state.profile)) { error.textContent = 'Önce ad-soyad ve unvan bilgilerini tamamla.'; return; }
  if (progress() !== survey.totalQuestions) { error.textContent = 'Excel’i indirmeden önce yukarıdaki eksik yanıtlarını tamamla.'; return; }
  const button = document.querySelector('#download-button');
  button.disabled = true; button.textContent = 'Excel’in hazırlanıyor…'; error.textContent = '';
  try {
    const snapshot = structuredClone(state);
    const result = await createWorkbook(survey, snapshot, await templateBytes());
    if (downloadedUrl) URL.revokeObjectURL(downloadedUrl);
    downloadedUrl = URL.createObjectURL(new Blob([result.bytes], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
    const link = document.createElement('a'); link.href = downloadedUrl; link.download = result.filename;
    document.body.append(link); link.click(); link.remove();
    state.downloaded = true; save(); renderNav();
    const success = document.querySelector('#download-success');
    if (success) success.hidden = false;
    status('Excel dosyan hazırlandı. İndirmeler klasörünü kontrol edip yöneticinle paylaş.');
  } catch (e) { error.textContent = e.message || 'Excel hazırlanırken bir sorun oluştu. Tekrar dene.'; }
  finally { button.disabled = false; button.innerHTML = 'Excel dosyamı indir<span class="arrow" aria-hidden="true">↓</span>'; }
}

content.addEventListener('input', event => {
  if (!survey || !state) return;
  if (event.target.matches('#full-name, #job-title')) {
    state.profile[event.target.name] = event.target.value;
    state.downloaded = false; save();
    event.target.removeAttribute('aria-invalid');
  }
});

content.addEventListener('change', event => {
  const input = event.target;
  if (!input.matches('input[data-section]')) return;
  const section = survey.sections.find(s => s.id === input.dataset.section);
  const value = section.kind === 'choice' ? input.value : Number(input.value);
  if (!validAnswer(section, value)) return;
  state.answers[section.id][input.name] = value;
  state.downloaded = false; save(); renderNav();
  input.closest('fieldset').classList.remove('invalid');
  input.closest('fieldset').querySelectorAll('input').forEach(r => { r.removeAttribute('aria-invalid'); r.removeAttribute('aria-describedby'); });
  const count = answeredCount(section, state);
  document.querySelector('#section-count').textContent = `${count} / ${section.count} cevaplandı`;
  const fill = document.querySelector('#section-progress-fill');
  fill.style.width = `${count / section.count * 100}%`;
  fill.parentElement.setAttribute('aria-valuenow', count);
  const first = (state.pages[section.id] || 0) * PAGE_SIZE;
  if (!section.questions.slice(first, first + PAGE_SIZE).some(q => !validAnswer(section, state.answers[section.id][q.id]))) document.querySelector('#question-error').textContent = '';
});

content.addEventListener('submit', event => {
  if (event.target.id !== 'profile-form') return;
  event.preventDefault();
  state.profile.name = state.profile.name.trim(); state.profile.title = state.profile.title.trim();
  if (!profileIsValid(state.profile)) {
    document.querySelector('#profile-error').textContent = 'Ad-soyad ve unvan alanlarını en az ikişer karakter olacak şekilde doldur.';
    for (const [key, id] of [['name', 'full-name'], ['title', 'job-title']]) document.getElementById(id).setAttribute('aria-invalid', state.profile[key].length < 2 ? 'true' : 'false');
    document.querySelector('input[aria-invalid="true"]')?.focus();
    return;
  }
  const incomplete = survey.sections.findIndex(s => answeredCount(s, state) !== s.count);
  if (incomplete < 0) go(5); else {
    const section = survey.sections[incomplete];
    const q = missingQuestions(section, state)[0];
    go(incomplete + 1, Math.floor((q.number - 1) / PAGE_SIZE));
  }
});

document.addEventListener('click', event => {
  const button = event.target.closest('button');
  if (!button || !survey || !state) return;
  if (button.hasAttribute('data-step')) go(Number(button.dataset.step));
  if (button.hasAttribute('data-review')) {
    const index = Number(button.dataset.review), section = survey.sections[index];
    const q = missingQuestions(section, state)[0];
    go(index + 1, q ? Math.floor((q.number - 1) / PAGE_SIZE) : 0);
  }
  if (button.dataset.action) {
    const section = survey.sections[state.step - 1], page = state.pages[section.id] || 0;
    if (button.dataset.action === 'previous') {
      if (page) go(state.step, page - 1);
      else go(state.step - 1, state.step > 1 ? Math.ceil(survey.sections[state.step - 2].count / PAGE_SIZE) - 1 : undefined);
    } else {
      const questions = section.questions.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
      const missing = questions.filter(q => !validAnswer(section, state.answers[section.id][q.id]));
      if (missing.length) { showQuestionError(missing); return; }
      if ((page + 1) * PAGE_SIZE >= section.count) {
        const earlier = missingQuestions(section, state)[0];
        if (earlier) { go(state.step, Math.floor((earlier.number - 1) / PAGE_SIZE)); return; }
        go(state.step + 1, 0);
      } else go(state.step, page + 1);
    }
  }
  if (button.id === 'download-button') download();
  if (['reset-button', 'finish-button'].includes(button.id)) document.querySelector('#reset-dialog').showModal();
  if (button.id === 'cancel-reset') document.querySelector('#reset-dialog').close();
  if (button.id === 'confirm-reset') {
    document.querySelector('#reset-dialog').close();
    if (downloadedUrl) { URL.revokeObjectURL(downloadedUrl); downloadedUrl = undefined; }
    state = emptyState(survey);
    try { sessionStorage.removeItem(DRAFT_KEY); } catch { /* Storage may be disabled. */ }
    render({ focus: true }); status('Bu sekmedeki tüm yanıtlar ve kişisel bilgiler temizlendi.');
  }
});

async function init() {
  try {
    const response = await fetch('./data/survey.json', { cache: 'no-store' });
    if (!response.ok) throw new Error('Sorular yüklenemedi.');
    survey = await response.json();
    let raw = null;
    try { raw = sessionStorage.getItem(DRAFT_KEY); } catch { storageAvailable = false; }
    state = restoreState(survey, raw);
    render();
  } catch {
    content.innerHTML = '<div class="loading-card"><h2>Sayfa yüklenemedi.</h2><p>Bağlantını kontrol edip tekrar dene. Yerel dosyayı açıyorsan uygulamayı bir HTTP sunucusuyla başlat.</p><button type="button" id="retry-button" class="button primary retry-action">Tekrar dene</button></div>';
    document.querySelector('#retry-button').addEventListener('click', () => location.reload());
  }
}
init();
