import { workbookValues } from './core.js';
import { characterHtml, matchingCharacters } from './behavior-characters.js';

// Use exactly the same evaluated cells as the exported workbook.
export function resultScores(survey, state) {
  const sheets = workbookValues(survey, state);
  return {
    communication: ['E3', 'E4', 'E5', 'E6'].map(ref => sheets[3][ref]),
    behavior: ['G17', 'H17', 'J17', 'K17'].map(ref => sheets[5][ref]),
    motivation: state.motivationSkipped ? null : ['K4', 'K5', 'K6', 'K7'].map(ref => sheets[7][ref]),
    control: sheets[9].F30,
  };
}

const escapeHtml = value => String(value ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"})[c]);
const leaders = (labels, values) => labels.filter((_, i) => values[i] === Math.max(...values)).join(" · ");

function bars(labels, values, max) {
  return `<div class="score-bars">${labels.map((label, i) => `<div class="score-row ${values[i] === Math.max(...values) ? 'is-leading' : ''}"><div class="score-label"><span>${label}</span><strong>${values[i]} <small>/ ${max}</small></strong></div><svg class="score-bar tone-${i}" viewBox="0 0 400 12" preserveAspectRatio="none" aria-hidden="true"><rect width="400" height="12" rx="6" class="bar-track"/><rect width="${values[i] / max * 400}" height="12" rx="6" class="bar-value"/></svg></div>`).join('')}</div>`;
}

export function resultsHtml(survey, state, colorOverride = '') {
  const scores = resultScores(survey, state);
  const [direct, indirect, people, task] = scores.behavior;
  const matches = matchingCharacters(scores.behavior, colorOverride);
  const communication = leaders(['Güvenli', 'Pasif', 'Agresif', 'Pasif-agresif'], scores.communication);
  const motivation = scores.motivation ? leaders(['Başarı', 'Etkileme', 'İlişkiler', 'Güvenlik'], scores.motivation) : 'Gözlem bekleniyor';
  const theme = matches.length === 1 ? matches[0].id : 'blend';
  // Same rectangle as the workbook: indirect left, direct right,
  // task above and people below the central origin. Each axis runs 0–14.
  const x = 220 - indirect * 10, y = 190 - task * 10;
  const marker = 30 + scores.control / 23 * 380;
  return `<section class="results participant-report" data-report-tone="${theme}" aria-labelledby="results-title">
    <header class="report-header"><div class="report-edition"><span class="report-live" aria-hidden="true"></span> ENVANTER / BİREYSEL PROFİL <span>01—04</span></div>
      <div class="report-identity"><div><span class="eyebrow">HER EKİBİN KENDİNE ÖZGÜ BİR RİTMİ VAR.</span><h2 id="results-title">${escapeHtml(state.profile?.name || 'Katılımcı')}</h2><p>${escapeHtml(state.profile?.title || 'Bireysel değerlendirme')} <span>·</span> Dört boyutta bir bakış.</p></div><button type="button" class="report-focus" data-report-focus aria-pressed="false">↗ Sunum görünümü</button></div>
      <nav class="report-nav" aria-label="Profil bölümleri"><a href="#report-behavior"><span>01</span> Davranış</a><a href="#report-communication"><span>02</span> İletişim</a><a href="#report-motivation"><span>03</span> Motivasyon</a><a href="#report-control"><span>04</span> Kontrol odağı</a></nav>
    </header>
    <div class="results-grid">
      <article class="result-card behavior-result" id="report-behavior"><div class="behavior-intro"><div><span class="result-kicker">01 / DAVRANIŞ İMZASI</span><h3>Bir karakter.<br><em>Kendine özgü bir denge.</em></h3></div><p>Dört yön, tek harita. Renkli alan yanıtlarınla oluşur; karakter bu dağılımın görsel bir benzetmesidir.</p></div>
        <div class="behavior-signature">${matches.length ? matches.map(c=>`<span>${c.emoji} ${c.name} <small>${c.color}</small></span>`).join('') : `<span>${escapeHtml(colorOverride)}</span>`}<span class="signature-caption">${colorOverride.trim() ? 'Yönetici renk seçimi' : 'En geniş davranış alanı'}${matches.length>1 ? ' · Birden çok renk' : ''}</span></div>
        <div class="behavior-layout"><div class="behavior-map-panel"><div class="map-heading"><span>DAVRANIŞ PUSULASI</span><span>0—14 / yön</span></div><svg class="behavior-chart" viewBox="0 0 440 380" role="img" aria-labelledby="behavior-title behavior-desc"><title id="behavior-title">Davranış tarzı haritası</title><desc id="behavior-desc">Direkt ${direct}, indirekt ${indirect}, insan odaklı ${people}, iş odaklı ${task}. Renkli dikdörtgen merkezden bu puanlar kadar uzanır.</desc>
          <rect x="80" y="50" width="140" height="140" rx="8" fill="#eaf0f9"/><rect x="220" y="50" width="140" height="140" rx="8" fill="#faeae5"/><rect x="80" y="190" width="140" height="140" rx="8" fill="#eaf2e6"/><rect x="220" y="190" width="140" height="140" rx="8" fill="#faf2d9"/>
          <path d="M80 120H360 M80 260H360 M150 50V330 M290 50V330" class="map-grid"/>
          <rect x="${x}" y="${y}" width="${(indirect + direct) * 10}" height="${(task + people) * 10}" class="behavior-area"/>
          <path d="M80 190H360 M220 50V330" class="map-axis"/><circle cx="220" cy="190" r="4" fill="#304d3f"/>
          <text x="220" y="25" text-anchor="middle">İş odaklı · ${task}</text><text x="220" y="360" text-anchor="middle">İnsan odaklı · ${people}</text>
          <text x="72" y="184" text-anchor="end">İndirekt</text><text x="72" y="204" text-anchor="end">${indirect}</text><text x="368" y="184">Direkt</text><text x="368" y="204">${direct}</text>
        </svg>
        <dl class="behavior-values"><div><dt>Direkt</dt><dd>${direct}/14</dd></div><div><dt>İndirekt</dt><dd>${indirect}/14</dd></div><div><dt>İnsan odaklı</dt><dd>${people}/14</dd></div><div><dt>İş odaklı</dt><dd>${task}/14</dd></div></dl></div>${characterHtml(scores.behavior, colorOverride)}</div>
      </article>
      <article class="result-card communication-result" id="report-communication"><span class="result-kicker">02 / İLETİŞİM</span><h3>İletişimin rengi.</h3><div class="dimension-lead"><span>En yüksek puan</span><strong>${communication}</strong></div><p>Dört iletişim tarzının yanıtlarındaki dağılımı. Her tarz 10–50 puan.</p>${bars(['Güvenli', 'Pasif', 'Agresif', 'Pasif-agresif'], scores.communication, 50)}</article>
      <article class="result-card motivation-result" id="report-motivation"><span class="result-kicker">03 / MOTİVASYON</span><h3>Harekete geçiren ne?</h3><div class="dimension-lead"><span>${scores.motivation ? 'En yüksek puan' : 'Yeni başlangıç'}</span><strong>${motivation}</strong></div><p>Birlikte çalıştığın kişilere ilişkin yanıtlarının özeti. Her başlık 10–40 puan.</p>${scores.motivation ? bars(['Başarı', 'Etkileme', 'İlişkiler', 'Güvenlik'], scores.motivation, 40) : '<p class="motivation-missing">Yeni başladım: yeterli gözlem olmadığı için bu bölüm boş geçildi. Puan hesaplanmadı.</p>'}</article>
      <article class="result-card control-result" id="report-control"><span class="result-kicker">04 / KONTROL ODAĞI</span><h3>Etkinin kaynağı.</h3><p>Şablondaki 0–23 ölçeğinde konumun. Puan yükseldikçe gösterge iç kontrol odağına yaklaşır.</p><div class="control-score"><strong>${scores.control}</strong><span>/ 23 puan</span></div>
        <svg class="control-chart" viewBox="0 0 440 76" role="img" aria-label="Kontrol odağı: ${scores.control} / 23. Sıfır dış kontrol, 23 iç kontrol odağı."><defs><linearGradient id="control-gradient"><stop stop-color="#dda66c"/><stop offset="1" stop-color="#527d68"/></linearGradient></defs><rect x="30" y="20" width="380" height="14" rx="7" fill="url(#control-gradient)"/><circle cx="${marker}" cy="27" r="11" fill="#fff" stroke="#263d35" stroke-width="3"/><text x="30" y="65">0</text><text x="410" y="65" text-anchor="end">23</text></svg>
        <div class="control-labels"><span>Dış kontrol odağı</span><span>İç kontrol odağı</span></div>
      </article>
    </div>
    <footer class="report-footer"><span class="report-seal" aria-hidden="true">↗</span><p>Bir etiket değil, bir konuşma başlangıcı.<br><span>Excel ile aynı puanlar. Bu sonuçlar performans notu veya kişilik tanısı değildir.</span></p><span class="report-wordmark">envanter.</span></footer>
  </section>`;
}
