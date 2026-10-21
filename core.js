export const PAGE_SIZE = 5;
export const DRAFT_KEY = 'riseup:team-inventories:v1';

export function emptyState(survey) {
  return { version: survey.version, profile: { name: '', title: '' }, answers: Object.fromEntries(survey.sections.map(s => [s.id, {}])), step: 0, pages: {}, downloaded: false };
}

export function validAnswer(section, value) {
  return section.kind === 'choice' ? value === 'A' || value === 'B' : Number.isInteger(value) && value >= 1 && value <= section.max;
}

export function restoreState(survey, raw) {
  const state = emptyState(survey);
  try {
    const saved = JSON.parse(raw);
    if (!saved || saved.version !== survey.version) return state;
    for (const key of ['name', 'title']) if (typeof saved.profile?.[key] === 'string') state.profile[key] = saved.profile[key].replace(/[\u0000-\u001f]/g, '').slice(0, key === 'name' ? 80 : 100);
    for (const section of survey.sections) {
      for (const q of section.questions) {
        const value = saved.answers?.[section.id]?.[q.id];
        if (validAnswer(section, value)) state.answers[section.id][q.id] = value;
      }
      const page = saved.pages?.[section.id];
      if (Number.isInteger(page)) state.pages[section.id] = Math.min(Math.max(0, page), Math.ceil(section.count / PAGE_SIZE) - 1);
    }
    if (Number.isInteger(saved.step)) state.step = Math.min(survey.sections.length + 1, Math.max(0, saved.step));
    state.downloaded = saved.downloaded === true;
  } catch { /* A missing or invalid draft starts a clean form. */ }
  return state;
}

export function profileIsValid(profile) {
  return typeof profile?.name === 'string' && profile.name.trim().length >= 2 && profile.name.trim().length <= 80 && typeof profile?.title === 'string' && profile.title.trim().length >= 2 && profile.title.trim().length <= 100 && !/[\u0000-\u001f]/.test(profile.name + profile.title);
}

export function answeredCount(section, state) {
  return section.questions.filter(q => validAnswer(section, state.answers[section.id]?.[q.id])).length;
}

export function totalAnswered(survey, state) {
  return survey.sections.reduce((count, s) => count + answeredCount(s, state), 0);
}

export function missingQuestions(section, state) {
  return section.questions.filter(q => !validAnswer(section, state.answers[section.id]?.[q.id]));
}

export function assertComplete(survey, state) {
  if (!profileIsValid(state.profile)) throw new Error('Ad-soyad ve unvan bilgilerini kontrol et.');
  if (totalAnswered(survey, state) !== survey.totalQuestions) throw new Error('Excel’i indirmeden önce tüm soruları cevapla.');
}

// This is deliberately limited to the three formula patterns present in the
// supplied workbook. Unsupported formulas fail rather than produce silent zeros.
export function evaluateSheet(formulas, inputs, blankCells = []) {
  const values = { ...inputs };
  const visiting = new Set();
  function read(ref) {
    if (Object.hasOwn(values, ref)) return values[ref];
    const formula = formulas[ref];
    if (!formula && blankCells.includes(ref)) return 0;
    if (!formula) throw new Error(`Formülün başvurduğu hücre bulunamadı: ${ref}`);
    if (visiting.has(ref)) throw new Error(`Döngüsel formül: ${ref}`);
    visiting.add(ref);
    let result;
    let match;
    if ((match = /^([A-Z]+\d+)$/.exec(formula))) result = read(match[1]);
    else if ((match = /^IF\(([A-Z]+\d+)=(\d+),(\d+),(\d+)\)$/.exec(formula))) result = read(match[1]) === Number(match[2]) ? Number(match[3]) : Number(match[4]);
    else if ((match = /^SUM\((.+)\)$/.exec(formula))) {
      const range = /^([A-Z]+)(\d+):\1(\d+)$/.exec(match[1]);
      const refs = range ? Array.from({ length: Number(range[3]) - Number(range[2]) + 1 }, (_, i) => `${range[1]}${Number(range[2]) + i}`) : match[1].split('+');
      if (!refs.length || refs.some(r => !/^[A-Z]+\d+$/.test(r))) throw new Error(`Desteklenmeyen SUM: ${formula}`);
      result = refs.reduce((sum, r) => sum + read(r), 0);
    } else throw new Error(`Desteklenmeyen formül: ${formula}`);
    if (!Number.isFinite(result)) throw new Error(`Geçersiz formül sonucu: ${ref}`);
    visiting.delete(ref);
    values[ref] = result;
    return result;
  }
  Object.keys(formulas).forEach(read);
  return values;
}

export function workbookValues(survey, state) {
  assertComplete(survey, state);
  const sheets = {};
  for (const section of survey.sections) {
    const source = {}, evaluation = {};
    for (const q of section.questions) {
      const value = state.answers[section.id][q.id];
      source[q.cell] = value;
      evaluation[q.evaluationCell] = section.kind === 'choice' ? (value === 'A' ? 1 : 2) : value;
    }
    sheets[section.sheet] = source;
    sheets[section.evaluationSheet] = evaluateSheet(survey.formulas[section.evaluationSheet], evaluation, survey.blankCells?.[section.evaluationSheet]);
  }
  return sheets;
}

export function downloadFilename(profile, now = new Date()) {
  const name = profile.name.trim().normalize('NFC').replace(/[^\p{L}\p{N} -]/gu, '').replace(/[\s-]+/g, '-').slice(0, 80) || 'Katilimci';
  const date = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Istanbul', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
  return `RiseUp-${name}-${date}.xlsx`;
}
