# Veolia — water consumption

This integration reads your water consumption from your **Veolia customer
account** (eau.veolia.fr) and brings it into Gladys: a "water meter" device, a
dashboard widget, and cards for your scenes.

## What you need

- A **remote-read** water meter (télérelève): it sends your consumption to
  Veolia every day. Without it, Veolia only has one reading a year.
- A **Veolia customer account** with an e-mail and a password. Check that the
  Veolia website shows your consumption day by day.
- Gladys **5.3 or later**.

Is your town served by Veolia? In the **Configuration** tab, use the **Check my
town** button with your postal code. For example, Metz (57000) answers
"Supported, portal eau.veolia.fr".

## Configuration

1. Open the **Configuration** tab of the integration.
2. Enter the **e-mail** and **password** of your customer account.
3. **Customer portal**: keep `eau.veolia.fr`, unless _Check my town_ names
   another portal (Eau de Toulouse Métropole).
4. Optional settings:
   - **Refresh interval** (6 h by default): Veolia publishes one reading a
     day, a short interval brings nothing;
   - **High consumption threshold** (L/day): 0 = off. At or above it, the
     _High water consumption_ trigger fires;
   - **Missing reading after** (3 days by default): delay before the _Water
     reading overdue_ trigger.
5. Click **Save configuration**, then **Test the connection**: the answer shows your meter and
   its last reading.
6. Open the **Discover** tab and add the water meter with **Add to Gladys**.

When the device is added, the known history (the current and the previous
month) is sent to Gladys, **dated on each reading day**.

Then the integration fetches the **24 previous months** from Veolia, dated on
their day too, so the Gladys charts can show the past years. The import runs
in the background, one month every 20 seconds (about 8 minutes). There is no
file to provide: Veolia keeps the history. If Gladys deletes old states (the
**Keep Device State History** setting in **Settings → System**), pick at least 2 years to
keep them.

## The "Water meter" device

| Value                    | Unit | Meaning                                         |
| ------------------------ | ---- | ----------------------------------------------- |
| Index                    | m³   | Meter index at the last reading                 |
| Consommation journalière | L    | Litres used each day, stored on the reading day |
| Consommation du mois     | m³   | Total of the current month                      |
| Consommation de l'année  | m³   | Total of the current calendar year              |

The device card carries the **Cloud** badge while the Veolia portal answers,
**Unreachable** when it does not, with an orange dot when no reading came for
the "Missing reading after" delay. There is no local mode: the data only
exists at Veolia.

Good to know: Veolia publishes a reading **1 to 3 days late**. Not seeing
yesterday's consumption is normal.

## Dashboard

Add the **Water consumption** widget (**Dashboard → Edit → New widget**): last day, month, year, index, a daily
chart (7, 14 or 30 days, set in the widget), the date and reliability of the
last reading (measured or estimated), and a **Refresh** button. With several
meters, pick one in the widget settings.

The **Water: year comparison** widget shows the consumption of each month of
the last 3 years side by side, the total of each year, and the change against
last year over the same period (January to the last full month). Its figures
come straight from Veolia: it works even if Gladys did not keep the history.

## Scenes

The integration adds its cards to the scene editor, under **Integrations**
(**Integration trigger** and **Integration action**).

Triggers:

- **New water reading** — Veolia published a new day. Variables:
  `{{triggerEvent.data.date}}`, `{{triggerEvent.data.liters}}`,
  `{{triggerEvent.data.index_m3}}`.
- **High water consumption** — a day reached the threshold you set (possible
  leak). Variables: `date`, `liters`, `threshold_liters`.
- **Water reading overdue** — no new reading for the number of days you set
  (meter or portal down). Variables: `last_date`, `days`.

Actions:

- **Refresh the water consumption** — reads Veolia now and returns the latest
  reading (`date`, `liters`, `index_m3`).
- **Get the water consumption** — returns the consumption of a period (last
  reading day, this month, last month, this year) in litres and m³, for a
  message or a condition.

Example: "every 1st of the month at 9:00, get last month's consumption and
send me: _Last month: {{…cubic_meters}} m³_".

## Troubleshooting

- **"Veolia refused the e-mail or the password"**: sign in on the Veolia
  website with the same credentials. If Veolia asks for a new password, change
  it there, then update Gladys.
- **"WAF block"** in the status: Veolia (through AWS) blocks some server
  addresses (hosting providers, VPNs). From a regular home connection this
  should not happen.
- **No daily consumption**: your meter is probably not remote-read. Check on
  the Veolia website.
- **Town "not supported yet"**: your town has its own Veolia portal. Open an
  issue on the GitHub repository with the portal address.

## Your data

- Your credentials stay in the Gladys configuration. They are only sent to
  Veolia (its AWS Cognito sign-in service) and never written to the logs.
- The integration only reads your consumption. It changes nothing on your
  Veolia account.
- Veolia offers no official API for this data: the integration does what the
  website does. If Veolia changes its website, it may stop working until an
  update.
