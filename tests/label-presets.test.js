import test from 'node:test';
import assert from 'node:assert/strict';
import { productsFor, presetTemplate, validateTemplate, labelGeometry, createCustomTemplate } from '../src/templates.js';
import { labelPageSlots } from '../src/pdf-layout.js';

const expected = {
  '3105': { rows: 7, cols: 3, labelWidth: 63.5, labelHeight: 38.1, startX: 8.001, startY: 15.804, gridW: 195.495, gridH: 266.700 },
  '3106': { rows: 8, cols: 3, labelWidth: 64, labelHeight: 34, startX: 6.498, startY: 12.499, gridW: 196.988, gridH: 271.159 },
  '3107': { rows: 8, cols: 2, labelWidth: 99.1, labelHeight: 33.9, startX: 4.699, startY: 14.196, gridW: 200.702, gridH: 271.159 },
  '3108': { rows: 7, cols: 2, labelWidth: 99.1, labelHeight: 38.1, startX: 4.995, startY: 13.801, gridW: 200.702, gridH: 266.700 },
  '3109': { rows: 9, cols: 2, labelWidth: 100, labelHeight: 30, startX: 3.697, startY: 13.497, gridW: 202.494, gridH: 269.081 }
};

test('Formtec 3105–3109 presets have the approved physical dimensions and capacity', () => {
  assert.deepEqual(productsFor('formtec').map(({ id }) => id).filter((id) => Object.hasOwn(expected, id)), Object.keys(expected));
  for (const [product, dimensions] of Object.entries(expected)) {
    const template = presetTemplate('formtec', product);
    assert.deepEqual(Object.fromEntries(Object.keys(dimensions).map((key) => [key, template[key]])), dimensions);
    assert.equal(template.rows * template.cols, { '3105': 21, '3106': 24, '3107': 16, '3108': 14, '3109': 18 }[product]);
  }
});

test('every Formtec grid starts and ends at the supplied HWPX coordinates inside A4', () => {
  for (const product of Object.keys(expected)) {
    const template = presetTemplate('formtec', product);
    const first = labelGeometry(template, 0, 0);
    const last = labelGeometry(template, template.rows - 1, template.cols - 1);
    assert.equal(validateTemplate(template), '');
    assert.equal(first.x, template.startX);
    assert.equal(first.y, template.startY);
    assert.ok(Math.abs(last.x + last.width - (template.startX + template.gridW)) < 1e-9);
    assert.ok(Math.abs(last.y + last.height - (template.startY + template.gridH)) < 1e-9);
    assert.ok(last.x + last.width <= 210);
    assert.ok(last.y + last.height <= 297);
  }
});

test('row pitches use HWPX grid height and offsets shift every label equally', () => {
  const template = presetTemplate('formtec', '3106');
  const first = labelGeometry(template, 0, 0);
  const next = labelGeometry(template, 1, 0);
  const shifted = labelGeometry(template, 1, 0, 1.2, -0.7);
  assert.ok(Math.abs(next.y - first.y - 271.159 / 8) < 1e-9);
  assert.ok(Math.abs(shifted.x - next.x - 1.2) < 1e-9);
  assert.ok(Math.abs(shifted.y - next.y + 0.7) < 1e-9);
  const custom = createCustomTemplate({ labelWidth: 50, labelHeight: 30, cols: 2, rows: 2, startX: 5, startY: 10, gapX: 3, gapY: 2 });
  assert.deepEqual(labelGeometry(custom, 1, 1), { x: 58, y: 42, width: 50, height: 30 });
});

const addedPresets = {
  formtec: {
    '3212': { left: 3.7, top: 10, width: 100, height: 45, horizontalPitch: 102.5, verticalPitch: 45, columns: 2, rows: 6 },
    '3218': { left: 7.2, top: 10, width: 63.5, height: 45, horizontalPitch: 66, verticalPitch: 45, columns: 3, rows: 6 },
    '3219': { left: 4, top: 13, width: 100, height: 24.5, horizontalPitch: 102, verticalPitch: 24.5, columns: 2, rows: 11 },
    '3620': { left: 45.3, top: 19, width: 119.3, height: 42.7, horizontalPitch: 119.3, verticalPitch: 42.7, columns: 1, rows: 6 }
  },
  anylabel: {
    'V3240': { left: 5.1, top: 13.8, width: 99, height: 33.8, horizontalPitch: 101.6, verticalPitch: 33.8, columns: 2, rows: 8 },
    'V3230': { left: 5.1, top: 15.9, width: 99, height: 38.1, horizontalPitch: 101.6, verticalPitch: 38.1, columns: 2, rows: 7 },
    'V3330': { left: 7.6, top: 15.9, width: 63.5, height: 38.1, horizontalPitch: 66, verticalPitch: 38.1, columns: 3, rows: 7 },
    'V3340': { left: 6.5, top: 13, width: 64, height: 33.8, horizontalPitch: 66.5, verticalPitch: 33.8, columns: 3, rows: 8 },
    'V3260': { left: 4, top: 13, width: 100, height: 30, horizontalPitch: 103, verticalPitch: 30, columns: 2, rows: 9 }
  }
};

test('nine Word-sourced presets keep their exact pitch, capacity, A4 bounds, and start-slot pagination', () => {
  for (const [manufacturer, products] of Object.entries(addedPresets)) {
    for (const [product, expectedPreset] of Object.entries(products)) {
      const template = presetTemplate(manufacturer, product);
      const first = labelGeometry(template, 0, 0);
      const last = labelGeometry(template, template.rows - 1, template.cols - 1);
      const capacity = template.cols * template.rows;
      assert.equal(first.x, expectedPreset.left, `${manufacturer} ${product} left`);
      assert.equal(first.y, expectedPreset.top, `${manufacturer} ${product} top`);
      assert.equal(template.labelWidth, expectedPreset.width);
      assert.equal(template.labelHeight, expectedPreset.height);
      assert.equal(template.cols, expectedPreset.columns);
      assert.equal(template.rows, expectedPreset.rows);
      assert.equal(capacity, expectedPreset.columns * expectedPreset.rows);
      assert.equal(validateTemplate(template), '');
      assert.ok(last.x + last.width <= 210, `${manufacturer} ${product} right edge`);
      assert.ok(last.y + last.height <= 296.9, `${manufacturer} ${product} bottom edge`);
      if (template.cols > 1) assert.ok(Math.abs(labelGeometry(template, 0, 1).x - first.x - expectedPreset.horizontalPitch) < 1e-9, `${manufacturer} ${product} horizontal pitch`);
      assert.ok(Math.abs(labelGeometry(template, 1, 0).y - first.y - expectedPreset.verticalPitch) < 1e-9, `${manufacturer} ${product} vertical pitch`);

      const startSlot = Math.min(2, capacity - 1);
      const rows = Array.from({ length: capacity - startSlot + 3 }, (_, index) => ({ sourceRow: index + 1 }));
      const pages = labelPageSlots(rows, capacity, startSlot);
      assert.equal(pages.length, 2, `${manufacturer} ${product} page count`);
      assert.deepEqual(pages[0].slice(0, startSlot), Array(startSlot).fill(null), `${manufacturer} ${product} first-page blanks`);
      assert.equal(pages[0][startSlot].sourceRow, 1, `${manufacturer} ${product} start row`);
      assert.equal(pages[1][0].sourceRow, capacity - startSlot + 1, `${manufacturer} ${product} next-page reset`);
    }
  }
});
