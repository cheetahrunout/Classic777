'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const { evaluate, payoutFor } = require('./game-logic');

test('three sevens win', () => {
  const r = evaluate(['SEVEN', 'SEVEN', 'SEVEN']);
  assert.equal(r.key, 'SEVEN');
  assert.equal(payoutFor(r, 2), 1500);
});

test('no win', () => {
  assert.equal(evaluate(['BLANK', 'BLANK', 'BLANK']), null);
});
