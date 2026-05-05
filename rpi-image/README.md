# Curio Robot Raspberry Pi Kiosk Image

Turn a Raspberry Pi into a dedicated Curio voice assistant appliance.
The Pi boots directly into a fullscreen Chromium kiosk running the Curio
web app -- no desktop environment, no login screen.

The kiosk is intended for dashboard mode, wall panels, appliance-style displays, and always-on voice assistant setups. See the root [README](../README.md) and [deployment guide](../docs/deployment.md) for the broader app documentation.

## Supported Hardware

| Board | RAM | Status |
|-------|-----|--------|
| RPi 5 | 4/8 GB | Recommended |
| RPi 4 | 2/4/8 GB | Works well |
| RPi 3B+ | 1 GB | Functional, slower wake word |
| RPi Zero 2W | 512 MB | Tight -- disable wake word |

A USB microphone (or HAT with mic) and speaker/3.5mm audio are required
for voice interaction. A touchscreen (official 7" or HDMI) is optional
but recommended for the full card UI experience.

## Quick Start (flash an existing RPi OS)

If you already have Raspberry Pi OS Lite (64-bit, Bookworm) installed:

```bash
# Copy the built Curio app to the Pi (from your dev machine)
npm run build
scp -r dist/ pi@curio.local:/tmp/curio-dist/

# SSH into the Pi and run the setup script
ssh pi@curio.local
curl -fsSL https://raw.githubusercontent.com/your-org/curio-robot/main/rpi-image/setup-kiosk.sh | sudo bash -s -- /tmp/curio-dist
```

Or clone the repo on the Pi:

```bash
git clone https://github.com/your-org/curio-robot.git
cd curio-robot/rpi-image
sudo ./setup-kiosk.sh /path/to/dist
```

After reboot the Pi boots straight into Curio.

## Pre-built Image (rpi-image-gen)

To build a complete `.img.xz` or `.img.zst` file that can be flashed with Raspberry
Pi Imager:

```bash
# Prereqs:
#   - Docker installed and running
#   - Linux / macOS, or Windows with Git Bash (or WSL)
#   - Node 20+ so you can run the web build

git clone https://github.com/your-org/curio-robot.git
cd curio-robot

npm install
npm run build

bash rpi-image/build-image.sh
# Output: rpi-image/output/curio-rpi*.img.xz or curio-rpi*.img.zst
```

What the script does:

1. Clones [raspberrypi/rpi-image-gen](https://github.com/raspberrypi/rpi-image-gen) into `rpi-image/.rpi-image-gen/` (first run only).
2. Copies `rpi-image/config/curio.yaml`, `rpi-image/layer/curio-kiosk.yaml`, and `setup-kiosk.sh` into the tool's tree.
3. Injects the freshly built `dist/` into the kiosk layer.
4. Builds the `curio-rpi-builder` Docker image (first run only, ~5 min).
5. Stages `rpi-image-gen` into the `curio-rpi-image-gen` Docker volume so the root filesystem is built on a Linux-native filesystem.
6. Runs `rpi-image-gen build -c config/curio.yaml` inside the container.
7. Copies the resulting image to `rpi-image/output/`.

First build takes 20-40 minutes (QEMU-emulated arm64 bootstrap). Subsequent builds are much faster because package caches, the Docker volume, and the builder image are reused.

Pass a custom dist path as the first argument if needed:

```bash
bash rpi-image/build-image.sh /path/to/some/other/dist
```

## What Gets Installed

- nginx (serves the Curio web app on localhost:8099)
- Cage (minimal Wayland kiosk compositor) + Chromium
- PipeWire + WirePlumber (audio -- mic input and speaker output)
- Systemd services for auto-start on boot
- GPU memory split optimized for Chromium rendering
- Swap file (1 GB) for stability on low-RAM boards

## WiFi Setup

### Option A: Raspberry Pi Imager (recommended)
Configure WiFi when flashing the SD card using Raspberry Pi Imager's
advanced settings (Ctrl+Shift+X).

### Option B: Boot partition file
Create `wpa_supplicant.conf` on the boot partition before first boot:

```
country=US
ctrl_interface=DIR=/var/run/wpa_supplicant GROUP=netdev
update_config=1

network={
    ssid="YourNetwork"
    psk="YourPassword"
}
```

### Option C: Ethernet
Just plug in an ethernet cable. Works immediately.

## Updating Curio

```bash
# From your dev machine
npm run build
scp -r dist/ pi@curio.local:/tmp/curio-dist/
ssh pi@curio.local 'sudo /opt/curio/update.sh /tmp/curio-dist'
```

Or on the Pi directly:

```bash
sudo /opt/curio/update.sh /path/to/new/dist
```

## Configuration

Settings are persisted in the browser's localStorage (Chromium profile
at `/home/curio/.config/chromium/`). Open Curio's settings gear to
configure your Gemini API key, Home Assistant connection, etc.

Recommended kiosk settings:

- Use Dashboard mode for persistent widgets.
- Prefer Kitten, TinyTTS, Browser TTS, or Remote TTS on lower-power Pi models.
- Keep wake word enabled only on hardware with enough CPU headroom.
- Use direct Home Assistant access for smart home widgets when the Pi is on the same LAN.
- Keep a keyboard nearby during first setup for Wi-Fi, microphone, and browser permission prompts.

### Display rotation
Edit `/opt/curio/kiosk-env` and set `CURIO_DISPLAY_ROTATE=90` (or 180, 270).

### Audio device
If the Pi doesn't pick the right audio device automatically, edit
`/opt/curio/kiosk-env` and set `CURIO_AUDIO_SINK` and `CURIO_AUDIO_SOURCE`.

## Troubleshooting

```bash
# Check kiosk service status
sudo systemctl status curio-kiosk

# Check nginx
sudo systemctl status nginx

# View kiosk logs
journalctl -u curio-kiosk -f

# View nginx logs
journalctl -u nginx -f

# Restart everything
sudo systemctl restart nginx curio-kiosk

# Drop to a shell (from a keyboard attached to the Pi)
# Press Ctrl+Alt+F2 for a TTY login
```
