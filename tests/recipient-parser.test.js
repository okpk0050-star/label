import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizePostalValue, parseCombinedRecipient } from '../src/recipient-parser.js';

test('keeps a leading zero for an Excel-coerced four-digit postcode', () => {
  assert.equal(normalizePostalValue('5029'), '05029');
  assert.equal(normalizePostalValue('05029'), '05029');
});

test('parses a trailing name after detail-address unit markers', () => {
  const value = parseCombinedRecipient({ name: '06764 서울특별시 서초구 태봉로 114 서초더샵 104동 1802호 김지훈' });
  assert.deepEqual(value, { name: '김지훈', postcode: '06764', address: '서울특별시 서초구 태봉로 114', detail: '서초더샵 104동 1802호' });
});

test('recognizes labelled, parenthesized, and bracketed postcodes near a name', () => {
  assert.equal(parseCombinedRecipient({ name: '김예진 / 우편번호 04969 / 서울특별시 광진구 아차산로 400' }).name, '김예진');
  assert.equal(parseCombinedRecipient({ name: '이승우 (03150) 서울특별시 종로구 종로 1' }).postcode, '03150');
  assert.equal(parseCombinedRecipient({ name: '[04157] 박서아 서울특별시 마포구 월드컵로 1' }).name, '박서아');
});

test('removes separator characters but preserves address and detail text', () => {
  const value = parseCombinedRecipient({ name: '조민석 / 01811 / 서울특별시 노원구 공릉로 232 / 태릉아파트 102동 501호' });
  assert.deepEqual(value, { name: '조민석', postcode: '01811', address: '서울특별시 노원구 공릉로 232', detail: '태릉아파트 102동 501호' });
});

test('does not strip common detailed-address forms', () => {
  const value = parseCombinedRecipient({ name: '홍길동 02700 서울특별시 성북구 종암로 10 B1 15F A동 S동 102-501 제7층 제701호 B-402' });
  assert.match(value.detail, /B1 15F A동 S동 102-501 제7층 제701호 B-402/);
});

test('splits an Excel-copied single-cell recipient row into label lines', () => {
  const value = parseCombinedRecipient({ name: '홍길동 02700 서울특별시 성북구 종암로 10 101동 1001호', address: '홍길동 02700 서울특별시 성북구 종암로 10 101동 1001호' });
  assert.deepEqual(value, { name: '홍길동', postcode: '02700', address: '서울특별시 성북구 종암로 10', detail: '101동 1001호' });
});

test('does not turn a four-digit road number into a postcode', () => {
  const value = parseCombinedRecipient({ name: '한지민 서울특별시 노원구 동일로 1234 상계주공아파트 501동 1202호 01695' });
  assert.deepEqual(value, { name: '한지민', postcode: '01695', address: '서울특별시 노원구 동일로 1234', detail: '상계주공아파트 501동 1202호' });
  const withoutPostcode = parseCombinedRecipient({ name: '한지민 서울특별시 노원구 동일로 1234 상계주공아파트 501동 1202호' });
  assert.equal(withoutPostcode.postcode, '');
  assert.equal(withoutPostcode.address, '서울특별시 노원구 동일로 1234');
});
