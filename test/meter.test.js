import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FEATURE, buildBilledStates, buildDevice, buildStates } from '../src/meter.js';
import { createFakeGladys } from './helpers/fakeGladys.js';

const gladys = createFakeGladys();
const subscription = {
  id: '1',
  pds: 'PDS0042',
  meter: 'M17AB',
  startDate: '2020-01-01',
  readingMode: 'TELERELEVE',
};
const keysOf = (device) => device.features.map((f) => f.external_id.split(':').at(-1)).sort();

test('the device is keyed on the delivery point, not the meter serial', () => {
  const device = buildDevice(gladys, subscription);
  assert.equal(device.external_id, 'ext:veolia:meter:PDS0042');
  assert.ok(device.name.includes('M17AB'));
  assert.equal(device.poll_frequency, undefined, 'no core polling');
});

test('every feature has explicit numeric bounds and is read-only', () => {
  const device = buildDevice(gladys, { ...subscription, readingMode: null });
  assert.deepEqual(keysOf(device), Object.values(FEATURE).sort());
  for (const feature of device.features) {
    assert.equal(typeof feature.min, 'number', `${feature.name}: min`);
    assert.equal(typeof feature.max, 'number', `${feature.name}: max`);
    assert.ok(feature.max > feature.min);
    assert.equal(feature.read_only, true);
    assert.equal(feature.category, 'volume-sensor');
    assert.ok(feature.unit);
  }
});

test('daily readings are past states, totals are current', () => {
  const readings = [
    { date: '2026-10-01', liters: 120, indexM3: 400.12, reliability: 'MESURE' },
    { date: '2026-10-02', liters: 130, indexM3: null, reliability: 'MESURE' },
  ];
  const states = buildStates(gladys, 'PDS0042', readings, {
    currentMonthM3: 0.25,
    currentYearM3: 9.25,
  });
  const ids = gladys.externalIds('meter', 'PDS0042');
  assert.deepEqual(states, [
    {
      device_feature_external_id: ids.feature(FEATURE.DAILY),
      state: 120,
      created_at: '2026-10-01T12:00:00.000Z',
    },
    {
      device_feature_external_id: ids.feature(FEATURE.INDEX),
      state: 400.12,
      created_at: '2026-10-01T12:00:00.000Z',
    },
    {
      device_feature_external_id: ids.feature(FEATURE.DAILY),
      state: 130,
      created_at: '2026-10-02T12:00:00.000Z',
    },
    { device_feature_external_id: ids.feature(FEATURE.MONTH), state: 0.25 },
    { device_feature_external_id: ids.feature(FEATURE.YEAR), state: 9.25 },
  ]);
});

test('unknown totals are not published', () => {
  const states = buildStates(gladys, 'PDS0042', [], { currentMonthM3: null, currentYearM3: null });
  assert.deepEqual(states, []);
});

test('only a meter that is not remote-read gets the billed volume', () => {
  assert.ok(!keysOf(buildDevice(gladys, subscription)).includes(FEATURE.BILLED));
  for (const readingMode of [null, 'RADIORELEVE', 'MANUAL']) {
    assert.ok(
      keysOf(buildDevice(gladys, { ...subscription, readingMode })).includes(FEATURE.BILLED),
      String(readingMode),
    );
  }
});

test('bills are past states on the bill date: volume and index', () => {
  const ids = gladys.externalIds('meter', 'PDS0042');
  const states = buildBilledStates(gladys, 'PDS0042', [
    { date: '2026-03-12', from: null, m3: 38, indexM3: 1191.5 },
    { date: '2026-09-14', from: '2026-03-12', m3: 42.5, indexM3: null },
  ]);
  assert.deepEqual(states, [
    {
      device_feature_external_id: ids.feature(FEATURE.BILLED),
      state: 38,
      created_at: '2026-03-12T12:00:00.000Z',
    },
    {
      device_feature_external_id: ids.feature(FEATURE.INDEX),
      state: 1191.5,
      created_at: '2026-03-12T12:00:00.000Z',
    },
    {
      device_feature_external_id: ids.feature(FEATURE.BILLED),
      state: 42.5,
      created_at: '2026-09-14T12:00:00.000Z',
    },
  ]);
});
