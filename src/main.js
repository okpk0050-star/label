import * as XLSX from 'xlsx';
import { PDFDocument, rgb } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import './style.css';
import './ux.css';
import '@fontsource/noto-sans-kr/400.css';
import '@fontsource/noto-sans-kr/700.css';
import { manufacturers, productsFor, presetTemplate, createCustomTemplate, validateTemplate, labelGeometry } from './templates.js';
import { normalizePostalValue, parseCombinedRecipient } from './recipient-parser.js';
import { parseRecipientCells, structurePastedRows } from './pasted-rows.js';
import { inferColumnMappingWithConfidence } from './column-mapping.js';
import { mappingAlertText } from './mapping-feedback.js';
import { inspectLabelPages, labelPageSlots } from './pdf-layout.js';
import { labelContent, layoutArrangement } from './label-arrangements.js';
import { FEEDBACK_ARIA_LABEL, FEEDBACK_FORM_URL } from './feedback.js';

const $ = (selector) => document.querySelector(selector);
const state = { rawRows: [], headers: [], hasHeader: false, mappingEdited: false, autoStructured: false, mapping: { name: '', postcode: '', address: '', detail: '' }, mappingConfidence: {}, manufacturer: 'formtec', product: '3105', template: presetTemplate('formtec', '3105'), custom: false, startSlot: 0, previewPage: 0, previewStats: { shrunk: 0, overflow: 0 }, previewEdits: new Map(), selectedEditSourceRow: null };
const fields = ['name', 'postcode', 'address', 'detail'];
const fieldNames = { name: '이름', postcode: '우편번호', address: '주소', detail: '상세주소' };
const aliases = { name: ['이름', '성명', '수취인', '받는이', 'recipient', 'name'], postcode: ['우편번호', '우편 번호', '우편번호5자리', 'zip', 'zipcode', 'postal'], address: ['주소', '주소지', '소재지', 'address'], detail: ['상세주소', '상세 주소', '상세', '동호수', 'detail'] };
const mm = 72 / 25.4;
// Full OTFs, unlike browser font subsets, contain every Korean glyph needed by PDF output.
const fontRegularUrl = '/fonts/NotoSansCJKkr-Regular.otf';
const fontBoldUrl = '/fonts/NotoSansCJKkr-Bold.otf';

function toast(message, error = false) { const node = $('#toast'); node.textContent = message; node.className = error ? 'show error-toast' : 'show'; window.clearTimeout(toast.timer); toast.timer = window.setTimeout(() => { node.className = ''; }, 4200); }
function feedbackLink(text = '문제가 있었나요? 피드백 보내기') {
  const link = document.createElement('a'); link.className = 'feedback-inline-link'; link.href = FEEDBACK_FORM_URL; link.target = '_blank'; link.rel = 'noopener noreferrer'; link.textContent = text; link.setAttribute('aria-label', FEEDBACK_ARIA_LABEL); return link;
}
function setFeedbackMessage(node, message) {
  node.replaceChildren();
  if (!message) { node.classList.add('hidden'); return; }
  node.append(document.createTextNode(`${message} `), feedbackLink());
  node.classList.remove('hidden');
}
document.querySelectorAll('[data-feedback-link]').forEach((link) => { link.href = FEEDBACK_FORM_URL; link.setAttribute('aria-label', FEEDBACK_ARIA_LABEL); });
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
  const inference = inferColumnMappingWithConfidence(data, state.headers.length, state.mapping);
  state.mapping = inference.mapping;
  state.mappingConfidence = inference.confidence;
}

function dataRows() {
  const start = state.hasHeader ? 1 : 0;
  return state.rawRows.slice(start).map((row, rowIndex) => {
    const item = { sourceRow: rowIndex + start + 1 };
    fields.forEach((field) => { const col = state.mapping[field]; item[field] = col === '' || col === undefined ? '' : cleanText(row[Number(col)]); });
    splitCombinedRecipient(item);
    if (!state.mappingEdited && (!item.name || !item.address || !normalizePostcode(item.postcode))) {
      const recovered = parseRecipientCells(row);
      if (recovered.name && recovered.address && normalizePostcode(recovered.postcode)) Object.assign(item, recovered);
    }
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
  const allRows = dataRows();
  const sourceCount = Math.max(0, state.rawRows.length - Number(state.hasHeader));
  $('#data-summary').textContent = `총 ${sourceCount}건 · 처음 ${Math.min(sourceCount, 10)}건 표시`;
  const rowIssues = allRows.filter((row) => !row.valid || !row.name || !row.postcodeNormalized).length;
  const needsReview = rowIssues + Math.max(0, sourceCount - allRows.length);
  const mappingAlert = $('#mapping-alert');
  mappingAlert.textContent = mappingAlertText(sourceCount, needsReview, state.mappingConfidence, fieldNames);
  mappingAlert.classList.toggle('hidden', !mappingAlert.textContent);
  const mapping = $('#mapping'); mapping.replaceChildren();
  fields.forEach((field) => {
    const label = document.createElement('label'); label.textContent = fieldNames[field];
    const select = document.createElement('select'); select.dataset.field = field;
    select.append(new Option('사용 안 함', ''));
    state.headers.forEach((header, index) => { const example = state.rawRows.slice(state.hasHeader ? 1 : 0).map((row) => cleanText(row[index])).find(Boolean); const sample = example ? ` · 예: ${example.slice(0, 16)}${example.length > 16 ? '…' : ''}` : ''; select.append(new Option(`${header}${sample}`, String(index), false, state.mapping[field] === String(index))); });
    const confidence = state.mappingConfidence[field] ?? 'missing';
    const status = document.createElement('small'); status.className = `mapping-confidence${['medium', 'missing'].includes(confidence) ? ' needs-check' : ''}`;
    status.textContent = ({ high: '✓ 자동 인식', medium: '? 확인 권장', missing: '? 열 선택 필요', manual: '✓ 직접 선택', optional: '' })[confidence];
    status.classList.toggle('hidden', !status.textContent);
    label.append(select, status); mapping.append(label);
  });
  const rows = allRows; const missing = rows.filter((row) => !row.valid).length; const badZip = rows.filter((row) => row.postcode && row.postcodeNormalized === null).length; const missingZip = rows.filter((row) => row.valid && !row.postcode).length; const missingName = rows.filter((row) => row.valid && !row.name).length;
  const health = $('#data-health'); health.textContent = needsReview ? `✓ 정상 ${sourceCount - needsReview}건 · ⚠ 확인 필요 ${needsReview}건` : `✓ ${sourceCount}건 정상 인식`;
  const messages = []; if (missing) messages.push(`주소가 없어 ${missing}개 행이 PDF에서 제외됩니다.`); if (badZip) messages.push(`⚠ ${badZip}건의 우편번호를 확인해주세요.`); if (missingZip) messages.push(`⚠ ${missingZip}건의 우편번호를 확인해주세요. 미리보기에서 수정할 수 있습니다.`); if (missingName) messages.push(`⚠ ${missingName}건의 이름을 확인해주세요.`);
  const warning = $('#warnings'); warning.textContent = messages.join(' '); warning.classList.toggle('hidden', !messages.length);
  const table = $('#data-table'); table.replaceChildren(); const header = document.createElement('tr'); [...fields.map((field) => fieldNames[field]), '확인'].forEach((name) => { const th = document.createElement('th'); th.textContent = name; header.append(th); }); table.append(header);
  rows.slice(0, 10).forEach((item) => { const tr = document.createElement('tr'); fields.forEach((field) => { const td = document.createElement('td'); td.textContent = field === 'postcode' ? item.postcodeNormalized ?? item.postcode : item[field]; tr.append(td); }); const issues = []; if (!item.name) issues.push('이름 누락'); if (!item.address) issues.push('주소 누락'); if (!item.postcodeNormalized) issues.push(item.postcode ? '우편번호 오류' : '우편번호 누락'); const td = document.createElement('td'); td.textContent = issues.join(' · ') || '정상'; if (issues.length) { tr.classList.add('data-row-warning'); td.classList.add('data-status-warning'); } tr.append(td); table.append(tr); });
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
  updateTemplateSummary();
}
function updateTemplateSummary() {
  const t = state.template;
  const paperName = t.paper.width === 210 && t.paper.height === 297 ? 'A4' : `${t.paper.width} × ${t.paper.height}mm`;
  $('#selected-template-summary').textContent = `${state.custom ? '사용자 지정' : t.name} · ${t.labelWidth} × ${t.labelHeight}mm · ${t.cols}열 × ${t.rows}행 (${t.cols * t.rows}칸/${paperName})`;
  $('#paper-guidance').textContent = t.paper.width === 210 && t.paper.height === 297 ? '용지 A4' : `용지 ${t.paper.width} × ${t.paper.height}mm`;
  $('#custom-toggle').textContent = state.custom ? '사용자 지정 규격 닫기' : '사용자 지정 규격';
  $('#custom-toggle').setAttribute('aria-expanded', String(state.custom));
}
function design() { return { arrangement: $('#arrangement-select').value, showName: $('#show-name').checked, nameSuffix: $('#name-suffix').value, showPostcode: $('#show-postcode').checked, showAddress: $('#show-address').checked, showDetail: $('#show-detail').checked, showGuides: $('#show-guides').checked, showDebugGeometry: $('#show-debug-geometry').checked, fontSize: Number($('#font-size').value), bold: $('#font-weight').value === 'bold', align: $('#text-align').value, lineHeight: Number($('#line-height').value), offsetX: Number($('#offset-x').value), offsetY: Number($('#offset-y').value) }; }

const customDefs = [['paperWidth', '용지 가로', 210], ['paperHeight', '용지 세로', 297], ['labelWidth', '라벨 가로', 99], ['labelHeight', '라벨 세로', 34], ['cols', '열', 2], ['rows', '행', 8], ['startX', '첫 라벨 시작 X', 5], ['startY', '첫 라벨 시작 Y', 14], ['gapX', '가로 간격', 2.5], ['gapY', '세로 간격', 0]];
function renderCustomFields() { const holder = $('#custom-fields'); holder.replaceChildren(); const template = state.template; customDefs.forEach(([key, name, fallback]) => { const label = document.createElement('label'); label.textContent = `${name}${key === 'cols' || key === 'rows' ? '' : ' (mm)'}`; const input = document.createElement('input'); input.type = 'number'; input.step = key === 'cols' || key === 'rows' ? '1' : '0.1'; input.min = '0'; input.dataset.custom = key; input.value = template[key] ?? template.paper?.[key === 'paperWidth' ? 'width' : 'height'] ?? fallback; label.append(input); holder.append(label); }); }
function refreshTemplateFromCustom() { const values = {}; document.querySelectorAll('[data-custom]').forEach((input) => { values[input.dataset.custom] = input.value; }); state.template = createCustomTemplate(values); return validateTemplate(state.template); }
function currentTemplateError() { return state.custom ? refreshTemplateFromCustom() : ''; }

const previewCanvas = document.createElement('canvas');
const previewContext = previewCanvas.getContext('2d');
function previewFont(bold) {
  return { widthOfTextAtSize(text, size) {
    previewContext.font = `${bold ? '700' : '400'} ${size * 96 / 72}px "Noto Sans KR"`;
    return previewContext.measureText(text).width * 72 / 96;
  } };
}
function startSlotPosition() { return { row: Math.floor(state.startSlot / state.template.cols) + 1, col: state.startSlot % state.template.cols + 1 }; }
function normalizeStartSlot() { const capacity = state.template.cols * state.template.rows; state.startSlot = Math.max(0, Math.min(state.startSlot, capacity - 1)); }
function renderStartSlotPicker() {
  normalizeStartSlot();
  const holder = $('#start-slot-picker'); holder.replaceChildren();
  holder.style.setProperty('--slot-columns', String(state.template.cols));
  const capacity = state.template.cols * state.template.rows;
  for (let slot = 0; slot < capacity; slot += 1) {
    const button = document.createElement('button'); button.type = 'button'; button.className = `start-slot${slot === state.startSlot ? ' selected' : ''}`;
    button.dataset.startSlot = String(slot); button.textContent = String(slot + 1);
    button.setAttribute('aria-label', `${Math.floor(slot / state.template.cols) + 1}행 ${slot % state.template.cols + 1}열부터 출력`);
    button.setAttribute('aria-pressed', String(slot === state.startSlot)); holder.append(button);
  }
  const { row, col } = startSlotPosition();
  $('#start-slot-summary').textContent = state.startSlot ? `첫 페이지 ${row}행 ${col}열부터 출력` : '첫 페이지 첫 칸부터 출력';
}
function pageCount() { const capacity = state.template.cols * state.template.rows; return labelPageSlots(eligibleRows(), capacity, state.startSlot).length; }
function renderPreviewEditor() {
  const panel = $('#preview-edit'); const sourceRow = state.selectedEditSourceRow;
  const row = eligibleRows().find((item) => item.sourceRow === sourceRow);
  if (!row) { panel.classList.add('hidden'); return; }
  panel.classList.remove('hidden');
  $('#preview-edit-title').textContent = `라벨 수정 · 데이터 ${row.sourceRow}행`;
  fields.forEach((field) => { $(`#edit-${field}`).value = row[field] ?? ''; });
}
function selectPreviewEdit(sourceRow) { state.selectedEditSourceRow = sourceRow; renderPreviewEditor(); $('#preview-edit').scrollIntoView({ behavior: 'smooth', block: 'nearest' }); }
function renderGeometryReadout(paper, template, enabled) {
  const readout = $('#geometry-debug-readout');
  readout.classList.toggle('hidden', !enabled);
  if (!enabled) return;
  window.requestAnimationFrame(() => {
    const first = paper.querySelector('.label'); const last = paper.querySelector('.label:last-child');
    if (!first || !last) return;
    const paperRect = paper.getBoundingClientRect(); const firstRect = first.getBoundingClientRect(); const lastRect = last.getBoundingClientRect();
    const pxToMm = 25.4 / 96;
    const firstDeltaPx = firstRect.top - paperRect.top;
    const bottomDeltaPx = paperRect.bottom - lastRect.bottom;
    const firstByPaperRatio = firstDeltaPx * template.paper.height / paperRect.height;
    const bottomByPaperRatio = bottomDeltaPx * template.paper.height / paperRect.height;
    const paperStyle = getComputedStyle(paper); const labelStyle = getComputedStyle(first);
    readout.textContent = `브라우저 실측 · A4 상단 Y ${paperRect.top.toFixed(2)}px → 첫 셀 Y ${firstRect.top.toFixed(2)}px · 차이 ${firstDeltaPx.toFixed(2)}px = ${(firstDeltaPx * pxToMm).toFixed(2)}mm (용지 비율 ${(firstByPaperRatio).toFixed(2)}mm) · 마지막 셀 아래 여백 ${(bottomDeltaPx * pxToMm).toFixed(2)}mm (용지 비율 ${bottomByPaperRatio.toFixed(2)}mm) · A4 padding ${paperStyle.paddingTop}, margin ${paperStyle.marginTop}, transform ${paperStyle.transform} · 셀 top ${labelStyle.top}, transform ${labelStyle.transform}`;
  });
}
function renderPreview() {
  const error = currentTemplateError(); updateTemplateSummary(); setFeedbackMessage($('#template-error'), error); if (error) return;
  const paper = $('#paper-preview'); paper.replaceChildren(); const template = state.template; const rows = eligibleRows(); const capacity = template.cols * template.rows; renderStartSlotPicker(); const pages = labelPageSlots(rows, capacity, state.startSlot); const count = pages.length; state.previewPage = Math.min(state.previewPage, count - 1); const d = design();
  paper.style.width = `${template.paper.width}mm`; paper.style.height = `${template.paper.height}mm`; paper.classList.toggle('debug-geometry', d.showDebugGeometry);
  const stats = { shrunk: 0, overflow: 0 };
  const pageRows = pages[state.previewPage];
  const previewFonts = { regular: previewFont(false), bold: previewFont(true) };
  for (let index = 0; index < capacity; index += 1) {
    const row = pageRows[index];
    const col = index % template.cols; const r = Math.floor(index / template.cols); const label = document.createElement('article'); label.className = 'label'; label.classList.toggle('debug-geometry', d.showDebugGeometry); const box = labelGeometry(template, r, col, d.offsetX, d.offsetY);
    Object.assign(label.style, { left: `${box.x}mm`, top: `${box.y}mm`, width: `${box.width}mm`, height: `${box.height}mm`, fontWeight: d.bold ? '700' : '400', textAlign: d.align });
    if (!row) { label.classList.add('label-empty'); label.setAttribute('aria-hidden', 'true'); paper.append(label); continue; }
    const layout = layoutArrangement(labelContent(row, d), previewFonts, d, box);
    label.classList.add('layout-variant');
    layout.items.forEach((item) => { const p = document.createElement('div'); p.textContent = item.text; Object.assign(p.style, { left: `${item.x}pt`, top: `${item.top}pt`, fontSize: `${item.size}pt`, fontWeight: item.weight === 'bold' ? '700' : '400' }); label.append(p); });
    if (layout.divider) { const line = document.createElement('div'); line.className = 'layout-divider'; Object.assign(line.style, { left: `${layout.divider.x1}pt`, top: `${layout.divider.top}pt`, width: `${layout.divider.x2 - layout.divider.x1}pt` }); label.append(line); }
    const editButton = document.createElement('button'); editButton.type = 'button'; editButton.className = 'label-edit'; editButton.textContent = '수정'; editButton.dataset.sourceRow = row.sourceRow; editButton.setAttribute('aria-label', `데이터 ${row.sourceRow}행 라벨 수정`); label.append(editButton); paper.append(label);
    if (layout.size < d.fontSize) stats.shrunk += 1;
    if (!layout.fits || label.scrollHeight > label.clientHeight) { stats.overflow += 1; label.classList.add('overflowing'); }
  }
  state.previewStats = stats;
  $('#page-indicator').textContent = `${state.previewPage + 1} / ${count} 페이지`; $('#previous-page').disabled = state.previewPage === 0; $('#next-page').disabled = state.previewPage >= count - 1;
  const alerts = []; if (stats.shrunk) alerts.push(`${stats.shrunk}개 라벨 글자 축소`); if (stats.overflow) alerts.push(`${stats.overflow}개 라벨은 8pt에서도 넘침`);
  const firstBox = labelGeometry(template, 0, 0, d.offsetX, d.offsetY);
  const lastBox = labelGeometry(template, template.rows - 1, template.cols - 1, d.offsetX, d.offsetY);
  const bottomMargin = template.paper.height - lastBox.y - lastBox.height;
  const startNote = state.previewPage === 0 && state.startSlot ? ` · ${startSlotPosition().row}행 ${startSlotPosition().col}열부터 출력` : '';
  $('#preview-summary').textContent = `${rows.length}개 유효 행 · 페이지당 ${capacity}개 라벨${startNote} · 위 여백 ${firstBox.y.toFixed(2)}mm / 아래 여백 ${bottomMargin.toFixed(2)}mm${alerts.length ? ` · ${alerts.join(', ')}` : ''}`;
  renderGeometryReadout(paper, template, d.showDebugGeometry);
  renderPreviewEditor();
}

function parseDelimited(text, delimiter) {
  const result = [[]]; let value = ''; let quoted = false;
  for (let i = 0; i < text.length; i += 1) { const char = text[i]; if (char === '"') { if (quoted && text[i + 1] === '"') { value += '"'; i += 1; } else quoted = !quoted; } else if (char === delimiter && !quoted) { result.at(-1).push(value); value = ''; } else if ((char === '\n' || char === '\r') && !quoted) { if (char === '\r' && text[i + 1] === '\n') i += 1; result.at(-1).push(value); value = ''; result.push([]); } else value += char; }
  result.at(-1).push(value); return result.filter((row) => row.some((cell) => cleanText(cell)));
}
function guessDelimiter(text) { return [',', '\t', ';'].map((delimiter) => ({ delimiter, score: text.split(/\r?\n/).slice(0, 10).reduce((sum, line) => sum + line.split(delimiter).length - 1, 0) })).sort((a, b) => b.score - a.score)[0].delimiter; }
async function parseFile(file) {
  const buffer = await file.arrayBuffer(); if (file.name.toLowerCase().endsWith('.csv')) { const utf8 = new TextDecoder('utf-8', { fatal: false }).decode(buffer); const korean = new TextDecoder('euc-kr', { fatal: false }).decode(buffer); const text = /�/.test(utf8) && !/�/.test(korean) ? korean : utf8; loadImportedRows(parseDelimited(text, guessDelimiter(text))); return; }
  const book = XLSX.read(buffer, { type: 'array', cellFormula: false, cellHTML: false }); state.workbook = book; const names = book.SheetNames; const picker = $('#sheet-picker'); const select = $('#sheet-select'); select.replaceChildren(...names.map((name) => new Option(name, name))); picker.classList.toggle('hidden', names.length < 2); loadSheet(names[0]);
}
function loadSheet(name) { const sheet = state.workbook.Sheets[name]; loadImportedRows(XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '', raw: false })); }
function loadImportedRows(rows) { const result = structurePastedRows(rows, { hasHeader: detectHeader(rows[0] ?? []) }); loadRows(result.rows, result.mapping, result.hasHeader); }
function loadRows(rows, mapping = null, hasHeader = false) { state.rawRows = rows.filter((row) => row.some((cell) => cleanText(cell))); state.mappingEdited = false; state.autoStructured = Boolean(mapping); state.previewEdits.clear(); state.selectedEditSourceRow = null; if (!state.rawRows.length) { toast('읽을 수 있는 데이터가 없습니다.', true); return; } detectMapping(); if (mapping) { state.hasHeader = hasHeader; state.headers = hasHeader ? Array.from({ length: 4 }, (_, i) => cleanText(state.rawRows[0][i]) || `열 ${i + 1}`) : ['이름', '우편번호', '주소', '상세주소']; state.mapping = mapping; state.mappingConfidence = Object.fromEntries(fields.map((field) => [field, mapping[field] === '' ? field === 'detail' ? 'optional' : 'missing' : 'high'])); } renderData(); }
function loadPastedData(text, automatic = false) {
  if (!text.trim()) return toast('붙여넣을 데이터를 입력해주세요.', true);
  const rows = parseDelimited(text, guessDelimiter(text));
  const result = structurePastedRows(rows, { hasHeader: detectHeader(rows[0] ?? []) });
  loadRows(result.rows, result.mapping, result.hasHeader);
  if (automatic) toast('엑셀에서 붙여넣은 데이터를 불러왔습니다. 열을 확인해주세요.');
}

async function createPdf() {
  const error = currentTemplateError(); if (error) { toast(error, true); return; } const rows = eligibleRows(); if (!rows.length) { toast('주소가 있는 행이 없어 PDF를 만들 수 없습니다.', true); return; }
  const warning = $('#export-warning'); setFeedbackMessage(warning, '');
  const button = $('#export-pdf'); button.disabled = true; button.textContent = 'PDF 만드는 중…';
  try {
    const pdf = await PDFDocument.create(); pdf.registerFontkit(fontkit); const d = design(); const fontBytes = await fetch(d.bold ? fontBoldUrl : fontRegularUrl).then((response) => response.arrayBuffer());
    // CJK OTF subsetting can corrupt the character map in some PDF readers.
    // Embed the complete licensed font to preserve every Korean syllable.
    const font = await pdf.embedFont(fontBytes, { subset: false }); const t = state.template; const capacity = t.cols * t.rows;
    const layouts = inspectLabelPages(rows, t, d, { regular: font, bold: font }, labelGeometry, (row) => labelContent(row, d), layoutArrangement, state.startSlot);
    const overflowing = layouts.filter((layout) => !layout.fits);
    if (overflowing.length) {
      const examples = overflowing.slice(0, 10).map((item) => `데이터 ${item.row.sourceRow}행 (${item.page}페이지 ${item.slot}번)`).join(', ');
      setFeedbackMessage(warning, `${overflowing.length}개 라벨의 내용이 칸을 넘어서 PDF를 만들지 않았습니다: ${examples}${overflowing.length > 10 ? ` 외 ${overflowing.length - 10}건` : ''}. 데이터를 줄이거나 글꼴 크기를 조정해주세요.`);
      warning.scrollIntoView({ block: 'nearest' }); return;
    }
    const shrunk = layouts.filter((layout) => layout.size < d.fontSize).length;
    const pages = labelPageSlots(rows, capacity, state.startSlot);
    for (let pageIndex = 0; pageIndex < pages.length; pageIndex += 1) {
      const page = pdf.addPage([t.paper.width * mm, t.paper.height * mm]);
      if (d.showDebugGeometry) {
        page.drawRectangle({ x: 0, y: 0, width: t.paper.width * mm, height: t.paper.height * mm, borderColor: rgb(0, 0, 0), borderWidth: 0.7 });
        for (let slot = 0; slot < capacity; slot += 1) {
          const box = labelGeometry(t, Math.floor(slot / t.cols), slot % t.cols, d.offsetX, d.offsetY);
          page.drawRectangle({ x: box.x * mm, y: t.paper.height * mm - (box.y + box.height) * mm, width: box.width * mm, height: box.height * mm, borderColor: rgb(0.85, 0.15, 0.15), borderWidth: 0.55 });
        }
      }
      layouts.filter((layout) => layout.page === pageIndex + 1).forEach((layout) => {
        const { box, items, divider } = layout;
        const x = box.x * mm; const top = box.y * mm;
        const width = box.width * mm; const height = box.height * mm;
        if (!d.showDebugGeometry && d.showGuides) page.drawRectangle({ x, y: t.paper.height * mm - top - height, width, height, borderColor: rgb(0.45, 0.55, 0.7), borderWidth: 0.35, borderDashArray: [1.5, 1.2], borderOpacity: 0.8 });
        if (divider) page.drawLine({ start: { x: x + divider.x1, y: t.paper.height * mm - top - divider.top }, end: { x: x + divider.x2, y: t.paper.height * mm - top - divider.top }, thickness: 0.45, color: rgb(0.55, 0.61, 0.7) });
        items.forEach((item) => {
          const options = { x: x + item.x, y: t.paper.height * mm - top - item.top - item.size, size: item.size, font, color: rgb(0.08, 0.1, 0.14) };
          page.drawText(item.text, options);
          if (item.weight === 'bold' && !d.bold) page.drawText(item.text, { ...options, x: options.x + 0.18 });
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
$('#has-header').addEventListener('change', (event) => { state.hasHeader = event.target.checked; state.mappingEdited = true; const first = state.rawRows[0] ?? []; const columns = Math.max(...state.rawRows.map((row) => row.length), 0); state.headers = Array.from({ length: columns }, (_, i) => state.hasHeader ? cleanText(first[i]) || `열 ${i + 1}` : `열 ${i + 1}`); const initial = {}; if (state.hasHeader) state.headers.forEach((header, index) => { const field = fieldForHeader(header); if (field) initial[field] = String(index); }); const result = inferColumnMappingWithConfidence(state.rawRows.slice(state.hasHeader ? 1 : 0), columns, initial); state.mapping = result.mapping; state.mappingConfidence = result.confidence; renderData(); });
$('#mapping').addEventListener('change', (event) => { if (!event.target.dataset.field) return; state.mappingEdited = true; const field = event.target.dataset.field; state.mapping[field] = event.target.value; state.mappingConfidence[field] = event.target.value === '' ? field === 'detail' ? 'optional' : 'missing' : 'manual'; renderData(); });
$('#manufacturer-select').addEventListener('change', (event) => { state.manufacturer = event.target.value; state.product = productsFor(state.manufacturer)[0]?.id; state.custom = false; state.template = presetTemplate(state.manufacturer, state.product); populateProducts(); $('#custom-fields').classList.add('hidden'); renderPreview(); });
$('#product-select').addEventListener('change', (event) => { state.product = event.target.value; state.custom = false; state.template = presetTemplate(state.manufacturer, state.product); $('#custom-fields').classList.add('hidden'); renderPreview(); });
$('#custom-toggle').addEventListener('click', () => { state.custom = !state.custom; if (state.custom) { state.template = createCustomTemplate(state.template); renderCustomFields(); } else state.template = presetTemplate(state.manufacturer, state.product); $('#custom-fields').classList.toggle('hidden', !state.custom); renderPreview(); });
$('#custom-fields').addEventListener('input', renderPreview); document.querySelectorAll('#label-section input, #label-section select').forEach((node) => node.addEventListener('input', () => { $('#font-size-output').textContent = `${$('#font-size').value}pt`; renderPreview(); }));
$('#start-slot-picker').addEventListener('click', (event) => { const button = event.target.closest('[data-start-slot]'); if (!button) return; state.startSlot = Number(button.dataset.startSlot); state.previewPage = 0; renderPreview(); });
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
document.fonts.ready.then(() => { if (state.rawRows.length) renderPreview(); });
