const provincePattern = /(?:서울특별시|부산광역시|대구광역시|인천광역시|광주광역시|대전광역시|울산광역시|세종특별자치시|경기도|강원특별자치도|충청북도|충청남도|전북특별자치도|전라남도|경상북도|경상남도|제주특별자치도)/;

function clean(value) { return String(value ?? '').trim().replace(/\s+/g, ' '); }
function hasAddressPattern(value) { return /(시|군|구|로|길|동|읍|면|리)/.test(value); }

export function normalizePostalValue(value) {
  const text = clean(value).replaceAll('-', '').replaceAll(' ', '');
  if (!/^\d{4,5}$/.test(text)) return text ? null : '';
  return text.length === 4 ? `0${text}` : text;
}

function findPostalCandidate(text) {
  const patterns = [
    /우편번호\s*[:：]?\s*(\d{4,5})\b/,
    /\((\d{4,5})\)/,
    /\[(\d{4,5})\]/,
    /(?:^|\s)(\d{3}-?\d{2}|\d{4})(?=\s|$)/
  ];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (!match) continue;
    const value = normalizePostalValue(match[1]);
    if (value) return { value, index: match.index, length: match[0].length };
  }
  return null;
}

export function parseCombinedRecipient(source) {
  const item = { name: '', postcode: '', address: '', detail: '', ...source };
  if (item.address && item.address !== item.name) return item;
  if (item.address === item.name) item.address = '';
  if (!hasAddressPattern(item.name)) return item;

  const combined = clean(item.name.replace(/[\/,|\t]+/g, ' '));
  const postal = findPostalCandidate(combined);
  if (postal && !item.postcode) item.postcode = postal.value;
  const withoutPostal = postal ? clean(`${combined.slice(0, postal.index)} ${combined.slice(postal.index + postal.length)}`) : combined;
  const addressStart = withoutPostal.search(provincePattern);
  if (addressStart < 0) return { ...item, name: '', address: combined };

  const leading = clean(withoutPostal.slice(0, addressStart));
  let addressAndDetail = clean(withoutPostal.slice(addressStart));
  item.name = /^[가-힣]{2,4}$/.test(leading) ? leading : '';

  // Treat a last short Hangul word as a person only after a concrete unit marker.
  const trailingName = addressAndDetail.match(/(?:^|\s)([가-힣]{2,4})$/);
  if (trailingName) {
    const beforeCandidate = clean(addressAndDetail.slice(0, trailingName.index));
    if (/\d+(?:동|호|층)(?:\s|$)/.test(beforeCandidate) && !item.name) {
      item.name = trailingName[1];
      addressAndDetail = beforeCandidate;
    }
  }

  const roadAddress = addressAndDetail.match(/^(.*?(?:로|길|대로)\s*\d+(?:-\d+)?)(?:\s+(.+))?$/);
  if (roadAddress) {
    item.address = clean(roadAddress[1]);
    if (!item.detail) item.detail = clean(roadAddress[2]);
  } else item.address = addressAndDetail;
  return item;
}
