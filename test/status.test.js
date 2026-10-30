import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  MESSAGES,
  gladysFailed,
  joinTexts,
  testResult,
  townCheckResult,
  unreachable,
} from '../src/status.js';
import { assertAllLanguages } from './helpers/languages.js';

test('Metz is on the national portal', () => {
  const message = townCheckResult('57000', [
    { name: 'METZ', type: 'NON_REDIRIGE', redirect: null },
    { name: 'METZ (BORNY)', type: 'NON_REDIRIGE', redirect: null },
  ]);
  assert.match(message.fr, /Compatible, portail eau\.veolia\.fr : METZ, METZ \(BORNY\)\./);
  assert.match(message.en, /Supported/);
});

test('Toulouse is redirected to a supported portal', () => {
  const message = townCheckResult('31000', [
    {
      name: 'TOULOUSE',
      type: 'REDIRIGE',
      redirect: 'https://eaudetm.monespace.eau.veolia.fr?numero_commune=26219',
    },
  ]);
  assert.match(message.fr, /Eau de Toulouse Métropole/);
});

test('La Roche-sur-Yon is redirected to Vendée Eau, outside monespace', () => {
  // As the town lookup answered on 2026-10-30.
  const message = townCheckResult('85000', [
    {
      name: 'LA ROCHE SUR YON',
      type: 'REDIRIGE',
      redirect: 'https://monespace85.eau.veolia.fr?numero_commune=21443&numero_quartier=0',
    },
  ]);
  assert.match(message.fr, /choisissez le portail « Vendée Eau » : LA ROCHE SUR YON\./);
});

test('unsupported portals and towns not served are told apart', () => {
  const message = townCheckResult('99999', [
    { name: 'A', type: 'REDIRIGE', redirect: 'https://other.example.fr' },
    { name: 'B', type: 'NON_DESSERVIE', redirect: null },
  ]);
  assert.match(message.en, /not supported yet: A\./);
  assert.match(message.en, /Not served by Veolia: B\./);
});

test('no town for a postal code', () => {
  assert.match(townCheckResult('00000', []).fr, /Aucune commune/);
});

test('long town lists are cut', () => {
  const towns = Array.from({ length: 12 }, (_, i) => ({
    name: `T${i}`,
    type: 'NON_REDIRIGE',
    redirect: null,
  }));
  assert.match(townCheckResult('01000', towns).en, /T7…/);
});

test('testResult describes each meter', () => {
  const message = testResult([
    {
      subscription: { meter: 'M1' },
      summary: { lastReading: { date: '2026-10-08', liters: 120 }, indexM3: 400.5 },
    },
    { subscription: { meter: 'M2' }, summary: { lastReading: null, indexM3: null } },
  ]);
  assert.equal(
    message.fr,
    'Connecté. Compteur M1 : 120 L le 2026-10-08, index 400.5 m³. Compteur M2 : aucun relevé pour l’instant.',
  );
});

test('every message is in English, French, German and Spanish', () => {
  assertAllLanguages(MESSAGES, 'MESSAGES');
  assertAllLanguages(unreachable('timeout'), 'unreachable');
  assertAllLanguages(gladysFailed('429'), 'gladysFailed');
  assertAllLanguages(
    testResult([{ subscription: { meter: 'M1' }, summary: { lastReading: null, indexM3: null } }]),
    'testResult',
  );
  assertAllLanguages(townCheckResult('00000', []), 'townCheckResult (none)');
  const message = townCheckResult('31000', [
    { name: 'A', type: 'NON_REDIRIGE', redirect: null },
    { name: 'B', type: 'REDIRIGE', redirect: 'https://eaudetm.monespace.eau.veolia.fr' },
    { name: 'C', type: 'REDIRIGE', redirect: 'https://other.example.fr' },
    { name: 'D', type: 'AUTRE', redirect: null },
  ]);
  assertAllLanguages(message, 'townCheckResult');
  assert.match(message.de, /Unterstützt, wähle das Portal „Eau de Toulouse Métropole“: B\./);
  assert.match(message.es, /No abastecido por Veolia: D\./);
});

test('joinTexts joins language by language, falling back to English', () => {
  assert.deepEqual(joinTexts([{ en: 'A', fr: 'B', de: 'C', es: 'D' }, { en: 'E' }], ' '), {
    en: 'A E',
    fr: 'B E',
    de: 'C E',
    es: 'D E',
  });
});
