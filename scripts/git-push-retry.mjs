#!/usr/bin/env node

/**
 * Run `git push <args>` with a handful of retries on transient network errors.
 * Used by the Curio deploy hooks to survive DNS hiccups and flaky Wi-Fi.
 *
 * Usage:  node scripts/git-push-retry.mjs [remote] [branch]
 *         node scripts/git-push-retry.mjs origin main
 */

import { execSync } from 'child_process';

const args = process.argv.slice(2);
const remote = args[0] || 'origin';
const branch = args[1] || 'main';
const ATTEMPTS = 3;
const DELAY_MS = 5000;

for (let i = 1; i <= ATTEMPTS; i++) {
    try {
        console.log(`> git push ${remote} ${branch}  (attempt ${i}/${ATTEMPTS})`);
        execSync(`git push ${remote} ${branch}`, { stdio: 'inherit' });
        process.exit(0);
    } catch (err) {
        if (i === ATTEMPTS) {
            console.error(`\nPush failed after ${ATTEMPTS} attempts.`);
            process.exit(err.status || 1);
        }
        console.warn(`\nAttempt ${i} failed. Retrying in ${DELAY_MS / 1000}s...\n`);
        // Cross-platform sleep without relying on shell binaries.
        Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, DELAY_MS);
    }
}
