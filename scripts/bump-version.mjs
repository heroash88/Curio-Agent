#!/usr/bin/env node

/**
 * Patch-bump the Curio version across the files that matter for a release.
 *
 * Source of truth: ha-addon/config.yaml `version:` field.
 * Propagates to:
 *   - package.json `version`
 *   - ha-addon/build.yaml `io.hass.version`
 *   - ha-addon/Dockerfile* `BUILD_VERSION`
 *   - ha-addon/CHANGELOG.md (prepends a new heading)
 *
 * Usage:
 *   node scripts/bump-version.mjs              # patch bump (1.3.1 -> 1.3.2)
 *   node scripts/bump-version.mjs minor        # minor bump (1.3.1 -> 1.4.0)
 *   node scripts/bump-version.mjs major        # major bump (1.3.1 -> 2.0.0)
 *   node scripts/bump-version.mjs 1.5.0        # explicit version
 *
 * Prints the new version to stdout so callers can capture it:
 *   VERSION=$(node scripts/bump-version.mjs)
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { resolve } from 'path';

const ROOT = resolve(import.meta.dirname, '..');
const CONFIG = resolve(ROOT, 'ha-addon', 'config.yaml');
const PACKAGE = resolve(ROOT, 'package.json');
const PACKAGE_LOCK = resolve(ROOT, 'package-lock.json');
const CHANGELOG = resolve(ROOT, 'ha-addon', 'CHANGELOG.md');
const BUILD = resolve(ROOT, 'ha-addon', 'build.yaml');
const DOCKERFILES = [
  resolve(ROOT, 'ha-addon', 'Dockerfile'),
  resolve(ROOT, 'ha-addon', 'Dockerfile.prebuilt'),
];

const arg = process.argv[2] || 'patch';

const readConfigVersion = () => {
  const text = readFileSync(CONFIG, 'utf8');
  const match = text.match(/^version:\s*"?([^"\n]+)"?\s*$/m);
  if (!match) throw new Error('Could not find version in ha-addon/config.yaml');
  return { text, current: match[1].trim() };
};

const writeConfigVersion = (text, next) => {
  const updated = text.replace(
    /^(version:\s*)"?[^"\n]+"?\s*$/m,
    `$1"${next}"`,
  );
  writeFileSync(CONFIG, updated, 'utf8');
};

const syncPackageVersion = (next) => {
  if (!existsSync(PACKAGE)) return;
  const pkg = JSON.parse(readFileSync(PACKAGE, 'utf8'));
  if (pkg.version === next) return;
  pkg.version = next;
  // Preserve a trailing newline to match Prettier's default + git's expectations.
  writeFileSync(PACKAGE, JSON.stringify(pkg, null, 2) + '\n', 'utf8');
};

const syncPackageLockVersion = (next) => {
  if (!existsSync(PACKAGE_LOCK)) return;
  const lock = JSON.parse(readFileSync(PACKAGE_LOCK, 'utf8'));
  let dirty = false;
  if (lock.version !== next) {
    lock.version = next;
    dirty = true;
  }
  if (lock.packages && lock.packages[''] && lock.packages[''].version !== next) {
    lock.packages[''].version = next;
    dirty = true;
  }
  if (!dirty) return;
  writeFileSync(PACKAGE_LOCK, JSON.stringify(lock, null, 2) + '\n', 'utf8');
};

const syncBuildMetadataVersion = (next) => {
  if (existsSync(BUILD)) {
    const build = readFileSync(BUILD, 'utf8');
    const updated = build.replace(
      /^(\s*io\.hass\.version:\s*)"?[^"\n]+"?\s*$/m,
      `$1"${next}"`,
    );
    writeFileSync(BUILD, updated, 'utf8');
  }

  for (const dockerfile of DOCKERFILES) {
    if (!existsSync(dockerfile)) continue;
    const current = readFileSync(dockerfile, 'utf8');
    const updated = current.replace(
      /^ARG BUILD_VERSION=[^\n]+$/gm,
      `ARG BUILD_VERSION=${next}`,
    );
    writeFileSync(dockerfile, updated, 'utf8');
  }
};

const prependChangelogEntry = (next) => {
  if (!existsSync(CHANGELOG)) return;
  const current = readFileSync(CHANGELOG, 'utf8');
  const date = new Date().toISOString().slice(0, 10);
  const entry = `## v${next} -- ${date}\n\n- Automated release bump.\n\n`;
  // Insert after the first top-level heading if one exists, otherwise prepend.
  const heading = current.match(/^#\s.+\n/);
  if (heading) {
    const after = heading[0].length;
    writeFileSync(
      CHANGELOG,
      current.slice(0, after) + '\n' + entry + current.slice(after).replace(/^\n+/, ''),
      'utf8',
    );
  } else {
    writeFileSync(CHANGELOG, `# Changelog\n\n${entry}${current}`, 'utf8');
  }
};

const computeNext = (current, bump) => {
  if (/^\d+\.\d+\.\d+$/.test(bump)) return bump; // explicit version
  const [maj, min, pat] = current.split('.').map(Number);
  if (bump === 'major') return `${maj + 1}.0.0`;
  if (bump === 'minor') return `${maj}.${min + 1}.0`;
  return `${maj}.${min}.${pat + 1}`;
};

const { text, current } = readConfigVersion();
const next = computeNext(current, arg);

if (next === current) {
  // Nothing to do -- caller may have passed the same explicit version.
  process.stdout.write(next);
  process.exit(0);
}

writeConfigVersion(text, next);
syncPackageVersion(next);
syncPackageLockVersion(next);
syncBuildMetadataVersion(next);
prependChangelogEntry(next);

// Single line of stdout = the new version, so shells can capture it cleanly.
process.stdout.write(next);
