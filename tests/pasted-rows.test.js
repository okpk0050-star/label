import test from 'node:test';
import assert from 'node:assert/strict';
import { parseRecipientCells, structurePastedRows } from '../src/pasted-rows.js';
import { normalizePostalValue } from '../src/recipient-parser.js';

test('copied single-column recipients become the same fields used by file import', () => {
  const result = structurePastedRows([
    ['홍길동 02700 서울특별시 성북구 종암로 10 101동 1001호', ''],
    ['김철수 02841 서울특별시 성북구 동소문로 20 성북아파트 202동 1503호']
  ]);
  assert.deepEqual(result.mapping, { name: '0', postcode: '1', address: '2', detail: '3' });
  assert.deepEqual(result.rows[0], ['홍길동', '02700', '서울특별시 성북구 종암로 10', '101동 1001호']);
  assert.deepEqual(result.rows[1], ['김철수', '02841', '서울특별시 성북구 동소문로 20', '성북아파트 202동 1503호']);
});

test('an organization name does not repeat its full source cell on the label', () => {
  const source = '중앙지방법원 서울지원 공탁계 (02700) 서울특별시 성북구 종암로 10-3 101동 1001호';
  const result = structurePastedRows([[source], [source]]);
  assert.deepEqual(result.rows[0], ['중앙지방법원 서울지원 공탁계', '02700', '서울특별시 성북구 종암로 10-3', '101동 1001호']);
});

test('already structured Excel columns remain unchanged', () => {
  const rows = [['홍길동', '02700', '서울특별시 성북구 종암로 10', '101동 1001호']];
  assert.deepEqual(structurePastedRows(rows), { rows, mapping: null });
});

test('mixed copied rows are parsed individually, including shifted numeric postcode', () => {
  const result = structurePastedRows([
    ['김민수 (02700) 서울특별시 성북구 종암로 10-3 101동 1001호'],
    ['박철수 / 03058 / 서울특별시 종로구 율곡로 33 / 301호'],
    ['5029', '강하늘', '서울특별시 광진구 능동로 120', '스타오피스텔 1104호'],
    ['해석되지 않는 메모'],
  ]);
  assert.deepEqual(result.mapping, { name: '0', postcode: '1', address: '2', detail: '3' });
  assert.deepEqual(result.rows[2], ['강하늘', '05029', '서울특별시 광진구 능동로 120', '스타오피스텔 1104호']);
  assert.equal(result.rows[3][2], '');
});

test('mixed Excel file keeps its header while normalizing data rows', () => {
  const rows = [
    ['이름', '우편번호', '주소', ''],
    ['김민수 02700 서울특별시 성북구 종암로 10'],
    ['5029', '강하늘', '서울특별시 광진구 능동로 120', '스타오피스텔 1104호'],
  ];
  const result = structurePastedRows(rows, { hasHeader: true });
  assert.equal(result.hasHeader, true);
  assert.equal(result.rows[0], rows[0]);
  assert.deepEqual(result.rows[2], ['강하늘', '05029', '서울특별시 광진구 능동로 120', '스타오피스텔 1104호']);
});

test('a 50-row Excel file remains normalized when one row has a shifted postcode', () => {
  const rows = [
    ['이름', '우편번호', '주소', ''],
    ...Array.from({ length: 49 }, (_, index) => [`홍길동 02700 서울특별시 성북구 종암로 ${index + 1}`]),
    ['5029', '강하늘', '서울특별시 광진구 능동로 120', '스타오피스텔 1104호'],
  ];
  const result = structurePastedRows(rows, { hasHeader: true });
  assert.equal(result.rows.length, 51);
  assert.deepEqual(result.rows.at(-1), ['강하늘', '05029', '서울특별시 광진구 능동로 120', '스타오피스텔 1104호']);
});

test('standalone four-digit prefix in a split row is restored without treating address numbers as postcodes', () => {
  const recovered = parseRecipientCells(['5029', '강하늘', '서울특별시 광진구 능동로 120', '스타오피스텔 1104호']);
  assert.equal(recovered.name, '강하늘');
  assert.equal(normalizePostalValue(recovered.postcode), '05029');
  const addressOnly = parseRecipientCells(['강하늘', '서울특별시 광진구 능동로 120 1104호']);
  assert.equal(addressOnly.postcode, '');
});

test('mixed recipient formats resembling the reported Excel paste normalize row by row', () => {
  const rows = [
    ['김민수 (02700) 서울특별시 성북구 종암로 10-3 101동 1001호'],
    ['(02841) 서울특별시 성북구 동소문로20길 15 성북빌딩 202호 이영희'],
    ['박철수 / 03058 / 서울특별시 종로구 율곡로 33 / 301호'],
    ['04524,최서연,서울특별시 중구 세종대로 110,서울빌딩 8층'],
    ['정유진 | 04750 | 서울특별시 성동구 왕십리로 125 | 102동 703호'],
    ['5029', '강하늘', '서울특별시 광진구 능동로 120', '스타오피스텔 1104호'],
    ['윤서준 02554 서울특별시 동대문구 왕산로 214 청량리타워 12층 1201호'],
    ['02053 / 서울특별시 중랑구 신내로16길 33 / 105동 902호 / 정수빈'],
    ['임형우,01380,서울특별시 도봉구 도봉로150길 20,현대아파트 103동 404호'],
    ['한지민|01695|서울특별시 노원구 동일로 1234|상계주공5단지 501동 1202호'],
  ];
  const result = structurePastedRows(rows);
  assert.ok(result.mapping);
  assert.equal(result.rows.length, rows.length);
  for (const [index, row] of result.rows.entries()) {
    assert.ok(row[0], `name at row ${index + 1}`);
    assert.match(row[1], /^\d{5}$/, `postcode at row ${index + 1}`);
    assert.ok(row[2].startsWith('서울특별시'), `address at row ${index + 1}`);
  }
  assert.equal(result.rows[5][1], '05029');
});
