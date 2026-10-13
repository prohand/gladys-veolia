# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

An **external integration for Gladys Assistant**, built on the official
[JavaScript template](https://github.com/GladysAssistant/integration-template-js) and
`@gladysassistant/integration-sdk`. It runs as its own Docker container, talks to Gladys over a
WebSocket the SDK manages, and reads the **water consumption of a Veolia customer account**
(eau.veolia.fr): one device per subscription, a dashboard widget, scene triggers and scene
actions.

It is **not** part of the Gladys core: it can only publish devices, states, scene events and
widget contents, and read its own configuration.

## Commands

```bash
npm test                 # node --test (built-in runner, no framework)
node --test test/sync.test.js                 # a single file
node --test --test-name-pattern "overdue"     # tests by name
npm run lint             # ESLint
npm run format           # Prettier, write
npm run format:check     # Prettier, check — the CI gate
```

All three gates run on every push and PR (`.github/workflows/ci.yml`), on Node 22 and 24. Pull
requests also build the Docker image and run the store admission checks. **Tests never touch the
network**: `VeoliaClient` takes an injected `fetch`, `test/helpers/fakeVeolia.js` plays Cognito
and the backend, `test/helpers/fakeGladys.js` plays the SDK.

Before tagging a release, check the manifest against the real store rules:

```bash
npx github:GladysAssistant/integration-store .
```

Expected findings before the first release: the `docker_image` tag is not on ghcr.io yet, and
`cover_image` 404s until `main` is pushed.

## Architecture

`index.js` is pure wiring — SDK handlers, the refresh schedule (a `setTimeout` chain), the
connection lifecycle — and holds no Veolia logic.

- **`src/veolia/client.js`** — the HTTP client. Cognito `InitiateAuth` (`USER_PASSWORD_AUTH`)
  → bearer token; then `prd-ael-sirius-backend.istefr.fr`: `/espace-client` (subscriptions),
  `/abonnements/{id}/facturation` (PDS + start date), `/consommations/{id}/journalieres` and
  `/mensuelles`. Retries network errors, 429 and 5xx (3 attempts); re-signs in once on 401.
  `lookupTowns()` reads the public town picker (no account).
- **`src/veolia/portals.js`** — portal host → Cognito client id. Mirrors `portals.py` of the
  Python `veolia-api` library (the Home Assistant integration's client): keep them in sync.
- **`src/veolia/consumption.js`** — pure: normalizes records, computes totals and periods.
  Dates are French calendar days (`Europe/Paris`).
- **`src/meter.js`** — subscription → device payload and states.
- **`src/sync.js`** — `VeoliaSync`: one refresh at a time (concurrent callers join it), publishes
  only the new readings, fires the scene triggers, reports the connection status. Once a meter is
  added, imports its `HISTORY_MONTHS` older months in the background (`importHistory`).
  The refresh and the import take turns on the Veolia client (`withPortal`).
- **`src/store.js`** — `/data/veolia-state.json`: per PDS, last published reading, last reading
  seen by the triggers, last overdue event, history import progress.
- **`src/scenes.js`**, **`src/widgets.js`** — capability handlers, keyed by the manifest keys.

### Decisions that look arbitrary without their reason

- **The device external id is `gladys.externalIds('meter', <PDS>)`**, not the meter serial:
  Veolia swaps meters on the same delivery point, and the history must survive. Feature keys
  (`index`, `daily-consumption`, `month-consumption`, `year-consumption`) are forever.
- **Daily readings are past states** (`created_at` = reading day at 12:00 UTC, the same calendar
  day in France all year): Veolia publishes 1 to 3 days late.
- **The core drops states of a feature that does not exist yet.** Nothing is published until the
  user adds the device (`gladys.devices`); `onDeviceCreated` then sends the known history. The
  `published` date only moves after a successful publication.
- **The history comes from Veolia, not from a file**: the SDK has no file field, and the portal
  keeps the daily readings. The import goes newest month first, one month every 20 s (≤ 62
  states: under the host API's 300 states/minute), and resumes from the `history` month in the
  store after a failure or a restart. Deleting and re-adding the device imports again.
- **The comparison widget draws every year on the current year's months** (`t` = this year's
  month): a chart series is a time series, this is how bars of the same month stand side by side.
  Its figures are the Veolia monthly totals, so it works whatever the Gladys state retention.
- **No `poll_frequency`**: the core's polling is an enum capped at one minute; Veolia updates once
  a day.
- **Triggers never fire on the first refresh** (the readings are history, not news), and a
  refresh asked by a **scene action runs with `events: false`**: firing a trigger from an action
  could loop through a scene. The skipped events fire at the next scheduled refresh.
- **`high_consumption` has its threshold in the configuration**, not in a trigger field: the
  core matches trigger fields by equality, a `>` on an event value is a state's job.
- **The widget computes its values** instead of binding tiles to device features: a live tile
  would show the publication time of a past state, and the device may not be added yet.
- **Transport badge**: `transports: ["cloud"]` only — the readings only exist on the Veolia
  cloud, a `local` value would be a lie and would add a useless "Prefer local" toggle.
  `publishTransports` reports `cloud`, `unreachable` (Veolia error) or `cloud` + degraded (no
  reading for `overdue_days`); a Gladys-side failure does not touch the badge.
- **AWS WAF**: Cognito answers `403 Request not allowed due to WAF block` from some datacenter
  addresses (CI runners, cloud sandboxes). It is reported as a `VeoliaApiError` with that text,
  never as wrong credentials.

## Gladys core constraints

- **Every feature needs an explicit numeric `min` and `max`** (`NOT NULL` columns): pinned by
  `test/meter.test.js`.
- `publishStates` takes at most 100 states per call; `publishSceneEvent` data is flat (≤ 30
  primitive keys) and only the keys declared in `fields` / `variables` are kept: pinned by
  `test/sync.test.js`.
- Widget contents must pass `validateWidgetContent` with `[]`: pinned by `test/widgets.test.js`.
- A `number` config field is locale-dependent: only integers there.

## Manifest gotchas

`gladys-assistant-integration.json` is validated by the store schema. Pinned by
`test/manifest.test.js`:

- free text is `string`, the password is `secret`;
- `label`, `description` and `placeholder` are `{ en, fr, de, es }` objects, never bare strings;
- the catalog `description` holds 10 to 100 characters per language;
- `scene_triggers`, `scene_actions`, `widgets` require `gladys_version` `>=5.1.0`;
- `transports` is `["cloud"]`;
- manifest keys and code keys match: `actions` ↔ `gladys.onAction` in `index.js`,
  `scene_actions` ↔ `SCENE_ACTIONS`, `scene_triggers` ↔ `TRIGGERS`, `widgets` ↔ `WIDGETS`,
  select options ↔ `PORTALS`, `PERIODS`, `CHART_DAYS`;
- the `config_schema` defaults equal `DEFAULT_CONFIG`.

## Releasing

**Actions → Release → Run workflow** (`patch`/`minor`/`major`). It bumps `package.json` and the
manifest `version` + `docker_image` tag together, reformats both with Prettier, moves the
`## [Unreleased]` section of `CHANGELOG.md` under the version
(`.github/scripts/changelog-release.mjs`), commits, tags `vX.Y.Z`, calls `build.yml` for the
multi-arch image and `github-release.yml` for the GitHub Release. Never edit the versions by hand.

Every user-visible change adds a line under `## [Unreleased]` (`### Added`, `Changed`, `Fixed`,
`Removed`, `Security`). Never write a version heading yourself.

## Conventions

Comments explain **why**, in English. Keep `src/veolia/consumption.js` and `src/meter.js` pure
(no network, no SDK calls). Feature names are French (the users are French Veolia customers);
every user-facing message (status, action answer, toast, manifest texts, docs) is
`{ en, fr, de, es }`, and `docs/en.md`, `docs/fr.md`, `docs/de.md`, `docs/es.md` stay in sync.

**Security**: the password only goes to Cognito, in a POST body; never log it, never put it in a
URL, never store it outside the Gladys configuration. Logs may contain the PDS and the meter
number (needed to diagnose), never the token. The container rootfs is read-only: write only
under `/data`.
