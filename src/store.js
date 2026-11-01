// -----------------------------------------------------------------------------
// Small persisted state, in /data (the only writable path of the container).
//
// Per meter (keyed by PDS):
//   - published: date of the last daily reading published to Gladys, so a
//     restart does not write the same readings twice in the history;
//   - billed: date of the last bill published (meters that are not
//     remote-read), same purpose;
//   - event: date of the last reading the scene triggers have seen, so a
//     restart does not fire `new_reading` again;
//   - overdue: date of the last reading an `reading_overdue` event was fired
//     for, so the event fires once per silence, not at every refresh;
//   - history: oldest month ('YYYY-MM') the history import has published, or
//     'done', so a restart resumes the import instead of starting it over.
// No credential is ever stored here: they live in the Gladys configuration.
// -----------------------------------------------------------------------------

import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { createLogger } from '@gladysassistant/integration-sdk';

const logger = createLogger({ name: 'store' });

export const DEFAULT_STATE_FILE = '/data/veolia-state.json';

export class Store {
  constructor(file = DEFAULT_STATE_FILE) {
    this.file = file;
    this.data = { meters: {} };
    try {
      const parsed = JSON.parse(readFileSync(file, 'utf8'));
      if (parsed && typeof parsed.meters === 'object') {
        this.data = parsed;
      }
    } catch (err) {
      if (err.code !== 'ENOENT') {
        logger.warn(`State file unreadable, starting fresh: ${err.message}`);
      }
    }
  }

  get(pds, key) {
    return this.data.meters[pds]?.[key] ?? null;
  }

  set(pds, key, value) {
    if (this.get(pds, key) === value) {
      return;
    }
    this.data.meters[pds] = { ...this.data.meters[pds], [key]: value };
    this.save();
  }

  save() {
    // Write then rename: a crash mid-write never leaves a truncated file.
    const tmp = `${this.file}.tmp`;
    try {
      mkdirSync(dirname(this.file), { recursive: true });
      writeFileSync(tmp, JSON.stringify(this.data, null, 2));
      renameSync(tmp, this.file);
    } catch (err) {
      // Running outside the container (no /data): keep going in memory.
      logger.warn(`State not saved (${err.code ?? err.message})`);
    }
  }
}
