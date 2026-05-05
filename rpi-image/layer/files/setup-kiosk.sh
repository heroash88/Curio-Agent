#!/usr/bin/env bash
# ==============================================================================
# Curio Robot -- Raspberry Pi Kiosk Setup
#
# Transforms a fresh Raspberry Pi OS Lite (64-bit, Bookworm) into a
# dedicated Curio kiosk appliance.
#
# Usage:
#   sudo ./setup-kiosk.sh /path/to/curio/dist
#
# What this does:
#   1. Creates a dedicated 'curio' system user
#   2. Installs nginx, Cage (Wayland kiosk compositor), Chromium, PipeWire
#   3. Deploys the Curio web app to /var/www/curio
#   4. Configures systemd services for auto-start
#   5. Tunes RPi settings (GPU mem, swap, boot config)
# ==============================================================================

set -euo pipefail

DIST_DIR="${1:-}"
CURIO_USER="curio"
CURIO_HOME="/home/${CURIO_USER}"
WEB_ROOT="/var/www/curio"
CURIO_OPT="/opt/curio"
KIOSK_PORT=8099

# ── Helpers ──────────────────────────────────────────────────────────

log()  { echo -e "\e[32m[curio]\e[0m $*"; }
warn() { echo -e "\e[33m[curio]\e[0m $*"; }
die()  { echo -e "\e[31m[curio]\e[0m $*" >&2; exit 1; }

# ── Preflight checks ────────────────────────────────────────────────

[[ $EUID -eq 0 ]] || die "Run this script as root (sudo)."
[[ -n "$DIST_DIR" ]] || die "Usage: $0 /path/to/curio/dist"
[[ -d "$DIST_DIR" ]] || die "Directory not found: $DIST_DIR"
[[ -f "$DIST_DIR/index.html" ]] || die "No index.html in $DIST_DIR -- is this a Curio build?"

log "Starting Curio kiosk setup..."

# ── 1. System packages ──────────────────────────────────────────────
#
# During image build, packages are already installed by the layer's
# mmdebstrap.packages list. On a fresh Pi OS install, we still install
# them here. Skip apt if everything is already present.

need_install=false
for pkg in nginx cage chromium-browser pipewire pipewire-pulse wireplumber; do
    if ! dpkg -s "$pkg" >/dev/null 2>&1; then
        need_install=true
        break
    fi
done

if $need_install; then
    log "Updating packages and installing dependencies..."
    apt-get update -qq
    apt-get install -y -qq \
        nginx \
        cage \
        chromium-browser \
        pipewire pipewire-pulse wireplumber \
        fonts-noto-core fonts-noto-color-emoji \
        libgles2-mesa \
        > /dev/null
else
    log "Required packages already installed; skipping apt."
fi

# ── 2. Create kiosk user ────────────────────────────────────────────

if ! id "$CURIO_USER" &>/dev/null; then
    log "Creating system user: $CURIO_USER"
    useradd --create-home --shell /bin/bash \
        --groups audio,video,input,render,gpio,i2c,spi \
        "$CURIO_USER"
else
    log "User $CURIO_USER already exists"
    # Ensure group membership
    usermod -aG audio,video,input,render "$CURIO_USER" 2>/dev/null || true
fi

# ── 3. Deploy web app ───────────────────────────────────────────────

log "Deploying Curio web app to $WEB_ROOT"
mkdir -p "$WEB_ROOT"
rm -rf "${WEB_ROOT:?}/"*
cp -a "$DIST_DIR/." "$WEB_ROOT/"
chown -R www-data:www-data "$WEB_ROOT"

# ── 4. Nginx config ─────────────────────────────────────────────────

log "Configuring nginx..."

# Remove default site
rm -f /etc/nginx/sites-enabled/default

cat > /etc/nginx/sites-available/curio <<'NGINX'
server {
    listen 8099;
    server_name _;

    root /var/www/curio;
    index index.html;

    # Proxy Yahoo Finance quote/search requests to avoid browser CORS issues.
    location /stock-proxy/ {
        rewrite ^/stock-proxy/(.*)$ /$1 break;
        proxy_pass https://query1.finance.yahoo.com;
        proxy_set_header Host query1.finance.yahoo.com;
        proxy_ssl_server_name on;
        proxy_http_version 1.1;
        proxy_read_timeout 15s;
    }

    # Fallback quote proxy for Stooq market data.
    location /stooq-proxy/ {
        rewrite ^/stooq-proxy/(.*)$ /$1 break;
        proxy_pass https://stooq.com;
        proxy_set_header Host stooq.com;
        proxy_ssl_server_name on;
        proxy_http_version 1.1;
        proxy_read_timeout 15s;
    }

    # SPA fallback
    location / {
        try_files $uri $uri/ /index.html;
    }

    # Cache hashed assets aggressively
    location /assets/ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }

    # Cache ONNX/WASM models
    location /models/ {
        expires 7d;
        add_header Cache-Control "public";
    }

    # WebSocket proxy for Amazon Nova Sonic.
    # Forwards to the bundled Node process on 127.0.0.1:8081 which
    # in turn talks to api.nova.amazon.com with the user's API key.
    location /nova-proxy {
        proxy_pass http://127.0.0.1:8081;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_read_timeout 86400s;
        proxy_send_timeout 86400s;
    }

    # WASM MIME type
    types {
        application/wasm wasm;
    }

    # Gzip
    gzip on;
    gzip_types text/plain text/css application/json application/javascript
               text/xml application/xml text/javascript image/svg+xml
               application/wasm;
    gzip_min_length 256;
}
NGINX

ln -sf /etc/nginx/sites-available/curio /etc/nginx/sites-enabled/curio

nginx -t || die "nginx config test failed"

# ── 5. Curio opt directory (scripts + env) ───────────────────────────

log "Setting up $CURIO_OPT"
mkdir -p "$CURIO_OPT"

# Environment file for kiosk tuning
cat > "$CURIO_OPT/kiosk-env" <<'ENV'
# Curio Kiosk Environment
# Edit these values and run: sudo systemctl restart curio-kiosk

# Display rotation: 0, 90, 180, 270
CURIO_DISPLAY_ROTATE=0

# Override audio sink/source (leave empty for auto-detect)
# Use `pactl list sinks short` / `pactl list sources short` to find names
CURIO_AUDIO_SINK=
CURIO_AUDIO_SOURCE=

# Extra Chromium flags (space-separated)
CURIO_CHROMIUM_FLAGS=
ENV

# Update script
cat > "$CURIO_OPT/update.sh" <<'UPDATE'
#!/usr/bin/env bash
set -euo pipefail
NEW_DIST="${1:-}"
WEB_ROOT="/var/www/curio"

[[ $EUID -eq 0 ]] || { echo "Run as root (sudo)." >&2; exit 1; }
[[ -n "$NEW_DIST" && -d "$NEW_DIST" && -f "$NEW_DIST/index.html" ]] || {
    echo "Usage: $0 /path/to/new/dist" >&2; exit 1;
}

echo "Updating Curio web app..."
rm -rf "${WEB_ROOT:?}/"*
cp -a "$NEW_DIST/." "$WEB_ROOT/"
chown -R www-data:www-data "$WEB_ROOT"

echo "Restarting services..."
systemctl restart nginx
systemctl restart curio-kiosk

echo "Done. Curio updated."
UPDATE
chmod +x "$CURIO_OPT/update.sh"

# ── 6. Systemd: nginx web server ────────────────────────────────────

log "Configuring nginx systemd service..."

# We use the stock nginx.service that ships with the nginx package.
# Our site config is already in sites-enabled/curio and the default
# site has been removed, so just enable the stock service.
systemctl enable nginx.service

# ── 6b. Nova Sonic proxy ────────────────────────────────────────────
#
# Bundled WebSocket proxy so users can just paste their Nova API key
# and have it work. Browser WebSockets can't set Authorization headers;
# this proxy accepts the key as a query param, adds the header, and
# forwards to wss://api.nova.amazon.com. nginx reverse-proxies
# /nova-proxy on port 8099 to this on 127.0.0.1:8081.

NOVA_DIR="/opt/curio-nova-proxy"
log "Installing Nova Sonic proxy to $NOVA_DIR..."
mkdir -p "$NOVA_DIR"

if [[ -f /tmp/nova-proxy.mjs ]]; then
    cp /tmp/nova-proxy.mjs "$NOVA_DIR/nova-proxy.mjs"
    cp /tmp/nova-proxy-package.json "$NOVA_DIR/package.json"
elif [[ -f "$(dirname "$0")/nova-proxy.mjs" ]]; then
    cp "$(dirname "$0")/nova-proxy.mjs" "$NOVA_DIR/nova-proxy.mjs"
    cp "$(dirname "$0")/nova-proxy-package.json" "$NOVA_DIR/package.json"
else
    warn "Nova proxy sources not found -- /nova-proxy will be unavailable."
fi

if [[ -f "$NOVA_DIR/nova-proxy.mjs" ]]; then
    (cd "$NOVA_DIR" && npm install --omit=dev --no-audit --no-fund --loglevel=error)

    cat > /etc/systemd/system/curio-nova-proxy.service <<'NOVAUNIT'
[Unit]
Description=Curio Nova Sonic WebSocket Proxy
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
WorkingDirectory=/opt/curio-nova-proxy
ExecStart=/usr/bin/node /opt/curio-nova-proxy/nova-proxy.mjs 8081
Restart=on-failure
RestartSec=5
NoNewPrivileges=true
ProtectSystem=strict
ProtectHome=true
PrivateTmp=true

[Install]
WantedBy=multi-user.target
NOVAUNIT

    log "Nova Sonic proxy installed. Service will be enabled in step 12."
else
    warn "Skipping curio-nova-proxy.service (proxy sources missing)."
fi

# ── 7. Systemd: Chromium kiosk via Cage ─────────────────────────────

log "Creating curio-kiosk systemd service..."

cat > /etc/systemd/system/curio-kiosk.service <<UNIT
[Unit]
Description=Curio Kiosk (Cage + Chromium)
After=nginx.service systemd-user-sessions.service
Wants=nginx.service
# Wait for a display to be available
ConditionPathExists=/dev/dri/card0
# Conflict with getty to ensure we own the screen
Conflicts=getty@tty1.service

[Service]
User=${CURIO_USER}
EnvironmentFile=${CURIO_OPT}/kiosk-env

# PipeWire and Wayland need session env
Environment=XDG_RUNTIME_DIR=/run/user/%U
Environment=XDG_SESSION_TYPE=wayland
Environment=XDG_SESSION_CLASS=user
# Use GLES2 for performance on Pi
Environment=WLR_RENDERER=gles2
# Enable input (remove NO_DEVICES)
Environment=WLR_LIBINPUT_NO_DEVICES=0

# Bind to TTY1
StandardInput=tty
StandardOutput=tty
TTYPath=/dev/tty1

# Cage is a single-window Wayland compositor -- perfect for kiosks.
# It launches Chromium in fullscreen and restarts if it crashes.
ExecStart=/usr/bin/cage -s -- /usr/bin/chromium-browser \\
    --kiosk \\
    --noerrdialogs \\
    --disable-infobars \\
    --disable-translate \\
    --disable-features=TranslateUI \\
    --disable-component-update \\
    --autoplay-policy=no-user-gesture-required \\
    --use-fake-ui-for-media-stream \\
    --enable-features=WebRTCPipeWireCapturer \\
    --enable-gpu-rasterization \\
    --enable-zero-copy \\
    --ignore-gpu-blocklist \\
    --user-data-dir=${CURIO_HOME}/.config/chromium \\
    \${CURIO_CHROMIUM_FLAGS} \\
    http://localhost:${KIOSK_PORT}

Restart=on-failure
RestartSec=3

# Ensure the runtime dir exists
ExecStartPre=/bin/bash -c 'mkdir -p /run/user/\$(id -u ${CURIO_USER}) && chown ${CURIO_USER}: /run/user/\$(id -u ${CURIO_USER})'

[Install]
WantedBy=multi-user.target
UNIT

# ── 8. PipeWire user service for the curio user ─────────────────────

log "Enabling PipeWire for $CURIO_USER..."

# Detect if we are in a systemd-booted environment
if systemctl --quiet is-system-running 2>/dev/null || [ -d /run/systemd/system ]; then
    # Enable lingering so user services start at boot without login
    loginctl enable-linger "$CURIO_USER" || warn "Could not enable lingering"

    # PipeWire runs as a user service -- enable it for the curio user
    sudo -u "$CURIO_USER" bash -c '
        export XDG_RUNTIME_DIR="/run/user/$(id -u)"
        mkdir -p "$XDG_RUNTIME_DIR" 2>/dev/null || true
        systemctl --user enable pipewire.socket pipewire-pulse.socket wireplumber 2>/dev/null || true
    ' || warn "Could not enable PipeWire user services"
else
    warn "Skipping systemd user service enablement (not booted with systemd). This is expected during image build."
    # Manually enable PipeWire user services via symlinks as a fallback
    USER_SYSTEMD_DIR="/home/$CURIO_USER/.config/systemd/user/default.target.wants"
    mkdir -p "$USER_SYSTEMD_DIR"
    chown -R "$CURIO_USER:$CURIO_USER" "/home/$CURIO_USER/.config"
    ln -sf /usr/lib/systemd/user/pipewire.socket "$USER_SYSTEMD_DIR/pipewire.socket"
    ln -sf /usr/lib/systemd/user/pipewire-pulse.socket "$USER_SYSTEMD_DIR/pipewire-pulse.socket"
    ln -sf /usr/lib/systemd/user/wireplumber.service "$USER_SYSTEMD_DIR/wireplumber.service"
fi

# ── 9. Boot config tuning ───────────────────────────────────────────

log "Tuning boot config..."

CONFIG_FILE="/boot/firmware/config.txt"
[[ -f "$CONFIG_FILE" ]] || CONFIG_FILE="/boot/config.txt"

if [[ ! -f "$CONFIG_FILE" ]]; then
    warn "No config.txt found at /boot/firmware or /boot -- skipping boot tuning."
    warn "(This is expected during rpi-image-gen builds; firmware layer writes it later.)"
else

# GPU memory -- Chromium benefits from more VRAM
if ! grep -q "^gpu_mem=" "$CONFIG_FILE" 2>/dev/null; then
    echo "gpu_mem=128" >> "$CONFIG_FILE"
else
    sed -i 's/^gpu_mem=.*/gpu_mem=128/' "$CONFIG_FILE"
fi

# Enable DRM VC4 (needed for Cage/Wayland)
if ! grep -q "^dtoverlay=vc4-kms-v3d" "$CONFIG_FILE" 2>/dev/null; then
    echo "dtoverlay=vc4-kms-v3d" >> "$CONFIG_FILE"
fi

# Disable splash screen for faster boot
if ! grep -q "^disable_splash=1" "$CONFIG_FILE" 2>/dev/null; then
    echo "disable_splash=1" >> "$CONFIG_FILE"
fi

# Force HDMI output even if no monitor is detected
if ! grep -q "^hdmi_force_hotplug=1" "$CONFIG_FILE" 2>/dev/null; then
    echo "hdmi_force_hotplug=1" >> "$CONFIG_FILE"
fi

fi  # CONFIG_FILE exists

# ── 10. Swap (important for low-RAM boards) ─────────────────────────

SWAP_FILE="/var/swap"
if [[ ! -f "$SWAP_FILE" ]]; then
    log "Creating 1GB swap file..."
    dd if=/dev/zero of="$SWAP_FILE" bs=1M count=1024 status=none
    chmod 600 "$SWAP_FILE"
    mkswap "$SWAP_FILE" > /dev/null
    echo "$SWAP_FILE none swap sw 0 0" >> /etc/fstab
fi

# ── 11. Disable unnecessary services for faster boot ────────────────

log "Disabling unnecessary services..."
systemctl disable bluetooth.service 2>/dev/null || true
systemctl disable avahi-daemon.service 2>/dev/null || true
systemctl disable triggerhappy.service 2>/dev/null || true
systemctl disable ModemManager.service 2>/dev/null || true

# ── 12. Enable and start ────────────────────────────────────────────

log "Enabling services and auto-login..."
systemctl daemon-reload

# Configure auto-login for the curio user on TTY1
mkdir -p /etc/systemd/system/getty@tty1.service.d
cat > /etc/systemd/system/getty@tty1.service.d/autologin.conf <<AUTOLOGIN
[Service]
ExecStart=
ExecStart=-/sbin/agetty --autologin ${CURIO_USER} --noclear %I \$TERM
AUTOLOGIN

systemctl enable nginx.service
systemctl enable curio-kiosk.service

# Enable Nova proxy if the unit was created in step 6b
if [[ -f /etc/systemd/system/curio-nova-proxy.service ]]; then
    systemctl enable curio-nova-proxy.service
fi

# ── 13. Quiet boot (optional cosmetic) ──────────────────────────────

CMDLINE="/boot/firmware/cmdline.txt"
[[ -f "$CMDLINE" ]] || CMDLINE="/boot/cmdline.txt"

if [[ -f "$CMDLINE" ]]; then
    # Add quiet + splash to hide boot messages
    if ! grep -q "quiet" "$CMDLINE"; then
        sed -i 's/$/ quiet splash loglevel=0/' "$CMDLINE"
    fi
else
    warn "No cmdline.txt found -- skipping quiet-boot tuning."
fi

# ── Done ─────────────────────────────────────────────────────────────

log ""
log "============================================"
log "  Curio kiosk setup complete!"
log "============================================"
log ""
log "  Web app:  http://localhost:$KIOSK_PORT"
log "  Config:   $CURIO_OPT/kiosk-env"
log "  Update:   sudo $CURIO_OPT/update.sh /path/to/dist"
log "  Logs:     journalctl -u curio-kiosk -f"
log ""
log "  Reboot now to start the kiosk:"
log "    sudo reboot"
log ""
