import * as XLSX from 'xlsx';
import { PDFDocument, rgb } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import './style.css';
import '@fontsource/noto-sans-kr/400.css';
import '@fontsource/noto-sans-kr/700.css';
import { manufacturers, productsFor, presetTemplate, createCustomTemplate, validateTemplate } from './templates.js';
import { normalizePostalValue, parseCombinedRecipient } from './recipient-parser.js';
import { structurePastedRows } from './pasted-rows.js';
import { PDF_TEXT_WIDTH_FACTOR, wrapPdfText } from './pdf-layout.js';

const $ = (selector) => document.querySelector(selector);
const state = { rawRows: [], headers: [], hasHeader: false, mapping: { name: '', postcode: '', address: '', detail: '' }, manufacturer: 'formtec', product: '3105', template: presetTemplate('formtec', '3105'), custom: false, previewPage: 0, previewStats: { shrunk: 0, overflow: 0 }, previewEdits: new Map(), selectedEditSourceRow: null };
const fields = ['name', 'postcode', 'address', 'detail'];
const fieldNames = { name: '이름', postcode: '우편번호', address: '주소', detail: '상세주소' };
const aliases = { name: ['이름', '성명', '수취인', '받는이', 'recipient', 'name'], postcode: ['우편번호', '우편 번호', '우편번호5자리', 'zip', 'zipcode', 'postal'], address: ['주소', '주소지', '소재지', 'address'], detail: ['상세주소', '상세 주소', '상세', '동호수', 'detail'] };
const mm = 72 / 25.4;
// Full OTFs, unlike browser font subsets, contain every Korean glyph needed by PDF output.
const fontRegularUrl = '/fonts/NotoSansCJKkr-Regular.otf';
const fontBoldUrl = '/fonts/NotoSansCJKkr-Bold.otf';

function toast(message, error = false) { const node = $('#toast'); node.textContent = message; node.className = error ? 'show error-toast' : 'show'; window.clearTimeout(toast.timer); toast.timer = window.setTimeout(() => { node.className = ''; }, 4200); }
function cleanText(value) { return String(value ?? '').trim().replace(/\s+/g, ' '); }
function normalizePostcode(value) { return normalizePostalValue(value); }
function detectHeader(row) { return row.filter(Boolean).some((cell) => Object.values(aliases).flat().includes(cleanText(cell).toLowerCase())); }
function fieldForHeader(value) { const text = cleanText(value).toLowerCase(); return fields.find((field) => aliases[field].includes(text)) ?? ''; }
function splitCombinedRecipient(item) {
  // A copied Excel range may map its only cell to more than one inferred
  // field. Parse the original cell first so it always becomes name → address
  // (including detail) → postcode, just as a one-column imported file does.
  if (/(?:서울특별시|부산광역시|대구광역시|인천광역시|광주광역시|대전광역시|울산광역시|세종특별자치시|경기도|강원특별자치도|충청북도|충청남도|전북특별자치도|전라남도|경상북도|경상남도|제주특별자치도)/.test(item.name) && /(?:^|\s)\d{3}-?\d{2}(?=\s|$)/.test(item.name)) {
    Object.assign(item, parseCombinedRecipient({ name: item.name }));
    return;
  }
  Object.assign(item, parseCombinedRecipient(item));
}

function detectMapping() {
  const first = state.rawRows[0] ?? [];
  state.hasHeader = detectHeader(first);
  const columnCount = Math.max(...state.rawRows.map((row) => row.length), 0);
  state.headers = Array.from({ length: columnCount }, (_, i) => state.hasHeader ? cleanText(first[i]) || `열 ${i + 1}` : `열 ${i + 1}`);
  const data = state.rawRows.slice(state.hasHeader ? 1 : 0);
  state.mapping = { name: '', postcode: '', address: '', detail: '' };
  if (state.hasHeader) state.headers.forEach((header, index) => { const field = fieldForHeader(header); if (field && !state.mapping[field]) state.mapping[field] = String(index); });
  const columns = state.headers.length;
  for (let col = 0; col < columns; col += 1) {
    const values = data.map((row) => cleanText(row[col])).filter(Boolean);
    if (!values.length) continue;
    const zipCount = values.filter((value) => /^\s*\d{3}-?\d{2}\s*$/.test(value)).length;
    const addressCount = values.filter((value) => /(시|군|구|로|길|동|읍|면|리)/.test(value)).length;
    if (!state.mapping.postcode && zipCount / values.length > 0.65) state.mapping.postcode = String(col);
    if (!state.mapping.address && addressCount / values.length > 0.45) state.mapping.address = String(col);
  }
  if (!state.mapping.detail && state.mapping.address !== '') {
    for (let col = 0; col < columns; col += 1) {
      if (Object.values(state.mapping).includes(String(col))) continue;
      const values = data.map((row) => cleanText(row[col])).filter(Boolean);
      const detailCount = values.filter((value) => /(?:아파트|빌딩|오피스텔|\d+동|\d+호|\d+층)/.test(value)).length;
      if (values.length && detailCount / values.length > 0.45) { state.mapping.detail = String(col); break; }
    }
  }
  if (!state.mapping.name && columns) state.mapping.name = String([...Array(columns).keys()].find((i) => String(i) !== state.mapping.postcode && String(i) !== state.mapping.address) ?? 0);
}

function dataRows() {
  const start = state.hasHeader ? 1 : 0;
  return state.rawRows.slice(start).map((row, rowIndex) => {
    const item = { sourceRow: rowIndex + start + 1 };
    fields.forEach((field) => { const col = state.mapping[field]; item[field] = col === '' || col === undefined ? '' : cleanText(row[Number(col)]); });
    splitCombinedRecipient(item);
    // Small corrections made from the preview take precedence over imported data
    // and are intentionally kept only in this browser session.
    const edit = state.previewEdits.get(item.sourceRow);
    if (edit) Object.assign(item, edit);
    item.postcodeNormalized = normalizePostcode(item.postcode);
    item.valid = Boolean(item.address);
    return item;
  }).filter((row) => fields.some((field) => row[field]));
}
function eligibleRows() { return dataRows().filter((row) => row.valid); }

function renderData() {
  $('#has-header').checked = state.hasHeader;
  $('#data-summary').textContent = `${dataRows().length}개 행을 읽었습니다. 열을 확인하고 필요하면 변경하세요.`;
  const mapping = $('#mapping'); mapping.replaceChildren();
  fields.forEach((field) => {
    const label = document.createElement('label'); label.textContent = fieldNames[field];
    const select = document.createElement('select'); select.dataset.field = field;
    select.append(new Option('사용 안 함', ''));
    state.headers.forEach((header, index) => select.append(new Option(header, String(index), false, state.mapping[field] === String(index))));
    label.append(select); mapping.append(label);
  });
  const rows = dataRows(); const missing = rows.filter((row) => !row.valid).length; const badZip = rows.filter((row) => row.postcode && row.postcodeNormalized === null).length; const missingZip = rows.filter((row) => row.valid && !row.postcode).length;
  const messages = []; if (missing) messages.push(`주소가 없어 ${missing}개 행이 PDF에서 제외됩니다.`); if (badZip) messages.push(`5자리로 변환할 수 없는 우편번호가 ${badZip}개 있습니다.`); if (missingZip) messages.push(`우편번호를 확인해야 하는 행이 ${missingZip}개 있습니다. 미리보기에서 수정할 수 있습니다.`);
  const warning = $('#warnings'); warning.textContent = messages.join(' '); warning.classList.toggle('hidden', !messages.length);
  const table = $('#data-table'); table.replaceChildren(); const header = document.createElement('tr'); state.headers.forEach((name) => { const th = document.createElement('th'); th.textContent = name; header.append(th); }); table.append(header);
  state.rawRows.slice(state.hasHeader ? 1 : 0, (state.hasHeader ? 1 : 0) + 10).forEach((row) => { const tr = document.createElement('tr'); state.headers.forEach((_, i) => { const td = document.createElement('td'); td.textContent = cleanText(row[i]); tr.append(td); }); table.append(tr); });
  $('#data-section').classList.remove('hidden'); $('#label-section').classList.remove('hidden'); $('#preview-section').classList.remove('hidden');
  renderPreview();
}

function populateProducts() {
  const select = $('#product-select'); select.replaceChildren();
  productsFor(state.manufacturer).forEach((product) => select.append(new Option(`${product.id} (${product.labelWidth} × ${product.labelHeight}mm / ${product.rows * product.cols}칸)`, product.id, false, product.id === state.product)));
}
function populateTemplates() {
  const select = $('#manufacturer-select'); select.replaceChildren();
  manufacturers().forEach((manufacturer) => select.append(new Option(manufacturer.name, manufacturer.id, false, manufacturer.id === state.manufacturer)));
  populateProducts();
}
function design() { return { showName: $('#show-name').checked, showPostcode: $('#show-postcode').checked, showAddress: $('#show-address').checked, showDetail: $('#show-detail').checked, showGuides: $('#show-guides').checked, fontSize: Number($('#font-size').value), bold: $('#font-weight').value === 'bold', align: $('#text-align').value, lineHeight: Number($('#line-height').value), offsetX: Number($('#offset-x').value), offsetY: Number($('#offset-y').value) }; }

const customDefs = [['paperWidth', '용지 가로', 210], ['paperHeight', '용지 세로', 297], ['labelWidth', '라벨 가로', 99], ['labelHeight', '라벨 세로', 34], ['cols', '열', 2], ['rows', '행', 8], ['startX', '첫 라벨 시작 X', 5], ['startY', '첫 라벨 시작 Y', 14], ['gapX', '가로 간격', 2.5], ['gapY', '세로 간격', 0]];
function renderCustomFields() { const holder = $('#custom-fields'); holder.replaceChildren(); const template = state.template; customDefs.forEach(([key, name, fallback]) => { const label = document.createElement('label'); label.textContent = `${name}${key === 'cols' || key === 'rows' ? '' : ' (mm)'}`; const input = document.createElement('input'); input.type = 'number'; input.step = key === 'cols' || key === 'rows' ? '1' : '0.1'; input.min = '0'; input.dataset.custom = key; input.value = template[key] ?? template.paper?.[key === 'paperWidth' ? 'width' : 'height'] ?? fallback; label.append(input); holder.append(label); }); }
function refreshTemplateFromCustom() { const values = {}; document.querySelectorAll('[data-custom]').forEach((input) => { values[input.dataset.custom] = input.value; }); state.template = createCustomTemplate(values); return validateTemplate(state.template); }
function currentTemplateError() { return state.custom ? refreshTemplateFromCustom() : ''; }

function labelLines(row) {
  const d = design(); const lines = [];
  // This is deliberately fixed so source-column variations never change the
  // printed arrangement: name → address (including detail) → postcode.
  if (d.showName && row.name) lines.push(row.name);
  const addressParts = [];
  if (d.showAddress && row.address) addressParts.push(row.address);
  if (d.showDetail && row.detail) addressParts.push(row.detail);
  if (addressParts.length) lines.push(addressParts.join(' '));
  if (d.showPostcode && row.postcodeNormalized) lines.push(row.postcodeNormalized);
  return lines;
}
function pageCount() { const capacity = state.template.cols * state.template.rows; return Math.max(1, Math.ceil(eligibleRows().length / capacity)); }
function renderPreviewEditor() {
  const panel = $('#preview-edit'); const sourceRow = state.selectedEditSourceRow;
  const row = eligibleRows().find((item) => item.sourceRow === sourceRow);
  if (!row) { panel.classList.add('hidden'); return; }
  panel.classList.remove('hidden');
  $('#preview-edit-title').textContent = `라벨 수정 · 데이터 ${row.sourceRow}행`;
  fields.forEach((field) => { $(`#edit-${field}`).value = row[field] ?? ''; });
}
function selectPreviewEdit(sourceRow) { state.selectedEditSourceRow = sourceRow; renderPreviewEditor(); $('#preview-edit').scrollIntoView({ behavior: 'smooth', block: 'nearest' }); }
function renderPreview() {
  const error = currentTemplateError(); $('#template-error').textContent = error; $('#template-error').classList.toggle('hidden', !error); if (error) return;
  const paper = $('#paper-preview'); paper.replaceChildren(); const template = state.template; const rows = eligibleRows(); const capacity = template.cols * template.rows; const count = pageCount(); state.previewPage = Math.min(state.previewPage, count - 1); const start = state.previewPage * capacity; const d = design();
  paper.style.aspectRatio = `${template.paper.width}/${template.paper.height}`;
  const stats = { shrunk: 0, overflow: 0 };
  rows.slice(start, start + capacity).forEach((row, index) => {
    const col = index % template.cols; const r = Math.floor(index / template.cols); const label = document.createElement('article'); label.className = 'label'; const left = template.startX + col * (template.labelWidth + template.gapX) + d.offsetX; const top = template.startY + r * (template.labelHeight + template.gapY) + d.offsetY; let size = Math.max(8, d.fontSize);
    Object.assign(label.style, { left: `${left / template.paper.width * 100}%`, top: `${top / template.paper.height * 100}%`, width: `${template.labelWidth / template.paper.width * 100}%`, height: `${template.labelHeight / template.paper.height * 100}%`, fontSize: `${size}pt`, fontWeight: d.bold ? '700' : '400', textAlign: d.align, lineHeight: d.lineHeight });
    labelLines(row).forEach((line) => { const p = document.createElement('div'); p.textContent = line; label.append(p); });
    const editButton = document.createElement('button'); editButton.type = 'button'; editButton.className = 'label-edit'; editButton.textContent = '수정'; editButton.dataset.sourceRow = row.sourceRow; editButton.setAttribute('aria-label', `데이터 ${row.sourceRow}행 라벨 수정`); label.append(editButton); paper.append(label);
    while (label.scrollHeight > label.clientHeight && size > 8) { size -= 0.5; label.style.fontSize = `${size}pt`; }
    if (size < d.fontSize) stats.shrunk += 1;
    if (label.scrollHeight > label.clientHeight) { stats.overflow += 1; label.classList.add('overflowing'); }
  });
  state.previewStats = stats;
  $('#page-indicator').textContent = `${state.previewPage + 1} / ${count} 페이지`; $('#previous-page').disabled = state.previewPage === 0; $('#next-page').disabled = state.previewPage >= count - 1;
  const alerts = []; if (stats.shrunk) alerts.push(`${stats.shrunk}개 라벨 글자 축소`); if (stats.overflow) alerts.push(`${stats.overflow}개 라벨은 8pt에서도 넘침`);
  $('#preview-summary').textContent = `${rows.length}개 유효 행 · 페이지당 ${capacity}개 라벨${alerts.length ? ` · ${alerts.join(', ')}` : ''}`;
  renderPreviewEditor();
}

function parseDelimited(text, delimiter) {
  const result = [[]]; let value = ''; let quoted = false;
  for (let i = 0; i < text.length; i += 1) { const char = text[i]; if (char === '"') { if (quoted && text[i + 1] === '"') { value += '"'; i += 1; } else quoted = !quoted; } else if (char === delimiter && !quoted) { result.at(-1).push(value); value = ''; } else if ((char === '\n' || char === '\r') && !quoted) { if (char === '\r' && text[i + 1] === '\n') i += 1; result.at(-1).push(value); value = ''; result.push([]); } else value += char; }
  result.at(-1).push(value); return result.filter((row) => row.some((cell) => cleanText(cell)));
}
function guessDelimiter(text) { return [',', '\t', ';'].map((delimiter) => ({ delimiter, score: text.split(/\r?\n/).slice(0, 10).reduce((sum, line) => sum + line.split(delimiter).length - 1, 0) })).sort((a, b) => b.score - a.score)[0].delimiter; }
async function parseFile(file) {
  const buffer = await file.arrayBuffer(); if (file.name.toLowerCase().endsWith('.csv')) { const utf8 = new TextDecoder('utf-8', { fatal: false }).decode(buffer); const korean = new TextDecoder('euc-kr', { fatal: false }).decode(buffer); const text = /�/.test(utf8) && !/�/.test(korean) ? korean : utf8; loadRows(parseDelimited(text, guessDelimiter(text))); return; }
  const book = XLSX.read(buffer, { type: 'array', cellFormula: false, cellHTML: false }); state.workbook = book; const names = book.SheetNames; const picker = $('#sheet-picker'); const select = $('#sheet-select'); select.replaceChildren(...names.map((name) => new Option(name, name))); picker.classList.toggle('hidden', names.length < 2); loadSheet(names[0]);
}
function loadSheet(name) { const sheet = state.workbook.Sheets[name]; loadRows(XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '', raw: false })); }
function loadRows(rows, mapping = null) { state.rawRows = rows.filter((row) => row.some((cell) => cleanText(cell))); state.previewEdits.clear(); state.selectedEditSourceRow = null; if (!state.rawRows.length) { toast('읽을 수 있는 데이터가 없습니다.', true); return; } detectMapping(); if (mapping) { state.hasHeader = false; state.headers = ['이름', '우편번호', '주소', '상세주소']; state.mapping = mapping; } renderData(); }
function loadPastedData(text, automatic = false) {
  if (!text.trim()) return toast('붙여넣을 데이터를 입력해주세요.', true);
  const result = structurePastedRows(parseDelimited(text, guessDelimiter(text)));
  loadRows(result.rows, result.mapping);
  if (automatic) toast('엑셀에서 붙여넣은 데이터를 불러왔습니다. 열을 확인해주세요.');
}

async function createPdf() {
  const error = currentTemplateError(); if (error) { toast(error, true); return; } const rows = eligibleRows(); if (!rows.length) { toast('주소가 있는 행이 없어 PDF를 만들 수 없습니다.', true); return; }
  if (state.previewStats.overflow) { toast(`8pt에서도 영역을 넘는 라벨이 ${state.previewStats.overflow}개 있습니다. 내용을 줄이거나 글꼴 크기를 조정해주세요.`, true); return; }
  const button = $('#export-pdf'); button.disabled = true; button.textContent = 'PDF 만드는 중…';
  try {
    const pdf = await PDFDocument.create(); pdf.registerFontkit(fontkit); const d = design(); const fontBytes = await fetch(d.bold ? fontBoldUrl : fontRegularUrl).then((response) => response.arrayBuffer());
    // CJK OTF subsetting can corrupt the character map in some PDF readers.
    // Embed the complete licensed font to preserve every Korean syllable.
    const font = await pdf.embedFont(fontBytes, { subset: false }); const t = state.template; const capacity = t.cols * t.rows; let shrunk = 0;
    for (let pageIndex = 0; pageIndex < Math.ceil(rows.length / capacity); pageIndex += 1) {
      const page = pdf.addPage([t.paper.width * mm, t.paper.height * mm]);
      rows.slice(pageIndex * capacity, (pageIndex + 1) * capacity).forEach((row, index) => {
        const col = index % t.cols; const r = Math.floor(index / t.cols);
        const x = (t.startX + col * (t.labelWidth + t.gapX) + d.offsetX) * mm;
        const top = (t.startY + r * (t.labelHeight + t.gapY) + d.offsetY) * mm;
        const width = t.labelWidth * mm; const height = t.labelHeight * mm;
        const padding = 2.5 * mm;
        const safeTextWidth = (width - padding * 2) * PDF_TEXT_WIDTH_FACTOR;
        const source = labelLines(row);
        let size = d.fontSize; let lines = [];
        while (size >= 8) {
          lines = source.flatMap((line) => wrapPdfText(line, font, size, safeTextWidth));
          if (lines.length * size * d.lineHeight <= height - padding * 2) break;
          size -= 0.5;
        }
        if (size < d.fontSize) shrunk += 1;
        size = Math.max(size, 8);
        if (d.showGuides) page.drawRectangle({ x, y: t.paper.height * mm - top - height, width, height, borderColor: rgb(0.45, 0.55, 0.7), borderWidth: 0.35, borderDashArray: [1.5, 1.2], borderOpacity: 0.8 });
        const lineStep = size * d.lineHeight;
        lines.slice(0, Math.floor((height - padding * 2) / lineStep)).forEach((line, lineIndex) => {
          const textWidth = font.widthOfTextAtSize(line, size);
          const textX = d.align === 'center' ? x + (width - textWidth) / 2 : d.align === 'right' ? x + width - padding - textWidth : x + padding;
          page.drawText(line, { x: textX, y: t.paper.height * mm - top - padding - size - lineIndex * lineStep, size, font, color: rgb(0.08, 0.1, 0.14) });
        });
      });
    }
    const bytes = await pdf.save(); const blob = new Blob([bytes], { type: 'application/pdf' }); const url = URL.createObjectURL(blob); const anchor = document.createElement('a'); anchor.href = url; anchor.download = 'postal-labels.pdf'; anchor.click(); URL.revokeObjectURL(url); toast(shrunk ? `PDF를 만들었습니다. ${shrunk}개 라벨의 글자 크기를 조정했습니다.` : 'PDF를 만들었습니다.');
  } catch (error) { console.error(error); toast('PDF 생성 중 문제가 발생했습니다. 입력과 라벨 규격을 확인해주세요.', true); } finally { button.disabled = false; button.textContent = 'PDF 만들기'; }
}

function printPreview() {
  const error = currentTemplateError();
  if (error) return toast(error, true);
  if (!eligibleRows().length) return toast('주소가 있는 행이 없어 인쇄할 수 없습니다.', true);
  let style = $('#dynamic-print-style');
  if (!style) { style = document.createElement('style'); style.id = 'dynamic-print-style'; document.head.append(style); }
  style.textContent = `@page { size: ${state.template.paper.width}mm ${state.template.paper.height}mm; margin: 0; }`;
  window.print();
}

$('#file-input').addEventListener('change', async (event) => { const file = event.target.files[0]; if (!file) return; try { await parseFile(file); toast(`${file.name}을(를) 브라우저에서 읽었습니다.`); } catch (error) { console.error(error); toast('파일을 읽을 수 없습니다. 암호화 또는 파일 형식을 확인해주세요.', true); } });
$('#parse-paste').addEventListener('click', () => loadPastedData($('#paste-input').value));
$('#paste-input').addEventListener('paste', (event) => {
  const text = event.clipboardData?.getData('text/plain') ?? '';
  if (!text.trim()) return;
  // Handle clipboard contents directly instead of waiting for the browser's
  // paste event. This guarantees the preview is rebuilt from the new rows,
  // rather than retaining labels from a previous import.
  event.preventDefault();
  $('#paste-input').value = text;
  loadPastedData(text, true);
});
$('#sheet-select').addEventListener('change', (event) => loadSheet(event.target.value));
$('#has-header').addEventListener('change', (event) => { state.hasHeader = event.target.checked; const first = state.rawRows[0] ?? []; state.headers = state.hasHeader ? first.map((value, i) => cleanText(value) || `열 ${i + 1}`) : first.map((_, i) => `열 ${i + 1}`); if (state.hasHeader) state.headers.forEach((header, index) => { const field = fieldForHeader(header); if (field) state.mapping[field] = String(index); }); renderData(); });
$('#mapping').addEventListener('change', (event) => { if (!event.target.dataset.field) return; state.mapping[event.target.dataset.field] = event.target.value; renderData(); });
$('#manufacturer-select').addEventListener('change', (event) => { state.manufacturer = event.target.value; state.product = productsFor(state.manufacturer)[0]?.id; state.custom = false; state.template = presetTemplate(state.manufacturer, state.product); populateProducts(); $('#custom-fields').classList.add('hidden'); renderPreview(); });
$('#product-select').addEventListener('change', (event) => { state.product = event.target.value; state.custom = false; state.template = presetTemplate(state.manufacturer, state.product); $('#custom-fields').classList.add('hidden'); renderPreview(); });
$('#custom-toggle').addEventListener('click', () => { state.custom = !state.custom; if (state.custom) { state.template = createCustomTemplate(state.template); renderCustomFields(); } else state.template = presetTemplate(state.manufacturer, state.product); $('#custom-fields').classList.toggle('hidden', !state.custom); renderPreview(); });
$('#custom-fields').addEventListener('input', renderPreview); document.querySelectorAll('#label-section input, #label-section select').forEach((node) => node.addEventListener('input', () => { $('#font-size-output').textContent = `${$('#font-size').value}pt`; renderPreview(); }));
$('#paper-preview').addEventListener('click', (event) => { const button = event.target.closest('.label-edit'); if (button) selectPreviewEdit(Number(button.dataset.sourceRow)); });
$('#save-preview-edit').addEventListener('click', () => {
  const sourceRow = state.selectedEditSourceRow; if (!sourceRow) return;
  const edit = Object.fromEntries(fields.map((field) => [field, cleanText($(`#edit-${field}`).value)]));
  state.previewEdits.set(sourceRow, edit); state.selectedEditSourceRow = null; renderPreview(); toast('수정한 라벨 내용을 미리보기와 PDF에 반영했습니다.');
});
$('#reset-preview-edit').addEventListener('click', () => { const sourceRow = state.selectedEditSourceRow; if (!sourceRow) return; state.previewEdits.delete(sourceRow); state.selectedEditSourceRow = null; renderPreview(); toast('이 라벨을 불러온 원본 데이터로 되돌렸습니다.'); });
$('#cancel-preview-edit').addEventListener('click', () => { state.selectedEditSourceRow = null; renderPreviewEditor(); });
$('#previous-page').addEventListener('click', () => { state.previewPage -= 1; renderPreview(); }); $('#next-page').addEventListener('click', () => { state.previewPage += 1; renderPreview(); }); $('#export-pdf').addEventListener('click', createPdf); $('#print-preview').addEventListener('click', printPreview);
populateTemplates();
