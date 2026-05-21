import { readFile } from 'node:fs/promises';
import test from 'node:test';
import assert from 'node:assert/strict';

const appSource = new URL('../public/app.js', import.meta.url);

test('job details dialog wires Generate Package to the package generator', async () => {
  const source = await readFile(appSource, 'utf8');

  assert.match(source, /data-generate-package-job="\$\{job\.id\}"/);
  assert.match(source, /generatePackage\(button\.dataset\.generatePackageJob,\s*button\)/);
});
