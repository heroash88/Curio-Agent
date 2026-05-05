#!/usr/bin/env node

/**
 * Deploy Curio to the Home Assistant addon repo.
 *
 * Usage:  node scripts/deploy-ha-addon.mjs [commit message]
 *
 * What it does:
 *   1. Builds the app (npm run build)
 *   2. Copies dist/ + addon config to the Home Assistant add-on repo
 *   3. Commits and pushes
 *
 * Expects the addon repo cloned as a sibling folder:
 *   ../curio-ha-addon  (relative to this project root)
 *
 * Override with:
 *   CURIO_HA_ADDON_REPO=/path/to/addon-repo node scripts/deploy-ha-addon.mjs
 */

import { execSync } from 'child_process';
import { cpSync, rmSync, existsSync, mkdirSync, readFileSync } from 'fs';
import { resolve, join } from 'path';

const SRC = resolve(import.meta.dirname, '..');
const DEST = process.env.CURIO_HA_ADDON_REPO
    ? resolve(process.env.CURIO_HA_ADDON_REPO)
    : resolve(SRC, '..', 'curio-ha-addon');
const CURIO = join(DEST, 'curio');

if (!existsSync(join(DEST, '.git'))) {
    console.error(`Addon repo not found at ${DEST}`);
    console.error('Clone it first, or set CURIO_HA_ADDON_REPO to your local add-on repository path.');
    process.exit(1);
}

const message = process.argv.slice(2).join(' ') || getVersionMessage();

function getVersionMessage() {
    try {
        const config = readFileSync(join(SRC, 'ha-addon', 'config.yaml'), 'utf8');
        const match = config.match(/version:\s*"?([^"\n]+)"?/);
        return match ? `v${match[1]}` : 'Update addon';
    } catch {
        return 'Update addon';
    }
}

function run(cmd, cwd = SRC) {
    console.log(`> ${cmd}`);
    execSync(cmd, { cwd, stdio: 'inherit' });
}

// Retries a command a handful of times on transient network failures
// (DNS hiccup, flaky Wi-Fi, GitHub blip). Exits clean on success.
function runWithRetry(cmd, cwd = SRC, attempts = 3, delayMs = 5000) {
    for (let i = 1; i <= attempts; i++) {
        try {
            run(cmd, cwd);
            return;
        } catch (err) {
            const isLast = i === attempts;
            if (isLast) throw err;
            console.warn(`\nAttempt ${i}/${attempts} failed: ${err.message || err}`);
            console.warn(`Retrying in ${delayMs / 1000}s...\n`);
            // Cross-platform sleep without relying on shell binaries.
            Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, delayMs);
        }
    }
}

// 1. Build
console.log('\n--- Building app ---');
run('npm run build');

// 2. Copy files
console.log('\n--- Copying to addon repo ---');

// Clean old dist from both locations (repo root and curio/)
for (const d of [join(DEST, 'dist'), join(CURIO, 'dist')]) {
    if (existsSync(d)) rmSync(d, { recursive: true, force: true });
}

// Create curio/ folder
mkdirSync(CURIO, { recursive: true });

// Copy dist/ INSIDE curio/ (HA builds from curio/ as Docker context)
cpSync(join(SRC, 'dist'), join(CURIO, 'dist'), { recursive: true });

// Copy repository.yaml to repo root
cpSync(join(SRC, 'ha-addon', 'repository.yaml'), join(DEST, 'repository.yaml'));

// Copy addon config files to curio/
const addonFiles = [
    'config.yaml', 'build.yaml', 'Dockerfile.prebuilt',
    'run.sh', 'nginx.conf', 'CHANGELOG.md', 'README.md',
    'nova-proxy-package.json', 'icon.png', 'logo.png',
];
for (const f of addonFiles) {
    const destName = f === 'Dockerfile.prebuilt' ? 'Dockerfile' : f;
    cpSync(join(SRC, 'ha-addon', f), join(CURIO, destName));
}

// Copy the Nova Sonic WebSocket proxy so the addon can run it.
// Dockerfile.prebuilt references it at ./nova-proxy.mjs (curio/ context).
cpSync(join(SRC, 'scripts', 'nova-proxy.mjs'), join(CURIO, 'nova-proxy.mjs'));

console.log('Files copied.');

// 3. Commit and push
console.log('\n--- Committing and pushing ---');
run('git add -A', DEST);

try {
    run(`git commit -m "${message}"`, DEST);
} catch {
    console.log('Nothing to commit (no changes).');
    process.exit(0);
}

runWithRetry('git push origin main', DEST);

console.log(`\nDone! Pushed: ${message}`);
