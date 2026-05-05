# Curio RPi Image Builder
# Provides a persistent environment for rpi-image-gen with pre-installed host tools

FROM debian:bookworm

# Avoid interactive prompts
ENV DEBIAN_FRONTEND=noninteractive

# Update and install core build dependencies + host tools
RUN apt-get update && apt-get install -y \
    mmdebstrap \
    bdebstrap \
    podman \
    uidmap \
    dbus-user-session \
    zip \
    dosfstools \
    rsync \
    curl \
    mtools \
    pv \
    btrfs-progs \
    dctrl-tools \
    uuid-runtime \
    fdisk \
    python3-jsonschema \
    python3-yaml \
    python3-debian \
    cryptsetup \
    python3-pip \
    make \
    build-essential \
    autoconf \
    automake \
    libtool \
    autopoint \
    flex \
    gettext \
    pkgconf \
    git \
    sudo \
    bc \
    bison \
    # Pre-install host tools so we don't have to build them inside the container
    genimage \
    libconfuse-dev \
    zstd \
    && rm -rf /var/lib/apt/lists/*

# Set up working directory
WORKDIR /rpi-image-gen

# Pre-configure podman to work in the container (rootless-in-root)
RUN mkdir -p /etc/containers && \
    printf '[storage]\ndriver = "overlay"\n' > /etc/containers/storage.conf

# Entrypoint removed to allow script to handle mounts
