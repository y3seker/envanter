import { workbookValues, downloadFilename } from './core.js';

const escapeXml = value => String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');

// Patch the known template's XML instead of rewriting it with a spreadsheet
// library. This preserves drawings, styles, print areas, formulas and media.
export function setCell(xml, ref, value, formula = null) {
  // Artifact/Office writers may prefix the spreadsheet namespace.
  const prefix = /<(\w+):worksheet\b/.exec(xml)?.[1];
  if (prefix) {
    xml = xml.replace(new RegExp(`(<\\/?){1}${prefix}:`, 'g'), '$1');
    xml = xml.replace('<worksheet ', '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" ');
  }
  const pattern = new RegExp(`<c\\b([^>]*\\br="${ref}"[^>]*?)(?:\\/>|>[\\s\\S]*?<\\/c>)`);
  const existing = pattern.exec(xml);
  const attributes = existing ? existing[1].replace(/\s+t="[^"]*"/g, '').replace(/\/$/, '') : ` r="${ref}"`;
  const contents = formula !== null ? `<f>${escapeXml(formula)}</f><v>${value}</v>` : typeof value === 'number' ? `<v>${value}</v>` : `<is><t xml:space="preserve">${escapeXml(value)}</t></is>`;
  const type = typeof value === 'string' && formula === null ? ' t="inlineStr"' : '';
  const cell = `<c${attributes}${type}>${contents}</c>`;
  if (existing) return xml.replace(pattern, () => cell);
  const row = /\d+$/.exec(ref)?.[0];
  const rowPattern = new RegExp(`(<row\\b[^>]*\\br="${row}"[^>]*>)([\\s\\S]*?)(<\\/row>)`);
  if (!rowPattern.test(xml)) throw new Error(`Excel şablonunda satır bulunamadı: ${ref}`);
  const colIndex = value => /^[A-Z]+/.exec(value)[0].split('').reduce((n, letter) => n * 26 + letter.charCodeAt(0) - 64, 0);
  return xml.replace(rowPattern, (_, start, cells, end) => {
    let inserted = false;
    const updated = cells.replace(/<c\b[^>]*\br="([A-Z]+\d+)"[^>]*?(?:\/>|>[\s\S]*?<\/c>)/g, (next, coordinate) => {
      if (!inserted && colIndex(coordinate) > colIndex(ref)) { inserted = true; return cell + next; }
      return next;
    });
    return start + updated + (inserted ? '' : cell) + end;
  });
}

function replaceDrawingText(xml, original, replacement) {
  const target = `<a:t>${original}</a:t>`;
  if (!xml.includes(target)) throw new Error('Excel kimlik alanı bulunamadı.');
  return xml.replace(target, () => `<a:t>${escapeXml(replacement)}</a:t>`);
}

function anchorPosition(tag, col, row, offset = 0) {
  return `<xdr:${tag}><xdr:col>${col}</xdr:col><xdr:colOff>${offset}</xdr:colOff><xdr:row>${row}</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:${tag}>`;
}

export function updateBehaviorDrawing(xml, values) {
  // The worksheet axes meet at the boundary after Z22. Each unit is one
  // row/column: left=indirect, right=direct, up=task, down=people.
  return xml.replace(/<xdr:twoCellAnchor\b[^>]*>[\s\S]*?<\/xdr:twoCellAnchor>/g, anchor => {
    if (!anchor.includes('name="Rectangle 1"')) return anchor;
    return anchor
      .replace(/<xdr:from>[\s\S]*?<\/xdr:from>/, anchorPosition('from', 26 - values.H17, 22 - values.K17))
      .replace(/<xdr:to>[\s\S]*?<\/xdr:to>/, anchorPosition('to', 26 + values.G17, 22 + values.J17))
      .replace(/<a:xfrm\b[^>]*>[\s\S]*?<\/a:xfrm>/, '');
  });
}

export function updateControlDrawing(xml, score, columns) {
  // O is wider than I:N in the source. Interpolate in physical units rather
  // than fractional column numbers so a high score stays within the axis.
  const widths = columns.map(c => c.hidden ? 0 : Math.floor((256 * c.width + Math.floor(128 / 7)) / 256 * 7) * 9525);
  const position = (col, offset) => widths.slice(0, col).reduce((sum, w) => sum + w, 0) + offset;
  const start = position(8, 370345), end = position(14, 2608720);
  const center = start + (end - start) * score / 23;
  function anchored(tag, x) {
    let col = 0;
    while (col < widths.length - 1 && x >= widths[col]) x -= widths[col++];
    return anchorPosition(tag, col, tag === 'from' ? 22 : 24, Math.round(x));
  }
  return xml.replace(/<xdr:twoCellAnchor\b[^>]*>[\s\S]*?<\/xdr:twoCellAnchor>/g, anchor => {
    if (!anchor.includes('name="Isosceles Triangle 6"')) return anchor;
    return anchor
      .replace(/<xdr:from>[\s\S]*?<\/xdr:from>/, anchored('from', center - 95250))
      .replace(/<xdr:to>[\s\S]*?<\/xdr:to>/, anchored('to', center + 95250))
      .replace(/<a:xfrm\b[^>]*>[\s\S]*?<\/a:xfrm>/, '');
  });
}

export async function createWorkbook(survey, state, template, JSZipConstructor = globalThis.JSZip) {
  if (!JSZipConstructor) throw new Error('Excel bileşeni yüklenemedi. Sayfayı yenileyip tekrar dene.');
  const values = workbookValues(survey, state);
  const zip = await JSZipConstructor.loadAsync(template);
  async function edit(path, fn) {
    const file = zip.file(path);
    if (!file) throw new Error(`Excel şablonu eksik: ${path}`);
    zip.file(path, fn(await file.async('string')));
  }
  for (const [sheet, cells] of Object.entries(values)) {
    await edit(`xl/worksheets/sheet${sheet}.xml`, xml => {
      for (const [ref, value] of Object.entries(cells)) xml = setCell(xml, ref, value, survey.formulas[sheet]?.[ref] ?? null);
      return xml;
    });
  }
  await edit('xl/drawings/drawing1.xml', xml => replaceDrawingText(replaceDrawingText(xml, 'Ad- Soyad:', `Ad- Soyad: ${state.profile.name.trim()}`), 'Unvan:', `Unvan: ${state.profile.title.trim()}`));
  await edit('xl/charts/chart1.xml', xml => {
    // The chart is the original communication chart; update its cached values
    // so viewers that do not recalculate do not show the template's zeros.
    const scores = ['H13', 'H14', 'H15', 'H16'].map(ref => values[3][ref]);
    return xml.replace(/<c:numCache>[\s\S]*?<\/c:numCache>/, cache => cache.replace(/<c:pt idx="(\d+)"><c:v>[^<]*<\/c:v><\/c:pt>/g, (_, index) => `<c:pt idx="${index}"><c:v>${scores[Number(index)]}</c:v></c:pt>`));
  });
  await edit('xl/drawings/drawing5.xml', xml => updateBehaviorDrawing(xml, values[5]));
  await edit('xl/drawings/drawing8.xml', xml => updateControlDrawing(xml, values[9].F30, survey.drawingLayout.control.columns));
  await edit('xl/workbook.xml', xml => xml.replace(/<calcPr\b[^>]*\/>/, '<calcPr calcId="191029" fullCalcOnLoad="1" forceFullCalc="1" calcMode="auto"/>'));
  const bytes = await zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE', compressionOptions: { level: 6 } });
  return { bytes, filename: downloadFilename(state.profile) };
}
