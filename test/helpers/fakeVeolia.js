// -----------------------------------------------------------------------------
// A fake Veolia portal: a `fetch` that answers like Cognito and the backend,
// from an in-memory account. Tests mutate `portal.daily` to make readings
// appear, and `portal.failures` to inject HTTP errors.
// -----------------------------------------------------------------------------

import { BACKEND_URL, COGNITO_URL } from '../../src/veolia/client.js';

export const ACCOUNT = {
  email: 'me@example.com',
  password: 'secret-password',
  subscriptionId: '1234567',
  pds: 'PDS0042',
  meter: 'M17AB123456',
  startDate: '2020-03-15',
};

function json(status, body, contentType = 'application/json') {
  return new Response(body === undefined ? '' : JSON.stringify(body), {
    status,
    headers: { 'Content-Type': contentType },
  });
}

/** A daily record as the backend sends it. */
export function dailyRecord(date, liters, indexM3, reliability = 'MESURE') {
  return {
    date_releve: date,
    index: { m3: indexM3 },
    consommation: { litre: liters, m3: liters / 1000 },
    fiabilite_index: reliability,
  };
}

/** Daily readings from `from` to `to` included, 100 L + i, index growing. */
export function dailyRange(from, to, { startIndex = 400, liters = (i) => 100 + i } = {}) {
  const records = [];
  let index = startIndex;
  for (let t = Date.parse(`${from}T00:00:00Z`), i = 0; t <= Date.parse(`${to}T00:00:00Z`); i += 1) {
    const date = new Date(t).toISOString().slice(0, 10);
    const l = liters(i);
    index += l / 1000;
    records.push(dailyRecord(date, l, Math.round(index * 1000) / 1000));
    t += 86_400_000;
  }
  return records;
}

export function createFakePortal({ daily = [], monthly = [], readingMode = 'TELERELEVE' } = {}) {
  const portal = {
    daily,
    monthly,
    readingMode, // facturation.mode_releve: TELERELEVE, RADIORELEVE, MANUAL
    calls: [],
    logins: 0,
    failures: [], // [{ match: RegExp, status }] consumed in order
    tokenExpiresIn: 3600,
    acceptPassword: ACCOUNT.password,
  };

  portal.fetch = async (input, init = {}) => {
    const url = new URL(String(input));
    portal.calls.push({ url, init });
    const failure = portal.failures.find((f) => f.match.test(url.href));
    if (failure) {
      portal.failures.splice(portal.failures.indexOf(failure), 1);
      return json(failure.status, { message: 'injected' });
    }

    if (url.href === COGNITO_URL) {
      const body = JSON.parse(init.body);
      if (body.AuthParameters.PASSWORD !== portal.acceptPassword) {
        return json(
          400,
          { __type: 'NotAuthorizedException', message: 'Incorrect username or password.' },
          'application/x-amz-json-1.1',
        );
      }
      portal.logins += 1;
      return json(
        200,
        {
          AuthenticationResult: {
            AccessToken: `token-${portal.logins}`,
            ExpiresIn: portal.tokenExpiresIn,
          },
        },
        'application/x-amz-json-1.1',
      );
    }

    if (url.origin !== new URL(BACKEND_URL).origin) {
      return json(404, {});
    }
    if (init.headers?.Authorization !== `Bearer token-${portal.logins}`) {
      return json(401, { message: 'Unauthorized' });
    }
    const path = url.pathname;
    if (path === '/espace-client') {
      return json(200, {
        contacts: [
          {
            id_contact: 'C1',
            tiers: [
              {
                id: 'T1',
                abonnements: [
                  { id_abonnement: ACCOUNT.subscriptionId, numero_compteur: ACCOUNT.meter },
                ],
              },
            ],
          },
        ],
      });
    }
    if (path === `/abonnements/${ACCOUNT.subscriptionId}/facturation`) {
      return json(200, {
        numero_pds: ACCOUNT.pds,
        date_debut_abonnement: ACCOUNT.startDate,
        mode_releve: portal.readingMode,
      });
    }
    if (path === `/consommations/${ACCOUNT.subscriptionId}/journalieres`) {
      const prefix = `${url.searchParams.get('annee')}-${url.searchParams.get('mois').padStart(2, '0')}-`;
      return json(
        200,
        portal.daily.filter((r) => r.date_releve.startsWith(prefix)),
      );
    }
    if (path === `/consommations/${ACCOUNT.subscriptionId}/mensuelles`) {
      const year = Number(url.searchParams.get('annee'));
      return json(
        200,
        portal.monthly.filter((r) => r.annee === year),
      );
    }
    return json(404, {});
  };

  return portal;
}
