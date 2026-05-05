#!/usr/bin/with-contenv bashio
# ==============================================================================
# Home Assistant Add-on: Curio
# Serves the pre-built Curio web app via nginx with HA auto-login support.
# Also runs the bundled Nova Sonic WebSocket proxy on 127.0.0.1:8081 so
# users don't have to set up any external service to use Nova.
# ==============================================================================

# Read user-configured port (default 8099)
PORT=$(bashio::config 'port' 2>/dev/null || echo "8099")
bashio::log.info "Starting Curio web server on port ${PORT}..."

# Update nginx listen port if user changed it
sed -i "s|listen 8099;|listen ${PORT};|g" /etc/nginx/http.d/default.conf

# SUPERVISOR_TOKEN is provided by the HA Supervisor to addons with
# homeassistant_api: true.
SUPERVISOR_TOKEN="${SUPERVISOR_TOKEN:-}"

if [ -n "${SUPERVISOR_TOKEN}" ]; then
    bashio::log.info "Supervisor token detected -- enabling HA auto-login"

    # 1. Write runtime config JSON so the frontend can detect ingress
    cat > /var/www/html/ha-runtime-config.json <<EOF
{
  "haIngress": true,
  "supervisorToken": "${SUPERVISOR_TOKEN}"
}
EOF
    chmod 644 /var/www/html/ha-runtime-config.json

    # 2. Inject the token into the nginx config for API proxying
    sed -i "s|__SUPERVISOR_TOKEN__|${SUPERVISOR_TOKEN}|g" /etc/nginx/http.d/default.conf
else
    bashio::log.warning "No SUPERVISOR_TOKEN found -- HA auto-login disabled"
    sed -i "s|__SUPERVISOR_TOKEN__||g" /etc/nginx/http.d/default.conf
fi

# ── Nova Sonic WebSocket proxy ───────────────────────────────────────
# The proxy binds to 127.0.0.1:8081 only; nginx reverse-proxies /nova-proxy
# to it. This means every user of the addon gets Nova Sonic working with
# just their own API key -- no separate proxy setup required.
bashio::log.info "Starting Nova Sonic proxy on 127.0.0.1:8081..."
(
    cd /opt/nova-proxy
    # The proxy script already listens on the port passed as argv[2].
    # We pin it to localhost by starting via node directly so external
    # traffic must go through nginx.
    node nova-proxy.mjs 8081 2>&1 | while IFS= read -r line; do
        bashio::log.info "[nova-proxy] ${line}"
    done
) &
NOVA_PID=$!

# If the proxy dies, log it but keep nginx running. Users may never touch
# Nova; no reason to take the whole add-on down if Nova crashes.
(
    wait ${NOVA_PID} 2>/dev/null
    bashio::log.warning "Nova Sonic proxy exited (pid ${NOVA_PID}). /nova-proxy will be unavailable until the addon restarts."
) &

# Run nginx in the foreground so tini tracks it as PID 1's child
exec nginx -g "daemon off;"
