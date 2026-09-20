import test from 'node:test';
import assert from 'node:assert/strict';
import { mappingAlertText } from '../src/mapping-feedback.js';

const names = { name: '이름', postcode: '우편번호', address: '주소' };

test('widespread failures point to column mapping before individual row edits', () => {
  const message = mappingAlertText(47, 47, { name: 'missing', postcode: 'missing', address: 'medium' }, names);
  assert.match(message, /대부분의 데이터를 정확하게 인식하지 못했습니다/);
  assert.match(message, /열이 올바르게 선택/);
});

test('uncertain mapping asks for confirmation without claiming all rows are bad', () => {
  assert.match(mappingAlertText(50, 1, { name: 'high', postcode: 'medium', address: 'high' }, names), /우편번호 열을 확인해주세요/);
  assert.equal(mappingAlertText(50, 0, { name: 'high', postcode: 'high', address: 'manual' }, names), '');
});
