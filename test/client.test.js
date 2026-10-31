import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  VeoliaApiError,
  VeoliaAuthError,
  VeoliaClient,
  lookupTowns,
} from '../src/veolia/client.js';
import { PORTALS } from '../src/veolia/portals.js';
import { ACCOUNT, createFakePortal, dailyRecord } from './helpers/fakeVeolia.js';

const noSleep = async () => {};

function clientFor(portal, options = {}) {
  return new VeoliaClient({
    email: ACCOUNT.email,
    password: ACCOUNT.password,
    fetch: portal.fetch,
    sleep: noSleep,
    ...options,
  });
}

test('signs in with the Cognito client id of the chosen portal', async () => {
  const portal = createFakePortal();
  await clientFor(portal, { portal: 'eaudetm.monespace.eau.veolia.fr' }).login();
  const body = JSON.parse(portal.calls[0].init.body);
  assert.equal(body.ClientId, PORTALS['eaudetm.monespace.eau.veolia.fr'].clientId);
  assert.equal(body.AuthFlow, 'USER_PASSWORD_AUTH');
  assert.equal(
    portal.calls[0].init.headers['X-Amz-Target'],
    'AWSCognitoIdentityProviderService.InitiateAuth',
  );
});

test('every portal is a Veolia host with its own Cognito client', () => {
  // The key is matched against the town lookup redirection host.
  for (const host of Object.keys(PORTALS)) {
    assert.match(host, /^[a-z0-9-]+(\.[a-z0-9-]+)*\.eau\.veolia\.fr$|^eau\.veolia\.fr$/, host);
  }
  const ids = Object.values(PORTALS).map((p) => p.clientId);
  assert.equal(new Set(ids).size, ids.length);
  for (const id of ids) assert.match(id, /^[a-z0-9]{25,26}$/);
});

test('an unknown portal falls back to eau.veolia.fr', () => {
  const client = clientFor(createFakePortal(), { portal: 'nope.example' });
  assert.equal(client.clientId, PORTALS['eau.veolia.fr'].clientId);
});

test('a wrong password is a VeoliaAuthError, not retried', async () => {
  const portal = createFakePortal();
  portal.acceptPassword = 'other';
  await assert.rejects(clientFor(portal).login(), VeoliaAuthError);
  assert.equal(portal.calls.length, 1);
});

test('the password never appears in a URL', async () => {
  const portal = createFakePortal();
  const client = clientFor(portal);
  await client.getSubscriptions();
  for (const { url } of portal.calls) {
    assert.ok(!url.href.includes(ACCOUNT.password));
  }
});

test('reads the subscriptions with their delivery point and start date', async () => {
  const subscriptions = await clientFor(createFakePortal()).getSubscriptions();
  assert.deepEqual(subscriptions, [
    {
      id: ACCOUNT.subscriptionId,
      pds: ACCOUNT.pds,
      meter: ACCOUNT.meter,
      startDate: ACCOUNT.startDate,
      readingMode: 'TELERELEVE',
    },
  ]);
});

test('daily readings are asked with the parameters the portal uses', async () => {
  const portal = createFakePortal({ daily: [dailyRecord('2026-10-01', 120, 400.12)] });
  const client = clientFor(portal);
  const [subscription] = await client.getSubscriptions();
  const records = await client.getDailyReadings(subscription, 2026, 10);
  assert.equal(records.length, 1);
  const { searchParams } = portal.calls.at(-1).url;
  assert.equal(searchParams.get('annee'), '2026');
  assert.equal(searchParams.get('mois'), '10');
  assert.equal(searchParams.get('numero-pds'), ACCOUNT.pds);
  assert.equal(searchParams.get('date-debut-abonnement'), ACCOUNT.startDate);
});

test('signs in again when the token expires', async () => {
  let now = 0;
  const portal = createFakePortal();
  const client = clientFor(portal, { now: () => now });
  await client.getSubscriptions();
  assert.equal(portal.logins, 1);
  now += 3600 * 1000; // past ExpiresIn
  await client.getSubscriptions();
  assert.equal(portal.logins, 2);
});

test('a revoked token (401) signs in again once', async () => {
  const portal = createFakePortal();
  const client = clientFor(portal);
  await client.login();
  client.token = 'revoked';
  await client.getSubscriptions();
  assert.equal(portal.logins, 2);
});

test('server errors and 429 are retried, then reported', async () => {
  const portal = createFakePortal();
  portal.failures.push({ match: /espace-client/, status: 503 });
  const client = clientFor(portal);
  assert.equal((await client.getSubscriptions()).length, 1, 'one 503 then success');

  portal.failures.push(
    { match: /espace-client/, status: 429 },
    { match: /espace-client/, status: 429 },
    { match: /espace-client/, status: 429 },
  );
  await assert.rejects(client.getSubscriptions(), VeoliaApiError);
});

test('a 403 from the backend is an authentication problem', async () => {
  const portal = createFakePortal();
  portal.failures.push({ match: /espace-client/, status: 403 });
  await assert.rejects(clientFor(portal).getSubscriptions(), VeoliaAuthError);
});

test('lookupTowns maps the town picker answer', async () => {
  const fetch = async (url) => {
    assert.equal(new URL(url).searchParams.get('q'), '57000');
    return new Response(
      JSON.stringify([{ libelle: 'METZ', type_commune: 'NON_REDIRIGE', code_postal: '57000' }]),
    );
  };
  assert.deepEqual(await lookupTowns('57000', { fetch }), [
    { name: 'METZ', type: 'NON_REDIRIGE', redirect: null },
  ]);
});

test('a WAF block is reported with its reason, not as wrong credentials', async () => {
  const fetch = async () =>
    new Response(
      JSON.stringify({
        __type: 'ForbiddenException',
        message: 'Request not allowed due to WAF block.',
      }),
      { status: 403 },
    );
  const client = new VeoliaClient({ email: 'a@b.fr', password: 'x', fetch, sleep: noSleep });
  await assert.rejects(client.login(), (err) => {
    assert.ok(err instanceof VeoliaApiError);
    assert.match(err.message, /WAF block/);
    return true;
  });
});

test('an unknown e-mail is a VeoliaAuthError', async () => {
  const fetch = async () =>
    new Response(
      JSON.stringify({
        __type: 'UserNotFoundException',
        message: 'UserMigration failed with error Incorrect username or password.',
      }),
      { status: 400 },
    );
  const client = new VeoliaClient({ email: 'a@b.fr', password: 'x', fetch, sleep: noSleep });
  await assert.rejects(client.login(), VeoliaAuthError);
});
