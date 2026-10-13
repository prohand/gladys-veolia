// Checks that every multi-language object of a value (a message, a widget
// content...) carries every language of the Gladys UI.

import assert from 'node:assert/strict';
import { LANGUAGES } from '../../src/status.js';

export function assertAllLanguages(node, path = 'value') {
  if (Array.isArray(node)) {
    node.forEach((child, i) => assertAllLanguages(child, `${path}[${i}]`));
  } else if (node && typeof node === 'object') {
    if (typeof node.en === 'string') {
      assert.deepEqual(Object.keys(node).sort(), [...LANGUAGES].sort(), `${path} languages`);
      for (const lang of LANGUAGES) {
        assert.ok(node[lang].trim().length > 0, `${path}.${lang} is empty`);
      }
    } else {
      for (const [key, child] of Object.entries(node)) {
        assertAllLanguages(child, `${path}.${key}`);
      }
    }
  }
}
