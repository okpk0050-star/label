import test from 'node:test';
import assert from 'node:assert/strict';
import { FEEDBACK_FORM_URL } from '../src/feedback.js';

test('feedback form destination is an absolute external URL', () => {
  const url = new URL(FEEDBACK_FORM_URL);
  assert.equal(url.protocol, 'https:');
  assert.equal(url.hostname, 'docs.google.com');
  assert.match(url.pathname, /\/forms\/d\/e\//);
});
