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
  measured: {
    value: { en: 'Measured', fr: 'Mesurée', de: 'Gemessen', es: 'Medida' },
    color: WIDGET_COLORS.SUCCESS,
  },
  estimated: {
    value: { en: 'Estimated', fr: 'Estimée', de: 'Geschätzt', es: 'Estimada' },
    color: WIDGET_COLORS.WARNING,
  },
  unknown: {
    value: { en: 'Unknown', fr: 'Inconnue', de: 'Unbekannt', es: 'Desconocida' },
    color: WIDGET_COLORS.NEUTRAL,
  },
};

// A tile value is a number or a string of at most 12 characters.
const m3 = (value) => (value === null ? '–' : Math.round(value * 100) / 100);

function readingAge(days, overdueDays) {
  if (days === 0 || days === 1) {
    return {
      value:
        days === 0
          ? { en: 'today', fr: "aujourd'hui", de: 'heute', es: 'hoy' }
          : { en: 'yesterday', fr: 'hier', de: 'gestern', es: 'ayer' },
      color: WIDGET_COLORS.SUCCESS,
    };
  }
  return {
    value: {
      en: `${days} days ago`,
      fr: `il y a ${days} jours`,
      de: `vor ${days} Tagen`,
      es: `hace ${days} días`,
    },
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
          de: 'Noch kein Messwert: Die erste Aktualisierung läuft.',
          es: 'Todavía no hay ninguna lectura: la primera actualización está en curso.',
        },
      },
      refreshButton(),
    ],
  };
}

function refreshButton() {
  return {
    type: 'button',
    label: { en: 'Refresh', fr: 'Rafraîchir', de: 'Aktualisieren', es: 'Actualizar' },
    icon: 'refresh-cw',
    style: 'secondary',
    action: { key: WIDGET_ACTIONS.REFRESH },
  };
}

function portalStatus(sync) {
  return {
    label: {
      en: 'Veolia portal',
      fr: 'Portail Veolia',
      de: 'Veolia-Portal',
      es: 'Portal de Veolia',
    },
    icon: 'cloud',
    value: sync.status.connected
      ? { en: 'Connected', fr: 'Connecté', de: 'Verbunden', es: 'Conectado' }
      : { en: 'Error', fr: 'Erreur', de: 'Fehler', es: 'Error' },
    color: sync.status.connected ? WIDGET_COLORS.SUCCESS : WIDGET_COLORS.DANGER,
  };
}

// Bills drawn by the card of a meter that is not remote-read (two to four a year).
const BILLS_SHOWN = 8;

/** The card of a meter that is not remote-read: its bills, no daily reading. */
function billedContent(sync, meter) {
  const { summary, billed, subscription } = meter;
  const bill = summary.lastBill;
  const components = [
    {
      type: 'text',
      variant: 'caption',
      text: {
        en: `Meter ${subscription.meter}, not remote-read: bills`,
        fr: `Compteur ${subscription.meter}, non télérelevé : factures`,
        de: `Zähler ${subscription.meter}, nicht fernausgelesen: Rechnungen`,
        es: `Contador ${subscription.meter}, sin telelectura: facturas`,
      },
    },
    {
      type: 'value',
      label: {
        en: 'Last bill',
        fr: 'Dernière facture',
        de: 'Letzte Rechnung',
        es: 'Última factura',
      },
      icon: 'file-text',
      value: m3(bill.m3),
      unit: 'm³',
      color: WIDGET_COLORS.PRIMARY,
    },
    {
      type: 'value',
      label: { en: 'Index', fr: 'Index', de: 'Zählerstand', es: 'Índice' },
      icon: 'hash',
      value: m3(summary.indexM3),
      unit: 'm³',
    },
  ];
  const points = billed.slice(-BILLS_SHOWN).map((b) => ({ t: b.date, v: b.m3 }));
  if (points.length > 1) {
    components.push({
      type: 'chart',
      chart_type: 'bar',
      title: {
        en: 'Billed volumes',
        fr: 'Volumes facturés',
        de: 'Abgerechnete Mengen',
        es: 'Volúmenes facturados',
      },
      unit: 'm³',
      series: [
        {
          name: { en: 'Billed', fr: 'Facturé', de: 'Abgerechnet', es: 'Facturado' },
          points,
        },
      ],
    });
  }
  const period = bill.from ? `${bill.from} → ${bill.date}` : bill.date;
  components.push(
    {
      type: 'status',
      items: [
        {
          label: {
            en: 'Billed period',
            fr: 'Période facturée',
            de: 'Abrechnungszeitraum',
            es: 'Periodo facturado',
          },
          icon: 'calendar',
          value: period,
          color: WIDGET_COLORS.NEUTRAL,
        },
        portalStatus(sync),
      ],
    },
    refreshButton(),
  );
  return { ttl_seconds: 3600, components };
}

export function buildWidgetContent(sync, settings = {}) {
  const meter = sync.meterOf(settings.device);
  if (!meter) {
    return emptyContent(sync);
  }
  const { summary, daily, subscription } = meter;
  if (!summary.lastReading && summary.lastBill) {
    return billedContent(sync, meter);
  }
  const days = CHART_DAYS.includes(Number(settings.days))
    ? Number(settings.days)
    : DEFAULT_CHART_DAYS;
  const last = summary.lastReading;
  const status = [];
  if (last) {
    status.push({
      label: {
        en: `Last reading (${last.date})`,
        fr: `Dernier relevé (${last.date})`,
        de: `Letzter Messwert (${last.date})`,
        es: `Última lectura (${last.date})`,
      },
      icon: 'calendar',
      ...readingAge(summary.daysSinceReading, sync.config.overdue_days),
    });
    status.push({
      label: { en: 'Reliability', fr: 'Fiabilité', de: 'Zuverlässigkeit', es: 'Fiabilidad' },
      icon: 'check-circle',
      ...RELIABILITY[reliabilityOf(last.reliability)],
    });
  }
  status.push(portalStatus(sync));

  const components = [
    {
      type: 'text',
      variant: 'caption',
      text: {
        en: `Meter ${subscription.meter}`,
        fr: `Compteur ${subscription.meter}`,
        de: `Zähler ${subscription.meter}`,
        es: `Contador ${subscription.meter}`,
      },
    },
    {
      type: 'value',
      label: { en: 'Last day', fr: 'Dernier jour', de: 'Letzter Tag', es: 'Último día' },
      icon: 'droplet',
      value: last ? last.liters : '–',
      unit: 'L',
      color: WIDGET_COLORS.PRIMARY,
    },
    {
      type: 'value',
      label: { en: 'This month', fr: 'Ce mois-ci', de: 'Dieser Monat', es: 'Este mes' },
      icon: 'calendar',
      value: m3(summary.currentMonthM3),
      unit: 'm³',
    },
    {
      type: 'value',
      label: { en: 'This year', fr: 'Cette année', de: 'Dieses Jahr', es: 'Este año' },
      icon: 'bar-chart-2',
      value: m3(summary.currentYearM3),
      unit: 'm³',
    },
    {
      type: 'value',
      label: { en: 'Index', fr: 'Index', de: 'Zählerstand', es: 'Índice' },
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
      title: {
        en: `Last ${days} days`,
        fr: `${days} derniers jours`,
        de: `Letzte ${days} Tage`,
        es: `Últimos ${days} días`,
      },
      unit: 'L',
      series: [
        {
          name: { en: 'Consumption', fr: 'Consommation', de: 'Verbrauch', es: 'Consumo' },
          points,
        },
      ],
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
        de: `Zähler ${meter.subscription.meter}, pro Monat`,
        es: `Contador ${meter.subscription.meter}, por mes`,
      },
    },
  ];
  for (const entry of years) {
    const inProgress = entry.year === thisYear;
    components.push({
      type: 'value',
      label: inProgress
        ? {
            en: `${entry.year} so far`,
            fr: `${entry.year} à ce jour`,
            de: `${entry.year} bisher`,
            es: `${entry.year} hasta hoy`,
          }
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
      label: {
        en: `vs ${before.year}`,
        fr: `vs ${before.year}`,
        de: `vs. ${before.year}`,
        es: `vs. ${before.year}`,
      },
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
      title: {
        en: 'Monthly consumption',
        fr: 'Consommation par mois',
        de: 'Monatlicher Verbrauch',
        es: 'Consumo mensual',
      },
      unit: 'm³',
      series,
    });
  } else {
    components.push({
      type: 'text',
      // A meter that is not remote-read never gets one: say where its data is.
      text: meter.summary.lastBill
        ? {
            en: 'This meter is not remote-read: Veolia only has its bills, see the water consumption card.',
            fr: 'Ce compteur n’est pas télérelevé : Veolia n’a que ses factures, voir la carte Consommation d’eau.',
            de: 'Dieser Zähler wird nicht fernausgelesen: Veolia hat nur seine Rechnungen, siehe die Karte Wasserverbrauch.',
            es: 'Este contador no tiene telelectura: Veolia solo tiene sus facturas, vea la tarjeta Consumo de agua.',
          }
        : {
            en: 'Veolia has no monthly total for this meter yet.',
            fr: 'Veolia n’a pas encore de total mensuel pour ce compteur.',
            de: 'Veolia hat für diesen Zähler noch keine Monatssumme.',
            es: 'Veolia todavía no tiene un total mensual para este contador.',
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
    return {
      en: 'Consumption refreshed.',
      fr: 'Consommation rafraîchie.',
      de: 'Verbrauch aktualisiert.',
      es: 'Consumo actualizado.',
    };
  }
  // Toasts are capped at 200 characters: the detail is in the status.
  return result.message === MESSAGES.notConfigured
    ? MESSAGES.notConfigured
    : {
        en: 'Refresh failed: see the integration status.',
        fr: 'Échec du rafraîchissement : voir le statut de l’intégration.',
        de: 'Aktualisierung fehlgeschlagen: siehe Status der Integration.',
        es: 'Error al actualizar: consulte el estado de la integración.',
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
