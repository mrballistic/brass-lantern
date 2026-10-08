#!/usr/bin/env node
// Release check: the version being released satisfies every internal
// dependency range, so @brass-lantern/vue 2.x never ships asking for an
// engine that the same release didn't publish.
//
//   node scripts/release-check.mjs 2.0.0

import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import semver from 'semver';

const ROOT = resolve(import.meta.dirname, '..');
const version = process.argv[2];
if (!semver.valid(version)) {
  console.error(`release-check: “${version ?? ''}” isn’t a version.`);
  process.exit(1);
}

let failures = 0;
for (const pkg of ['engine', 'server', 'vue']) {
  const manifest = JSON.parse(readFileSync(join(ROOT, 'packages', pkg, 'package.json'), 'utf8'));
  for (const field of ['dependencies', 'peerDependencies', 'optionalDependencies']) {
    for (const [dep, range] of Object.entries(manifest[field] ?? {})) {
      if (!dep.startsWith('@brass-lantern/')) continue;
      const ok = semver.satisfies(version, range);
      console.log(`${ok ? 'ok  ' : 'FAIL'} ${manifest.name} ${field}: ${dep}@${range} ${ok ? 'accepts' : 'does not accept'} ${version}`);
      if (!ok) failures += 1;
    }
  }
}
process.exit(failures === 0 ? 0 : 1);
