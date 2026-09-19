import test from 'node:test';
import assert from 'node:assert/strict';
import { structurePastedRows } from '../src/pasted-rows.js';

test('copied single-column recipients become the same fields used by file import', () => {
  const result = structurePastedRows([
    ['홍길동 02700 서울특별시 성북구 종암로 10 101동 1001호', ''],
    ['김철수 02841 서울특별시 성북구 동소문로 20 성북아파트 202동 1503호']
  ]);
  assert.deepEqual(result.mapping, { name: '0', postcode: '1', address: '2', detail: '3' });
  assert.deepEqual(result.rows[0], ['홍길동', '02700', '서울특별시 성북구 종암로 10', '101동 1001호']);
  assert.deepEqual(result.rows[1], ['김철수', '02841', '서울특별시 성북구 동소문로 20', '성북아파트 202동 1503호']);
});

test('already structured Excel columns remain unchanged', () => {
  const rows = [['홍길동', '02700', '서울특별시 성북구 종암로 10', '101동 1001호']];
  assert.deepEqual(structurePastedRows(rows), { rows, mapping: null });
});
