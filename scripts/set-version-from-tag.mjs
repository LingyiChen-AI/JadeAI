// CI only: make package.json's version match the tag being released.
//
// electron-builder puts package.json's version into every installer filename, so
// without this a release tagged ds-v0.0.1 ships files called JadeAI-0.1.0-*.dmg
// and nobody can tell which build a file came from. The tag is the single source
// of truth; the working tree's version is only a placeholder between releases.
//
// The tag is read from GITHUB_REF_NAME rather than argv because this runs on
// three platforms and the default shell differs (bash on macOS, pwsh on
// Windows) — an env var needs no quoting that works in both.
import { readFileSync, writeFileSync } from 'node:fs';

const PACKAGE_JSON = 'package.json';
const tag = process.env.GITHUB_REF_NAME ?? '';

// Accepts v1.2.3 and the legacy ds-v1.2.3, plus a prerelease suffix. Same shape
// as parseReleaseTag in electron/main/update-check.ts — the client compares the
// version this writes against those tags, so the two must agree on what a
// release tag looks like.
const match = /^(?:ds-)?v(\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?)$/.exec(tag);
if (match === null) {
  console.error(`Not a release tag: ${JSON.stringify(tag)}`);
  process.exit(1);
}

const version = match[1];
const pkg = JSON.parse(readFileSync(PACKAGE_JSON, 'utf-8'));

if (pkg.version === version) {
  console.log(`package.json version is already ${version}`);
  process.exit(0);
}

const previous = pkg.version;
pkg.version = version;
// Reformatting is fine: this edit lives and dies inside the CI checkout and is
// never committed.
writeFileSync(PACKAGE_JSON, `${JSON.stringify(pkg, null, 2)}\n`);
console.log(`package.json version ${previous} -> ${version} (from tag ${tag})`);
