export const A4 = { width: 210, height: 297 };

// Keep all measured/template-derived coordinates here. startX/startY are
// initial values and can be adjusted after a physical print test.
export const LABEL_PRESETS = {
  formtec: {
    name: '폼텍',
    products: {
      '3105': { name: '폼텍 3105', rows: 7, cols: 3, labelWidth: 63.5, labelHeight: 38.1, startX: 8.0, startY: 15.8, gapX: 2.5, gapY: 0 },
      '3106': { name: '폼텍 3106', rows: 8, cols: 3, labelWidth: 64.0, labelHeight: 34.0, startX: 6.5, startY: 12.5, gapX: 2.5, gapY: 0 },
      '3107': { name: '폼텍 3107', rows: 8, cols: 2, labelWidth: 99.1, labelHeight: 33.9, startX: 4.7, startY: 14.2, gapX: 2.5, gapY: 0 },
      '3108': { name: '폼텍 3108', rows: 7, cols: 2, labelWidth: 99.1, labelHeight: 38.1, startX: 5.0, startY: 13.8, gapX: 2.5, gapY: 0 },
      '3109': { name: '폼텍 3109', rows: 9, cols: 2, labelWidth: 100.0, labelHeight: 30.0, startX: 3.7, startY: 13.5, gapX: 2.5, gapY: 0 }
    }
  }
};

export function presetTemplate(manufacturer, product) {
  const preset = LABEL_PRESETS[manufacturer]?.products[product];
  return preset ? { ...preset, id: `${manufacturer}-${product}`, manufacturer, product, paper: { ...A4 } } : null;
}
export function manufacturers() { return Object.entries(LABEL_PRESETS).map(([id, value]) => ({ id, name: value.name })); }
export function productsFor(manufacturer) { return Object.entries(LABEL_PRESETS[manufacturer]?.products ?? {}).map(([id, value]) => ({ id, ...value })); }

export function createCustomTemplate(values = {}) {
  return {
    id: 'custom', name: '사용자 지정', paper: { width: Number(values.paperWidth ?? 210), height: Number(values.paperHeight ?? 297) },
    cols: Number(values.cols ?? 2), rows: Number(values.rows ?? 8), labelWidth: Number(values.labelWidth ?? 99), labelHeight: Number(values.labelHeight ?? 34),
    startX: Number(values.startX ?? 5), startY: Number(values.startY ?? 14), gapX: Number(values.gapX ?? 2.5), gapY: Number(values.gapY ?? 0)
  };
}

export function validateTemplate(t) {
  const values = [t.paper.width, t.paper.height, t.cols, t.rows, t.labelWidth, t.labelHeight, t.startX, t.startY, t.gapX, t.gapY];
  if (values.some((value) => !Number.isFinite(value) || value < 0) || t.cols < 1 || t.rows < 1) return '모든 치수는 0 이상의 숫자여야 하고, 행과 열은 1 이상이어야 합니다.';
  const lastX = t.startX + (t.cols - 1) * (t.labelWidth + t.gapX) + t.labelWidth;
  const lastY = t.startY + (t.rows - 1) * (t.labelHeight + t.gapY) + t.labelHeight;
  if (lastX > t.paper.width + 0.001 || lastY > t.paper.height + 0.001) return '라벨 규격의 크기가 용지를 초과합니다. 시작 위치, 간격, 행·열 수를 확인해주세요.';
  return '';
}
