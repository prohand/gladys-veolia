# Changelog

All notable changes to this integration are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses
[semantic versioning](https://semver.org/), bumped by the Release workflow.

## [Unreleased]

## [1.3.2] - 2026-10-31

### Changed

- "Test the connection" on a meter without any reading always gives the
  reading mode (or says Veolia gave none) and how many daily and monthly
  records Veolia sent. The logs list the billing fields when Veolia gives no
  reading mode (field names only).

## [1.3.1] - 2026-10-31

### Changed

- "Test the connection" names the Veolia reading mode of a meter without any
  reading (`RADIORELEVE`, `MANUAL`…): only remote-read meters have daily
  readings. The logs give, at every refresh, the reading mode and how many
  readings Veolia sent.

### Fixed

- A meter without any reading no longer shows 0 m³ for the month and the
  year: the values stay empty instead of looking like a real reading.

## [1.3.0] - 2026-10-30

### Added

- The delegated Veolia portals: Atlantic'Eau, C Mon O, Calléo, Eau du Coquelicot,
  Eaux de Dinan, Nantes Métropole, Odici, SMAEP Ouest Briard, Sobass, Valyo and
  Vendée Eau. "Check my town" names the portal to choose for their towns.

## [1.2.0] - 2026-10-25

### Added

- Store search keywords (water meter, compteur d'eau, télérelève, Eau de Toulouse
  Métropole…) and the country the integration is offered in (France).

### Changed

- Gladys 5.3.0 or later is now required.
- Gladys integration SDK 0.16.

## [1.1.1] - 2026-10-23

- Maintenance release, no functional change.

## [1.1.0] - 2026-10-13

### Added

- German and Spanish translations (configuration screen, messages, widgets,
  documentation).

### Fixed

- The English documentation names the Gladys screens as the Gladys interface does.

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

[Unreleased]: https://github.com/prohand/gladys-veolia/compare/v1.3.2...HEAD
[1.3.2]: https://github.com/prohand/gladys-veolia/compare/v1.3.1...v1.3.2
[1.3.1]: https://github.com/prohand/gladys-veolia/compare/v1.3.0...v1.3.1
[1.3.0]: https://github.com/prohand/gladys-veolia/compare/v1.2.0...v1.3.0
[1.2.0]: https://github.com/prohand/gladys-veolia/compare/v1.1.1...v1.2.0
[1.1.1]: https://github.com/prohand/gladys-veolia/compare/v1.1.0...v1.1.1
[1.1.0]: https://github.com/prohand/gladys-veolia/compare/v1.0.3...v1.1.0
[1.0.3]: https://github.com/prohand/gladys-veolia/compare/v1.0.2...v1.0.3
[1.0.2]: https://github.com/prohand/gladys-veolia/compare/v1.0.1...v1.0.2
[1.0.1]: https://github.com/prohand/gladys-veolia/releases/tag/v1.0.1
