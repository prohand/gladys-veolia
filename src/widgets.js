// -----------------------------------------------------------------------------
// Dashboard widget (SDK v0.14+, Gladys 5.1+): the water consumption card.
//
// The content is computed from the data of the last refresh, not bound to the
// device features: the readings are published as past states, and a live tile
// would show the time of the publication, not the day of the reading. The
// refresh cycle nudges the widget (requestWidgetRefresh) each time it ends,
// so the TTL is only a safety net.
// -----------------------------------------------------------------------------

import { createLogger, WIDGET_COLORS } from '@gladysassistant/integration-sdk';
import { reliabilityOf, yearlyComparison } from './veolia/consumption.js';
import { MESSAGES } from './status.js';

const logger = createLogger({ name: 'widgets' });

export const WATER_WIDGET = 'water_consumption';
export const COMPARISON_WIDGET = 'water_comparison';

const WIDGET_ACTIONS = { REFRESH: 'refresh' };

export const CHART_DAYS = [7, 14, 30];
export const DEFAULT_CHART_DAYS = 14;

const RELIABILITY = {
  measured: { value: { en: 'Measured', fr: 'Mesurée' }, color: WIDGET_COLORS.SUCCESS },
  estimated: { value: { en: 'Estimated', fr: 'Estimée' }, color: WIDGET_COLORS.WARNING },
  unknown: { value: { en: 'Unknown', fr: 'Inconnue' }, color: WIDGET_COLORS.NEUTRAL },
};

// A tile value is a number or a string of at most 12 characters.
const m3 = (value) => (value === null ? '–' : Math.round(value * 100) / 100);

function readingAge(days, overdueDays) {
  if (days === 0 || days === 1) {
    return {
      value: days === 0 ? { en: 'today', fr: "aujourd'hui" } : { en: 'yesterday', fr: 'hier' },
      color: WIDGET_COLORS.SUCCESS,
    };
  }
  return {
    value: { en: `${days} days ago`, fr: `il y a ${days} jours` },
    color: days >= overdueDays ? WIDGET_COLORS.WARNING : WIDGET_COLORS.SUCCESS,
  };
}

function emptyContent(sync) {
  const message = sync.status.connected ? null : sync.status.message;
  return {
    ttl_seconds: 300,
    components: [
      {
        type: 'text',
        text: message ?? {
          en: 'No reading yet: the first refresh is running.',
          fr: 'Aucun relevé pour l’instant : premier rafraîchissement en cours.',
        },
      },
      refreshButton(),
    ],
  };
}

function refreshButton() {
  return {
    type: 'button',
    label: { en: 'Refresh', fr: 'Rafraîchir' },
    icon: 'refresh-cw',
    style: 'secondary',
    action: { key: WIDGET_ACTIONS.REFRESH },
  };
}

export function buildWidgetContent(sync, settings = {}) {
  const meter = sync.meterOf(settings.device);
  if (!meter) {
    return emptyContent(sync);
  }
  const { summary, daily, subscription } = meter;
  const days = CHART_DAYS.includes(Number(settings.days))
    ? Number(settings.days)
    : DEFAULT_CHART_DAYS;
  const last = summary.lastReading;
  const status = [];
  if (last) {
    status.push({
      label: { en: `Last reading (${last.date})`, fr: `Dernier relevé (${last.date})` },
      icon: 'calendar',
      ...readingAge(summary.daysSinceReading, sync.config.overdue_days),
    });
    status.push({
      label: { en: 'Reliability', fr: 'Fiabilité' },
      icon: 'check-circle',
      ...RELIABILITY[reliabilityOf(last.reliability)],
    });
  }
  status.push({
    label: { en: 'Veolia portal', fr: 'Portail Veolia' },
    icon: 'cloud',
    value: sync.status.connected
      ? { en: 'Connected', fr: 'Connecté' }
      : { en: 'Error', fr: 'Erreur' },
    color: sync.status.connected ? WIDGET_COLORS.SUCCESS : WIDGET_COLORS.DANGER,
  });

  const components = [
    {
      type: 'text',
      variant: 'caption',
      text: { en: `Meter ${subscription.meter}`, fr: `Compteur ${subscription.meter}` },
    },
    {
      type: 'value',
      label: { en: 'Last day', fr: 'Dernier jour' },
      icon: 'droplet',
      value: last ? last.liters : '–',
      unit: 'L',
      color: WIDGET_COLORS.PRIMARY,
    },
    {
      type: 'value',
      label: { en: 'This month', fr: 'Ce mois-ci' },
      icon: 'calendar',
      value: m3(summary.currentMonthM3),
      unit: 'm³',
    },
    {
      type: 'value',
      label: { en: 'This year', fr: 'Cette année' },
      icon: 'bar-chart-2',
      value: m3(summary.currentYearM3),
      unit: 'm³',
    },
    {
      type: 'value',
      label: { en: 'Index', fr: 'Index' },
      icon: 'hash',
      value: m3(summary.indexM3),
      unit: 'm³',
    },
  ];
  const points = daily.slice(-days).map((reading) => ({ t: reading.date, v: reading.liters }));
  if (points.length > 0) {
    components.push({
      type: 'chart',
      chart_type: 'bar',
      title: { en: `Last ${days} days`, fr: `${days} derniers jours` },
      unit: 'L',
      series: [{ name: { en: 'Consumption', fr: 'Consommation' }, points }],
    });
  }
  components.push({ type: 'status', items: status }, refreshButton());
  return { ttl_seconds: 3600, components };
}

/** Percentage change, as a tile string ('+12 %', '−5 %'). */
function change(now, before) {
  const percent = Math.round(((now - before) / before) * 100);
  return `${percent > 0 ? '+' : percent < 0 ? '−' : ''}${Math.abs(percent)} %`;
}

export function buildComparisonContent(sync, settings = {}) {
  const meter = sync.meterOf(settings.device);
  if (!meter) {
    return emptyContent(sync);
  }
  const today = sync.today();
  const thisYear = Number(today.slice(0, 4));
  const years = yearlyComparison({ daily: meter.daily, monthly: meter.monthly, today });
  const current = years.at(-1);
  const components = [
    {
      type: 'text',
      variant: 'caption',
      text: {
        en: `Meter ${meter.subscription.meter}, per month`,
        fr: `Compteur ${meter.subscription.meter}, par mois`,
      },
    },
  ];
  for (const entry of years) {
    const inProgress = entry.year === thisYear;
    components.push({
      type: 'value',
      label: inProgress
        ? { en: `${entry.year} so far`, fr: `${entry.year} à ce jour` }
        : String(entry.year),
      icon: 'calendar',
      value: m3(entry.total),
      unit: 'm³',
      color: inProgress ? WIDGET_COLORS.PRIMARY : WIDGET_COLORS.NEUTRAL,
    });
  }
  const before = years.at(-2);
  if (current?.year === thisYear && current.samePeriod !== null && before?.samePeriod) {
    // Same months on both sides: January to the last full month.
    components.push({
      type: 'value',
      label: { en: `vs ${before.year}`, fr: `vs ${before.year}` },
      icon: 'trending-up',
      value: change(current.samePeriod, before.samePeriod),
      color: current.samePeriod > before.samePeriod ? WIDGET_COLORS.WARNING : WIDGET_COLORS.SUCCESS,
    });
  }
  // Every year is drawn on the months of the current one, so the bars of the
  // same month stand side by side; the series name tells the year.
  const series = years
    .map((entry) => ({
      name: String(entry.year),
      points: entry.months.flatMap((value, i) =>
        value === null ? [] : [{ t: `${thisYear}-${String(i + 1).padStart(2, '0')}-01`, v: value }],
      ),
    }))
    .filter((serie) => serie.points.length > 0);
  if (series.length > 0) {
    components.push({
      type: 'chart',
      chart_type: 'bar',
      title: { en: 'Monthly consumption', fr: 'Consommation par mois' },
      unit: 'm³',
      series,
    });
  } else {
    components.push({
      type: 'text',
      text: {
        en: 'Veolia has no monthly total for this meter yet.',
        fr: 'Veolia n’a pas encore de total mensuel pour ce compteur.',
      },
    });
  }
  components.push(refreshButton());
  return { ttl_seconds: 3600, components };
}

// The button carries no params: nothing from the dashboard reaches Veolia.
async function refreshAction(key, sync, { actionKey }) {
  logger.info(`onWidgetAction <- ${key}.${actionKey}`);
  if (actionKey !== WIDGET_ACTIONS.REFRESH) {
    throw new Error(`Unknown widget action: ${actionKey}`);
  }
  const result = await sync.refresh();
  if (result.ok) {
    return { en: 'Consumption refreshed.', fr: 'Consommation rafraîchie.' };
  }
  // Toasts are capped at 200 characters: the detail is in the status.
  return result.message === MESSAGES.notConfigured
    ? MESSAGES.notConfigured
    : {
        en: 'Refresh failed: see the integration status.',
        fr: 'Échec du rafraîchissement : voir le statut de l’intégration.',
      };
}

export const WIDGETS = {
  [WATER_WIDGET]: {
    async get(sync, { settings }) {
      logger.debug(`onWidgetGet <- ${WATER_WIDGET}`);
      return buildWidgetContent(sync, settings);
    },
    action: (sync, request) => refreshAction(WATER_WIDGET, sync, request),
  },

  [COMPARISON_WIDGET]: {
    async get(sync, { settings }) {
      logger.debug(`onWidgetGet <- ${COMPARISON_WIDGET}`);
      return buildComparisonContent(sync, settings);
    },
    action: (sync, request) => refreshAction(COMPARISON_WIDGET, sync, request),
  },
};

/** Ask the core to re-pull every widget now (rate-limited 1 per 10 s per widget). */
export function refreshWidgets(gladys) {
  for (const key of Object.keys(WIDGETS)) {
    gladys.requestWidgetRefresh(key);
  }
}
