// -----------------------------------------------------------------------------
// Consistency checks between `gladys-assistant-integration.json` and the code.
// The manifest is validated by the store indexer, but nothing there can know
// which handlers the code actually registers — these tests keep both in sync.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { DEFAULT_CONFIG } from '../src/config.js';
import { SCENE_ACTIONS } from '../src/scenes.js';
import { TRIGGERS } from '../src/sync.js';
import { CHART_DAYS, DEFAULT_CHART_DAYS, WIDGETS } from '../src/widgets.js';
import { PERIODS } from '../src/veolia/consumption.js';
import { PORTALS } from '../src/veolia/portals.js';

const manifest = JSON.parse(
  await readFile(new URL('../gladys-assistant-integration.json', import.meta.url), 'utf8'),
);
const pkg = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
const indexSource = await readFile(new URL('../index.js', import.meta.url), 'utf8');

// Every list of form fields the manifest can declare (same field grammar).
const allFields = [
  ...(manifest.config_schema ?? []),
  ...[
    ...(manifest.actions ?? []),
    ...(manifest.scene_triggers ?? []),
    ...(manifest.scene_actions ?? []),
  ].flatMap((item) => [...(item.fields ?? []), ...(item.variables ?? []), ...(item.outputs ?? [])]),
  ...(manifest.widgets ?? []).flatMap((widget) => widget.settings ?? []),
];

const CAPABILITY_FIELDS = ['scene_triggers', 'scene_actions', 'widgets'];
const CAPABILITY_MIN_GLADYS_VERSION = [5, 1, 0];

const keysOf = (list) => (list ?? []).map((entry) => entry.key).sort();
const fieldOf = (list, key) => list.find((f) => f.key === key);

function minGladysVersion() {
  const match = manifest.gladys_version.match(/>=\s*(\d+)\.(\d+)\.(\d+)/);
  assert.ok(match, 'gladys_version must declare a minimum version');
  return match.slice(1).map(Number);
}

function isAtLeast(version, required) {
  for (let i = 0; i < required.length; i += 1) {
    if (version[i] !== required[i]) {
      return version[i] > required[i];
    }
  }
  return true;
}

test('every manifest action has a handler registered in index.js, and vice versa', () => {
  const registered = [...indexSource.matchAll(/gladys\.onAction\('([a-z0-9_]+)'/g)].map(
    (m) => m[1],
  );
  assert.deepEqual(registered.sort(), keysOf(manifest.actions));
});

test('scene actions, scene triggers and widgets match the code', () => {
  assert.deepEqual(keysOf(manifest.scene_actions), Object.keys(SCENE_ACTIONS).sort());
  assert.deepEqual(keysOf(manifest.scene_triggers), Object.values(TRIGGERS).sort());
  assert.deepEqual(keysOf(manifest.widgets), Object.keys(WIDGETS).sort());
  assert.ok(manifest.widgets.length <= 5, 'at most 5 widgets');
});

test('the capability fields require Gladys >= 5.1.0', () => {
  for (const field of CAPABILITY_FIELDS) {
    assert.ok(manifest[field]?.length > 0, `${field} is declared`);
  }
  assert.ok(
    isAtLeast(minGladysVersion(), CAPABILITY_MIN_GLADYS_VERSION),
    `scene and widget fields require gladys_version >= 5.1.0, got "${manifest.gladys_version}"`,
  );
});

// The store vocabulary of catalog shelves (Gladys 5.3 added the last four).
const CATALOG_CATEGORIES = [
  'climate',
  'lighting',
  'energy',
  'security',
  'multimedia',
  'appliances',
  'environment',
  'protocols',
  'network',
  'notifications',
  'assistants',
  'services',
  'transport',
  'vehicles',
  'servers',
  'leisure',
];

test('catalog categories: 1 to 3 unique keys of the store vocabulary', () => {
  assert.ok(manifest.categories.length >= 1 && manifest.categories.length <= 3);
  assert.equal(new Set(manifest.categories).size, manifest.categories.length);
  for (const category of manifest.categories) {
    assert.ok(CATALOG_CATEGORIES.includes(category), `unknown category "${category}"`);
  }
});

test('keywords, countries and music require Gladys >= 5.3.0', () => {
  // An older core rejects any manifest field it does not know.
  if (manifest.keywords || manifest.countries || manifest.music) {
    assert.ok(
      isAtLeast(minGladysVersion(), [5, 3, 0]),
      `keywords and countries require gladys_version >= 5.3.0, got "${manifest.gladys_version}"`,
    );
  }
});

test('search keywords: 1 to 10 unique strings of 2 to 30 characters', () => {
  const { keywords } = manifest;
  assert.ok(Array.isArray(keywords) && keywords.length >= 1 && keywords.length <= 10);
  const normalized = keywords.map((keyword) => keyword.trim().toLowerCase());
  assert.equal(new Set(normalized).size, keywords.length, 'keywords must be unique');
  for (const keyword of normalized) {
    assert.ok(keyword.length >= 2 && keyword.length <= 30, `keyword "${keyword}"`);
  }
});

test('the integration is listed for France only', () => {
  // The Veolia water portals read here are the French ones.
  assert.deepEqual(manifest.countries, ['FR']);
});

test('the manifest declares the cloud transport only', () => {
  // The data comes from the Veolia web portal: no local channel, no toggle.
  assert.deepEqual(manifest.transports, ['cloud']);
});

test('select options match the code', () => {
  const portal = fieldOf(manifest.config_schema, 'portal');
  assert.deepEqual(portal.options.map((o) => o.value).sort(), Object.keys(PORTALS).sort());
  for (const option of portal.options) {
    assert.deepEqual(option.label, PORTALS[option.value].label, option.value);
  }

  const period = fieldOf(fieldOf(manifest.scene_actions, 'get_consumption').fields, 'period');
  assert.deepEqual(period.options.map((o) => o.value).sort(), Object.values(PERIODS).sort());

  const days = fieldOf(fieldOf(manifest.widgets, 'water_consumption').settings, 'days');
  assert.deepEqual(
    days.options.map((o) => Number(o.value)),
    CHART_DAYS,
  );
  assert.equal(Number(days.default), DEFAULT_CHART_DAYS);
});

test('the password is a secret field', () => {
  assert.equal(fieldOf(manifest.config_schema, 'password').type, 'secret');
});

test('config_schema defaults stay consistent with DEFAULT_CONFIG', () => {
  const keys = manifest.config_schema.filter((f) => f.type !== 'section').map((f) => f.key);
  assert.deepEqual(keys.sort(), Object.keys(DEFAULT_CONFIG).sort());
  for (const field of manifest.config_schema) {
    if (field.default !== undefined) {
      assert.equal(DEFAULT_CONFIG[field.key], field.default, `DEFAULT_CONFIG.${field.key}`);
    }
  }
});

test('section fields are purely presentational', () => {
  for (const section of manifest.config_schema.filter((f) => f.type === 'section')) {
    assert.equal(section.required, undefined, `section "${section.key}" must not be required`);
    assert.equal(section.default, undefined, `section "${section.key}" must not have a default`);
    assert.equal(section.placeholder, undefined, `section "${section.key}": no placeholder`);
    for (const link of section.links ?? []) {
      assert.match(link.url, /^https:\/\//, 'section links must be https');
    }
  }
});

test('the manifest version is the package version, and the image is tagged with it', () => {
  assert.equal(manifest.version, pkg.version, 'manifest version must match package.json');
  assert.ok(
    manifest.docker_image.endsWith(`:${manifest.version}`),
    `docker_image must be tagged :${manifest.version}, got "${manifest.docker_image}"`,
  );
});

test('the catalog description holds 10 to 100 characters per language', () => {
  assert.ok(manifest.description.en, 'the description needs an English text');
  for (const [lang, text] of Object.entries(manifest.description)) {
    assert.ok(
      text.length >= 10 && text.length <= 100,
      `description.${lang} has ${text.length} characters (10 to 100 allowed)`,
    );
  }
});

const LANGUAGES = ['en', 'fr', 'de', 'es'];

// Every multi-language object of the manifest, wherever it sits (labels,
// descriptions, placeholders, option and link labels...), with its path.
function multiLanguageTexts(node, path = 'manifest', found = []) {
  if (Array.isArray(node)) {
    node.forEach((child, i) => multiLanguageTexts(child, `${path}[${i}]`, found));
  } else if (node && typeof node === 'object') {
    if (typeof node.en === 'string') {
      found.push({ path, text: node });
    } else {
      for (const [key, child] of Object.entries(node)) {
        multiLanguageTexts(child, `${path}.${key}`, found);
      }
    }
  }
  return found;
}

test('every text is in English, French, German and Spanish, placeholders included', () => {
  const items = [
    ...allFields,
    ...(manifest.actions ?? []),
    ...(manifest.scene_triggers ?? []),
    ...(manifest.scene_actions ?? []),
    ...(manifest.widgets ?? []),
  ];
  for (const item of items) {
    for (const key of ['label', 'description', 'placeholder']) {
      if (item[key] !== undefined) {
        assert.equal(typeof item[key], 'object', `"${item.key}": ${key}`);
      }
    }
  }
  const texts = multiLanguageTexts(manifest);
  assert.ok(texts.length > 50, 'the walk found the texts');
  for (const { path, text } of texts) {
    assert.deepEqual(Object.keys(text).sort(), [...LANGUAGES].sort(), `${path} languages`);
    for (const lang of LANGUAGES) {
      assert.ok(text[lang].trim().length > 0, `${path}.${lang} is empty`);
    }
  }
});

test('texts respect the store length limits in every language', () => {
  const within = (text, min, max, path) => {
    for (const [lang, value] of Object.entries(text)) {
      assert.ok(
        value.length >= min && value.length <= max,
        `${path}.${lang} has ${value.length} characters (${min} to ${max} allowed)`,
      );
    }
  };
  for (const widget of manifest.widgets) {
    within(widget.label, 3, 30, `widgets.${widget.key}.label`);
    within(widget.description, 0, 100, `widgets.${widget.key}.description`);
  }
  for (const section of manifest.config_schema.filter((f) => f.type === 'section')) {
    within(section.description, 0, 1000, `config_schema.${section.key}.description`);
  }
});
