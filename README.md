# Media Remote

Pause and resume whatever is playing in Chrome on your computer from your iPhone, from anywhere.

```
 iOS app ──HTTPS──▶ Cloudflare Worker relay ◀──WebSocket── Chrome extension ──▶ every tab's <audio>/<video>
         ◀─status──                         ◀──status─────
```

- **`extension/`** is a Chrome extension (Manifest V3). It keeps a WebSocket open to the relay. On a command, it pauses every audible `<audio>`/`<video>` in every tab, including iframes and shadow DOM. It remembers what it paused, so "play" resumes only those. Muted background videos are left alone. It reports what's playing back to the relay. Clicking the toolbar icon also toggles playback.
- **`relay/`** is a Cloudflare Worker with one Durable Object. The extension connects outbound, so nothing on your computer is exposed and no VPN is needed. A shared token protects it.
- **`ios/`** is a SwiftUI app with a big play/pause button, a live "now playing" list, and a "Chrome connected" indicator. It also includes a **Toggle Chrome Playback** App Intent, which you can use from Shortcuts, Siri, the Action button, or Back Tap without opening the app.

## Setup

### 1. Deploy the relay

```sh
cd relay
npm install
npx wrangler login
openssl rand -hex 32            # copy this; it's your token
npx wrangler secret put AUTH_TOKEN
npx wrangler deploy             # prints https://media-remote-relay.<you>.workers.dev
```

The free Workers plan is enough. The relay uses a SQLite-backed Durable Object, and keepalive pings are answered without waking it.

### 2. Install the Chrome extension

1. Open `chrome://extensions` and turn on **Developer mode**.
2. Click **Load unpacked** and pick the `extension/` folder.
3. The settings page opens. Enter the relay URL and token, then click **Save**. The status should change to **connected**, and the red "off" badge on the icon disappears.

### 3. Build the iOS app

Using [XcodeGen](https://github.com/yonaskolb/XcodeGen):

```sh
brew install xcodegen
cd ios && xcodegen && open MediaRemote.xcodeproj
```

Set your signing team and bundle ID, then run it on your phone. Enter the same relay URL and token in Settings.

Without XcodeGen, create a new iOS App project in Xcode (SwiftUI, iOS 17+) and drag in the files from `ios/MediaRemote/`, replacing the generated `App` and `ContentView` files.

## Relay API

All endpoints except `/` require `Authorization: Bearer <token>`. `/ws` takes `?token=` instead.

| Method | Path       | Body / result |
|--------|------------|---------------|
| POST   | `/command` | `{"action": "toggle" \| "pause" \| "play"}` → `{ok, delivered}` (503 if no browser is connected) |
| GET    | `/status`  | `{connected, state: {playing, tabs: [{title, url}], resumable, reportedAt}}` |
| GET    | `/ws`      | WebSocket used by the extension |

You can trigger it from anything that can send HTTP, for example `curl -X POST -H "Authorization: Bearer $TOKEN" -d '{"action":"toggle"}' $RELAY/command`.

## How toggle behaves

1. If anything audible is playing in any tab, pause all of it.
2. Otherwise, resume what the remote paused last time.
3. If the remote didn't pause anything (for example, you paused by hand), start the main player in the tab that most recently played.

## Development

```sh
cd relay && echo 'AUTH_TOKEN=dev-token' > .dev.vars && npm run dev   # local relay on :8787
cd relay && npm test                                                  # relay smoke test
cd extension/test && npm install && npm test                          # E2E: Chromium + extension + relay
```

## Known limits

- Chrome has to be running. The extension reconnects automatically after sleep or network changes.
- Media that isn't attached to the page (a script-only `new Audio()`, or Web Audio API sound) can't be found. That's rare for real players.
- Every connected browser receives commands. The status shown is from whichever browser reported last.
