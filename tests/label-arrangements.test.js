import test from 'node:test';
import assert from 'node:assert/strict';
import { labelContent, layoutArrangement, LABEL_ARRANGEMENTS } from '../src/label-arrangements.js';
import { labelGeometry, presetTemplate } from '../src/templates.js';

const font = { widthOfTextAtSize: (text, size) => [...text].length * size * 0.6 };
const fonts = { regular: font, bold: font };
const design = { arrangement: 'basic', showName: true, showAddress: true, showDetail: true, showPostcode: true, nameSuffix: '', fontSize: 11, lineHeight: 1.2, align: 'left', bold: false };
const row = { name: '홍길동', address: '서울특별시 성북구 종암로 10', detail: '101동 1001호', postcodeNormalized: '02700' };

test('basic arrangement is the default and keeps name, address, postcode in order', () => {
  assert.equal(LABEL_ARRANGEMENTS[0].id, 'basic');
  const box = labelGeometry(presetTemplate('formtec', '3105'), 0, 0);
  const result = layoutArrangement(labelContent(row, design), fonts, design, box);
  assert.equal(result.fits, true);
  assert.equal(result.items[0].text, '홍길동');
  assert.equal(result.items.at(-1).text, '02700');
  assert.ok(result.items[0].top < result.items.at(-1).top);
});

test('all four arrangements fit ordinary content and render distinguishing elements', () => {
  for (const product of ['3105', '3106', '3107', '3108', '3109']) {
    const box = labelGeometry(presetTemplate('formtec', product), 0, 0);
    for (const arrangement of LABEL_ARRANGEMENTS) {
      const result = layoutArrangement(labelContent(row, design), fonts, { ...design, arrangement: arrangement.id }, box);
      assert.equal(result.fits, true, `${product} ${arrangement.id}`);
      assert.equal(Boolean(result.divider), arrangement.id === 'divider', arrangement.id);
      const postcode = result.items.find((item) => item.text === '02700');
      if (arrangement.id === 'postcode-right' || arrangement.id === 'compact') assert.ok(postcode.x > box.width * 72 / 25.4 / 2, arrangement.id);
    }
  }
});

test('arrangement layout reports overflow instead of discarding long address lines', () => {
  const box = labelGeometry(presetTemplate('formtec', '3105'), 0, 0);
  const result = layoutArrangement({ name: '홍길동', address: '긴주소'.repeat(200), postcode: '02700' }, fonts, design, box);
  assert.equal(result.fits, false);
});

test('five line-spacing choices progressively separate lines, including compact layout', () => {
  const box = labelGeometry(presetTemplate('formtec', '3107'), 0, 0);
  const content = labelContent(row, design);
  for (const arrangement of ['basic', 'compact']) {
    const positions = [0, 1, 1.2, 1.4, 1.6].map((lineHeight) => {
      const result = layoutArrangement(content, fonts, { ...design, arrangement, lineHeight }, box);
      assert.equal(result.fits, true, `${arrangement} ${lineHeight}`);
      return result.items.find((item) => item.text.startsWith('서울특별시')).top;
    });
    assert.ok(positions.every((position, index) => index === 0 || position > positions[index - 1]), arrangement);
  }
});
