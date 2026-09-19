import test from 'node:test';
import assert from 'node:assert/strict';
import { productsFor, presetTemplate, validateTemplate } from '../src/templates.js';

const expected = {
  '3105': { rows: 7, cols: 3, labelWidth: 63.5, labelHeight: 38.1, startX: 8, startY: 15.8, gapX: 2.5, gapY: 0 },
  '3106': { rows: 8, cols: 3, labelWidth: 64, labelHeight: 34, startX: 6.5, startY: 12.5, gapX: 2.5, gapY: 0 },
  '3107': { rows: 8, cols: 2, labelWidth: 99.1, labelHeight: 33.9, startX: 4.7, startY: 14.2, gapX: 2.5, gapY: 0 },
  '3108': { rows: 7, cols: 2, labelWidth: 99.1, labelHeight: 38.1, startX: 5, startY: 13.8, gapX: 2.5, gapY: 0 },
  '3109': { rows: 9, cols: 2, labelWidth: 100, labelHeight: 30, startX: 3.7, startY: 13.5, gapX: 2.5, gapY: 0 }
};

test('Formtec 3105–3109 presets have the approved physical dimensions and capacity', () => {
  assert.deepEqual(productsFor('formtec').map(({ id }) => id), Object.keys(expected));
  for (const [product, dimensions] of Object.entries(expected)) {
    const template = presetTemplate('formtec', product);
    assert.deepEqual(Object.fromEntries(Object.keys(dimensions).map((key) => [key, template[key]])), dimensions);
    assert.equal(template.rows * template.cols, { '3105': 21, '3106': 24, '3107': 16, '3108': 14, '3109': 18 }[product]);
  }
});

test('every Formtec preset starts at its configured point and ends inside A4', () => {
  for (const product of Object.keys(expected)) {
    const template = presetTemplate('formtec', product);
    const lastX = template.startX + (template.cols - 1) * (template.labelWidth + template.gapX);
    const lastY = template.startY + (template.rows - 1) * (template.labelHeight + template.gapY);
    assert.equal(validateTemplate(template), '');
    assert.equal(lastX >= template.startX && lastY >= template.startY, true);
    assert.ok(lastX + template.labelWidth <= 210);
    assert.ok(lastY + template.labelHeight <= 297);
  }
});
