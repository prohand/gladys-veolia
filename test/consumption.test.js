import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  PERIODS,
  consumptionOf,
  daysBetween,
  localDate,
  monthOf,
  normalizeDaily,
  normalizeMonthly,
  reliabilityOf,
  summarize,
  yearlyComparison,
} from '../src/veolia/consumption.js';
import { dailyRecord } from './helpers/fakeVeolia.js';

test('localDate uses the French calendar day', () => {
  // 23:30 UTC on Oct 10 is already Oct 11 in Paris (UTC+2).
  assert.equal(localDate(Date.parse('2026-10-10T23:30:00Z')), '2026-10-11');
  assert.equal(localDate(Date.parse('2026-01-10T22:30:00Z')), '2026-01-10');
});

test('monthOf shifts across years', () => {
  assert.deepEqual(monthOf('2026-01-15', -1), { year: 2025, month: 12 });
  assert.deepEqual(monthOf('2026-12-01', 1), { year: 2027, month: 1 });
  assert.deepEqual(monthOf('2026-10-10'), { year: 2026, month: 10 });
});

test('daysBetween counts calendar days', () => {
  assert.equal(daysBetween('2026-10-08', '2026-10-10'), 2);
  assert.equal(daysBetween('2026-03-28', '2026-03-30'), 2, 'DST change in between');
});

test('normalizeDaily sorts, dedupes, accepts strings and m3-only records', () => {
  const daily = normalizeDaily([
    dailyRecord('2026-10-02', 130, 400.25),
    { date_releve: '2026-10-01', index: { m3: '400.12' }, consommation: { m3: '0.12' } },
    dailyRecord('2026-10-02', 135, 400.255),
    { date_releve: 'garbage', consommation: { litre: 1 } },
    { date_releve: '2026-10-03', consommation: {} },
  ]);
  assert.deepEqual(daily, [
    { date: '2026-10-01', liters: 120, indexM3: 400.12, reliability: null },
    { date: '2026-10-02', liters: 135, indexM3: 400.255, reliability: 'MESURE' },
  ]);
});

test('normalizeMonthly keeps valid months only', () => {
  const monthly = normalizeMonthly([
    { annee: 2026, mois: 2, consommation: { m3: '3.5' } },
    { annee: 2026, mois: 1, consommation: { m3: 4 } },
    { annee: 2026, mois: 13, consommation: { m3: 1 } },
    { annee: 2026, mois: 3 },
  ]);
  assert.deepEqual(
    monthly.map((m) => [m.month, m.m3]),
    [
      [1, 4],
      [2, 3.5],
    ],
  );
});

test('summarize computes the month and year, completing the current month from daily data', () => {
  const daily = normalizeDaily([
    dailyRecord('2026-09-30', 200, 399.9),
    dailyRecord('2026-10-01', 120, 400.02),
    dailyRecord('2026-10-02', 130, 400.15),
  ]);
  const monthly = normalizeMonthly([
    { annee: 2026, mois: 8, consommation: { m3: 4 } },
    { annee: 2026, mois: 9, consommation: { m3: 5 } },
  ]);
  const summary = summarize({ daily, monthly, today: '2026-10-04' });
  assert.equal(summary.lastReading.date, '2026-10-02');
  assert.equal(summary.indexM3, 400.15);
  assert.equal(summary.currentMonthM3, 0.25, 'no October total yet: sum of the days');
  assert.equal(summary.previousMonthM3, 5);
  assert.equal(summary.currentYearM3, 9.25);
  assert.equal(summary.daysSinceReading, 2);
});

test('summarize prefers the monthly total when Veolia has it', () => {
  const daily = normalizeDaily([dailyRecord('2026-10-01', 120, 400)]);
  const monthly = normalizeMonthly([{ annee: 2026, mois: 10, consommation: { m3: 1.5 } }]);
  const summary = summarize({ daily, monthly, today: '2026-10-04' });
  assert.equal(summary.currentMonthM3, 1.5);
  assert.equal(summary.currentYearM3, 1.5, 'not counted twice');
});

test('summarize without any data', () => {
  const summary = summarize({ daily: [], monthly: [], today: '2026-10-04' });
  assert.equal(summary.lastReading, null);
  assert.equal(summary.indexM3, null);
  // Unknown, not zero: a radio-read meter has no reading at all.
  assert.equal(summary.currentMonthM3, null);
  assert.equal(summary.currentYearM3, null);
  assert.equal(summary.previousMonthM3, null);
  assert.equal(summary.daysSinceReading, null);
});

test('summarize with readings but none this month counts 0 for the month', () => {
  const monthly = normalizeMonthly([{ annee: 2026, mois: 9, consommation: { m3: 3 } }]);
  const summary = summarize({ daily: [], monthly, today: '2026-10-04' });
  assert.equal(summary.currentMonthM3, 0);
  assert.equal(summary.currentYearM3, 3);
});

test('consumptionOf answers every period', () => {
  const daily = normalizeDaily([dailyRecord('2026-10-02', 130, 400.15)]);
  const monthly = normalizeMonthly([{ annee: 2026, mois: 9, consommation: { m3: 5.1234 } }]);
  const summary = summarize({ daily, monthly, today: '2026-10-04' });
  const today = '2026-10-04';
  assert.deepEqual(consumptionOf(summary, PERIODS.LAST_DAY, today), {
    liters: 130,
    cubic_meters: 0.13,
    date: '2026-10-02',
  });
  assert.deepEqual(consumptionOf(summary, PERIODS.CURRENT_MONTH, today).date, '2026-10');
  assert.deepEqual(consumptionOf(summary, PERIODS.PREVIOUS_MONTH, today), {
    liters: 5123,
    cubic_meters: 5.123,
    date: '2026-09',
  });
  assert.equal(consumptionOf(summary, PERIODS.CURRENT_YEAR, today).date, '2026');
  assert.throws(() => consumptionOf(summary, 'week', today), /Unknown period/);
});

test('reliabilityOf simplifies the Veolia codes', () => {
  assert.equal(reliabilityOf('MESURE'), 'measured');
  assert.equal(reliabilityOf('ESTIME'), 'estimated');
  assert.equal(reliabilityOf(null), 'unknown');
});

test('yearlyComparison: three years per month, same period up to the last full month', () => {
  const monthly = normalizeMonthly([
    { annee: 2024, mois: 1, consommation: { m3: 5 } },
    { annee: 2024, mois: 12, consommation: { m3: 6 } },
    { annee: 2025, mois: 1, consommation: { m3: 4 } },
    { annee: 2025, mois: 9, consommation: { m3: 3 } },
    { annee: 2025, mois: 10, consommation: { m3: 9 } },
    { annee: 2026, mois: 1, consommation: { m3: 2 } },
    { annee: 2026, mois: 9, consommation: { m3: 2.5 } },
  ]);
  const daily = normalizeDaily([
    dailyRecord('2026-10-01', 300, 1),
    dailyRecord('2026-10-02', 200, 1),
  ]);
  const years = yearlyComparison({ daily, monthly, today: '2026-10-10' });
  assert.deepEqual(
    years.map((y) => y.year),
    [2024, 2025, 2026],
  );
  const [y2024, y2025, y2026] = years;
  assert.equal(y2024.total, 11);
  assert.equal(y2024.samePeriod, 5, 'January to September');
  assert.equal(y2025.samePeriod, 7, 'October 2025 left out');
  assert.equal(y2026.months[9], 0.5, 'the current month comes from the daily readings');
  assert.equal(y2026.months[10], null, 'no future month');
  assert.equal(y2026.total, 5);
  assert.equal(y2026.samePeriod, 4.5);
});

test('yearlyComparison: a year without data is left out, January has no same period', () => {
  const monthly = normalizeMonthly([{ annee: 2026, mois: 1, consommation: { m3: 2 } }]);
  const years = yearlyComparison({ daily: [], monthly, today: '2026-01-20' });
  assert.deepEqual(
    years.map((y) => [y.year, y.samePeriod]),
    [[2026, null]],
  );
});
