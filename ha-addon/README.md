# Curio Robot Home Assistant Add-on

Curio Robot can run as a Home Assistant add-on with ingress support, direct network access, smart home widgets, HA service routines, proactive notifications, and optional Home Assistant Assist voice pipeline integration.

The add-on serves the same Curio app documented in the root [README](../README.md). It includes the dashboard, response cards, local/offline voice options, and Home Assistant device controls.

## Add-on Image and Store Assets

The add-on builds from the Home Assistant base image `ghcr.io/home-assistant/{arch}-base:3.21` through `build.yaml`. The Dockerfiles also default to the multi-arch `ghcr.io/home-assistant/base:3.21`, so local Docker or BuildKit builds do not depend on Supervisor injecting a `BUILD_FROM` argument.

Home Assistant store graphics are included as PNG files in this folder:

- `icon.png` is the 128x128 add-on icon.
- `logo.png` is the 250x250 add-on logo.

The release deploy script copies these assets into the published add-on repository with the rest of the add-on package.

## Installation

1. In Home Assistant, go to **Settings > Add-ons > Add-on Store**
2. Click the **three-dot menu** (top right) > **Repositories**
3. Paste your published add-on repository URL, for example `https://github.com/your-org/curio-ha-addon`, and click **Add**
4. Find **Curio Robot** in the store and click **Install**
5. After install, toggle **Show in sidebar** for quick access
6. Click **Start**, then **Open Web UI**

The add-on uses ingress, so it appears directly inside the Home Assistant UI. Direct access is also available for OAuth, voice, camera, and kiosk flows.

## Direct Access (for Google Sign-In)

Curio is also accessible directly at `http://<your-ha-ip>:8099`. This is useful for:

- **Google sign-in** (Calendar, Tasks, Photos) -- popups don't work through HA ingress
- Accessing Curio from other devices on your network
- Kiosk/tablet setups

The port can be changed in the add-on configuration. After signing into Google via direct access, the tokens persist -- so ingress will have access to Google services too.

## Google Sign-In Setup

Connecting Google Calendar, Tasks, Gmail, and Photos requires a one-time setup in Google Cloud Console. Google rejects sign-in attempts from redirect URIs it doesn't know about, so you have to add your HA address to the allowlist.

If you click **Connect** and get an error like:

> Access blocked: Authorization Error  
> redirect_uri not supported for response_type=token:  
> http://192.168.0.2:8099/oauth-callback.html

that means Google doesn't recognize that URL yet. Follow these steps:

### 1. Create a Google OAuth Client ID (if you don't have one)

1. Open [Google Cloud Console -- Credentials](https://console.cloud.google.com/apis/credentials)
2. Create a new project (or pick an existing one)
3. Click **Create Credentials > OAuth client ID**
4. Choose **Web application** as the application type
5. Give it a name like "Curio"

### 2. Add your Curio URL as an authorized redirect

In the same OAuth client, under **Authorized JavaScript origins** add:

- `http://<your-ha-ip>:8099` -- for example `http://192.168.0.2:8099`
- `http://homeassistant.local:8099` -- if you use the mDNS hostname
- `https://<your-domain>` -- if you access HA over HTTPS (Nabu Casa, reverse proxy, etc.)

Under **Authorized redirect URIs** add the same URLs but with `/oauth-callback.html` on the end:

- `http://<your-ha-ip>:8099/oauth-callback.html`
- `http://homeassistant.local:8099/oauth-callback.html`
- `https://<your-domain>/oauth-callback.html` (if applicable)

Add every URL you actually open Curio from. Google does an exact string match, so `http://` vs `https://`, the port number, and the IP all have to match.

### 3. Enable the APIs you want to use

From [API Library](https://console.cloud.google.com/apis/library), enable each service you plan to connect:

- **Google Calendar API**
- **Google Tasks API**
- **Gmail API**
- **Google Photos Library API**

### 4. Paste the Client ID into Curio

1. Copy the **Client ID** from Google Cloud Console (looks like `123456-abcd.apps.googleusercontent.com`)
2. Open Curio > **Settings > Integrations > Google Services**
3. Paste the Client ID into the **OAuth Client ID** field
4. Click **Connect** next to any Google service

The first time you connect, Google may warn that the app is unverified -- that's normal for personal OAuth clients. Click **Advanced > Go to Curio (unsafe)** to proceed.

### If sign-in still fails

- Double-check that the URL in the error message matches exactly what's in **Authorized redirect URIs**
- Google OAuth changes can take a minute or two to propagate -- wait and try again
- If your HA IP changes (DHCP), you'll need to re-add the new URL to Google Cloud Console. A static IP or mDNS hostname avoids this.

## Microphone and Camera

Mic and camera require a "secure context" (HTTPS or localhost). This means:

- **HA with HTTPS** (Nabu Casa, reverse proxy, etc.) -- mic/camera work via direct access at `https://<your-domain>:8099`
- **Plain HTTP** -- browsers block mic/camera. To work around this, open `chrome://flags/#unsafely-treat-insecure-origin-as-secure` in Chrome, add `http://<your-ha-ip>:8099`, and restart Chrome
- **HA ingress** -- mic/camera don't work in the ingress iframe (HA limitation). Use direct access instead

For the best experience on a kiosk/tablet, access Curio directly at `http(s)://<your-ha-ip>:8099` rather than through the HA sidebar.

## Requirements

- Home Assistant with add-on support.
- At least one assistant backend configured in Curio settings, such as Gemini Live, Nova Sonic, Home Assistant Voice, or a custom Ollama/OpenAI-compatible text LLM.

## Configuration

| Option | Default | Description |
|--------|---------|-------------|
| `port` | `8099` | Port for direct web access (change if 8099 conflicts) |
| `log_level` | `info` | Logging verbosity |

## What Works Well in the Add-on

- Home Assistant lights, sensors, cameras, climate, covers, media players, select entities, button stacks, calendars, vacuums, printers, energy, and general home status widgets.
- Routines that react to Home Assistant entity states.
- Routines that call Home Assistant services.
- Dashboard mode in the HA sidebar or a direct browser tab.
- iCal, Google, Outlook, Slack, weather, and local voice features when configured from direct access.

## Known Browser Constraints

- Google sign-in and some popup flows should be done from direct access at `http://<your-ha-ip>:8099`, not inside HA ingress.
- Microphone and camera usually need HTTPS or a browser exception for insecure local origins.
- HA ingress runs inside an iframe, so direct access is better for voice, camera, and kiosk/tablet setups.

## Updating

When a new version is available, go to **Settings > Add-ons > Curio Robot** and click **Update**. If you are testing a local copy of the add-on folder, use **Rebuild** after changing the Dockerfile, base image, or bundled app files.
