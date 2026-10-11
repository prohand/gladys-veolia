import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateWidgetContent } from '@gladysassistant/integration-sdk';
import {
  CHART_DAYS,
  COMPARISON_WIDGET,
  WATER_WIDGET,
  WIDGETS,
  refreshWidgets,
} from '../src/widgets.js';
import { normalizeConfig } from '../src/config.js';
import { dailyRange, dailyRecord } from './helpers/fakeVeolia.js';
import { setup } from './helpers/setup.js';
import { createFakeGladys } from './helpers/fakeGladys.js';

const widget = WIDGETS[WATER_WIDGET];
const getContent = (sync, settings = {}) =>
  widget.get(sync, { settings, language: 'fr', units: 'metric' });

test('the content is rendered exactly as sent, for every chart period', async () => {
  const { sync } = setup({
    daily: dailyRange('2026-09-01', '2026-10-08'),
    monthly: [{ annee: 2026, mois: 9, consommation: { m3: 4.2 } }],
  });
  await sync.refresh();
  for (const days of CHART_DAYS) {
    const content = await getContent(sync, { days: String(days) });
    assert.deepEqual(validateWidgetContent(content), [], `days=${days}`);
    const chart = content.components.find((c) => c.type === 'chart');
    assert.equal(chart.series[0].points.length, days);
  }
});

test('an estimated, overdue reading is still a valid content', async () => {
  const { sync } = setup({ daily: [dailyRecord('2026-10-01', 90, 400, 'ESTIME')] });
  await sync.refresh();
  const content = await getContent(sync);
  assert.deepEqual(validateWidgetContent(content), []);
  const status = content.components.find((c) => c.type === 'status');
  assert.ok(status.items.some((item) => item.color === 'warning'));
});

test('before any data, the widget explains why', async () => {
  const { sync } = setup();
  sync.setConfig(normalizeConfig({}));
  await sync.refresh();
  const content = await getContent(sync);
  assert.deepEqual(validateWidgetContent(content), []);
  assert.equal(content.components[0].type, 'text');
});

test('the refresh button is handled and answers a short toast', async () => {
  const { sync } = setup({ daily: dailyRange('2026-10-01', '2026-10-08') });
  await sync.refresh();
  const buttons = (await getContent(sync)).components.filter((c) => c.type === 'button');
  assert.equal(buttons.length, 1);
  for (const { action } of buttons) {
    const toast = await widget.action(sync, { actionKey: action.key, params: {}, settings: {} });
    assert.ok(toast.en.length <= 200 && toast.fr.length <= 200);
  }
});

test('a failed refresh answers a short toast too', async () => {
  const { sync, portal } = setup();
  portal.acceptPassword = 'changed';
  const toast = await widget.action(sync, { actionKey: 'refresh', params: {}, settings: {} });
  assert.ok(toast.en.length <= 200 && toast.fr.length <= 200);
});

test('an unknown widget action fails', async () => {
  const { sync } = setup();
  await assert.rejects(widget.action(sync, { actionKey: 'nope' }), /Unknown widget action/);
});

test('refreshWidgets nudges every widget', () => {
  const gladys = createFakeGladys();
  refreshWidgets(gladys);
  assert.deepEqual(gladys.widgetRefreshes, Object.keys(WIDGETS));
});

const comparison = WIDGETS[COMPARISON_WIDGET];

test('the comparison widget shows each year on the same months', async () => {
  const monthly = [];
  for (const year of [2024, 2025, 2026]) {
    for (let mois = 1; mois <= (year === 2026 ? 9 : 12); mois += 1) {
      monthly.push({ annee: year, mois, consommation: { m3: year === 2026 ? 3 : 4 } });
    }
  }
  const { sync } = setup({ daily: dailyRange('2026-09-01', '2026-10-08'), monthly });
  await sync.refresh();
  const content = await comparison.get(sync, { settings: {}, language: 'fr', units: 'metric' });
  assert.deepEqual(validateWidgetContent(content), []);
  const chart = content.components.find((c) => c.type === 'chart');
  assert.deepEqual(
    chart.series.map((serie) => [serie.name, serie.points.length]),
    [
      ['2024', 12],
      ['2025', 12],
      ['2026', 10],
    ],
  );
  assert.ok(chart.series.every((serie) => serie.points.every((p) => p.t.startsWith('2026-'))));
  const versus = content.components.find((c) => c.label?.fr === 'vs 2025');
  assert.equal(versus.value, '−25 %', '27 m³ against 36 m³, January to September');
  assert.equal(versus.color, 'success');
});

test('the comparison widget without monthly data, or without meter', async () => {
  const { sync } = setup({ daily: [dailyRecord('2026-10-01', 90, 400)] });
  await sync.refresh();
  let content = await comparison.get(sync, { settings: {} });
  assert.deepEqual(validateWidgetContent(content), []);
  sync.setConfig(normalizeConfig({}));
  content = await comparison.get(sync, { settings: {} });
  assert.deepEqual(validateWidgetContent(content), []);
  const toast = await comparison.action(sync, { actionKey: 'refresh', params: {}, settings: {} });
  assert.ok(toast.en.length <= 200);
});
