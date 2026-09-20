const postcodePattern = /^\d{3}-?\d{2}$/;
const provincePattern = /(?:서울특별시|서울시|부산광역시|부산시|대구광역시|대구시|인천광역시|인천시|광주광역시|광주시|대전광역시|대전시|울산광역시|울산시|세종특별자치시|세종시|경기도|강원특별자치도|강원도|충청북도|충청남도|충북|충남|전북특별자치도|전라북도|전라남도|전북|전남|경상북도|경상남도|경북|경남|제주특별자치도|제주도)/;

function addressScore(value) {
  const text = String(value ?? '').trim();
  if (!text || postcodePattern.test(text)) return 0;
  let score = 0;
  if (provincePattern.test(text)) score += 4;
  if (/(?:^|\s)[가-힣]+(?:시|군|구|읍|면|동|리)(?=\s|$)/.test(text)) score += 2;
  if (/(?:^|\s)[가-힣\d]+(?:대로|로|길)\s*\d+(?:-\d+)?(?=\s|$)/.test(text)) score += 4;
  if (/\d+(?:동|호|층|번지)(?=\s|$)/.test(text)) score += 1;
  return score;
}

const organizationPattern = /(?:법원|법인|주식회사|㈜|\(주\)|유한회사|공사|공단|협회|재단|학교|대학교|병원|의원|은행|센터|사무소|사업소|연구소|연구원|위원회|연합회|조합|청|본부)/;
function nameLike(value) {
  const text = String(value ?? '').trim();
  if (/^[가-힣]{2,5}$/.test(text)) return true;
  return text.length <= 60 && organizationPattern.test(text) && /[가-힣A-Za-z]/.test(text) && addressScore(text) < 4;
}

export function inferColumnMappingWithConfidence(rows, columns, initial = {}) {
  const mapping = { name: '', postcode: '', address: '', detail: '', ...initial };
  const samples = Array.from({ length: columns }, (_, col) => rows.map((row) => String(row[col] ?? '').trim()).filter(Boolean));
  const ratio = (values, pattern) => values.length ? values.filter((value) => pattern.test(value)).length / values.length : 0;
  if (!mapping.postcode) {
    const candidate = samples.findIndex((values) => values.length && values.filter((value) => postcodePattern.test(value)).length / values.length > 0.65);
    if (candidate >= 0) mapping.postcode = String(candidate);
  }
  if (!mapping.address) {
    const candidates = samples.map((values, col) => ({ col, confidence: values.length ? values.filter((value) => addressScore(value) >= 4).length / values.length : 0, strength: values.length ? values.reduce((sum, value) => sum + addressScore(value), 0) / values.length : 0 }));
    candidates.sort((a, b) => b.confidence - a.confidence || b.strength - a.strength);
    const best = candidates.find((candidate) => String(candidate.col) !== mapping.postcode);
    if (best && best.confidence > 0.45) mapping.address = String(best.col);
  }
  // A four-digit Excel number may be a postcode whose leading zero was lost,
  // but four digits alone are ambiguous (road numbers, apartment numbers...).
  // Require a postcode-shaped column plus independent address and name evidence.
  if (!mapping.postcode && mapping.address !== '') {
    const nameColumn = samples.findIndex((values, col) => String(col) !== mapping.address && values.length && values.filter(nameLike).length / values.length > 0.6);
    if (nameColumn >= 0) {
      const candidate = samples.findIndex((values, col) => col !== nameColumn && String(col) !== mapping.address && values.length
        && values.some((value) => /^\d{4}$/.test(value))
        && values.filter((value) => /^\d{4,5}$/.test(value)).length / values.length > 0.8);
      if (candidate >= 0) mapping.postcode = String(candidate);
    }
  }
  if (!mapping.detail && mapping.address !== '') {
    const candidate = samples.findIndex((values, col) => !Object.values(mapping).includes(String(col)) && values.length && values.filter((value) => /(?:아파트|빌딩|오피스텔|\d+동|\d+호|\d+층)/.test(value)).length / values.length > 0.45);
    if (candidate >= 0) mapping.detail = String(candidate);
  }
  if (!mapping.name && columns) {
    const candidates = samples.map((values, col) => ({ col, confidence: values.length ? values.filter(nameLike).length / values.length : 0 }))
      .filter((item) => !Object.values(mapping).includes(String(item.col)))
      .sort((a, b) => b.confidence - a.confidence);
    if (candidates[0]?.confidence > 0.6) mapping.name = String(candidates[0].col);
  }
  const confidence = {};
  for (const field of ['name', 'postcode', 'address', 'detail']) {
    const col = mapping[field];
    if (col === '') { confidence[field] = field === 'detail' ? 'optional' : 'missing'; continue; }
    if (initial[field] !== undefined && initial[field] !== '') { confidence[field] = 'high'; continue; }
    const values = samples[Number(col)] ?? [];
    if (field === 'name') confidence[field] = values.length >= 2 && values.filter(nameLike).length / values.length >= 0.8 ? 'high' : 'medium';
    if (field === 'postcode') confidence[field] = values.length >= 2 && ratio(values, postcodePattern) >= 0.8 ? 'high' : 'medium';
    if (field === 'address') {
      const score = values.length ? values.filter((value) => addressScore(value) >= 4).length / values.length : 0;
      const runnerUp = Math.max(0, ...samples.map((other, index) => index === Number(col) ? 0 : other.length ? other.filter((value) => addressScore(value) >= 4).length / other.length : 0));
      confidence[field] = values.length >= 2 && score >= 0.75 && score - runnerUp >= 0.2 ? 'high' : 'medium';
    }
    if (field === 'detail') confidence[field] = 'medium';
  }
  return { mapping, confidence };
}

export function inferColumnMapping(rows, columns, initial = {}) {
  return inferColumnMappingWithConfidence(rows, columns, initial).mapping;
}
