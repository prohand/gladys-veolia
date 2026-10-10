// -----------------------------------------------------------------------------
// Veolia customer portals.
//
// Every Veolia water portal signs in through the same AWS Cognito user pool and
// reads the same backend; only the Cognito "app client" differs. Most towns use
// the national portal eau.veolia.fr; a few delegated services have their own
// (Toulouse Métropole). The client ids are public: the portal web pages send
// them from the browser.
//
// The list mirrors the community one of the Python `veolia-api` library used by
// the Home Assistant integration. A town redirected to a portal missing here
// cannot be read until its client id is added (see the docs).
// -----------------------------------------------------------------------------

export const DEFAULT_PORTAL = 'eau.veolia.fr';

export const PORTALS = {
  'eau.veolia.fr': {
    clientId: '3kghade1fg54739kj8pkbova8j',
    label: { en: 'Veolia (eau.veolia.fr)', fr: 'Veolia (eau.veolia.fr)' },
  },
  'eaudetm.monespace.eau.veolia.fr': {
    clientId: '19bjc8ldefie683n889iiubjc8',
    label: { en: 'Eau de Toulouse Métropole', fr: 'Eau de Toulouse Métropole' },
  },
};

/** The Cognito client id of a portal, the national one when unknown. */
export function clientIdOf(portal) {
  return (PORTALS[portal] ?? PORTALS[DEFAULT_PORTAL]).clientId;
}
