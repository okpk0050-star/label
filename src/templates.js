export const A4 = { width: 210, height: 297 };

// HWPX table origin and full grid dimensions in mm, supplied from the five
// Formtec templates. Product dimensions remain available for the UI; preset
// placement uses the HWPX grid rather than accumulated nominal heights.
export const LABEL_PRESETS = {
  formtec: {
    name: '폼텍',
    products: {
      '3105': { name: '폼텍 3105', rows: 7, cols: 3, labelWidth: 63.5, labelHeight: 38.1, startX: 8.001, startY: 15.804, gridW: 195.495, gridH: 266.700 },
      '3106': { name: '폼텍 3106', rows: 8, cols: 3, labelWidth: 64.0, labelHeight: 34.0, startX: 6.498, startY: 12.499, gridW: 196.988, gridH: 271.159 },
      '3107': { name: '폼텍 3107', rows: 8, cols: 2, labelWidth: 99.1, labelHeight: 33.9, startX: 4.699, startY: 14.196, gridW: 200.702, gridH: 271.159 },
      '3108': { name: '폼텍 3108', rows: 7, cols: 2, labelWidth: 99.1, labelHeight: 38.1, startX: 4.995, startY: 13.801, gridW: 200.702, gridH: 266.700 },
      '3109': { name: '폼텍 3109', rows: 9, cols: 2, labelWidth: 100.0, labelHeight: 30.0, startX: 3.697, startY: 13.497, gridW: 202.494, gridH: 269.081 },
      '3212': { name: '폼텍 3212', rows: 6, cols: 2, labelWidth: 100, labelHeight: 45, startX: 3.7, startY: 10, gapX: 2.5, gapY: 0 },
      '3218': { name: '폼텍 3218', rows: 6, cols: 3, labelWidth: 63.5, labelHeight: 45, startX: 7.2, startY: 10, gapX: 2.5, gapY: 0 },
      '3219': { name: '폼텍 3219', rows: 11, cols: 2, labelWidth: 100, labelHeight: 24.5, startX: 4, startY: 13, gapX: 2, gapY: 0 },
      '3620': { name: '폼텍 3620', rows: 6, cols: 1, labelWidth: 119.3, labelHeight: 42.7, startX: 45.3, startY: 19, gapX: 0, gapY: 0 }
    }
  },
  anylabel: {
    name: '애니라벨',
    products: {
      'V3240': { name: '애니라벨 V3240', rows: 8, cols: 2, labelWidth: 99, labelHeight: 33.8, startX: 5.1, startY: 13.8, gapX: 2.6, gapY: 0 },
      'V3230': { name: '애니라벨 V3230', rows: 7, cols: 2, labelWidth: 99, labelHeight: 38.1, startX: 5.1, startY: 15.9, gapX: 2.6, gapY: 0 },
      'V3330': { name: '애니라벨 V3330', rows: 7, cols: 3, labelWidth: 63.5, labelHeight: 38.1, startX: 7.6, startY: 15.9, gapX: 2.5, gapY: 0 },
      'V3340': { name: '애니라벨 V3340', rows: 8, cols: 3, labelWidth: 64, labelHeight: 33.8, startX: 6.5, startY: 13, gapX: 2.5, gapY: 0 },
      'V3260': { name: '애니라벨 V3260', rows: 9, cols: 2, labelWidth: 100, labelHeight: 30, startX: 4, startY: 13, gapX: 3, gapY: 0 }
    }
  }
};

export function presetTemplate(manufacturer, product) {
  const preset = LABEL_PRESETS[manufacturer]?.products[product];
  return preset ? { ...preset, id: `${manufacturer}-${product}`, manufacturer, product, paper: { ...A4 } } : null;
}
export function manufacturers() { return Object.entries(LABEL_PRESETS).map(([id, value]) => ({ id, name: value.name })); }
export function productsFor(manufacturer) { return Object.entries(LABEL_PRESETS[manufacturer]?.products ?? {}).map(([id, value]) => ({ id, ...value })); }

export function labelGeometry(t, row, col, offsetX = 0, offsetY = 0) {
  const pitchX = t.gridW === undefined ? t.labelWidth + t.gapX : t.cols === 1 ? 0 : (t.gridW - t.labelWidth) / (t.cols - 1);
  const pitchY = t.gridH === undefined ? t.labelHeight + t.gapY : t.gridH / t.rows;
  return {
    x: t.startX + col * pitchX + offsetX,
    y: t.startY + row * pitchY + offsetY,
    width: t.labelWidth,
    height: t.gridH === undefined ? t.labelHeight : pitchY
  };
}

export function createCustomTemplate(values = {}) {
  return {
    id: 'custom', name: '사용자 지정', paper: { width: Number(values.paperWidth ?? 210), height: Number(values.paperHeight ?? 297) },
    cols: Number(values.cols ?? 2), rows: Number(values.rows ?? 8), labelWidth: Number(values.labelWidth ?? 99), labelHeight: Number(values.labelHeight ?? 34),
    startX: Number(values.startX ?? 5), startY: Number(values.startY ?? 14), gapX: Number(values.gapX ?? 2.5), gapY: Number(values.gapY ?? 0)
  };
}

export function validateTemplate(t) {
  const values = [t.paper.width, t.paper.height, t.cols, t.rows, t.labelWidth, t.labelHeight, t.startX, t.startY, t.gridW ?? t.gapX, t.gridH ?? t.gapY];
  if (values.some((value) => !Number.isFinite(value) || value < 0) || t.cols < 1 || t.rows < 1) return '모든 치수는 0 이상의 숫자여야 하고, 행과 열은 1 이상이어야 합니다.';
  if (t.gridW !== undefined && t.gridW < t.labelWidth) return '그리드 가로 크기가 라벨 폭보다 작습니다.';
  const last = labelGeometry(t, t.rows - 1, t.cols - 1);
  const lastX = last.x + last.width;
  const lastY = last.y + last.height;
  if (lastX > t.paper.width + 0.001 || lastY > t.paper.height + 0.001) return '라벨 규격의 크기가 용지를 초과합니다. 시작 위치, 간격, 행·열 수를 확인해주세요.';
  return '';
}
