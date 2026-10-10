import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Store } from '../src/store.js';

const tempFile = () => join(mkdtempSync(join(tmpdir(), 'veolia-store-')), 'state.json');

test('values survive a reload', () => {
  const file = tempFile();
  new Store(file).set('PDS1', 'published', '2026-10-08');
  assert.equal(new Store(file).get('PDS1', 'published'), '2026-10-08');
  assert.equal(new Store(file).get('PDS1', 'event'), null);
});

test('a corrupted file starts fresh', () => {
  const file = tempFile();
  writeFileSync(file, '{ not json');
  assert.equal(new Store(file).get('PDS1', 'published'), null);
});

test('an unwritable location keeps working in memory', () => {
  // A path under a regular file can never be created (ENOTDIR).
  const file = tempFile();
  writeFileSync(file, '{}');
  const store = new Store(join(file, 'state.json'));
  store.set('PDS1', 'event', '2026-10-08');
  assert.equal(store.get('PDS1', 'event'), '2026-10-08');
});
