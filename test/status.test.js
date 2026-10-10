import { test } from 'node:test';
import assert from 'node:assert/strict';
import { testResult, townCheckResult } from '../src/status.js';

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
