import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rollChangelog } from '../.github/scripts/changelog-release.mjs';

const REPO = 'https://github.com/prohand/gladys-veolia';

test('the first release moves Unreleased under the version and links its tag', () => {
  const before = `# Changelog\n\n## [Unreleased]\n\n### Added\n\n- First version.\n\n[Unreleased]: ${REPO}/commits/main\n`;
  const after = rollChangelog(before, '1.0.0', '2026-10-10');
  assert.match(
    after,
    /## \[Unreleased\]\n\n## \[1\.0\.0\] - 2026-10-10\n\n### Added\n\n- First version\./,
  );
  assert.match(after, new RegExp(`\\[Unreleased\\]: ${REPO}/compare/v1\\.0\\.0\\.\\.\\.HEAD`));
  assert.match(after, new RegExp(`\\[1\\.0\\.0\\]: ${REPO}/releases/tag/v1\\.0\\.0`));
});

test('a later release compares with the previous tag', () => {
  const before = `## [Unreleased]\n\n- Fix.\n\n## [1.0.0] - 2026-10-10\n\n- First.\n\n[Unreleased]: ${REPO}/compare/v1.0.0...HEAD\n`;
  const after = rollChangelog(before, '1.0.1', '2026-10-11');
  assert.match(after, /## \[1\.0\.1\] - 2026-10-11\n\n- Fix\./);
  assert.match(after, new RegExp(`\\[1\\.0\\.1\\]: ${REPO}/compare/v1\\.0\\.0\\.\\.\\.v1\\.0\\.1`));
});

test('an empty Unreleased section still writes the version, and a re-run changes nothing', () => {
  const before = `## [Unreleased]\n\n[Unreleased]: ${REPO}/commits/main\n`;
  const after = rollChangelog(before, '1.0.0', '2026-10-10');
  assert.match(after, /Maintenance release/);
  assert.equal(rollChangelog(after, '1.0.0', '2026-10-10'), after);
});
