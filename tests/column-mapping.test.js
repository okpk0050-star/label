import test from 'node:test';
import assert from 'node:assert/strict';
import { inferColumnMapping, inferColumnMappingWithConfidence } from '../src/column-mapping.js';
import { normalizePostalValue } from '../src/recipient-parser.js';

test('headerless name containing an address suffix is not mapped as address', () => {
  const rows = [
    ['홍길동', '02700', '서울특별시 성북구 종암로 10'],
    ['김나리', '02841', '서울특별시 성북구 동소문로 20'],
  ];
  assert.deepEqual(inferColumnMapping(rows, 3), { name: '0', postcode: '1', address: '2', detail: '' });
});

test('address evidence wins regardless of column order and preserves header mapping', () => {
  const rows = [['경기도 수원시 영통구 광교로 12', '이하늘', '16508'], ['서울특별시 성북구 종암로 10', '홍길동', '02700']];
  assert.deepEqual(inferColumnMapping(rows, 3), { name: '1', postcode: '2', address: '0', detail: '' });
  assert.equal(inferColumnMapping(rows, 3, { name: '1' }).name, '1');
});

test('Excel-stripped 05029 is mapped as postcode and restored from 5029', () => {
  const rows = [
    ['정하늘', 5029, '서울특별시 광진구 능동로 120'],
    ['홍길동', '2700', '서울특별시 성북구 종암로 10'],
    ['김철수', '02841', '서울특별시 성북구 동소문로 20'],
  ];
  const mapping = inferColumnMapping(rows, 3);
  assert.deepEqual(mapping, { name: '0', postcode: '1', address: '2', detail: '' });
  assert.equal(normalizePostalValue(rows[0][Number(mapping.postcode)]), '05029');
});

test('a consistently four-digit postcode column is inferred only with separate name and address columns', () => {
  const rows = [['정하늘', 5029, '서울특별시 광진구 능동로 120'], ['홍길동', 2700, '서울특별시 성북구 종암로 10']];
  assert.equal(inferColumnMapping(rows, 3).postcode, '1');
  assert.equal(normalizePostalValue(rows[1][1]), '02700');
});

test('a four-digit column without independent address and name evidence is not presumed postal', () => {
  assert.equal(inferColumnMapping([['1234', '메모'], ['5678', '기타']], 2).postcode, '');
  const rows = [['홍길동', '1234', '서울특별시 성북구 종암로 10', '02700'], ['김철수', '5678', '서울특별시 광진구 능동로 120', '05029']];
  assert.equal(inferColumnMapping(rows, 4).postcode, '3');
});

test('headerless institution names provide name evidence without being mistaken for addresses', () => {
  const rows = [
    ['중앙지방법원 서울지원 공탁계', 5029, '서울특별시 성북구 종암로 10-3'],
    ['한빛주식회사 총무팀', 2700, '서울특별시 종로구 율곡로 33'],
  ];
  const result = inferColumnMappingWithConfidence(rows, 3);
  assert.deepEqual(result.mapping, { name: '0', postcode: '1', address: '2', detail: '' });
  assert.equal(result.confidence.postcode, 'medium');
});

test('confidence distinguishes clear columns, ambiguous four-digit postcodes, and missing names', () => {
  const clear = inferColumnMappingWithConfidence([
    ['홍길동', '02700', '서울특별시 성북구 종암로 10'],
    ['김나리', '02841', '서울특별시 성북구 동소문로 20'],
  ], 3);
  assert.deepEqual(clear.confidence, { name: 'high', postcode: 'high', address: 'high', detail: 'optional' });
  const ambiguous = inferColumnMappingWithConfidence([
    ['회사 담당자', 5029, '서울특별시 광진구 능동로 120'],
    ['수취인 미정', 2700, '서울특별시 성북구 종암로 10'],
  ], 3);
  assert.equal(ambiguous.mapping.name, '');
  assert.equal(ambiguous.confidence.name, 'missing');
  assert.equal(ambiguous.mapping.postcode, '');
  const fourDigits = inferColumnMappingWithConfidence([
    ['홍길동', 5029, '서울특별시 광진구 능동로 120'],
    ['김나리', 2700, '서울특별시 성북구 종암로 10'],
  ], 3);
  assert.equal(fourDigits.confidence.postcode, 'medium');
  const single = inferColumnMappingWithConfidence([['홍길동', '02700', '서울특별시 성북구 종암로 10']], 3);
  assert.equal(single.confidence.name, 'medium');
  assert.equal(single.confidence.postcode, 'medium');
});
