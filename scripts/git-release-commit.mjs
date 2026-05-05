#!/usr/bin/env node

/**
 * Stage all changes and create a "Release vX.Y.Z" commit using the version
 * from ha-addon/config.yaml. Exits clean when there's nothing to commit.
 *
 * Used by .kiro/hooks/deploy-github-main.kiro.hook.
 */

import { execSync } from 'child_process';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const ROOT = resolve(import.meta.dirname, '..');

const configPath = resolve(ROOT, 'ha-addon', 'config.yaml');
const configText = readFileSync(configPath, 'utf8');
const match = configText.match(/^version:\s*"?([^"\n]+)"?\s*$/m);
if (!match) {
    console.error('Could not parse version from ha-addon/config.yaml');
    process.exit(1);
}
const version = match[1].trim();

try {
    execSync('git add -A', { stdio: 'inherit', cwd: ROOT });
} catch (err) {
    console.error('git add failed');
    process.exit(err.status || 1);
}

// Check if there is anything staged -- `git diff --cached --quiet` exits
// non-zero when there are staged changes, zero when clean.
let hasStaged = false;
try {
    execSync('git diff --cached --quiet', { cwd: ROOT });
} catch {
    hasStaged = true;
}

if (!hasStaged) {
    console.log('Nothing to commit.');
    process.exit(0);
}

try {
    execSync(`git commit -m "Release v${version}" --no-verify`, {
        stdio: 'inherit',
        cwd: ROOT,
    });
} catch (err) {
    console.error('git commit failed');
    process.exit(err.status || 1);
}
