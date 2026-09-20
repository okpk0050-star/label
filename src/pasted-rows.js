import { parseCombinedRecipient } from './recipient-parser.js';

function clean(value) { return String(value ?? '').trim(); }
const provincePattern = /(?:서울특별시|부산광역시|대구광역시|인천광역시|광주광역시|대전광역시|울산광역시|세종특별자치시|경기도|강원특별자치도|충청북도|충청남도|전북특별자치도|전라남도|경상북도|경상남도|제주특별자치도)/;

export function parseRecipientCells(row) {
  const values = row.map(clean).filter(Boolean);
  const combined = values.join(' ');
  const parsed = parseCombinedRecipient({ name: combined });
  return { name: parsed.name, postcode: parsed.postcode, address: parsed.address, detail: parsed.detail };
}

export function structurePastedRows(rows, { hasHeader = false } = {}) {
  const data = rows.slice(hasHeader ? 1 : 0).filter((row) => row.some((value) => clean(value)));
  const nonempty = data.map((row) => row.map(clean).filter(Boolean)).filter((row) => row.length);
  // A mixed Excel range can contain mostly one-cell recipients and a few
  // tab-separated records. Parse each row independently rather than making
  // one irregular record disable normalization for the whole range.
  const combinedCount = nonempty.filter((row) => row.length === 1 && provincePattern.test(row[0])).length;
  if (!nonempty.length || combinedCount / nonempty.length < 0.5) return { rows, mapping: null };
  const parsed = data.map(parseRecipientCells);
  if (parsed.filter((item) => item.address).length / parsed.length < 0.5) return { rows, mapping: null };
  // An unresolved recipient should stay empty so it can be reviewed. Putting
  // the entire source cell back into name duplicates its address on the label.
  const normalized = parsed.map((item) => [item.name, item.postcode, item.address, item.detail]);
  return {
    rows: hasHeader ? [rows[0], ...normalized] : normalized,
    mapping: { name: '0', postcode: '1', address: '2', detail: '3' },
    ...(hasHeader ? { hasHeader: true } : {})
  };
}
