import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { Store } from '../src/store.js';
import { HISTORY_MONTHS, TRIGGERS } from '../src/sync.js';
import { FEATURE } from '../src/meter.js';
import { MESSAGES } from '../src/status.js';
import { normalizeConfig } from '../src/config.js';
import { ACCOUNT, dailyRange, dailyRecord } from './helpers/fakeVeolia.js';
import { setToday, setup } from './helpers/setup.js';
import { assertAllLanguages } from './helpers/languages.js';

const manifest = JSON.parse(
  await readFile(new URL('../gladys-assistant-integration.json', import.meta.url), 'utf8'),
);
const DEVICE_ID = `ext:veolia:meter:${ACCOUNT.pds}`;
const dailyFeature = `${DEVICE_ID}:${FEATURE.DAILY}`;

// September 1st to October 8th: two days behind "today" (October 10th).
const history = () => dailyRange('2026-09-01', '2026-10-08');

test('the first refresh discovers the meter and reports connected', async () => {
  const { gladys, sync } = setup({ daily: history() });
  const result = await sync.refresh();
  assert.deepEqual(result, { ok: true });
  assert.equal(gladys.discovered.length, 1);
  assert.equal(gladys.discovered[0][0].external_id, DEVICE_ID);
  assert.deepEqual(gladys.connectionStatuses.at(-1), { connected: true, message: undefined });
  assert.ok(gladys.widgetRefreshes.length > 0, 'the widget is nudged');
});

test('no state is published before the user adds the device', async () => {
  const { gladys, sync, store } = setup({ daily: history() });
  await sync.refresh();
  assert.equal(gladys.published.length, 0);
  assert.equal(store.get(ACCOUNT.pds, 'published'), null);
});

test('adding the device sends the known history with the reading dates', async () => {
  const { gladys, sync, store } = setup({ daily: history() });
  await sync.refresh();
  gladys.createAllDevices();
  await sync.onDeviceCreated(DEVICE_ID);

  const daily = gladys.published.filter((s) => s.device_feature_external_id === dailyFeature);
  assert.equal(daily.length, 38, 'September 1st to October 8th');
  assert.equal(daily[0].created_at, '2026-09-01T12:00:00.000Z');
  assert.equal(daily.at(-1).created_at, '2026-10-08T12:00:00.000Z');
  assert.ok(
    gladys.stateCalls.every((batch) => batch.length <= 100),
    'batches of 100 max',
  );
  assert.equal(store.get(ACCOUNT.pds, 'published'), '2026-10-08');
});

test('a meter that is not remote-read publishes no fake zero', async () => {
  const { gladys, sync } = setup({ readingMode: 'RADIORELEVE' });
  assert.deepEqual(await sync.refresh(), { ok: true });
  gladys.createAllDevices();
  await sync.onDeviceCreated(DEVICE_ID);
  await sync.refresh();
  assert.deepEqual(gladys.published, [], 'no reading, no 0 m³ total');
  assert.equal(sync.meterOf().subscription.readingMode, 'RADIORELEVE');
});

test('later refreshes only publish the new readings', async () => {
  const { gladys, sync, portal, clock } = setup({ daily: history() });
  await sync.refresh();
  gladys.createAllDevices();
  await sync.onDeviceCreated(DEVICE_ID);
  gladys.stateCalls.length = 0;

  await sync.refresh();
  const again = gladys.published.filter((s) => s.device_feature_external_id === dailyFeature);
  assert.equal(again.length, 0, 'nothing new, nothing re-published');

  portal.daily.push(dailyRecord('2026-10-09', 180, 500));
  setToday(clock, '2026-10-11');
  await sync.refresh();
  const fresh = gladys.published.filter((s) => s.device_feature_external_id === dailyFeature);
  assert.deepEqual(
    fresh.map((s) => [s.state, s.created_at]),
    [[180, '2026-10-09T12:00:00.000Z']],
  );
});

test('the published date survives a restart (persisted store)', async () => {
  const { gladys, sync, storeFile } = setup({ daily: history() });
  await sync.refresh();
  gladys.createAllDevices();
  await sync.onDeviceCreated(DEVICE_ID);
  assert.equal(new Store(storeFile).get(ACCOUNT.pds, 'published'), '2026-10-08');
});

test('a failed publication is retried at the next refresh', async () => {
  const { gladys, sync, store } = setup({ daily: history() });
  await sync.refresh();
  gladys.createAllDevices();
  gladys.failStates = true;
  const result = await sync.refresh();
  assert.equal(result.ok, false);
  assert.equal(store.get(ACCOUNT.pds, 'published'), null);
  await sync.refresh();
  assert.equal(store.get(ACCOUNT.pds, 'published'), '2026-10-08');
});

test('the first refresh fires no event: the readings are history', async () => {
  const { gladys, sync } = setup({ daily: history(), config: { high_consumption_liters: 1 } });
  await sync.refresh();
  assert.deepEqual(gladys.sceneEvents, []);
});

test('a new reading fires new_reading, and high_consumption above the threshold', async () => {
  const { gladys, sync, portal, clock } = setup({
    daily: history(),
    config: { high_consumption_liters: 500 },
  });
  await sync.refresh();
  portal.daily.push(dailyRecord('2026-10-09', 650, 500), dailyRecord('2026-10-10', 90, 500.09));
  setToday(clock, '2026-10-11');
  await sync.refresh();

  assert.deepEqual(gladys.sceneEvents, [
    {
      key: TRIGGERS.HIGH_CONSUMPTION,
      data: { device: DEVICE_ID, date: '2026-10-09', liters: 650, threshold_liters: 500 },
    },
    {
      key: TRIGGERS.NEW_READING,
      data: { device: DEVICE_ID, date: '2026-10-10', liters: 90, index_m3: 500.09 },
    },
  ]);
  await sync.refresh();
  assert.equal(gladys.sceneEvents.length, 2, 'no repeat without a new reading');
});

test('reading_overdue fires once per silence', async () => {
  const { gladys, sync, clock, portal } = setup({ daily: history(), config: { overdue_days: 3 } });
  await sync.refresh();
  assert.equal(gladys.sceneEvents.length, 0, '2 days: not overdue yet');

  setToday(clock, '2026-10-11');
  await sync.refresh();
  assert.deepEqual(gladys.sceneEvents, [
    {
      key: TRIGGERS.READING_OVERDUE,
      data: { device: DEVICE_ID, last_date: '2026-10-08', days: 3 },
    },
  ]);
  setToday(clock, '2026-10-12');
  await sync.refresh();
  assert.equal(gladys.sceneEvents.length, 1, 'still the same silence');

  portal.daily.push(dailyRecord('2026-10-09', 100, 500));
  setToday(clock, '2026-10-20');
  await sync.refresh();
  assert.equal(
    gladys.sceneEvents.filter((e) => e.key === TRIGGERS.READING_OVERDUE).length,
    2,
    'a new silence after a new reading',
  );
});

test('a refresh asked by a scene fires no event, the next scheduled one does', async () => {
  const { gladys, sync, portal, clock } = setup({ daily: history() });
  await sync.refresh();
  portal.daily.push(dailyRecord('2026-10-09', 100, 500));
  setToday(clock, '2026-10-10');
  await sync.refresh({ events: false });
  assert.equal(gladys.sceneEvents.length, 0);
  await sync.refresh();
  assert.equal(gladys.sceneEvents.at(-1).key, TRIGGERS.NEW_READING);
});

test('event data only carries keys the trigger declares', async () => {
  const { gladys, sync, portal, clock } = setup({
    daily: history(),
    config: { high_consumption_liters: 1, overdue_days: 1 },
  });
  await sync.refresh();
  portal.daily.push(dailyRecord('2026-10-09', 100, 500));
  setToday(clock, '2026-10-12');
  await sync.refresh();
  assert.deepEqual(
    new Set(gladys.sceneEvents.map((e) => e.key)),
    new Set(Object.values(TRIGGERS)),
    'every trigger fired at least once',
  );
  for (const { key, data } of gladys.sceneEvents) {
    const trigger = manifest.scene_triggers.find((t) => t.key === key);
    assert.ok(trigger, `${key} is declared in the manifest`);
    const declared = [...trigger.fields, ...trigger.variables].map((f) => f.key);
    for (const [name, value] of Object.entries(data)) {
      assert.ok(declared.includes(name), `${key}: data.${name} is not declared`);
      assert.ok(value === null || typeof value !== 'object', `${key}: data.${name} is flat`);
    }
  }
});

test('wrong credentials: clear status, nothing published', async () => {
  const { gladys, sync, portal } = setup({ daily: history() });
  portal.acceptPassword = 'changed';
  const result = await sync.refresh();
  assert.equal(result.ok, false);
  assert.deepEqual(result.message, MESSAGES.authFailed);
  assert.deepEqual(gladys.connectionStatuses.at(-1), {
    connected: false,
    message: MESSAGES.authFailed,
  });
  assert.equal(gladys.discovered.length, 0);
});

test('no credentials: not configured, no request', async () => {
  const { sync, portal } = setup();
  sync.setConfig(normalizeConfig({}));
  const result = await sync.refresh();
  assert.deepEqual(result.message, MESSAGES.notConfigured);
  assert.equal(portal.calls.length, 0);
});

test('concurrent refreshes share one read of the portal', async () => {
  const { sync, portal } = setup({ daily: history() });
  const [a, b] = await Promise.all([sync.refresh(), sync.refresh()]);
  assert.deepEqual(a, b);
  assert.equal(portal.calls.filter((c) => c.url.pathname === '/espace-client').length, 1);
});

test('a new account starts from scratch', async () => {
  const { sync } = setup({ daily: history() });
  await sync.refresh();
  assert.equal(sync.meters.size, 1);
  const changed = sync.setConfig(
    normalizeConfig({ email: 'other@example.com', password: ACCOUNT.password }),
  );
  assert.equal(changed, true);
  assert.equal(sync.meters.size, 0);
  assert.equal(sync.setConfig(sync.config), false, 'same account: nothing reset');
});

test('a failed discovery is published again at the next refresh', async () => {
  const { gladys, sync } = setup({ daily: history() });
  const publish = gladys.publishDiscoveredDevices;
  gladys.publishDiscoveredDevices = async () => {
    throw new Error('Gladys restarting');
  };
  assert.equal((await sync.refresh()).ok, false);
  gladys.publishDiscoveredDevices = publish;
  await sync.refresh();
  assert.equal(gladys.discovered.length, 1);
  await sync.refresh();
  assert.equal(gladys.discovered.length, 1, 'not re-sent when nothing changed');
});

test('an account change during a refresh drops the old account data', async () => {
  const { sync } = setup({ daily: history() });
  const running = sync.refresh();
  sync.setConfig(normalizeConfig({ email: 'other@example.com', password: ACCOUNT.password }));
  const next = sync.refresh();
  assert.equal((await running).ok, false);
  assert.equal(sync.meters.size, 0);
  assert.equal((await next).ok, true, 'the new account is read right after');
  assert.equal(sync.meters.size, 1);
});

test('the transport badge follows the Veolia link and the reading delay', async () => {
  const { gladys, sync, clock, portal } = setup({ daily: history(), config: { overdue_days: 3 } });
  await sync.refresh();
  assert.deepEqual(gladys.transports.at(-1), [{ external_id: DEVICE_ID, transport: 'cloud' }]);

  setToday(clock, '2026-10-12');
  await sync.refresh();
  const [overdue] = gladys.transports.at(-1);
  assert.equal(overdue.transport, 'cloud');
  assert.equal(overdue.degraded, true);
  assert.match(overdue.message.fr, /4 jours/);
  assertAllLanguages(overdue.message, 'transport message');
  assert.ok(Object.values(overdue.message).every((text) => text.length <= 200));

  portal.failures.push(
    { match: /journalieres/, status: 503 },
    { match: /journalieres/, status: 503 },
    { match: /journalieres/, status: 503 },
  );
  await sync.refresh();
  assert.deepEqual(gladys.transports.at(-1), [
    { external_id: DEVICE_ID, transport: 'unreachable' },
  ]);
});

test('a Gladys failure does not mark the meter unreachable', async () => {
  const { gladys, sync } = setup({ daily: history() });
  await sync.refresh();
  gladys.createAllDevices();
  const sent = gladys.transports.length;
  gladys.failStates = true;
  await sync.refresh();
  assert.equal(gladys.transports.length, sent);
});

// Two and a half years of readings: more than the import goes back.
const longHistory = () => dailyRange('2024-04-01', '2026-10-08');
const dailyDates = (gladys) =>
  gladys.published
    .filter((s) => s.device_feature_external_id === dailyFeature)
    .map((s) => s.created_at.slice(0, 10));

test('the history import waits for the device to be added', async () => {
  const { gladys, sync, store } = setup({ daily: longHistory() });
  await sync.refresh();
  await sync.importHistory();
  assert.equal(gladys.published.length, 0);
  assert.equal(store.get(ACCOUNT.pds, 'history'), null);
});

test('adding the device imports HISTORY_MONTHS older months, paced', async () => {
  const pauses = [];
  const { gladys, sync, store } = setup({
    daily: longHistory(),
    sleep: async (ms) => pauses.push(ms),
  });
  await sync.refresh();
  gladys.createAllDevices();
  await sync.onDeviceCreated(DEVICE_ID);
  await sync.importHistory();

  const dates = dailyDates(gladys);
  assert.equal(dates.length, new Set(dates).size, 'each day published once');
  // September and October 2026 by the device creation, then the
  // HISTORY_MONTHS months before them: August 2026 back to September 2024.
  assert.equal(HISTORY_MONTHS, 24);
  assert.equal(dates.sort()[0], '2024-09-01');
  assert.ok(dates.includes('2026-08-31'));
  assert.equal(pauses.length, HISTORY_MONTHS - 1, 'one pause between two months');
  assert.ok(pauses.every((ms) => ms >= 10_000));
  assert.ok(gladys.stateCalls.every((batch) => batch.length <= 100));
  assert.equal(store.get(ACCOUNT.pds, 'history'), 'done');

  gladys.stateCalls.length = 0;
  await sync.refresh();
  await sync.importHistory();
  assert.equal(gladys.published.filter((s) => s.created_at).length, 0, 'done is done');
});

test('the history import goes back HISTORY_MONTHS, no further', async () => {
  const { gladys, sync, portal } = setup({ daily: longHistory() });
  await sync.refresh();
  gladys.createAllDevices();
  await sync.onDeviceCreated(DEVICE_ID);
  await sync.importHistory();
  // The subscription started in 2020: the cap applies, not the start date.
  const months = portal.calls
    .filter((c) => c.url.pathname.endsWith('/journalieres'))
    .map((c) => `${c.url.searchParams.get('annee')}-${c.url.searchParams.get('mois')}`);
  assert.ok(months.includes('2024-9') && !months.includes('2024-8'));
});

test('an interrupted history import resumes where it stopped', async () => {
  const { gladys, sync, portal, store } = setup({ daily: longHistory() });
  await sync.refresh();
  gladys.createAllDevices();
  // Three retries on 5xx: fail the 2026-05 month for good this time.
  for (let i = 0; i < 3; i += 1) {
    portal.failures.push({ match: /journalieres.*annee=2026&mois=5/, status: 503 });
  }
  await sync.onDeviceCreated(DEVICE_ID);
  await sync.importHistory();
  assert.equal(store.get(ACCOUNT.pds, 'history'), '2026-06');

  await sync.refresh();
  await sync.importHistory();
  assert.equal(store.get(ACCOUNT.pds, 'history'), 'done');
  const dates = dailyDates(gladys);
  assert.equal(dates.length, new Set(dates).size, 'nothing published twice');
  assert.ok(dates.includes('2026-05-15') && dates.includes('2024-09-01'));
});

test('the refresh and the history import never sign in twice in parallel', async () => {
  const { gladys, sync, portal, clock } = setup({ daily: longHistory() });
  await sync.refresh();
  gladys.createAllDevices();
  await sync.onDeviceCreated(DEVICE_ID);
  // The token expires while the import runs: both need a new one.
  setToday(clock, '2026-10-11');
  const result = await sync.refresh();
  await sync.importHistory();
  assert.deepEqual(result, { ok: true });
  assert.equal(portal.logins, 2);
});
