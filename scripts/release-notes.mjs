#!/usr/bin/env node
// Release notes: prints the GitHub Release body for a version, from that
// version's CHANGELOG.md section plus a line naming the packages on npm.
// Fails if the CHANGELOG has no section for the version, or an empty one, so
// the release workflow can check it before publishing anything.
//
//   node scripts/release-notes.mjs 2.3.2 > notes.md

import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import semver from 'semver';

const ROOT = resolve(import.meta.dirname, '..');
const version = process.argv[2];
if (!semver.valid(version)) {
  console.error(`release-notes: “${version ?? ''}” isn’t a version.`);
  process.exit(1);
}

// A section runs from its `## <version>` heading to the next `## ` heading.
const lines = readFileSync(join(ROOT, 'CHANGELOG.md'), 'utf8').split('\n');
// Compared as text, not a RegExp: a version can hold `+` (build metadata).
const heading = `## ${version}`;
const start = lines.findIndex((line) => line === heading || line.startsWith(`${heading} `));
if (start === -1) {
  console.error(`release-notes: CHANGELOG.md has no “## ${version}” section.`);
  process.exit(1);
}
const rest = lines.slice(start + 1);
const end = rest.findIndex((line) => line.startsWith('## '));
const body = (end === -1 ? rest : rest.slice(0, end)).join('\n').trim();
if (body === '') {
  console.error(`release-notes: the “## ${version}” section of CHANGELOG.md is empty.`);
  process.exit(1);
}

// The order earlier releases used.
const names = ['engine', 'vue', 'server', 'mcp'].map(
  (dir) => `\`${JSON.parse(readFileSync(join(ROOT, 'packages', dir, 'package.json'), 'utf8')).name}\``,
);
const list = `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`;

process.stdout.write(`${body}\n\nOn npm: ${list} ${version}.\n`);
