import { workbookValues } from './core.js';

// Use exactly the same evaluated cells as the exported workbook.
export function resultScores(survey, state) {
  const sheets = workbookValues(survey, state);
  return {
    communication: ['E3', 'E4', 'E5', 'E6'].map(ref => sheets[3][ref]),
    behavior: ['G17', 'H17', 'J17', 'K17'].map(ref => sheets[5][ref]),
    motivation: ['K4', 'K5', 'K6', 'K7'].map(ref => sheets[7][ref]),
    control: sheets[9].F30,
  };
}

function bars(labels, values, max) {
  return `<div class="score-bars">${labels.map((label, i) => `<div class="score-row"><div class="score-label"><span>${label}</span><strong>${values[i]} <small>/ ${max}</small></strong></div><svg class="score-bar tone-${i}" viewBox="0 0 400 12" preserveAspectRatio="none" aria-hidden="true"><rect width="400" height="12" rx="6" class="bar-track"/><rect width="${values[i] / max * 400}" height="12" rx="6" class="bar-value"/></svg></div>`).join('')}</div>`;
}

export function resultsHtml(survey, state) {
  const scores = resultScores(survey, state);
  const [direct, indirect, people, task] = scores.behavior;
  // Same rectangle as the workbook: indirect left, direct right,
  // task above and people below the central origin. Each axis runs 0–14.
  const x = 220 - indirect * 10, y = 190 - task * 10;
  const marker = 30 + scores.control / 23 * 380;
  return `<section class="results" aria-labelledby="results-title">
    <div class="results-heading"><span class="eyebrow">YANITLARININ GÖRSEL ÖZETİ</span><h2 id="results-title">Kendine bir de buradan bak.</h2><p>Excel’deki değerlendirmelerin, aynı puanlarla burada. Bu sonuçlar bir performans notu değildir.</p></div>
    <div class="results-grid">
      <article class="result-card"><span class="result-kicker">01 / İLETİŞİM</span><h3>İletişim tarzın</h3><p>Her tarz için 10 sorunun toplamı · 10–50 puan.</p>${bars(['Güvenli', 'Pasif', 'Agresif', 'Pasif-agresif'], scores.communication, 50)}</article>
      <article class="result-card"><span class="result-kicker">02 / DAVRANIŞ</span><h3>Davranış haritan</h3><p>Renkli alan, Excel’deki dört yönlü puan haritasını gösterir. Her yönde en fazla 14 puan.</p>
        <svg class="behavior-chart" viewBox="0 0 440 380" role="img" aria-labelledby="behavior-title behavior-desc"><title id="behavior-title">Davranış tarzı haritası</title><desc id="behavior-desc">Direkt ${direct}, indirekt ${indirect}, insan odaklı ${people}, iş odaklı ${task}. Renkli dikdörtgen merkezden bu puanlar kadar uzanır.</desc>
          <rect x="80" y="50" width="140" height="140" rx="8" fill="#eaf0f9"/><rect x="220" y="50" width="140" height="140" rx="8" fill="#faeae5"/><rect x="80" y="190" width="140" height="140" rx="8" fill="#eaf2e6"/><rect x="220" y="190" width="140" height="140" rx="8" fill="#faf2d9"/>
          <path d="M80 120H360 M80 260H360 M150 50V330 M290 50V330" class="map-grid"/>
          <rect x="${x}" y="${y}" width="${(indirect + direct) * 10}" height="${(task + people) * 10}" class="behavior-area"/>
          <path d="M80 190H360 M220 50V330" class="map-axis"/><circle cx="220" cy="190" r="4" fill="#304d3f"/>
          <text x="220" y="25" text-anchor="middle">İş odaklı · ${task}</text><text x="220" y="360" text-anchor="middle">İnsan odaklı · ${people}</text>
          <text x="72" y="184" text-anchor="end">İndirekt</text><text x="72" y="204" text-anchor="end">${indirect}</text><text x="368" y="184">Direkt</text><text x="368" y="204">${direct}</text>
        </svg>
        <dl class="behavior-values"><div><dt>Direkt</dt><dd>${direct}/14</dd></div><div><dt>İndirekt</dt><dd>${indirect}/14</dd></div><div><dt>İnsan odaklı</dt><dd>${people}/14</dd></div><div><dt>İş odaklı</dt><dd>${task}/14</dd></div></dl>
      </article>
      <article class="result-card"><span class="result-kicker">03 / MOTİVASYON</span><h3>Motivasyon ihtiyacı</h3><p>Birlikte çalıştığın kişilere ilişkin yanıtlarının özeti. Her başlık 10–40 puan.</p>${bars(['Başarı', 'Etkileme', 'İlişkiler', 'Güvenlik'], scores.motivation, 40)}</article>
      <article class="result-card control-result"><span class="result-kicker">04 / KONTROL ODAĞI</span><h3>İç–dış motivasyon</h3><p>Şablondaki 0–23 ölçeğinde konumun. Puan yükseldikçe gösterge iç kontrol odağına yaklaşır.</p><div class="control-score"><strong>${scores.control}</strong><span>/ 23 puan</span></div>
        <svg class="control-chart" viewBox="0 0 440 76" role="img" aria-label="Kontrol odağı: ${scores.control} / 23. Sıfır dış kontrol, 23 iç kontrol odağı."><defs><linearGradient id="control-gradient"><stop stop-color="#dda66c"/><stop offset="1" stop-color="#527d68"/></linearGradient></defs><rect x="30" y="20" width="380" height="14" rx="7" fill="url(#control-gradient)"/><circle cx="${marker}" cy="27" r="11" fill="#fff" stroke="#263d35" stroke-width="3"/><text x="30" y="65">0</text><text x="410" y="65" text-anchor="end">23</text></svg>
        <div class="control-labels"><span>Dış kontrol odağı</span><span>İç kontrol odağı</span></div>
      </article>
    </div>
  </section>`;
}
