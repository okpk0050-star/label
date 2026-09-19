export const A4 = { width: 210, height: 297 };

// Official Formtec Microsoft Word registration coordinates (updated 2023-05-07).
export const templates = [
  { id: 'formtec-3107', name: '폼텍 3107 · 2 × 8', paper: A4, columns: 2, rows: 8, labelWidth: 99.1, labelHeight: 33.9, marginLeft: 4.7, marginTop: 14.2, horizontalGap: 2.5, verticalGap: 0 },
  { id: 'formtec-3105', name: '폼텍 3105 · 3 × 7', paper: A4, columns: 3, rows: 7, labelWidth: 63.5, labelHeight: 38.1, marginLeft: 8, marginTop: 15.8, horizontalGap: 2.5, verticalGap: 0 },
  { id: 'formtec-3108', name: '폼텍 3108 · 2 × 7', paper: A4, columns: 2, rows: 7, labelWidth: 99.1, labelHeight: 38.1, marginLeft: 5, marginTop: 13.8, horizontalGap: 2.5, verticalGap: 0 }
];

export function createCustomTemplate(values = {}) {
  return {
    id: 'custom', name: '사용자 지정', paper: { width: Number(values.paperWidth ?? 210), height: Number(values.paperHeight ?? 297) },
    columns: Number(values.columns ?? 2), rows: Number(values.rows ?? 8), labelWidth: Number(values.labelWidth ?? 99), labelHeight: Number(values.labelHeight ?? 34),
    marginLeft: Number(values.marginLeft ?? 5), marginRight: Number(values.marginRight ?? 5), marginTop: Number(values.marginTop ?? 14), marginBottom: Number(values.marginBottom ?? 14),
    horizontalGap: Number(values.horizontalGap ?? 2.5), verticalGap: Number(values.verticalGap ?? 0)
  };
}

export function validateTemplate(t) {
  const values = [t.paper.width, t.paper.height, t.columns, t.rows, t.labelWidth, t.labelHeight, t.marginLeft, t.marginTop, t.horizontalGap, t.verticalGap];
  if (values.some((value) => !Number.isFinite(value) || value < 0) || t.columns < 1 || t.rows < 1) return '모든 치수는 0 이상의 숫자여야 하고, 행과 열은 1 이상이어야 합니다.';
  const right = t.marginRight ?? 0;
  const bottom = t.marginBottom ?? 0;
  const usedWidth = t.marginLeft + t.labelWidth * t.columns + t.horizontalGap * (t.columns - 1) + right;
  const usedHeight = t.marginTop + t.labelHeight * t.rows + t.verticalGap * (t.rows - 1) + bottom;
  if (usedWidth > t.paper.width + 0.001 || usedHeight > t.paper.height + 0.001) return '라벨 규격의 크기가 용지를 초과합니다. 여백, 간격, 행·열 수를 확인해주세요.';
  return '';
}
