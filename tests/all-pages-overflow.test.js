import test from 'node:test';
import assert from 'node:assert/strict';
import { inspectLabelPages, labelPageSlots } from '../src/pdf-layout.js';
import { labelGeometry, presetTemplate } from '../src/templates.js';

const font = { widthOfTextAtSize: (text, size) => [...text].length * size * 0.6 };
const design = { fontSize: 11, lineHeight: 1.4, offsetX: 0, offsetY: 0 };

test('preflight finds overflow on a later PDF page and identifies the source row', () => {
  const template = presetTemplate('formtec', '3105');
  const rows = Array.from({ length: 22 }, (_, index) => ({ sourceRow: index + 1, text: index === 21 ? '긴주소'.repeat(200) : '짧은 주소' }));
  const layouts = inspectLabelPages(rows, template, design, font, labelGeometry, (row) => [row.text]);
  assert.equal(layouts.length, 22);
  assert.equal(layouts.slice(0, 21).every((item) => item.fits), true);
  assert.equal(layouts[21].fits, false);
  assert.equal(layouts[21].page, 2);
  assert.equal(layouts[21].slot, 1);
  assert.equal(layouts[21].row.sourceRow, 22);
  assert.equal(layouts[0].box.y, template.startY);
});

test('preflight also detects an overflowing label on page three', () => {
  const template = presetTemplate('formtec', '3105');
  const capacity = template.cols * template.rows;
  const rows = Array.from({ length: capacity * 2 + 2 }, (_, index) => ({ sourceRow: index + 1, text: index === capacity * 2 + 1 ? '긴주소'.repeat(200) : '짧은 주소' }));
  const failures = inspectLabelPages(rows, template, design, font, labelGeometry, (row) => [row.text]).filter((item) => !item.fits);
  assert.equal(failures.length, 1);
  assert.equal(failures[0].page, 3);
  assert.equal(failures[0].slot, 2);
  assert.equal(failures[0].row.sourceRow, 44);
});

test('first-page start slot leaves earlier labels empty and resets on the next page', () => {
  const rows = Array.from({ length: 8 }, (_, index) => ({ sourceRow: index + 1, text: '짧은 주소' }));
  const pages = labelPageSlots(rows, 6, 3);
  assert.equal(pages.length, 2);
  assert.deepEqual(pages[0].slice(0, 3), [null, null, null]);
  assert.equal(pages[0][3].sourceRow, 1);
  assert.equal(pages[0][5].sourceRow, 3);
  assert.equal(pages[1][0].sourceRow, 4);
  assert.equal(pages[1][4].sourceRow, 8);

  const template = { ...presetTemplate('formtec', '3105'), rows: 2, cols: 3 };
  const layouts = inspectLabelPages(rows, template, design, font, labelGeometry, (row) => [row.text], undefined, 3);
  assert.deepEqual(layouts.slice(0, 4).map(({ page, slot, row }) => [page, slot, row.sourceRow]), [[1, 4, 1], [1, 5, 2], [1, 6, 3], [2, 1, 4]]);

  const longRows = [{ sourceRow: 1, text: '짧은 주소' }, { sourceRow: 2, text: '긴주소'.repeat(200) }];
  const overflow = inspectLabelPages(longRows, presetTemplate('formtec', '3105'), design, font, labelGeometry, (row) => [row.text], undefined, 20).find((item) => !item.fits);
  assert.equal(overflow.page, 2);
  assert.equal(overflow.slot, 1);
  assert.equal(overflow.row.sourceRow, 2);
});
