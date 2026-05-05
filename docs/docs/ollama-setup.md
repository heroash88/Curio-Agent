# Running Curio Against a Local Ollama Server

Curio's Custom LLM backend can talk to a local [Ollama](https://ollama.com)
server for fully local, private model inference. The tricky part is getting
your browser (especially Safari on iOS) to actually reach Ollama without
getting blocked by CORS, mixed-content, or Local Network restrictions.

This guide walks through the two supported setups and the pitfalls that show
up in practice.

## TL;DR -- macOS desktop app, iPhone on the same Wi-Fi

This is the most common setup. Ollama runs on the Mac, Curio is served over
plain HTTP from a PC/Mac on the LAN, and you open Curio from the iPhone.

1. Stop Ollama completely. If you're running the menu-bar app, click the icon
   and pick **Quit**. If you ran `ollama serve` in a terminal, Ctrl+C it.
2. Tell Ollama to listen on all interfaces and accept requests from any
   origin. **For the macOS app, this must be set via `launchctl` -- terminal
   env vars don't reach the menu-bar process:**

   ```bash
   launchctl setenv OLLAMA_HOST "0.0.0.0:11434"
   launchctl setenv OLLAMA_ORIGINS "*"
   ```

3. Relaunch the Ollama app (or run `ollama serve` again if you use the CLI).
   Env vars are read only at startup, so a restart is mandatory.
4. From the iPhone, open `http://<mac-lan-ip>:11434/api/tags` in Safari
   directly. You should see JSON with your installed models. If iOS shows a
   "Allow local network access" prompt, tap **Allow**.
5. In Curio Settings -> Voice & AI -> Custom LLM, set the Ollama base URL
   to `http://<mac-lan-ip>:11434`, press **Fetch models**, pick one.

## Why `launchctl` and not a terminal `export`?

The macOS Ollama menu-bar app is launched by `launchd`, not by your shell. It
inherits the env from `launchctl setenv ...`, not from your `.zshrc` or
`.bash_profile`. Setting the variables in a terminal and then using the app
has no effect -- you'll see Ollama log `403` errors on every request because
`OLLAMA_ORIGINS` is still at the default (localhost only).

If you prefer running the CLI:

```bash
export OLLAMA_HOST="0.0.0.0:11434"
export OLLAMA_ORIGINS="*"
ollama serve
```

The `export` lines have to be in the **same shell** that runs `ollama serve`.

## Making the setting permanent (macOS app)

`launchctl setenv` doesn't survive a reboot. Add a LaunchAgent so the env is
restored automatically:

```bash
mkdir -p ~/Library/LaunchAgents
cat > ~/Library/LaunchAgents/com.ollama.envvars.plist <<'EOF'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>com.ollama.envvars</string>
  <key>ProgramArguments</key>
  <array>
    <string>/bin/sh</string>
    <string>-c</string>
    <string>launchctl setenv OLLAMA_HOST "0.0.0.0:11434"; launchctl setenv OLLAMA_ORIGINS "*"</string>
  </array>
  <key>RunAtLoad</key><true/>
</dict>
</plist>
EOF
launchctl load ~/Library/LaunchAgents/com.ollama.envvars.plist
```

Reboot to confirm it sticks. Then quit + relaunch the Ollama app.

## Tightening `OLLAMA_ORIGINS`

`*` is the easy mode and fine on a home LAN. If you want it narrower, list
every origin you'll load Curio from, comma-separated. Every combination of
protocol + host + port counts as a distinct origin:

```bash
launchctl setenv OLLAMA_ORIGINS "http://192.168.0.158:8080,http://localhost:8080"
```

Miss one and you get a `403` from Ollama and `Load failed` in Safari.

## Why HTTP and not HTTPS?

Safari and iOS refuse mixed-content requests: an HTTPS page cannot fetch
`http://` URLs, even on the LAN, full stop. Running Curio over plain HTTP on
the LAN sidesteps this entirely at the cost of losing PWA install, service
worker caching, and a few browser APIs.

If you want HTTPS end-to-end, front Ollama with an HTTPS tunnel:

- `cloudflared tunnel --url http://localhost:11434` -- trusted TLS cert, works
  from anywhere, no config on the iPhone
- `ngrok http 11434` -- same idea, free tier works
- Tailscale + tailscale cert for a LAN-only HTTPS path

Whichever you pick, add the resulting origin to `OLLAMA_ORIGINS` and point
Curio at the new HTTPS URL.

## Common failure modes

**Ollama logs `403` on every request.** `OLLAMA_ORIGINS` isn't applied. On
macOS this almost always means you used `export` but run the menu-bar app --
redo it with `launchctl setenv` and fully quit/relaunch the app.

**Curio shows "Load failed" with the correct origin in the error.** CORS
preflight is being blocked. Check Ollama's startup log for the actual
`OLLAMA_ORIGINS` value it's using. If the log still shows only the defaults,
the env var didn't land.

**iPhone can't reach `http://<mac-ip>:11434/api/tags` directly in Safari.**
Two possibilities:

- macOS firewall is blocking inbound 11434. System Settings -> Network ->
  Firewall -> either disable temporarily, or allow incoming connections for
  the Ollama binary.
- iOS never got the Local Network prompt, or you dismissed it. iOS Settings
  -> Privacy & Security -> Local Network -> make sure Safari is toggled on.

**Ollama only listens on 127.0.0.1.** `OLLAMA_HOST` didn't take. Restart with
it set. The server logs its bound address at startup -- look for
`Listening on [::]:11434` (good) vs `127.0.0.1:11434` (bad).

**Everything works on desktop but not iPhone.** Almost always CORS
(`OLLAMA_ORIGINS` needs the iPhone's origin too, which is the origin of the
server serving Curio -- not the iPhone itself) or Local Network permission.

## Related

- `docs/offline-voice-models.md` -- offline wake word, STT, TTS setup
- `docs/voice-ai.md` -- Curio voice and AI backend overview
