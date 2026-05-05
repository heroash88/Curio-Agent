#!/usr/bin/env bash
# ==============================================================================
# Curio Robot -- Build a flashable RPi image using rpi-image-gen
#
# Prerequisites:
#   - Docker installed and running
#   - The Curio app already built (npm run build) in the repo root
#
# Usage:
#   cd rpi-image
#   ./build-image.sh [/path/to/dist]
# ==============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
DIST_DIR="${1:-$REPO_ROOT/dist}"
OUTPUT_DIR="$SCRIPT_DIR/output"
GEN_DIR="$SCRIPT_DIR/.rpi-image-gen"
BUILD_VOLUME="${CURIO_RPI_BUILD_VOLUME:-curio-rpi-image-gen}"

log()  { echo -e "\e[32m[build]\e[0m $*"; }
die()  { echo -e "\e[31m[build]\e[0m $*" >&2; exit 1; }

# -- Preflight ----------------------------------------------------------------

[[ -d "$DIST_DIR" && -f "$DIST_DIR/index.html" ]] || \
    die "Curio dist/ not found at $DIST_DIR. Run 'npm run build' first."

command -v docker &>/dev/null || die "Docker is required. Install it first."

# -- Clone rpi-image-gen if needed --------------------------------------------

if [[ ! -d "$GEN_DIR" ]]; then
    log "Cloning rpi-image-gen..."
    git clone --depth 1 https://github.com/raspberrypi/rpi-image-gen.git "$GEN_DIR"
fi

# -- Prepare files for the build ----------------------------------------------

log "Preparing build assets..."

# Copy our custom config + layer into the tool's tree.
mkdir -p "$GEN_DIR/config" "$GEN_DIR/layer/curio-kiosk/files"
cp "$SCRIPT_DIR/config/curio.yaml" "$GEN_DIR/config/curio.yaml"
cp "$SCRIPT_DIR/layer/curio-kiosk.yaml" "$GEN_DIR/layer/curio-kiosk.yaml"
cp "$SCRIPT_DIR/layer/files/setup-kiosk.sh" "$GEN_DIR/layer/curio-kiosk/files/"

# Inject the freshly built web app so the layer can copy-in files/dist.
log "Injecting web app dist..."
DIST_STAGE="$GEN_DIR/layer/curio-kiosk/files/dist"
if command -v rsync &>/dev/null; then
    mkdir -p "$DIST_STAGE"
    rsync -a --delete "$DIST_DIR"/ "$DIST_STAGE"/
else
    rm -rf "$DIST_STAGE"
    cp -a "$DIST_DIR" "$DIST_STAGE"
fi

# Inject the Nova Sonic proxy script and its package manifest so the
# layer can install and run it as a systemd service.
log "Injecting Nova proxy..."
cp "$REPO_ROOT/scripts/nova-proxy.mjs" "$GEN_DIR/layer/curio-kiosk/files/nova-proxy.mjs"
cp "$REPO_ROOT/ha-addon/nova-proxy-package.json" "$GEN_DIR/layer/curio-kiosk/files/nova-proxy-package.json"

# Normalize line endings (essential on Windows hosts).
log "Normalizing line endings..."
find "$GEN_DIR/config" "$GEN_DIR/layer/curio-kiosk" -type f \
    \( -name "*.sh" -o -name "*.yaml" \) \
    -exec perl -pi -e 's/\r$//' {} +

# -- Build --------------------------------------------------------------------

log "Ensuring builder image is ready..."
docker build -t curio-rpi-builder "$SCRIPT_DIR"

log "Staging rpi-image-gen into Docker volume..."
docker volume create "$BUILD_VOLUME" >/dev/null
docker run --rm \
    -v "$GEN_DIR":/host-rpi-image-gen:ro \
    -v "$BUILD_VOLUME":/rpi-image-gen \
    curio-rpi-builder \
    bash -c "set -euo pipefail; \
             rsync -a --delete --exclude=/.git --exclude=/work /host-rpi-image-gen/ /rpi-image-gen/; \
             rm -rf /rpi-image-gen/.git \
                    /rpi-image-gen/work/chroot-* \
                    /rpi-image-gen/work/image-* \
                    /rpi-image-gen/work/deploy-*"

if [[ "${CURIO_RPI_KEEP_STAGED_DIST:-0}" != "1" ]]; then
    rm -rf "$DIST_STAGE"
fi

log "Building image with rpi-image-gen..."

# --privileged for bdebstrap's unshare + mount.
# binfmt_misc mount enables cross-arch QEMU emulation on non-arm64 hosts.
docker run --privileged --rm \
    -v "$BUILD_VOLUME":/rpi-image-gen \
    -w /rpi-image-gen \
    -e IG_ENABLE_HOST_GENIMAGE=n \
    -e IG_ENABLE_HOST_ZSTD=n \
    -e IG_ENABLE_HOST_BDEBSTRAP=y \
    curio-rpi-builder \
    bash -c "mount -t binfmt_misc binfmt_misc /proc/sys/fs/binfmt_misc 2>/dev/null || true; \
             ./rpi-image-gen build -c config/curio.yaml"

# -- Collect output -----------------------------------------------------------

mkdir -p "$OUTPUT_DIR"

# rpi-image-gen writes images under work/<image_name>/ (compressed or raw).
log "Collecting image output..."
if ! docker run --rm \
    -v "$BUILD_VOLUME":/rpi-image-gen:ro \
    -v "$OUTPUT_DIR":/output \
    curio-rpi-builder \
    bash -c "set -euo pipefail; \
             img_file=\$(find /rpi-image-gen/work -maxdepth 3 -type f \
                 \( -name 'curio-rpi*.img.xz' -o -name 'curio-rpi*.img.zst' -o -name 'curio-rpi*.img' \) \
                 2>/dev/null | head -1); \
             [[ -n \"\$img_file\" ]] || exit 64; \
             cp -f \"\$img_file\" \"/output/\$(basename \"\$img_file\")\"; \
             basename \"\$img_file\" > /output/.curio-rpi-last-image"; then
    die "Build finished but no image file found under Docker volume $BUILD_VOLUME. Check the logs above."
fi

IMG_FILE="$OUTPUT_DIR/$(cat "$OUTPUT_DIR/.curio-rpi-last-image" 2>/dev/null || true)"
rm -f "$OUTPUT_DIR/.curio-rpi-last-image"

if [[ -f "$IMG_FILE" ]]; then
    OUT_NAME=$(basename "$IMG_FILE")
    log ""
    log "============================================"
    log "  Image built successfully!"
    log "============================================"
    log "  Output: $OUTPUT_DIR/$OUT_NAME"
    log ""
    log "  Flash with Raspberry Pi Imager, or on Linux:"
    if [[ "$OUT_NAME" == *.xz ]]; then
        log "    xzcat $OUT_NAME | sudo dd of=/dev/sdX bs=4M status=progress"
    elif [[ "$OUT_NAME" == *.zst ]]; then
        log "    zstdcat $OUT_NAME | sudo dd of=/dev/sdX bs=4M status=progress"
    else
        log "    sudo dd if=$OUT_NAME of=/dev/sdX bs=4M status=progress"
    fi
    log ""
else
    die "Build finished but no image file found under $GEN_DIR/work/. Check the logs above."
fi
