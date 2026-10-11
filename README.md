# Veolia — Gladys Assistant integration

External integration for [Gladys Assistant](https://gladysassistant.com) that
reads the **water consumption** of a Veolia customer account
([eau.veolia.fr](https://www.eau.veolia.fr)) and publishes it as a Gladys
device, a dashboard widget, scene triggers and scene actions.

Requested on the Gladys forum:
[Demande d'intégration externe eau Veolia](https://community.gladysassistant.com/t/demande-dintegration-externe-eau-veolia/11026).

Built from the official
[JavaScript template](https://github.com/GladysAssistant/integration-template-js)
with [`@gladysassistant/integration-sdk`](https://github.com/GladysAssistant/integration-sdk-js).

User documentation: [`docs/fr.md`](docs/fr.md) / [`docs/en.md`](docs/en.md).

## How it works

```
Remote-read meter ──> Veolia ──> eau.veolia.fr portal ──(HTTPS)──> this integration ──> Gladys
```

Veolia has no public API for its customers' consumption. The integration
signs in like the web portal (AWS Cognito, e-mail + password) and reads the
same backend, as the Python
[`veolia-api`](https://github.com/Jezza34000/veolia-api) library behind the
[Home Assistant integration](https://github.com/Jezza34000/homeassistant_veolia)
does.

- **One device per subscription** (external id built from the delivery point
  number, PDS), with four features: index (m³), daily consumption (L), month
  and year totals (m³).
- **Daily readings are published as past states**, dated on the reading day:
  Veolia publishes them 1 to 3 days late.
- **Transport badge** on the device card: `cloud` while the portal answers,
  `unreachable` when it does not, orange dot (degraded) when no reading came
  for `overdue_days`. No `local` channel: the data only exists on the Veolia
  cloud, so the manifest declares `transports: ["cloud"]`.
- Refresh every `refresh_hours` (default 6 h), about 5 requests per refresh.
- **History import**: once the meter is added, the 24 previous months of daily
  readings are fetched from Veolia (one month every 20 s) and stored on their
  day in the Gladys history.
- **Scene triggers**: `new_reading`, `high_consumption` (threshold in the
  configuration), `reading_overdue`.
- **Scene actions**: `refresh_consumption`, `get_consumption` (last day, this
  month, last month, this year).
- **Dashboard widget** `water_consumption`: tiles, daily chart (7/14/30 days),
  reading date and reliability, refresh button; `water_comparison`: monthly
  consumption of the last 3 years side by side, year totals, change against
  last year.
- **Configuration actions**: _Test the connection_, _Check my town_ (postal
  code → Veolia portal, no account needed).

Requires **Gladys 5.1.0 or later** (scene and widget capability fields).

## Project structure

```
.
├─ index.js                    # SDK wiring only (handlers, schedule, lifecycle)
├─ src/
│  ├─ veolia/client.js         # HTTP client: Cognito sign-in, backend endpoints, retries
│  ├─ veolia/portals.js        # Veolia portals and their Cognito client ids
│  ├─ veolia/consumption.js    # pure computations: readings, totals, periods
│  ├─ meter.js                 # one subscription -> Gladys device + states
│  ├─ sync.js                  # refresh cycle: read, publish, fire scene triggers
│  ├─ store.js                 # small persisted state in /data
│  ├─ scenes.js                # scene actions
│  ├─ widgets.js               # dashboard widgets
│  ├─ status.js                # bilingual messages
│  └─ config.js                # config defaults + normalization
├─ docs/fr.md, docs/en.md      # user documentation (re-hosted by Gladys)
├─ test/                       # node --test, no network
├─ gladys-assistant-integration.json
├─ Dockerfile                  # Node 24 Alpine, read-only rootfs ready
├─ CHANGELOG.md · CLAUDE.md · SECURITY.md
└─ .github/                    # CI, Release, image build, GitHub releases, Dependabot
```

## Development

```bash
npm install
npm test               # node --test
npm run lint           # ESLint
npm run format:check   # Prettier, as the CI runs it
npx github:GladysAssistant/integration-store .   # store admission checks
```

Run against a real Gladys:

```bash
GLADYS_HOST_API_URL="http://localhost:1443" \
GLADYS_INTEGRATION_TOKEN="<token>" \
GLADYS_INTEGRATION_SELECTOR="veolia" \
LOG_LEVEL=debug \
npm start
```

## Releasing

Describe the changes under `## [Unreleased]` in [`CHANGELOG.md`](CHANGELOG.md),
then **Actions → Release → Run workflow** (`patch` / `minor` / `major`). The
workflow bumps `package.json` and the manifest (`version` + `docker_image`),
moves the changelog section, tags `vX.Y.Z`, builds the `linux/amd64` +
`linux/arm64` image on `ghcr.io` and publishes the GitHub Release.

Before the first release: add the GitHub topic `gladys-assistant-integration`,
make the ghcr.io package public, and turn on **Private vulnerability
reporting** ([`SECURITY.md`](SECURITY.md) sends reporters there).

## Disclaimer

Not affiliated with, nor endorsed by, Veolia. "Veolia" is a trademark of its
owner, used here only to name the service the integration reads.

## License

Apache-2.0
