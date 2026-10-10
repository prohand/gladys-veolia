// -----------------------------------------------------------------------------
// Scene actions (SDK v0.14+, Gladys 5.1+), keyed by the manifest
// `scene_actions` key; index.js registers each one with
// `gladys.onSceneAction(key, ...)`.
//
// The scene TRIGGERS (new_reading, high_consumption, reading_overdue) are fired
// by the refresh cycle, see src/sync.js.
//
// The rules that matter:
//   - `fields` arrive RESOLVED (scene variables substituted, defaults applied);
//     a `"source": "devices"` field is the chosen device external_id;
//   - resolve the declared `outputs` only (scalars); throwing fails this
//     action only, the scene continues;
//   - never fire a scene event because of an action: a refresh asked by a
//     scene runs with `events: false` (see VeoliaSync.refresh).
// -----------------------------------------------------------------------------

import { createLogger } from '@gladysassistant/integration-sdk';
import { PERIODS, consumptionOf } from './veolia/consumption.js';

const logger = createLogger({ name: 'scenes' });

export const SCENE_ACTION_KEYS = {
  REFRESH: 'refresh_consumption',
  GET: 'get_consumption',
};

// An output the scene can always read, even when there is no data.
const EMPTY = { liters: null, cubic_meters: null, date: null };

function lastReadingOutputs(meter) {
  const last = meter?.summary.lastReading;
  return last
    ? { date: last.date, liters: last.liters, index_m3: meter.summary.indexM3 }
    : { date: null, liters: null, index_m3: null };
}

export const SCENE_ACTIONS = {
  // Read the portal now, then hand the latest reading to the next actions.
  async [SCENE_ACTION_KEYS.REFRESH](sync, { fields }) {
    logger.info('Scene action refresh_consumption');
    const result = await sync.refresh({ events: false });
    if (!result.ok) {
      throw new Error(result.message.en);
    }
    return lastReadingOutputs(sync.meterOf(fields.device));
  },

  // The consumption of a period, from the data of the last refresh.
  async [SCENE_ACTION_KEYS.GET](sync, { fields }) {
    const period = fields.period || PERIODS.LAST_DAY;
    logger.info(`Scene action get_consumption <- ${period}`);
    if (sync.meters.size === 0) {
      // Nothing read yet (just started): read once, without firing events.
      await sync.refresh({ events: false });
    }
    const meter = sync.meterOf(fields.device);
    if (!meter) {
      return EMPTY;
    }
    return consumptionOf(meter.summary, period, sync.today()) ?? EMPTY;
  },
};
