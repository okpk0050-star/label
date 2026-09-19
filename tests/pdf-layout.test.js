import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PDFDocument } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import { PDF_TEXT_WIDTH_FACTOR, wrapPdfText } from '../src/pdf-layout.js';

test('long addresses wrap within the measured Formtec 3107 PDF text area', async () => {
  const pdf = await PDFDocument.create();
  pdf.registerFontkit(fontkit);
  const font = await pdf.embedFont(await readFile('public/fonts/NotoSansCJKkr-Regular.otf'), { subset: false });
  const mm = 72 / 25.4;
  const labelWidth = 99.1 * mm;
  const safeWidth = (labelWidth - 5 * mm) * PDF_TEXT_WIDTH_FACTOR;
  for (const address of [
    '서울특별시 동대문구 왕산로 214 청량리타워 12층 1201호',
    '서울특별시 노원구 동일로 1234 상계주공아파트 501동 1202호'
  ]) {
    const lines = wrapPdfText(address, font, 11, safeWidth);
    assert.ok(lines.length > 1, address);
    assert.equal(lines.join(' '), address);
    assert.ok(lines.every((line) => font.widthOfTextAtSize(line, 11) <= safeWidth));
  }
});
