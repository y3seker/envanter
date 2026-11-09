import { emptyState, profileIsValid, answersComplete, sectionSkipped, validAnswer } from './core.js';
import { resultScores } from './results.js';

const FORMAT = 2;
const ITERATIONS = 600000;
const MAX_TOKEN_LENGTH = 4096;
const encoder = new TextEncoder();
const invalidLink = () => new Error('Paylaşım linki geçersiz veya eksik. Linkin tamamını kopyaladığından emin ol.');

function cryptoApi() {
  if (!globalThis.crypto?.subtle) throw new Error('Paylaşım için siteyi HTTPS üzerinden veya yerel önizlemede aç.');
  return globalThis.crypto;
}

function join(...arrays) {
  const bytes = new Uint8Array(arrays.reduce((n, a) => n + a.length, 0));
  let offset = 0;
  for (const array of arrays) { bytes.set(array, offset); offset += array.length; }
  return bytes;
}

function toBase64(bytes) {
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64(token) {
  if (typeof token !== 'string' || !token.length || token.length > MAX_TOKEN_LENGTH || !/^[\w-]+$/.test(token) || token.length % 4 === 1) throw invalidLink();
  try {
    const bytes = Uint8Array.from(atob(token.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0));
    if (toBase64(bytes) !== token) throw invalidLink();
    return bytes;
  } catch { throw invalidLink(); }
}

// Bind the answer order and wording to the link so later survey changes fail
// explicitly rather than silently assigning old answers to new questions.
async function surveyId(survey) {
  const schema = { version: survey.version, sections: survey.sections.map(s => ({ id: s.id, kind: s.kind, max: s.max, questions: s.questions })) };
  return new Uint8Array(await cryptoApi().subtle.digest('SHA-256', encoder.encode(JSON.stringify(schema)))).slice(0, 16);
}

function answerFields(survey, state) {
  return survey.sections.filter(s => !sectionSkipped(s, state)).flatMap(section => section.questions.map(question => ({ section, question, bits: section.kind === 'choice' ? 1 : Math.ceil(Math.log2(section.max)) })));
}

function packReport(survey, state) {
  if (!profileIsValid(state.profile)) throw new Error('Önce ad-soyad ve unvan bilgilerini tamamla.');
  if (!answersComplete(survey, state)) throw new Error('Paylaşmadan önce eksik yanıtlarını tamamla.');
  const scores = resultScores(survey, state);
  assertReportScores(scores);
  const metadata = encoder.encode(JSON.stringify([state.profile.name.trim(), state.profile.title.trim()]));
  const values = [...scores.communication, ...scores.behavior, ...(scores.motivation || []), scores.control];
  return join(new Uint8Array([scores.motivation === null ? 1 : 0, metadata.length >> 8, metadata.length & 255]), metadata, new Uint8Array(values));
}

function assertReportScores(scores) {
  const four = (values, min, max) => Array.isArray(values) && values.length === 4 && values.every(n => Number.isInteger(n) && n >= min && n <= max);
  if (!four(scores.communication, 10, 50) || !four(scores.behavior, 0, 14) ||
      scores.behavior[0] + scores.behavior[1] !== 14 || scores.behavior[2] + scores.behavior[3] !== 14 ||
      (scores.motivation !== null && !four(scores.motivation, 10, 40)) ||
      !Number.isInteger(scores.control) || scores.control < 0 || scores.control > 23) throw invalidLink();
}

function unpackReport(bytes) {
  if (bytes.length < 3 || ![0, 1].includes(bytes[0])) throw invalidLink();
  const motivationSkipped = bytes[0] === 1;
  const length = (bytes[1] << 8) | bytes[2];
  if (bytes.length !== 3 + length + (motivationSkipped ? 9 : 13)) throw invalidLink();
  let metadata;
  try { metadata = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes.slice(3, 3 + length))); } catch { throw invalidLink(); }
  if (!Array.isArray(metadata) || metadata.length !== 2) throw invalidLink();
  const profile = { name: metadata[0], title: metadata[1] };
  if (!profileIsValid(profile)) throw invalidLink();
  const values = Array.from(bytes.slice(3 + length));
  const scores = { communication: values.slice(0, 4), behavior: values.slice(4, 8), motivation: motivationSkipped ? null : values.slice(8, 12), control: values.at(-1) };
  assertReportScores(scores);
  return { profile, scores, motivationSkipped };
}

async function unpack(survey, bytes) {
  if (!survey) throw new Error('Eski paylaşım linkini açmak için sorular yüklenemedi. Tekrar dene.');
  const expected = await surveyId(survey);
  if (!expected.every((v, i) => v === bytes[i])) throw new Error('Bu link farklı bir soru sürümüyle oluşturulmuş. Sonuçlar güncel sorularla açılamıyor.');
  const length = (bytes[16] << 8) | bytes[17];
  let metadata;
  try { metadata = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes.slice(18, 18 + length))); } catch { throw invalidLink(); }
  if (!Array.isArray(metadata) || metadata.length !== 4 || metadata[0] !== survey.version || typeof metadata[3] !== 'boolean') throw invalidLink();
  const state = emptyState(survey);
  state.profile = { name: metadata[1], title: metadata[2] };
  state.motivationSkipped = metadata[3];
  if (!profileIsValid(state.profile)) throw invalidLink();
  const fields = answerFields(survey, state);
  const bitCount = fields.reduce((n, f) => n + f.bits, 0);
  const answers = bytes.slice(18 + length);
  if (answers.length !== Math.ceil(bitCount / 8)) throw invalidLink();
  let bit = 0;
  for (const { section, question, bits } of fields) {
    let value = 0;
    for (let b = 0; b < bits; b++, bit++) value |= ((answers[bit >> 3] >> (bit % 8)) & 1) << b;
    const answer = section.kind === 'choice' ? (value ? 'B' : 'A') : value + 1;
    if (!validAnswer(section, answer)) throw invalidLink();
    state.answers[section.id][question.id] = answer;
  }
  if (bitCount % 8 && answers.at(-1) >> (bitCount % 8)) throw invalidLink();
  state.step = 5;
  return state;
}

async function passwordKey(password, salt) {
  const { subtle } = cryptoApi();
  const material = await subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, ['deriveKey']);
  return subtle.deriveKey({ name: 'PBKDF2', hash: 'SHA-256', iterations: ITERATIONS, salt }, material, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}

function parseToken(token) {
  const bytes = fromBase64(token);
  if (![1, FORMAT].includes(bytes[0]) || ![0, 1].includes(bytes[1])) throw invalidLink();
  const passwordProtected = bytes[1] === 1;
  const keyEnd = passwordProtected ? 18 : 34;
  if (bytes.length < keyEnd + 12 + 16 + (bytes[0] === 1 ? 18 : 12)) throw invalidLink();
  return { format: bytes[0], passwordProtected, header: bytes.slice(0, 2), keyBytes: bytes.slice(2, keyEnd), iv: bytes.slice(keyEnd, keyEnd + 12), ciphertext: bytes.slice(keyEnd + 12) };
}

export function inspectShareToken(token) {
  const { passwordProtected, format } = parseToken(token);
  return { passwordProtected, format };
}

export function tokenFromHash(hash) {
  const params = new URLSearchParams(hash.replace(/^#/, ''));
  if (params.getAll('r').length !== 1) throw invalidLink();
  const token = params.get('r');
  inspectShareToken(token);
  return token;
}

export async function createShareToken(survey, state, password = '') {
  if (typeof password !== 'string' || password.length > 128) throw new Error('Parola en fazla 128 karakter olabilir.');
  const api = cryptoApi();
  const payload = packReport(survey, state);
  const header = new Uint8Array([FORMAT, password ? 1 : 0]);
  const keyBytes = api.getRandomValues(new Uint8Array(password ? 16 : 32));
  const iv = api.getRandomValues(new Uint8Array(12));
  const key = password ? await passwordKey(password, keyBytes) : await api.subtle.importKey('raw', keyBytes, 'AES-GCM', false, ['encrypt', 'decrypt']);
  const ciphertext = new Uint8Array(await api.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: header }, key, payload));
  return toBase64(join(header, keyBytes, iv, ciphertext));
}

export async function openShareToken(survey, token, password = '') {
  const packet = parseToken(token);
  if (packet.passwordProtected && !password) throw new Error('Bu sonuçları açmak için paylaşan kişinin belirlediği parolayı gir.');
  if (typeof password !== 'string' || password.length > 128) throw new Error('Parola en fazla 128 karakter olabilir.');
  const { subtle } = cryptoApi();
  const key = packet.passwordProtected ? await passwordKey(password, packet.keyBytes) : await subtle.importKey('raw', packet.keyBytes, 'AES-GCM', false, ['decrypt']);
  let payload;
  try {
    payload = new Uint8Array(await subtle.decrypt({ name: 'AES-GCM', iv: packet.iv, additionalData: packet.header }, key, packet.ciphertext));
  } catch {
    throw new Error(packet.passwordProtected ? 'Parola yanlış veya paylaşım linki bozulmuş. Kontrol edip tekrar dene.' : 'Paylaşım linki bozulmuş. Paylaşan kişiden linki yeniden iste.');
  }
  return packet.format === 1 ? unpack(survey, payload) : unpackReport(payload);
}

export async function createShareUrl(survey, state, { password = '', baseUrl = globalThis.location?.href } = {}) {
  const url = new URL('./sonuc.html', baseUrl);
  url.hash = `r=${await createShareToken(survey, state, password)}`;
  return url.href;
}
