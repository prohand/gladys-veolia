# Changelog

All notable changes to this integration are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses
[semantic versioning](https://semver.org/), bumped by the Release workflow.

## [Unreleased]

### Added

- German and Spanish translations (configuration screen, messages, widgets,
  documentation).

## [1.0.3] - 2026-10-12

### Changed

- `@gladysassistant/integration-sdk` updated to 0.15.0.

## [1.0.2] - 2026-10-11

### Added

- Past consumption: once the meter is added, the 24 previous months of daily
  readings are imported from Veolia into the Gladys history, dated on their
  day (in the background, about 8 minutes), so the Gladys charts show the past
  years. No file to import: Veolia keeps the history.
- Dashboard widget "Water: year comparison": the monthly consumption of the
  last 3 years side by side, each year's total, and the change against last
  year over the same months.

## [1.0.1] - 2026-10-10

### Added

- First version: reads the water consumption of a Veolia customer account
  (eau.veolia.fr, and the Eau de Toulouse Métropole portal) with its e-mail and
  password.
- One water meter device per subscription: index (m³), daily consumption (L),
  month and year totals (m³). Daily readings are stored on the day they were
  measured, and the known history is sent when the device is added.
- Dashboard widget "Water consumption": last day, month, year, index, daily
  chart (7, 14 or 30 days), reading date and reliability, refresh button.
- Scene triggers: new water reading, high water consumption (threshold in the
  configuration), water reading overdue.
- Scene actions: refresh the water consumption, get the consumption of a period
  (last day, this month, last month, this year).
- Cloud transport badge on the meter: `cloud` while the Veolia portal answers,
  `unreachable` when it does not, and an orange dot when no new reading came
  for the "missing reading" delay.
- "Test the connection" and "Check my town" (postal code → Veolia portal)
  actions in the Configuration screen.
- CI runs the tests on Node 22 and 24, and on pull requests builds the Docker
  image and runs the store admission checks; Dependabot keeps the npm
  dependencies, the GitHub Actions and the Docker base image up to date.

[Unreleased]: https://github.com/prohand/gladys-veolia/compare/v1.0.3...HEAD
[1.0.3]: https://github.com/prohand/gladys-veolia/compare/v1.0.2...v1.0.3
[1.0.2]: https://github.com/prohand/gladys-veolia/compare/v1.0.1...v1.0.2
[1.0.1]: https://github.com/prohand/gladys-veolia/releases/tag/v1.0.1
