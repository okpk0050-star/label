import { parseCombinedRecipient } from './recipient-parser.js';

function clean(value) { return String(value ?? '').trim(); }

export function structurePastedRows(rows) {
  const nonempty = rows.map((row) => row.map(clean).filter(Boolean)).filter((row) => row.length);
  // Excel often copies a single address column with trailing empty tab cells.
  // Convert the entire range only when every row is a recognizable recipient;
  // otherwise keep the original columns for normal mapping.
  if (!nonempty.length || nonempty.some((row) => row.length !== 1)) return { rows, mapping: null };
  const parsed = nonempty.map(([value]) => parseCombinedRecipient({ name: value }));
  if (parsed.some((item) => !item.address || !item.name || !item.postcode)) return { rows, mapping: null };
  return {
    rows: parsed.map((item) => [item.name, item.postcode, item.address, item.detail]),
    mapping: { name: '0', postcode: '1', address: '2', detail: '3' }
  };
}
