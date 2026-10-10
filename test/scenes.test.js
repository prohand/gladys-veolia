import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { SCENE_ACTIONS, SCENE_ACTION_KEYS } from '../src/scenes.js';
import { PERIODS } from '../src/veolia/consumption.js';
import { ACCOUNT, dailyRange, dailyRecord } from './helpers/fakeVeolia.js';
import { setup } from './helpers/setup.js';

const manifest = JSON.parse(
  await readFile(new URL('../gladys-assistant-integration.json', import.meta.url), 'utf8'),
);
const DEVICE_ID = `ext:veolia:meter:${ACCOUNT.pds}`;

function assertDeclaredOutputs(key, outputs) {
  const declared = manifest.scene_actions.find((a) => a.key === key).outputs.map((o) => o.key);
  for (const [name, value] of Object.entries(outputs)) {
    assert.ok(declared.includes(name), `${key}: output "${name}" is not declared`);
    assert.ok(value === null || typeof value !== 'object', `${key}: output "${name}" is a scalar`);
  }
}

test('refresh_consumption reads the portal and returns the latest reading', async () => {
  const { sync, gladys } = setup({ daily: dailyRange('2026-10-01', '2026-10-08') });
  await sync.refresh(); // baseline
  const outputs = await SCENE_ACTIONS[SCENE_ACTION_KEYS.REFRESH](sync, { fields: {} });
  assert.equal(outputs.date, '2026-10-08');
  assert.equal(typeof outputs.liters, 'number');
  assert.equal(typeof outputs.index_m3, 'number');
  assertDeclaredOutputs(SCENE_ACTION_KEYS.REFRESH, outputs);
  assert.equal(gladys.sceneEvents.length, 0, 'an action never fires a trigger');
});

test('refresh_consumption fails the action when the portal refuses', async () => {
  const { sync, portal } = setup();
  portal.acceptPassword = 'changed';
  await assert.rejects(
    SCENE_ACTIONS[SCENE_ACTION_KEYS.REFRESH](sync, { fields: {} }),
    /refused the e-mail or the password/,
  );
});

test('get_consumption answers each period with declared outputs', async () => {
  const { sync } = setup({
    daily: [dailyRecord('2026-10-08', 150, 400.5)],
    monthly: [{ annee: 2026, mois: 9, consommation: { m3: 4.2 } }],
  });
  for (const period of Object.values(PERIODS)) {
    const outputs = await SCENE_ACTIONS[SCENE_ACTION_KEYS.GET](sync, {
      fields: { device: DEVICE_ID, period },
    });
    assert.equal(typeof outputs.liters, 'number', period);
    assertDeclaredOutputs(SCENE_ACTION_KEYS.GET, outputs);
  }
  const lastMonth = await SCENE_ACTIONS[SCENE_ACTION_KEYS.GET](sync, {
    fields: { period: PERIODS.PREVIOUS_MONTH },
  });
  assert.deepEqual(lastMonth, { liters: 4200, cubic_meters: 4.2, date: '2026-09' });
});

test('get_consumption returns empty outputs for an unknown meter', async () => {
  const { sync } = setup({ daily: [dailyRecord('2026-10-08', 150, 400.5)] });
  const outputs = await SCENE_ACTIONS[SCENE_ACTION_KEYS.GET](sync, {
    fields: { device: 'ext:veolia:meter:other', period: PERIODS.LAST_DAY },
  });
  assert.deepEqual(outputs, { liters: null, cubic_meters: null, date: null });
});
