// -----------------------------------------------------------------------------
// User-facing messages: the connection status of the Configuration screen and
// the answers of the manifest actions. Bilingual, like every text the user
// reads. Never echo the password, nor the full e-mail address.
// -----------------------------------------------------------------------------

import { PORTALS } from './veolia/portals.js';

export const MESSAGES = {
  notConfigured: {
    en: 'Enter the e-mail and password of your Veolia customer account.',
    fr: 'Indiquez l’e-mail et le mot de passe de votre espace client Veolia.',
  },
  authFailed: {
    en: 'Veolia refused the e-mail or the password. Check them by signing in on the Veolia website.',
    fr: 'Veolia a refusé l’e-mail ou le mot de passe. Vérifiez-les en vous connectant sur le site Veolia.',
  },
  noSubscription: {
    en: 'Signed in, but the account has no active water subscription.',
    fr: 'Connecté, mais le compte n’a aucun abonnement eau actif.',
  },
};

export function unreachable(detail) {
  return {
    en: `Cannot read the Veolia portal (${detail}). Next try at the next refresh.`,
    fr: `Impossible de lire le portail Veolia (${detail}). Nouvel essai au prochain rafraîchissement.`,
  };
}

export function gladysFailed(detail) {
  return {
    en: `Veolia data read, but Gladys refused it (${detail}). Next try at the next refresh.`,
    fr: `Données Veolia lues, mais Gladys les a refusées (${detail}). Nouvel essai au prochain rafraîchissement.`,
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
      };
    }
    const index = summary.indexM3 === null ? '' : `, index ${summary.indexM3} m³`;
    return {
      en: `Meter ${subscription.meter}: ${last.liters} L on ${last.date}${index}.`,
      fr: `Compteur ${subscription.meter} : ${last.liters} L le ${last.date}${index}.`,
    };
  });
  return {
    en: `Connected. ${lines.map((l) => l.en).join(' ')}`,
    fr: `Connecté. ${lines.map((l) => l.fr).join(' ')}`,
  };
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

  const en = [];
  const fr = [];
  if (national.length > 0) {
    en.push(`Supported, portal eau.veolia.fr: ${listTowns(national)}.`);
    fr.push(`Compatible, portail eau.veolia.fr : ${listTowns(national)}.`);
  }
  for (const host of new Set(ownPortal.map(supportedPortal))) {
    const list = listTowns(ownPortal.filter((t) => supportedPortal(t) === host));
    en.push(`Supported, choose the portal "${PORTALS[host].label.en}": ${list}.`);
    fr.push(`Compatible, choisissez le portail « ${PORTALS[host].label.fr} » : ${list}.`);
  }
  if (unsupported.length > 0) {
    en.push(`Veolia portal not supported yet: ${listTowns(unsupported)}.`);
    fr.push(`Portail Veolia pas encore pris en charge : ${listTowns(unsupported)}.`);
  }
  if (notServed.length > 0) {
    en.push(`Not served by Veolia: ${listTowns(notServed)}.`);
    fr.push(`Non desservie par Veolia : ${listTowns(notServed)}.`);
  }
  return { en: en.join(' '), fr: fr.join(' ') };
}
