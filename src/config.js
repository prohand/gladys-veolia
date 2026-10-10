// -----------------------------------------------------------------------------
// Integration configuration.
//
// The configuration is filled in by the user in Gladys, from the `config_schema`
// declared in `gladys-assistant-integration.json`. The SDK fetches it for you
// (`gladys.getConfig()`) and notifies you of every change through
// `gladys.onConfigUpdated()`.
//
// This module only provides defaults and normalizes the received object, so the
// rest of the code never has to deal with `undefined`.
// -----------------------------------------------------------------------------

import { DEFAULT_PORTAL, PORTALS } from './veolia/portals.js';

// Defaults: they MUST stay consistent with the `default` values declared in the
// `config_schema` of the manifest.
export const DEFAULT_CONFIG = {
  email: '',
  password: '',
  portal: DEFAULT_PORTAL,
  refresh_hours: 6, // hours between two reads of the Veolia portal
  high_consumption_liters: 0, // daily litres that fire `high_consumption`, 0 = off
  overdue_days: 3, // days without a reading that fire `reading_overdue`
};

function toNumber(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) && value !== '' && value !== null ? number : fallback;
}

const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

/**
 * Merge the user config with the defaults.
 * @param {Record<string, unknown>} raw config returned by the SDK
 */
export function normalizeConfig(raw = {}) {
  const portal = String(raw.portal ?? DEFAULT_CONFIG.portal);
  return {
    ...DEFAULT_CONFIG,
    ...raw,
    // Config may arrive as strings from a form.
    email: String(raw.email ?? '').trim(),
    password: String(raw.password ?? ''),
    portal: PORTALS[portal] ? portal : DEFAULT_PORTAL,
    refresh_hours: clamp(
      Math.round(toNumber(raw.refresh_hours, DEFAULT_CONFIG.refresh_hours)),
      1,
      24,
    ),
    high_consumption_liters: clamp(
      Math.round(toNumber(raw.high_consumption_liters, DEFAULT_CONFIG.high_consumption_liters)),
      0,
      100000,
    ),
    overdue_days: clamp(Math.round(toNumber(raw.overdue_days, DEFAULT_CONFIG.overdue_days)), 1, 30),
  };
}

/** Whether the account can be read at all. */
export function isConfigured(config) {
  return Boolean(config.email && config.password);
}
