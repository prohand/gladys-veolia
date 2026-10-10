// A VeoliaSync wired to the fake Gladys and the fake portal, with a store in a
// temporary directory and a clock the test controls.

import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { normalizeConfig } from '../../src/config.js';
import { Store } from '../../src/store.js';
import { VeoliaSync } from '../../src/sync.js';
import { VeoliaClient } from '../../src/veolia/client.js';
import { createFakeGladys } from './fakeGladys.js';
import { ACCOUNT, createFakePortal } from './fakeVeolia.js';

export function setup({ daily = [], monthly = [], today = '2026-10-10', config = {} } = {}) {
  const gladys = createFakeGladys();
  const portal = createFakePortal({ daily, monthly });
  const clock = { now: Date.parse(`${today}T10:00:00Z`) };
  const storeFile = join(mkdtempSync(join(tmpdir(), 'veolia-')), 'state.json');
  const store = new Store(storeFile);
  const sync = new VeoliaSync(gladys, {
    store,
    now: () => clock.now,
    createClient: (cfg) =>
      new VeoliaClient({
        email: cfg.email,
        password: cfg.password,
        portal: cfg.portal,
        fetch: portal.fetch,
        now: () => clock.now,
        sleep: async () => {},
      }),
    onUpdate: () => gladys.requestWidgetRefresh('water_consumption'),
  });
  sync.setConfig(normalizeConfig({ email: ACCOUNT.email, password: ACCOUNT.password, ...config }));
  return { gladys, portal, clock, store, storeFile, sync };
}

/** Move the clock to another day (10:00 UTC). */
export function setToday(clock, date) {
  clock.now = Date.parse(`${date}T10:00:00Z`);
}
