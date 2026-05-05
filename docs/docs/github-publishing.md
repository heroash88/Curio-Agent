# GitHub Publishing Checklist

This project is ready to publish as a normal Git repository without Git LFS.

## What Should Be Included

Commit these project files:

- `src/`
- `public/`
- `public/models/`
- `docs/`
- `electron/`
- `ha-addon/`
- `rpi-image/`
- `scripts/`
- root config files such as `package.json`, `package-lock.json`,
  `vite.config.ts`, `vitest.config.ts`, `tsconfig*.json`,
  `tailwind.config.js`, `postcss.config.js`, `firebase.json`,
  `electron-builder.config.cjs`, `.gitignore`, `.gitattributes`,
  `.firebaserc.example`, and `.env.example`
- `.github/workflows/ci.yml`

`AGENTS.md`, `AGENT.md`, `PROJECT.md`, `steering/`, and `.kiro/` are local
assistant/project orientation files and folders. They are ignored by default.
Keep them updated locally, but do not publish them unless `.gitignore` is changed
intentionally.

The offline models are intentionally included:

- Wake word ONNX models.
- Face/vision model assets.
- ONNX Runtime WASM assets.
- TinyTTS files.
- Kitten TTS files.
- Pocket TTS files and built-in voice embeddings.

## What Should Not Be Included

The `.gitignore` excludes:

- `node_modules/`
- `build/`
- `dist/`
- `release/`
- `out/`
- `output/`
- `Archive.zip`
- packaged installers such as `.dmg`, `.exe`, `.AppImage`, and `.deb`
- `.env` and local secret files
- local `.firebaserc` files with personal Firebase project IDs
- local tool caches such as `.firebase/`, `.playwright-cli/`, `.superpowers/`, `.kiro/`, and `.vscode/`
- local assistant/project orientation files such as `AGENTS.md`, `AGENT.md`, `PROJECT.md`, and `steering/`
- generated worker bundles and copied MediaPipe WASM files that are rebuilt by `npm run dev` or `npm run build`
- logs and OS/editor noise

## No Git LFS

Do not enable Git LFS for this repo unless a future model file exceeds GitHub's normal file limit. The current largest file under `public/models/` is below 100 MB, so normal Git is enough.

The `.gitattributes` file marks model binaries as binary so Git does not try text diffs.

## First Publish

If this folder is not already a Git repository:

```bash
git init
git add .
git status
git commit -m "Initial Curio Robot app"
git branch -M main
git remote add origin https://github.com/<owner>/<repo>.git
git push -u origin main
```

Before pushing, run:

```bash
npm ci
npm run typecheck
npm test
npm run build
```

Before pushing documentation or architecture changes, also confirm the
orientation docs are current:

- `README.md`
- `docs/README.md`
- `docs/deployment.md`
- `docs/github-publishing.md`

If local assistant orientation docs exist, update `AGENTS.md`, `AGENT.md`,
`PROJECT.md`, `steering/*.md`, and `.kiro/steering/*.md` locally, but keep them
ignored.

If steering docs are being used locally, mirror relevant updates between
`steering/*.md` and `.kiro/steering/*.md`.

## After Clone

Users can run:

```bash
npm install
npm run dev
```

Then open:

```text
http://localhost:8080
```

## Tagged Releases

Installer builds for macOS, Windows, and Linux are produced by
`.github/workflows/release.yml`. The workflow is tag-triggered, so nothing
publishes until a `v<version>` tag lands on `origin`.

### Cutting a release

Run one of these from a clean `main` branch:

```bash
npm run release:patch   # 0.1.0 -> 0.1.1
npm run release:minor   # 0.1.0 -> 0.2.0
npm run release:major   # 0.1.0 -> 1.0.0
```

That runs `scripts/release.mjs` which:

1. Bumps the version across `package.json`, `package-lock.json`,
   `ha-addon/config.yaml`, `ha-addon/build.yaml`, `ha-addon/Dockerfile*`, and
   prepends a `ha-addon/CHANGELOG.md` entry.
2. Commits as `Release v<version>`.
3. Pushes `main` to `origin` (with three retries).
4. Creates and pushes a `v<version>` tag.

The tag push wakes `release.yml`, which builds the Electron app on
`macos-latest`, `windows-latest`, and `ubuntu-latest`, uploads the
installers as artifacts, and creates a GitHub Release named
`Curio Robot v<version>` with the `.dmg`, `.exe`, `.AppImage`, and `.deb`
installers attached. macOS builds both Intel and Apple Silicon DMGs.
Windows and Linux build x64 only: Windows arm64 users run the x64
installer natively, and Linux arm64 users use the `rpi-image/` kiosk
path.

Expect roughly 10-20 minutes per release for all three OS builds to finish.

### Re-running a release

If the workflow fails mid-build, rerun it from the Actions tab, or trigger
the workflow manually via **Actions -> Release -> Run workflow** and supply
the tag name (for example `v0.1.0`).

### Code signing

Installers are currently unsigned. Users will see Gatekeeper (macOS) and
SmartScreen (Windows) warnings on first launch. Signing requires a paid
certificate and is intentionally deferred for the v0.1.x series.

### Publishing without a tag

Regular `main` pushes still trigger `ci.yml` (typecheck, tests, and a web
build). They do **not** produce installers and do **not** publish a
Release. Only `v*` tag pushes do that.
