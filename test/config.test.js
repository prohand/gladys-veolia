import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_CONFIG, isConfigured, normalizeConfig } from '../src/config.js';

test('defaults when nothing is configured', () => {
  const config = normalizeConfig();
  assert.deepEqual(config, DEFAULT_CONFIG);
  assert.equal(isConfigured(config), false);
});

test('form strings become numbers, within bounds', () => {
  const config = normalizeConfig({
    email: ' me@example.com ',
    password: 'x',
    refresh_hours: '48',
    high_consumption_liters: '450.6',
    overdue_days: '0',
  });
  assert.equal(config.email, 'me@example.com');
  assert.equal(config.refresh_hours, 24);
  assert.equal(config.high_consumption_liters, 451);
  assert.equal(config.overdue_days, 1);
  assert.equal(isConfigured(config), true);
});

test('an unknown portal falls back to eau.veolia.fr', () => {
  assert.equal(normalizeConfig({ portal: 'evil.example' }).portal, 'eau.veolia.fr');
  assert.equal(
    normalizeConfig({ portal: 'eaudetm.monespace.eau.veolia.fr' }).portal,
    'eaudetm.monespace.eau.veolia.fr',
  );
});

test('empty number fields keep their default', () => {
  assert.equal(normalizeConfig({ refresh_hours: '' }).refresh_hours, 6);
  assert.equal(normalizeConfig({ overdue_days: null }).overdue_days, 3);
});
