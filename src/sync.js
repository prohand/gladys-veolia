// -----------------------------------------------------------------------------
// The refresh cycle: read the Veolia portal, publish to Gladys, fire the scene
// triggers.
//
// One refresh at a time: a refresh asked while another runs (scheduled tick,
// "Test the connection", widget button, scene action) waits for it and gets
// its result, so the portal is never read twice in parallel.
//
// Each refresh reads, per subscription, the daily readings of the previous and
// the current month and the monthly totals of the last COMPARISON_YEARS years
// (the comparison widget): about 5 requests. The data lives in memory between
// refreshes: the widget, the scene actions and the device creation never call
// Veolia themselves.
//
// Once a meter is added in Gladys, its older daily readings (HISTORY_MONTHS
// back) are imported in the background, one month at a time, so the Gladys
// charts can show the past years: Veolia keeps them, users asked for them.
// -----------------------------------------------------------------------------

import { createLogger, DEVICE_TRANSPORTS } from '@gladysassistant/integration-sdk';
import { VeoliaApiError, VeoliaAuthError, VeoliaClient } from './veolia/client.js';
import {
  COMPARISON_YEARS,
  localDate,
  monthOf,
  normalizeDaily,
  normalizeMonthly,
  summarize,
} from './veolia/consumption.js';
import { buildDevice, buildReadingStates, buildStates, meterIds } from './meter.js';
import { isConfigured } from './config.js';
import { MESSAGES, gladysFailed, unreachable } from './status.js';

const logger = createLogger({ name: 'sync' });

export const TRIGGERS = {
  NEW_READING: 'new_reading',
  HIGH_CONSUMPTION: 'high_consumption',
  READING_OVERDUE: 'reading_overdue',
};

// The SDK caps a publishStates batch at 100 states.
const STATES_PER_BATCH = 100;

// Months of daily readings imported into the Gladys history, before the two
// the refreshes already publish.
export const HISTORY_MONTHS = 24;
// Pause between two imported months. A month is at most 62 states: about 190
// states a minute, under the host API's 300, with room left for the refreshes,
// and one request every 20 s is gentle on the Veolia portal.
const HISTORY_PAUSE_MS = 20_000;
// store `history` value once the import reached its oldest month.
const HISTORY_DONE = 'done';

const monthIndex = (m) => m.year * 12 + m.month;
const monthLabel = (m) => `${m.year}-${String(m.month).padStart(2, '0')}`;

export class VeoliaSync {
  /**
   * @param {object} gladys the SDK instance
   * @param {object} options
   * @param {import('./store.js').Store} options.store
   * @param {(config) => VeoliaClient} [options.createClient]
   * @param {() => number} [options.now]
   * @param {() => void} [options.onUpdate] called after each refresh (widgets)
   * @param {(ms: number) => Promise<void>} [options.sleep] history import pacing
   */
  constructor(
    gladys,
    {
      store,
      createClient,
      now = Date.now,
      onUpdate = () => {},
      sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
    },
  ) {
    this.gladys = gladys;
    this.store = store;
    this.createClient =
      createClient ??
      ((config) =>
        new VeoliaClient({
          email: config.email,
          password: config.password,
          portal: config.portal,
        }));
    this.now = now;
    this.onUpdate = onUpdate;
    this.sleep = sleep;
    this.importing = null;
    // The refresh and the history import take turns on the Veolia client: two
    // sign-ins in parallel (expired token) would make each other's token stale.
    this.portalTurn = Promise.resolve();
    this.config = null;
    this.client = null;
    this.subscriptions = null;
    /** @type {Map<string, { subscription, daily, monthly, summary }>} */
    this.meters = new Map();
    this.running = null;
    // Bumped on every account change: a refresh started for the previous
    // account must not store its meters under the new one.
    this.generation = 0;
    // The discovered devices still have to reach Gladys (start, new account,
    // failed publication).
    this.discoveryPending = true;
    this.lastSuccess = 0;
    this.lastError = null;
    this.status = { connected: false, message: MESSAGES.notConfigured };
  }

  /** Apply a (new) configuration: a new account means a new client. */
  setConfig(config) {
    const previous = this.config;
    this.config = config;
    const accountChanged =
      !previous ||
      previous.email !== config.email ||
      previous.password !== config.password ||
      previous.portal !== config.portal;
    if (accountChanged) {
      this.client = isConfigured(config) ? this.createClient(config) : null;
      this.subscriptions = null;
      this.meters.clear();
      this.lastSuccess = 0;
      this.generation += 1;
      this.discoveryPending = true;
    }
    return accountChanged;
  }

  today() {
    return localDate(this.now());
  }

  /** The meter a device external id (or nothing: the first meter) points to. */
  meterOf(externalId) {
    const all = [...this.meters.values()];
    if (!externalId) {
      return all[0] ?? null;
    }
    return all.find((m) => meterIds(this.gladys, m.subscription.pds).device === externalId) ?? null;
  }

  buildDevices() {
    return [...this.meters.values()].map((m) => buildDevice(this.gladys, m.subscription));
  }

  /**
   * Run a refresh, or join the one in progress.
   * @param {{ events?: boolean }} options `events: false` for a refresh asked by
   *   a scene: firing a trigger from a scene action could loop through the
   *   scene. The skipped events fire at the next scheduled refresh.
   * @returns {Promise<{ ok: boolean, message?: object }>}
   */
  refresh({ events = true } = {}) {
    if (this.running && this.runningGeneration !== this.generation) {
      // The one in progress reads the previous account: run ours after it.
      return this.running.then(() => this.refresh({ events }));
    }
    if (!this.running) {
      this.runningGeneration = this.generation;
      this.running = this.doRefresh({ events }).finally(() => {
        this.running = null;
      });
    }
    return this.running;
  }

  async doRefresh({ events }) {
    if (!this.client) {
      await this.reportStatus(false, MESSAGES.notConfigured);
      return { ok: false, message: MESSAGES.notConfigured };
    }
    const { client, generation } = this;
    try {
      const read = await this.withPortal(async () => {
        if (!this.subscriptions) {
          this.subscriptions = await client.getSubscriptions();
        }
        const meters = [];
        for (const subscription of this.subscriptions) {
          meters.push(await this.readMeter(client, subscription));
        }
        return meters;
      });
      if (read.length === 0) {
        this.subscriptions = null; // ask again next time
        await this.reportStatus(false, MESSAGES.noSubscription);
        return { ok: false, message: MESSAGES.noSubscription };
      }
      if (generation !== this.generation) {
        // The account changed while reading: drop it, the new one is next.
        return { ok: false, message: MESSAGES.notConfigured };
      }
      const known = this.meters.size;
      for (const meter of read) {
        this.meters.set(meter.subscription.pds, meter);
      }
      if (this.meters.size !== known || this.discoveryPending) {
        await this.gladys.publishDiscoveredDevices(this.buildDevices());
        this.discoveryPending = false;
      }
      for (const meter of this.meters.values()) {
        await this.publishMeter(meter);
        if (events) {
          await this.fireEvents(meter);
        }
      }
      this.lastSuccess = this.now();
      this.lastError = null;
      await this.reportStatus(true);
      await this.publishTransports(true);
      // Not awaited: the import takes minutes, the refresh answers now.
      this.importHistory();
      return { ok: true };
    } catch (err) {
      let message;
      if (err instanceof VeoliaAuthError) {
        message = MESSAGES.authFailed;
        // Wrong credentials: read the subscriptions again once they are fixed.
        this.subscriptions = null;
      } else if (err instanceof VeoliaApiError) {
        message = unreachable(err.message);
      } else {
        // Gladys itself refused a publication (restarting, rate limit...).
        message = gladysFailed(err.message);
      }
      logger.error(`Refresh failed: ${err.message}`);
      this.lastError = err;
      await this.reportStatus(false, message);
      if (!(err instanceof VeoliaApiError || err instanceof VeoliaAuthError)) {
        // Gladys refused a call: the Veolia link itself is fine.
        return { ok: false, message };
      }
      await this.publishTransports(false);
      return { ok: false, message };
    } finally {
      this.onUpdate();
    }
  }

  /** Run `task` once the other users of the Veolia client are done. */
  withPortal(task) {
    const turn = this.portalTurn.then(task);
    this.portalTurn = turn.catch(() => {});
    return turn;
  }

  async readMeter(client, subscription) {
    const today = this.today();
    const current = monthOf(today);
    const previous = monthOf(today, -1);
    // The endpoints refuse a period before the subscription started.
    const start = monthOf(subscription.startDate);
    const afterStart = (m) => monthIndex(m) >= monthIndex(start);

    const dailyRecords = [];
    for (const m of [previous, current].filter(afterStart)) {
      dailyRecords.push(...(await client.getDailyReadings(subscription, m.year, m.month)));
    }
    const monthlyRecords = [];
    for (let year = current.year - COMPARISON_YEARS + 1; year <= current.year; year += 1) {
      if (year >= start.year) {
        monthlyRecords.push(...(await client.getMonthlyTotals(subscription, year)));
      }
    }
    const daily = normalizeDaily(dailyRecords);
    const monthly = normalizeMonthly(monthlyRecords);
    // What Veolia sent, at every refresh: "connected but everything at zero"
    // cannot be diagnosed from the logs otherwise.
    logger.info(
      `Meter ${subscription.pds} (reading mode ${subscription.readingMode ?? 'unknown'}): ` +
        `${dailyRecords.length} daily record(s) -> ${daily.length} reading(s), ` +
        `${monthlyRecords.length} monthly record(s) -> ${monthly.length} total(s)`,
    );
    return {
      subscription,
      daily,
      monthly,
      // Raw record counts, for "Test the connection" when no reading is usable.
      received: { daily: dailyRecords.length, monthly: monthlyRecords.length },
      summary: summarize({ daily, monthly, today }),
    };
  }

  isCreated(meter) {
    const id = meterIds(this.gladys, meter.subscription.pds).device;
    return (this.gladys.devices ?? []).some((device) => device.external_id === id);
  }

  /**
   * Publish the readings Gladys has not stored yet, and the running totals.
   * Skipped while the user has not added the device: the core drops the states
   * of a feature that does not exist, so they are sent once it is created.
   */
  async publishMeter(meter) {
    const { pds } = meter.subscription;
    if (!this.isCreated(meter)) {
      logger.debug(`Meter ${pds} not added in Gladys yet, states kept for later`);
      return;
    }
    const published = this.store.get(pds, 'published');
    const fresh = meter.daily.filter((reading) => !published || reading.date > published);
    const states = buildStates(this.gladys, pds, fresh, meter.summary);
    for (let i = 0; i < states.length; i += STATES_PER_BATCH) {
      await this.gladys.publishStates(states.slice(i, i + STATES_PER_BATCH));
    }
    if (fresh.length > 0) {
      this.store.set(pds, 'published', fresh.at(-1).date);
      logger.info(`Meter ${pds}: ${fresh.length} new daily reading(s) published`);
    }
  }

  /** The device was just added from the Discovery screen: send its history. */
  async onDeviceCreated(externalId) {
    const meter = this.meterOf(externalId);
    if (!meter || meterIds(this.gladys, meter.subscription.pds).device !== externalId) {
      return;
    }
    this.store.set(meter.subscription.pds, 'published', null);
    // A device deleted then added again has lost its history: import it again.
    this.store.set(meter.subscription.pds, 'history', null);
    await this.publishMeter(meter);
    this.importHistory();
  }

  /**
   * Import the older daily readings of the added meters, or join the import in
   * progress. Never throws: a failure is logged and the import resumes from
   * the month it stopped at, after the next refresh.
   */
  importHistory() {
    if (!this.importing) {
      this.importing = this.doImportHistory()
        .catch((err) => logger.warn(`History import paused: ${err.message}`))
        .finally(() => {
          this.importing = null;
        });
    }
    return this.importing;
  }

  async doImportHistory() {
    const { client, generation } = this;
    let first = true;
    for (const meter of [...this.meters.values()]) {
      const { pds, startDate } = meter.subscription;
      const done = this.store.get(pds, 'history');
      if (!client || done === HISTORY_DONE || !this.isCreated(meter)) {
        continue;
      }
      // The refreshes publish the current and the previous month: start
      // before them, newest first, so an interrupted import still left the
      // most useful months.
      const today = this.today();
      const oldest = Math.max(
        monthIndex(monthOf(startDate)),
        monthIndex(monthOf(today, -HISTORY_MONTHS - 1)),
      );
      let month = done ? monthOf(`${done}-01`, -1) : monthOf(today, -2);
      let imported = 0;
      while (monthIndex(month) >= oldest) {
        if (!first) {
          await this.sleep(HISTORY_PAUSE_MS);
        }
        first = false;
        if (generation !== this.generation || !this.isCreated(meter)) {
          return; // new account, or device deleted meanwhile
        }
        const { year, month: number } = month;
        const readings = normalizeDaily(
          await this.withPortal(() => client.getDailyReadings(meter.subscription, year, number)),
        );
        const states = buildReadingStates(this.gladys, pds, readings);
        for (let i = 0; i < states.length; i += STATES_PER_BATCH) {
          await this.gladys.publishStates(states.slice(i, i + STATES_PER_BATCH));
        }
        imported += readings.length;
        this.store.set(pds, 'history', monthLabel(month));
        month = monthOf(`${monthLabel(month)}-01`, -1);
      }
      this.store.set(pds, 'history', HISTORY_DONE);
      logger.info(`Meter ${pds}: history imported (${imported} daily reading(s))`);
    }
  }

  async fireEvents(meter) {
    const { pds } = meter.subscription;
    const device = meterIds(this.gladys, pds).device;
    const last = meter.summary.lastReading;
    if (!last) {
      return;
    }
    const seen = this.store.get(pds, 'event');
    if (seen === null) {
      // First refresh ever: the readings are history, not news.
      this.store.set(pds, 'event', last.date);
    } else if (last.date > seen) {
      const fresh = meter.daily.filter((reading) => reading.date > seen);
      const threshold = this.config.high_consumption_liters;
      if (threshold > 0) {
        for (const reading of fresh.filter((r) => r.liters >= threshold)) {
          await this.publishEvent(TRIGGERS.HIGH_CONSUMPTION, {
            device,
            date: reading.date,
            liters: reading.liters,
            threshold_liters: threshold,
          });
        }
      }
      // One event for the latest reading: two days arriving together are one
      // piece of news, and the scene reads the latest values anyway.
      await this.publishEvent(TRIGGERS.NEW_READING, {
        device,
        date: last.date,
        liters: last.liters,
        index_m3: meter.summary.indexM3,
      });
      this.store.set(pds, 'event', last.date);
    }

    const days = meter.summary.daysSinceReading;
    if (days >= this.config.overdue_days && this.store.get(pds, 'overdue') !== last.date) {
      await this.publishEvent(TRIGGERS.READING_OVERDUE, { device, last_date: last.date, days });
      this.store.set(pds, 'overdue', last.date);
    }
  }

  async publishEvent(key, data) {
    try {
      await this.gladys.publishSceneEvent(key, data);
    } catch (err) {
      // An event lost is not worth failing the refresh (Gladys < 5.1, 429...).
      logger.warn(`Scene event ${key} not sent: ${err.message}`);
    }
  }

  /**
   * The per-device transport badge. The data only comes from the Veolia cloud
   * (manifest `transports: ["cloud"]`, no local channel): `cloud` while the
   * portal answers, `unreachable` when it does not, and `cloud` + degraded when
   * it answers but the meter has sent nothing for `overdue_days`.
   */
  buildTransports(reachable) {
    return [...this.meters.values()].map((meter) => {
      const external_id = meterIds(this.gladys, meter.subscription.pds).device;
      if (!reachable) {
        return { external_id, transport: DEVICE_TRANSPORTS.UNREACHABLE };
      }
      const days = meter.summary.daysSinceReading;
      if (days !== null && days >= this.config.overdue_days) {
        return {
          external_id,
          transport: DEVICE_TRANSPORTS.CLOUD,
          degraded: true,
          message: {
            en: `Veolia answers, but no new reading for ${days} days.`,
            fr: `Veolia répond, mais aucun nouveau relevé depuis ${days} jours.`,
            de: `Veolia antwortet, aber seit ${days} Tagen kein neuer Messwert.`,
            es: `Veolia responde, pero no hay ninguna lectura nueva desde hace ${days} días.`,
          },
        };
      }
      return { external_id, transport: DEVICE_TRANSPORTS.CLOUD };
    });
  }

  async publishTransports(reachable = this.status.connected) {
    const entries = this.buildTransports(reachable);
    if (entries.length === 0) {
      return;
    }
    try {
      await this.gladys.publishTransports(entries);
    } catch (err) {
      logger.warn(`Transport badge not sent: ${err.message}`);
    }
  }

  async reportStatus(connected, message) {
    this.status = { connected, message };
    try {
      await this.gladys.setConnectionStatus(connected, message);
    } catch (err) {
      logger.error('setConnectionStatus failed', err);
    }
  }
}
