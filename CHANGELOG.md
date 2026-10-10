# Changelog

All notable changes to this integration are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses
[semantic versioning](https://semver.org/), bumped by the Release workflow.

## [Unreleased]

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
- "Test the connection" and "Check my town" (postal code → Veolia portal)
  actions in the Configuration screen.
- CI runs the tests on Node 22 and 24, and on pull requests builds the Docker
  image and runs the store admission checks; Dependabot keeps the npm
  dependencies, the GitHub Actions and the Docker base image up to date.

[Unreleased]: https://github.com/prohand/gladys-veolia/commits/main
