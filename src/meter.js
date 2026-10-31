// -----------------------------------------------------------------------------
// One water meter = one Gladys device.
//
// The device external id is built from the delivery point number (PDS) of the
// subscription, not from the meter serial: Veolia swaps meters (end of life,
// failure) on the same delivery point, and the user's history, dashboards and
// scenes must survive the swap. Feature keys are forever too.
//
// The daily readings are published as PAST states (`created_at` = the reading
// date): Veolia sends them one to three days late, and the history must show
// each litre on the day it was used.
// -----------------------------------------------------------------------------

import {
  DEVICE_FEATURE_CATEGORIES,
  DEVICE_FEATURE_TYPES,
  DEVICE_FEATURE_UNITS,
} from '@gladysassistant/integration-sdk';

export const DEVICE_TYPE = 'meter';

export const FEATURE = {
  INDEX: 'index',
  DAILY: 'daily-consumption',
  MONTH: 'month-consumption',
  YEAR: 'year-consumption',
};

const VOLUME = DEVICE_FEATURE_CATEGORIES.VOLUME_SENSOR;
const { DECIMAL, INTEGER } = DEVICE_FEATURE_TYPES.VOLUME_SENSOR;
const { LITER, CUBIC_METER } = DEVICE_FEATURE_UNITS;

// Every feature needs an explicit numeric min and max: the core columns are
// NOT NULL, and a missing bound only fails when the user adds the device.
const FEATURES = [
  { key: FEATURE.INDEX, name: 'Index', type: DECIMAL, unit: CUBIC_METER, max: 999999 },
  {
    key: FEATURE.DAILY,
    name: 'Consommation journalière',
    type: INTEGER,
    unit: LITER,
    max: 100000,
  },
  {
    key: FEATURE.MONTH,
    name: 'Consommation du mois',
    type: DECIMAL,
    unit: CUBIC_METER,
    max: 10000,
  },
  {
    key: FEATURE.YEAR,
    name: "Consommation de l'année",
    type: DECIMAL,
    unit: CUBIC_METER,
    max: 100000,
  },
];

export function meterIds(gladys, pds) {
  return gladys.externalIds(DEVICE_TYPE, pds);
}

/** The discovery payload of a subscription's meter. */
export function buildDevice(gladys, subscription) {
  const ids = meterIds(gladys, subscription.pds);
  return {
    name: `Compteur d'eau ${subscription.meter}`,
    external_id: ids.device,
    // No poll_frequency: the integration refreshes on its own schedule (the
    // core's polling tops out at one minute, Veolia updates once a day).
    features: FEATURES.map((feature) => ({
      name: feature.name,
      external_id: ids.feature(feature.key),
      category: VOLUME,
      type: feature.type,
      unit: feature.unit,
      min: 0,
      max: feature.max,
      read_only: true,
      has_feedback: false,
      keep_history: true,
    })),
    params: [
      { name: 'Numéro de compteur', value: subscription.meter },
      { name: 'Point de service (PDS)', value: subscription.pds },
    ],
  };
}

// Noon UTC is the same calendar day in France all year round (13:00 or 14:00).
const pastInstant = (date) => `${date}T12:00:00.000Z`;

/**
 * The past states of daily readings (consumption and index, on the reading day).
 * @param {object} gladys
 * @param {string} pds
 * @param {Array} readings normalized daily readings
 */
export function buildReadingStates(gladys, pds, readings) {
  const ids = meterIds(gladys, pds);
  const states = [];
  for (const reading of readings) {
    states.push({
      device_feature_external_id: ids.feature(FEATURE.DAILY),
      state: reading.liters,
      created_at: pastInstant(reading.date),
    });
    if (reading.indexM3 !== null) {
      states.push({
        device_feature_external_id: ids.feature(FEATURE.INDEX),
        state: reading.indexM3,
        created_at: pastInstant(reading.date),
      });
    }
  }
  return states;
}

/**
 * The states to publish for a meter.
 * @param {object} gladys
 * @param {string} pds
 * @param {Array} readings daily readings newer than the last published one
 * @param {object} summary see summarize()
 */
export function buildStates(gladys, pds, readings, summary) {
  const ids = meterIds(gladys, pds);
  const states = buildReadingStates(gladys, pds, readings);
  // Running totals: their value is "as of now". Unknown (null) totals are not
  // published: a 0 would draw a false reading in the history.
  if (summary.currentMonthM3 !== null) {
    states.push({
      device_feature_external_id: ids.feature(FEATURE.MONTH),
      state: summary.currentMonthM3,
    });
  }
  if (summary.currentYearM3 !== null) {
    states.push({
      device_feature_external_id: ids.feature(FEATURE.YEAR),
      state: summary.currentYearM3,
    });
  }
  return states;
}
