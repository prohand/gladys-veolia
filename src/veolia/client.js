// -----------------------------------------------------------------------------
// HTTP client of the Veolia water customer portal.
//
// Veolia publishes no public API for its customers' consumption. This client
// replays what the eau.veolia.fr web portal does, like the Python `veolia-api`
// library behind the Home Assistant integration:
//   1. sign in to AWS Cognito (USER_PASSWORD_AUTH) -> a bearer access token;
//   2. GET /espace-client -> the subscriptions of the account;
//   3. GET /abonnements/{id}/facturation -> the delivery point (PDS) and the
//      subscription start date, both required by the consumption endpoints;
//   4. GET /consommations/{id}/journalieres (one month of daily readings) and
//      /consommations/{id}/mensuelles (one year of monthly totals).
//
// `fetch` is injected so the tests never touch the network. The password is
// only ever sent to Cognito and never logged.
// -----------------------------------------------------------------------------

import { createLogger } from '@gladysassistant/integration-sdk';
import { DEFAULT_PORTAL, clientIdOf } from './portals.js';

const logger = createLogger({ name: 'veolia' });

export const COGNITO_URL = 'https://cognito-idp.eu-west-3.amazonaws.com/';
export const BACKEND_URL = 'https://prd-ael-sirius-backend.istefr.fr';
export const COMMUNES_URL = 'https://prd-ael-sirius-refcommunes.istefr.fr/communes-nationales';

const TYPE_FRONT = 'WEB_ORDINATEUR';
const REQUEST_TIMEOUT_MS = 15_000;
const MAX_ATTEMPTS = 3;
// Renew the token a minute before Cognito says it expires.
const TOKEN_MARGIN_MS = 60_000;
// The portal is a web app: present the browser User-Agent the veolia-api
// library uses, the backend has only ever seen browsers.
const USER_AGENT =
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36';

/** The account refused the credentials: retrying will not help. */
export class VeoliaAuthError extends Error {
  constructor(message) {
    super(message);
    this.name = 'VeoliaAuthError';
  }
}

/** Any other failure: network, HTTP status, unexpected payload. */
export class VeoliaApiError extends Error {
  constructor(message, status) {
    super(message);
    this.name = 'VeoliaApiError';
    this.status = status;
  }
}

const sleepFor = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export class VeoliaClient {
  /**
   * @param {object} options
   * @param {string} options.email
   * @param {string} options.password
   * @param {string} [options.portal] key of PORTALS
   * @param {typeof fetch} [options.fetch]
   * @param {() => number} [options.now]
   * @param {(ms: number) => Promise<void>} [options.sleep]
   */
  constructor({
    email,
    password,
    portal = DEFAULT_PORTAL,
    fetch = globalThis.fetch,
    now = Date.now,
    sleep = sleepFor,
  }) {
    this.email = email;
    this.password = password;
    this.clientId = clientIdOf(portal);
    this.fetch = fetch;
    this.now = now;
    this.sleep = sleep;
    this.token = null;
    this.tokenExpiresAt = 0;
  }

  // --- Authentication --------------------------------------------------------

  async login() {
    logger.debug('Signing in to Veolia');
    const response = await this.request(COGNITO_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-amz-json-1.1',
        'X-Amz-Target': 'AWSCognitoIdentityProviderService.InitiateAuth',
      },
      body: JSON.stringify({
        ClientId: this.clientId,
        AuthFlow: 'USER_PASSWORD_AUTH',
        AuthParameters: { USERNAME: this.email, PASSWORD: this.password },
      }),
    });
    const body = await readJson(response);
    if (!response.ok) {
      // Cognito names the error in `__type` ("prefix#NotAuthorizedException"
      // on some regions): wrong password and unknown e-mail are both final.
      const type = String(body?.__type ?? '');
      if (/NotAuthorized|UserNotFound|UserNotConfirmed|PasswordReset/.test(type)) {
        throw new VeoliaAuthError(body?.message ?? 'Invalid credentials');
      }
      // e.g. 403 "Request not allowed due to WAF block": AWS filters some
      // datacenter addresses; the message tells the user what happened.
      const detail = body?.message ? `: ${body.message}` : '';
      throw new VeoliaApiError(
        `Sign-in failed (HTTP ${response.status}${detail})`,
        response.status,
      );
    }
    const result = body?.AuthenticationResult;
    if (!result?.AccessToken) {
      // A challenge (new password, MFA...) the portal asks to complete in a browser.
      throw new VeoliaAuthError(
        body?.ChallengeName ? `Sign-in challenge ${body.ChallengeName}` : 'No access token',
      );
    }
    this.token = result.AccessToken;
    this.tokenExpiresAt = this.now() + Number(result.ExpiresIn ?? 3600) * 1000 - TOKEN_MARGIN_MS;
  }

  async ensureToken() {
    if (!this.token || this.now() >= this.tokenExpiresAt) {
      await this.login();
    }
  }

  // --- Account ---------------------------------------------------------------

  /**
   * Every subscription of the account, with what the consumption endpoints need.
   * @returns {Promise<Array<{ id: string, pds: string, meter: string, startDate: string }>>}
   */
  async getSubscriptions() {
    const account = await this.get('/espace-client', { 'type-front': TYPE_FRONT });
    const raw = [];
    for (const contact of account?.contacts ?? []) {
      for (const tiers of contact?.tiers ?? []) {
        for (const abonnement of tiers?.abonnements ?? []) {
          if (abonnement?.id_abonnement) {
            raw.push(abonnement);
          }
        }
      }
    }
    const subscriptions = [];
    for (const abonnement of raw) {
      const id = String(abonnement.id_abonnement);
      try {
        const billing = await this.get(`/abonnements/${encodeURIComponent(id)}/facturation`);
        if (!billing?.numero_pds || !billing?.date_debut_abonnement) {
          throw new VeoliaApiError('Billing data without delivery point');
        }
        subscriptions.push({
          id,
          pds: String(billing.numero_pds).trim(),
          meter: String(abonnement.numero_compteur ?? billing.numero_pds).trim(),
          startDate: String(billing.date_debut_abonnement).slice(0, 10),
          // TELERELEVE, RADIORELEVE or MANUAL: the portal only has daily and
          // monthly readings for remote-read (TELERELEVE) meters.
          readingMode: billing.mode_releve ? String(billing.mode_releve) : null,
        });
      } catch (err) {
        // A terminated subscription can stay listed: keep reading the others.
        logger.warn(`Subscription ${id} skipped: ${err.message}`);
      }
    }
    return subscriptions;
  }

  // --- Consumption -----------------------------------------------------------

  /** Daily readings of one month (raw records). */
  async getDailyReadings(subscription, year, month) {
    const records = await this.get(
      `/consommations/${encodeURIComponent(subscription.id)}/journalieres`,
      {
        annee: year,
        mois: month,
        'numero-pds': subscription.pds,
        'date-debut-abonnement': subscription.startDate,
      },
    );
    return Array.isArray(records) ? records : [];
  }

  /** Monthly totals of one year (raw records). */
  async getMonthlyTotals(subscription, year) {
    const records = await this.get(
      `/consommations/${encodeURIComponent(subscription.id)}/mensuelles`,
      {
        annee: year,
        'numero-pds': subscription.pds,
        'date-debut-abonnement': subscription.startDate,
      },
    );
    return Array.isArray(records) ? records : [];
  }

  // --- Plumbing --------------------------------------------------------------

  async get(path, params = {}) {
    await this.ensureToken();
    const url = new URL(path, BACKEND_URL);
    for (const [key, value] of Object.entries(params)) {
      url.searchParams.set(key, String(value));
    }
    let response = await this.request(url, { headers: this.authHeaders() });
    if (response.status === 401) {
      // Token revoked before its expiry (password changed, new session...).
      await this.login();
      response = await this.request(url, { headers: this.authHeaders() });
    }
    if (response.status === 401 || response.status === 403) {
      throw new VeoliaAuthError(`Access refused (HTTP ${response.status})`);
    }
    if (response.status === 204) {
      return null;
    }
    if (!response.ok) {
      throw new VeoliaApiError(`${url.pathname}: HTTP ${response.status}`, response.status);
    }
    return readJson(response);
  }

  authHeaders() {
    return { Authorization: `Bearer ${this.token}` };
  }

  // One HTTP call, retried on network errors, 429 and 5xx with a short backoff.
  async request(url, { headers = {}, ...init } = {}) {
    let lastError;
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
      try {
        const response = await this.fetch(url, {
          ...init,
          headers: { Accept: 'application/json', 'User-Agent': USER_AGENT, ...headers },
          signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        });
        if (response.status !== 429 && response.status < 500) {
          return response;
        }
        lastError = new VeoliaApiError(`HTTP ${response.status}`, response.status);
      } catch (err) {
        lastError = new VeoliaApiError(err.message);
      }
      if (attempt < MAX_ATTEMPTS) {
        await this.sleep(1000 * 2 ** (attempt - 1));
      }
    }
    throw lastError;
  }
}

async function readJson(response) {
  // Cognito answers `application/x-amz-json-1.1`: parse the text ourselves.
  const text = await response.text();
  if (!text) {
    return null;
  }
  try {
    return JSON.parse(text);
  } catch {
    throw new VeoliaApiError('Unexpected answer (not JSON)', response.status);
  }
}

/**
 * Towns matching a postal code, as the portal's own town picker shows them.
 * No account needed.
 * @returns {Promise<Array<{ name: string, type: string, redirect: string | null }>>}
 */
export async function lookupTowns(postalCode, { fetch = globalThis.fetch } = {}) {
  const url = new URL(COMMUNES_URL);
  url.searchParams.set('q', postalCode);
  const response = await fetch(url, {
    headers: { Accept: 'application/json', 'User-Agent': USER_AGENT },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (!response.ok) {
    throw new VeoliaApiError(`Town lookup: HTTP ${response.status}`, response.status);
  }
  const towns = await readJson(response);
  return (Array.isArray(towns) ? towns : []).map((town) => ({
    name: String(town.libelle ?? ''),
    type: String(town.type_commune ?? ''),
    redirect: town.url_redirection ?? null,
  }));
}
