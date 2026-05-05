# ── Stage 1: Build the web app ──────────────────────────────────────
ARG BUILD_FROM=ghcr.io/home-assistant/base:3.21
ARG BUILD_VERSION=0.1.1
FROM node:20-alpine AS builder

WORKDIR /build

# Install deps first (layer cache)
COPY package.json package-lock.json ./
RUN npm ci

# Copy source and build
COPY . .
RUN npm run build


# ── Stage 2: Serve from the HA base image ──────────────────────────
FROM ${BUILD_FROM}

ARG BUILD_VERSION=0.1.1
LABEL org.opencontainers.image.title="Curio Robot" \
    org.opencontainers.image.description="Curio - Voice-powered AI assistant with 30+ response cards" \
    io.hass.type="addon" \
    io.hass.version="${BUILD_VERSION}"

# Install nginx (tiny, production-grade static server)
RUN apk add --no-cache nginx

# Copy the built app from stage 1
COPY --from=builder /build/dist /var/www/html

# Copy nginx config
COPY ha-addon/nginx.conf /etc/nginx/http.d/default.conf

# Copy the run script
COPY ha-addon/run.sh /run.sh
RUN chmod a+x /run.sh

EXPOSE 8099

CMD ["/run.sh"]
