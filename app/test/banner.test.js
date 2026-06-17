import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_STATE, deepMerge } from '../public/defles-data.js';

test('mededelingStijl default is kader', () => {
  assert.equal(DEFAULT_STATE.mededelingStijl, 'kader');
});

test('deepMerge behoudt een gekozen mededelingStijl', () => {
  const merged = deepMerge(DEFAULT_STATE, { mededelingStijl: 'kaartje' });
  assert.equal(merged.mededelingStijl, 'kaartje');
});
