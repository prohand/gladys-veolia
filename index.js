// -----------------------------------------------------------------------------
// Entry point of the Veolia water integration for Gladys Assistant.
//
// Role of this file: wire the SDK to the refresh cycle (src/sync.js). It holds
// no Veolia logic (see src/veolia/) and no device logic (see src/meter.js). It:
//   1. instantiates the SDK (connection, auth, reconnection: handled for you);
//   2. registers the event handlers BEFORE connect();
//   3. schedules the refresh of the Veolia data once connected.
//
// Environment variables provided by the Gladys supervisor to the container:
//   - GLADYS_HOST_API_URL         (host API URL)
//   - GLADYS_INTEGRATION_TOKEN    (integration-scoped JWT)
//   - GLADYS_INTEGRATION_SELECTOR (integration identifier)
// The SDK reads them automatically: `new GladysIntegration()` is enough.
// -----------------------------------------------------------------------------

import { GladysIntegration, logger } from '@gladysassistant/integration-sdk';
import { isConfigured, normalizeConfig } from './src/config.js';
import { Store } from './src/store.js';
import { VeoliaSync } from './src/sync.js';
import { lookupTowns } from './src/veolia/client.js';
import { MESSAGES, testResult, townCheckResult } from './src/status.js';
import { SCENE_ACTIONS } from './src/scenes.js';
import { WIDGETS, refreshWidgets } from './src/widgets.js';

const gladys = new GladysIntegration();

// After a reconnection (Gladys restart), data younger than this is re-used.
const RECONNECT_REUSE_MS = 30 * 60 * 1000;

const sync = new VeoliaSync(gladys, {
  store: new Store(),
  onUpdate: () => refreshWidgets(gladys),
});
sync.setConfig(normalizeConfig());

let timer = null;

// Refresh now, then every `refresh_hours`. A setTimeout chain, not the core
// polling: its frequencies stop at one minute and Veolia updates once a day.
function schedule(delayMs = 0) {
  clearTimeout(timer);
  timer = setTimeout(async () => {
    await sync.refresh();
    schedule(sync.config.refresh_hours * 3600 * 1000);
  }, delayMs);
}

// --- Discovery: Gladys asks for the list of devices --------------------------
gladys.onScanRequest(async () => {
  logger.info('onScanRequest -> publishing the meters of the account');
  if (sync.meters.size === 0) {
    await sync.refresh();
  }
  await gladys.publishDiscoveredDevices(sync.buildDevices());
});

// --- Device created from the Discovery screen --------------------------------
// The core drops the states of a feature that does not exist yet: send the
// readings already known, with their dates, as soon as the device exists.
gladys.onDeviceCreated(async (device) => {
  logger.info(`onDeviceCreated -> ${device.external_id}`);
  await sync.onDeviceCreated(device.external_id);
});

// --- No command: every value is read-only ------------------------------------
gladys.onSetValue(async (device) => {
  throw new Error(`${device.external_id} is read-only`);
});

// --- Manifest actions: buttons in the Configuration screen -------------------
gladys.onAction('test_connection', async () => {
  logger.info('Action test_connection');
  if (!isConfigured(sync.config)) {
    return MESSAGES.notConfigured;
  }
  const result = await sync.refresh();
  return result.ok ? testResult([...sync.meters.values()]) : result.message;
});

gladys.onAction('check_town', async (fields) => {
  const postalCode = String(fields.postal_code ?? '').trim();
  logger.info(`Action check_town <- ${postalCode}`);
  if (!/^\d{5}$/.test(postalCode)) {
    return { en: 'Enter a 5-digit postal code.', fr: 'Indiquez un code postal à 5 chiffres.' };
  }
  try {
    return townCheckResult(postalCode, await lookupTowns(postalCode));
  } catch (err) {
    logger.error('Town lookup failed', err);
    return {
      en: 'The Veolia town lookup did not answer, try again later.',
      fr: 'La recherche de commune Veolia n’a pas répondu, réessayez plus tard.',
    };
  }
});

// --- Scene actions (Gladys 5.1+) ---------------------------------------------
// The scene triggers need no handler: the refresh cycle fires them.
for (const [actionKey, handler] of Object.entries(SCENE_ACTIONS)) {
  gladys.onSceneAction(actionKey, (fields) => handler(sync, { fields }));
}

// --- Dashboard widgets (Gladys 5.1+) -----------------------------------------
for (const [widgetKey, widget] of Object.entries(WIDGETS)) {
  gladys.onWidgetGet(widgetKey, (request) => widget.get(sync, request));
  gladys.onWidgetAction(widgetKey, (actionKey, params, { settings }) =>
    widget.action(sync, { actionKey, params, settings }),
  );
}

// --- Configuration updated by the user ---------------------------------------
gladys.onConfigUpdated(async (newConfig) => {
  logger.info('onConfigUpdated -> new configuration received');
  const accountChanged = sync.setConfig(normalizeConfig(newConfig));
  // A new account is read now; a new interval or threshold waits its turn.
  schedule(accountChanged ? 0 : sync.config.refresh_hours * 3600 * 1000);
  refreshWidgets(gladys);
});

// --- Connection lifecycle ----------------------------------------------------
// The SDK itself logs the WebSocket lifecycle under the `gladys-sdk` name.
gladys.on('connected', async () => {
  try {
    sync.setConfig(normalizeConfig(await gladys.getConfig()));
    const fresh = sync.lastSuccess && Date.now() - sync.lastSuccess < RECONNECT_REUSE_MS;
    if (fresh && sync.meters.size > 0) {
      // Gladys restarted: re-publish what we have, read Veolia on schedule.
      await gladys.publishDiscoveredDevices(sync.buildDevices());
      await sync.reportStatus(true);
      await sync.publishTransports(true);
      refreshWidgets(gladys);
      return;
    }
    schedule(0);
  } catch (err) {
    logger.error('Post-connection initialization failed', err);
    await gladys
      .setConnectionStatus(false, {
        en: 'Initialization failed, check the integration logs.',
        fr: "L'initialisation a échoué, consultez les logs de l'intégration.",
      })
      .catch(() => {});
  }
});

// --- Graceful shutdown -------------------------------------------------------
gladys.handleShutdown((signal) => {
  logger.info(`Received ${signal} -> graceful shutdown`);
  clearTimeout(timer);
});

// --- Startup -----------------------------------------------------------------
logger.info('Starting the Veolia integration...');
gladys.connect().catch((err) => {
  logger.error('Initial connection failed', err);
  process.exit(1);
});
