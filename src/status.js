// -----------------------------------------------------------------------------
// User-facing messages: the connection status of the Configuration screen and
// the answers of the manifest actions. Multi-language, like every text the
// user reads, in every language Gladys offers (`LANGUAGES`). Never echo the
// password, nor the full e-mail address.
// -----------------------------------------------------------------------------

import { PORTALS } from './veolia/portals.js';

/** The languages of the Gladys UI: every user-facing text carries all of them. */
export const LANGUAGES = ['en', 'fr', 'de', 'es'];

/**
 * Join multi-language texts language by language; a missing language falls
 * back to English, as the Gladys front does.
 * @param {Array<Record<string, string>>} texts
 * @param {string} separator
 */
export function joinTexts(texts, separator) {
  return Object.fromEntries(
    LANGUAGES.map((lang) => [lang, texts.map((t) => t[lang] ?? t.en).join(separator)]),
  );
}

export const MESSAGES = {
  notConfigured: {
    en: 'Enter the e-mail and password of your Veolia customer account.',
    fr: 'Indiquez l’e-mail et le mot de passe de votre espace client Veolia.',
    de: 'Gib die E-Mail-Adresse und das Passwort deines Veolia-Kundenkontos ein.',
    es: 'Introduzca el e-mail y la contraseña de su área de cliente de Veolia.',
  },
  authFailed: {
    en: 'Veolia refused the e-mail or the password. Check them by signing in on the Veolia website.',
    fr: 'Veolia a refusé l’e-mail ou le mot de passe. Vérifiez-les en vous connectant sur le site Veolia.',
    de: 'Veolia hat die E-Mail-Adresse oder das Passwort abgelehnt. Prüfe sie, indem du dich auf der Veolia-Website anmeldest.',
    es: 'Veolia ha rechazado el e-mail o la contraseña. Compruébelos iniciando sesión en la web de Veolia.',
  },
  noSubscription: {
    en: 'Signed in, but the account has no active water subscription.',
    fr: 'Connecté, mais le compte n’a aucun abonnement eau actif.',
    de: 'Angemeldet, aber das Konto hat kein aktives Wasserabonnement.',
    es: 'Sesión iniciada, pero la cuenta no tiene ningún contrato de agua activo.',
  },
};

export function unreachable(detail) {
  return {
    en: `Cannot read the Veolia portal (${detail}). Next try at the next refresh.`,
    fr: `Impossible de lire le portail Veolia (${detail}). Nouvel essai au prochain rafraîchissement.`,
    de: `Das Veolia-Portal kann nicht gelesen werden (${detail}). Neuer Versuch bei der nächsten Aktualisierung.`,
    es: `No se puede leer el portal de Veolia (${detail}). Nuevo intento en la próxima actualización.`,
  };
}

export function gladysFailed(detail) {
  return {
    en: `Veolia data read, but Gladys refused it (${detail}). Next try at the next refresh.`,
    fr: `Données Veolia lues, mais Gladys les a refusées (${detail}). Nouvel essai au prochain rafraîchissement.`,
    de: `Veolia-Daten gelesen, aber Gladys hat sie abgelehnt (${detail}). Neuer Versuch bei der nächsten Aktualisierung.`,
    es: `Datos de Veolia leídos, pero Gladys los ha rechazado (${detail}). Nuevo intento en la próxima actualización.`,
  };
}

/** Answer of the "Test the connection" action. */
export function testResult(meters) {
  const lines = meters.map(({ subscription, summary }) => {
    const last = summary.lastReading;
    if (!last) {
      return {
        en: `Meter ${subscription.meter}: no reading yet.`,
        fr: `Compteur ${subscription.meter} : aucun relevé pour l’instant.`,
        de: `Zähler ${subscription.meter}: noch kein Messwert.`,
        es: `Contador ${subscription.meter}: todavía no hay ninguna lectura.`,
      };
    }
    const index = summary.indexM3 === null ? '' : `, index ${summary.indexM3} m³`;
    return {
      en: `Meter ${subscription.meter}: ${last.liters} L on ${last.date}${index}.`,
      fr: `Compteur ${subscription.meter} : ${last.liters} L le ${last.date}${index}.`,
      de: `Zähler ${subscription.meter}: ${last.liters} L am ${last.date}${index}.`,
      es: `Contador ${subscription.meter}: ${last.liters} L el ${last.date}${index}.`,
    };
  });
  return joinTexts(
    [{ en: 'Connected.', fr: 'Connecté.', de: 'Verbunden.', es: 'Conectado.' }, ...lines],
    ' ',
  );
}

const MAX_TOWNS = 8;

function listTowns(towns) {
  const names = [...new Set(towns.map((t) => t.name))];
  const shown = names.slice(0, MAX_TOWNS).join(', ');
  return names.length > MAX_TOWNS ? `${shown}…` : shown;
}

/**
 * Answer of the "Check my town" action, from lookupTowns().
 * @param {string} postalCode
 * @param {Array<{ name: string, type: string, redirect: string | null }>} towns
 */
export function townCheckResult(postalCode, towns) {
  if (towns.length === 0) {
    return {
      en: `No town found for ${postalCode}.`,
      fr: `Aucune commune trouvée pour ${postalCode}.`,
      de: `Keine Gemeinde für ${postalCode} gefunden.`,
      es: `No se ha encontrado ningún municipio para ${postalCode}.`,
    };
  }
  const national = towns.filter((t) => t.type === 'NON_REDIRIGE');
  const redirected = towns.filter((t) => t.type === 'REDIRIGE');
  const supportedPortal = (t) => {
    try {
      return PORTALS[new URL(t.redirect).hostname] ? new URL(t.redirect).hostname : null;
    } catch {
      return null;
    }
  };
  const ownPortal = redirected.filter((t) => supportedPortal(t));
  const unsupported = redirected.filter((t) => !supportedPortal(t));
  const notServed = towns.filter((t) => t.type !== 'NON_REDIRIGE' && t.type !== 'REDIRIGE');

  const parts = [];
  if (national.length > 0) {
    const list = listTowns(national);
    parts.push({
      en: `Supported, portal eau.veolia.fr: ${list}.`,
      fr: `Compatible, portail eau.veolia.fr : ${list}.`,
      de: `Unterstützt, Portal eau.veolia.fr: ${list}.`,
      es: `Compatible, portal eau.veolia.fr: ${list}.`,
    });
  }
  for (const host of new Set(ownPortal.map(supportedPortal))) {
    const list = listTowns(ownPortal.filter((t) => supportedPortal(t) === host));
    const { label } = PORTALS[host];
    parts.push({
      en: `Supported, choose the portal "${label.en}": ${list}.`,
      fr: `Compatible, choisissez le portail « ${label.fr} » : ${list}.`,
      de: `Unterstützt, wähle das Portal „${label.de ?? label.en}“: ${list}.`,
      es: `Compatible, elija el portal «${label.es ?? label.en}»: ${list}.`,
    });
  }
  if (unsupported.length > 0) {
    const list = listTowns(unsupported);
    parts.push({
      en: `Veolia portal not supported yet: ${list}.`,
      fr: `Portail Veolia pas encore pris en charge : ${list}.`,
      de: `Veolia-Portal noch nicht unterstützt: ${list}.`,
      es: `Portal de Veolia todavía no compatible: ${list}.`,
    });
  }
  if (notServed.length > 0) {
    const list = listTowns(notServed);
    parts.push({
      en: `Not served by Veolia: ${list}.`,
      fr: `Non desservie par Veolia : ${list}.`,
      de: `Nicht von Veolia versorgt: ${list}.`,
      es: `No abastecido por Veolia: ${list}.`,
    });
  }
  return joinTexts(parts, ' ');
}
