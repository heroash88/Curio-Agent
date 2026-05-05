#!/usr/bin/env node

/**
 * Full release: bump version, commit, push, then create + push a `v<version>`
 * git tag so the GitHub Actions release workflow can pick it up and publish
 * installers to the Releases page.
 *
 * Usage:  node scripts/release.mjs [patch|minor|major|x.y.z]
 *
 * The HA add-on deploy step is intentionally decoupled: we used to chain it
 * here, but tag-triggered release builds should not require an HA deploy to
 * succeed. Run `node scripts/deploy-ha-addon.mjs` separately when needed.
 */

import { execSync } from "child_process";
import { readFileSync } from "fs";
import { resolve } from "path";

const ROOT = resolve(import.meta.dirname, "..");

function run(cmd, cwd = ROOT) {
    console.log(`> ${cmd}`);
    execSync(cmd, { cwd, stdio: "inherit" });
}

function runCapture(cmd, cwd = ROOT) {
    console.log(`> ${cmd}`);
    return execSync(cmd, { cwd }).toString().trim();
}

const bump = process.argv[2] || "patch";

// 1. Bump version
run(`node scripts/bump-version.mjs ${bump}`);

// Read the new version from the source of truth.
const config = readFileSync(resolve(ROOT, "ha-addon", "config.yaml"), "utf8");
const match = config.match(/version:\s*"?([^"\n]+)"?/);
const version = match ? match[1].trim() : "unknown";
console.log(`\nVersion: ${version}\n`);

const tag = `v${version}`;

// 2. Commit the bump.
run("git add -A");
try {
    run(`git commit -m "Release ${tag}"`);
} catch {
    console.log("Nothing to commit in main repo.");
}

// 3. Push the branch (3 retries for flaky networks).
for (let i = 1; i <= 3; i++) {
    try {
        run("git push origin main");
        break;
    } catch (err) {
        if (i === 3) throw err;
        console.warn(`Push attempt ${i}/3 failed, retrying in 5s...`);
        Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 5000);
    }
}

// 4. Tag and push the tag. This triggers .github/workflows/release.yml.
const existingTags = runCapture("git tag --list").split("\n");
if (existingTags.includes(tag)) {
    console.warn(
        `Tag ${tag} already exists locally; delete it with "git tag -d ${tag}" and rerun if you meant to retag.`,
    );
} else {
    run(`git tag -a ${tag} -m "Release ${tag}"`);
}

for (let i = 1; i <= 3; i++) {
    try {
        run(`git push origin ${tag}`);
        break;
    } catch (err) {
        if (i === 3) throw err;
        console.warn(`Tag push attempt ${i}/3 failed, retrying in 5s...`);
        Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 5000);
    }
}

console.log(`\nDone! Released ${tag}.`);
console.log(
    `GitHub Actions is now building installers for macOS, Windows, and Linux. Watch progress at:`,
);
console.log(`  https://github.com/heroash88/Curio-Robot/actions`);
console.log(`When the workflow finishes, installers will appear at:`);
console.log(`  https://github.com/heroash88/Curio-Robot/releases/tag/${tag}`);
