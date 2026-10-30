// -----------------------------------------------------------------------------
// Veolia customer portals.
//
// Every Veolia water portal signs in through the same AWS Cognito user pool and
// reads the same backend; only the Cognito "app client" differs. Most towns use
// the national portal eau.veolia.fr; delegated services have their own (Toulouse
// Métropole, Vendée Eau, C Mon O...). The client ids are public: one web bundle
// serves every portal and holds them all (`cognitoUserpool<Portal>ClientId`,
// next to each portal's production host).
//
// The key is the host the town lookup redirects to (`url_redirection`), so
// "Check my town" can name the portal to choose. A town redirected to a portal
// missing here cannot be read until its client id is added (see the docs).
// -----------------------------------------------------------------------------

export const DEFAULT_PORTAL = 'eau.veolia.fr';

/** A portal name, a brand: the same in every language. */
function named(name) {
  return { en: name, fr: name, de: name, es: name };
}

export const PORTALS = {
  'eau.veolia.fr': {
    clientId: '3kghade1fg54739kj8pkbova8j',
    label: named('Veolia (eau.veolia.fr)'),
  },
  'atlantic-eau.monespace.eau.veolia.fr': {
    clientId: '91a3v5b3pef8cjbb3s0pdrnm2',
    label: named("Atlantic'Eau"),
  },
  'c-mon-o.monespace.eau.veolia.fr': {
    clientId: '6vut9c2gvaeoeaf9ac7dr0i3jn',
    label: named('C Mon O'),
  },
  'eaudelacall.monespace.eau.veolia.fr': {
    clientId: '60di3vchcr6e5mk8iolbm14pn9',
    label: named('Calléo'),
  },
  'eaudetm.monespace.eau.veolia.fr': {
    clientId: '19bjc8ldefie683n889iiubjc8',
    label: named('Eau de Toulouse Métropole'),
  },
  'coquelicot.monespace.eau.veolia.fr': {
    clientId: '690v5rk3r5mmo4830quptunplf',
    label: named('Eau du Coquelicot'),
  },
  'eaux-de-dinan.monespace.eau.veolia.fr': {
    clientId: '60ou1e3jfbtfo5a5duucf6vu64',
    label: named('Eaux de Dinan'),
  },
  'nantes-metropole.monespace.eau.veolia.fr': {
    clientId: '5a4d8q7puddbgli4d2t62f5rh2',
    label: named('Nantes Métropole'),
  },
  'odici.monespace.eau.veolia.fr': {
    clientId: '3nf1o8d5bdf243l71m4gb60bg0',
    label: named('Odici'),
  },
  'brivalsmaepob.monespace.eau.veolia.fr': {
    clientId: '4bdk3i8pq1ibpva1cahdsgbigm',
    label: named('SMAEP Ouest Briard'),
  },
  'sobass.monespace.eau.veolia.fr': {
    clientId: '433kr2k9n661mnvr0io3g3a3vb',
    label: named('Sobass'),
  },
  'valyo.monespace.eau.veolia.fr': {
    clientId: 'r8eglfhksjhp6v1b0qehbb375',
    label: named('Valyo'),
  },
  // Not under monespace.eau.veolia.fr: the department number is in the host.
  'monespace85.eau.veolia.fr': {
    clientId: '55q97ufu391iajd22q9ed5qabe',
    label: named('Vendée Eau'),
  },
};

/** The Cognito client id of a portal, the national one when unknown. */
export function clientIdOf(portal) {
  return (PORTALS[portal] ?? PORTALS[DEFAULT_PORTAL]).clientId;
}
