// -----------------------------------------------------------------------------
// Pure computations on the Veolia consumption records: no network, no SDK.
//
// Daily record (journalieres):
//   { date_releve: '2026-10-08', index: { m3: 456.789 },
//     consommation: { litre: 123, m3: 0.123 }, fiabilite_index: 'MESURE' }
// Monthly record (mensuelles):
//   { annee: 2026, mois: 10, consommation: { m3: 3.4 }, fiabilite_conso: 'MESURE' }
//
// Numbers may arrive as strings: everything goes through toNumber(). A reading
// is made by the remote meter once a day and reaches the portal one to three
// days later, so "today" usually has no reading yet.
// -----------------------------------------------------------------------------

export const PERIODS = {
  LAST_DAY: 'last_day',
  CURRENT_MONTH: 'current_month',
  PREVIOUS_MONTH: 'previous_month',
  CURRENT_YEAR: 'current_year',
};

const DAY_MS = 86_400_000;

function toNumber(value) {
  if (value === null || value === undefined || value === '') {
    return null;
  }
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

const round3 = (value) => Math.round(value * 1000) / 1000;

/** 'YYYY-MM-DD' of an instant, in the French time zone the readings use. */
export function localDate(instant, timeZone = 'Europe/Paris') {
  // en-CA formats as YYYY-MM-DD.
  return new Intl.DateTimeFormat('en-CA', { timeZone }).format(new Date(instant));
}

/** Whole days between two 'YYYY-MM-DD' dates (b - a). */
export function daysBetween(a, b) {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / DAY_MS);
}

/** { year, month } of a 'YYYY-MM-DD' date, shifted by `offset` months. */
export function monthOf(date, offset = 0) {
  const [year, month] = date.split('-').map(Number);
  const index = year * 12 + (month - 1) + offset;
  return { year: Math.floor(index / 12), month: (index % 12) + 1 };
}

/**
 * Daily readings, sorted by date, one per date (the last record wins).
 * @returns {Array<{ date: string, liters: number, indexM3: number | null, reliability: string | null }>}
 */
export function normalizeDaily(records = []) {
  const byDate = new Map();
  for (const record of records) {
    const date = String(record?.date_releve ?? '').slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      continue;
    }
    const liters = toNumber(record.consommation?.litre);
    const m3 = toNumber(record.consommation?.m3);
    const consumed = liters ?? (m3 === null ? null : Math.round(m3 * 1000));
    if (consumed === null) {
      continue;
    }
    byDate.set(date, {
      date,
      liters: Math.max(0, Math.round(consumed)),
      indexM3: toNumber(record.index?.m3),
      reliability: record.fiabilite_index ?? null,
    });
  }
  return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * Monthly totals, sorted, one per month.
 * @returns {Array<{ year: number, month: number, m3: number, reliability: string | null }>}
 */
export function normalizeMonthly(records = []) {
  const byMonth = new Map();
  for (const record of records) {
    const year = toNumber(record?.annee);
    const month = toNumber(record?.mois);
    const m3 = toNumber(record?.consommation?.m3);
    if (!year || !month || month < 1 || month > 12 || m3 === null) {
      continue;
    }
    byMonth.set(year * 12 + month, {
      year,
      month,
      m3: Math.max(0, m3),
      reliability: record.fiabilite_conso ?? null,
    });
  }
  return [...byMonth.entries()].sort(([a], [b]) => a - b).map(([, value]) => value);
}

// Total of one month: the monthly record when Veolia has one, the sum of the
// daily readings otherwise (the current month is often missing early on).
function monthM3(daily, monthly, { year, month }) {
  const record = monthly.find((m) => m.year === year && m.month === month);
  if (record) {
    return record.m3;
  }
  const prefix = `${year}-${String(month).padStart(2, '0')}-`;
  const days = daily.filter((d) => d.date.startsWith(prefix));
  return days.length > 0 ? round3(days.reduce((sum, d) => sum + d.liters, 0) / 1000) : null;
}

/**
 * Everything the device, the widget and the scenes show, from the records.
 * @param {{ daily: Array, monthly: Array, today: string }} input normalized records
 */
export function summarize({ daily, monthly, today }) {
  const last = daily.at(-1) ?? null;
  const current = monthOf(today);
  const previous = monthOf(today, -1);
  const yearMonths = monthly.filter((m) => m.year === current.year);
  const coveredMonths = new Set(yearMonths.map((m) => m.month));
  // Months of the year Veolia has no total for yet (the current one) come
  // from the daily readings.
  const missingThisMonth = coveredMonths.has(current.month)
    ? 0
    : (monthM3(daily, [], current) ?? 0);
  const yearTotal = yearMonths.reduce((sum, m) => sum + m.m3, 0) + missingThisMonth;
  const lastIndex = [...daily].reverse().find((d) => d.indexM3 !== null)?.indexM3 ?? null;
  // Veolia sent nothing at all (e.g. a meter that is not remote-read): the
  // totals are unknown, not zero. A 0 would look like a real reading.
  const known = daily.length > 0 || monthly.length > 0;
  return {
    lastReading: last,
    indexM3: lastIndex,
    currentMonthM3: known ? (monthM3(daily, monthly, current) ?? 0) : null,
    previousMonthM3: monthM3(daily, monthly, previous),
    currentYearM3: known ? round3(yearTotal) : null,
    daysSinceReading: last ? daysBetween(last.date, today) : null,
  };
}

// Years shown side by side by the comparison widget (the current one included).
export const COMPARISON_YEARS = 3;

/**
 * The monthly totals of the last `years` years, for the comparison widget.
 * `samePeriod` sums January to the last full month, so a year in progress is
 * compared with the same months of the others, never with a whole year.
 * @returns {Array<{ year: number, months: Array<number | null>, total: number, samePeriod: number | null }>}
 *   oldest first; a year with no data at all is left out
 */
export function yearlyComparison({ daily, monthly, today, years = COMPARISON_YEARS }) {
  const current = monthOf(today);
  const lastFull = current.month - 1;
  const result = [];
  for (let year = current.year - years + 1; year <= current.year; year += 1) {
    const months = [];
    for (let month = 1; month <= 12; month += 1) {
      const future = year === current.year && month > current.month;
      months.push(future ? null : monthM3(daily, monthly, { year, month }));
    }
    if (months.every((m) => m === null)) {
      continue;
    }
    const sum = (list) => round3(list.reduce((total, m) => total + (m ?? 0), 0));
    const full = months.slice(0, lastFull);
    result.push({
      year,
      months,
      total: sum(months),
      samePeriod: lastFull > 0 && full.some((m) => m !== null) ? sum(full) : null,
    });
  }
  return result;
}

/**
 * The consumption of a period, for the `get_consumption` scene action.
 * @returns {{ liters: number, cubic_meters: number, date: string } | null}
 */
export function consumptionOf(summary, period, today) {
  const toOutputs = (m3, date) =>
    m3 === null ? null : { liters: Math.round(m3 * 1000), cubic_meters: round3(m3), date };
  const { year, month } = monthOf(today);
  const monthLabel = (m) => `${m.year}-${String(m.month).padStart(2, '0')}`;
  switch (period) {
    case PERIODS.LAST_DAY: {
      const last = summary.lastReading;
      return last ? toOutputs(last.liters / 1000, last.date) : null;
    }
    case PERIODS.CURRENT_MONTH:
      return toOutputs(summary.currentMonthM3, monthLabel({ year, month }));
    case PERIODS.PREVIOUS_MONTH:
      return toOutputs(summary.previousMonthM3, monthLabel(monthOf(today, -1)));
    case PERIODS.CURRENT_YEAR:
      return toOutputs(summary.currentYearM3, String(year));
    default:
      throw new Error(`Unknown period: ${period}`);
  }
}

/** Simplified reliability of a reading: 'measured', 'estimated' or 'unknown'. */
export function reliabilityOf(raw) {
  const value = String(raw ?? '').toUpperCase();
  if (value.startsWith('MES') || value === 'REEL' || value === 'REELLE') {
    return 'measured';
  }
  if (value.startsWith('EST') || value.startsWith('CALC')) {
    return 'estimated';
  }
  return 'unknown';
}
