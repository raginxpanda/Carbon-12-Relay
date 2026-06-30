# Carbon-12 Relay

Desktop companion for [Carbon-12]. It tails the Star Citizen `Game.log`, recognizes
events, and pushes them to your org's Carbon-12 ingest endpoint so things like the
blueprints you earn in-game sync automatically (no manual `/blueprint own`).

This is the **headless core** — runs as a CLI today. A system-tray GUI (Tauri) wraps it later.

## How it fits
1. In the Carbon-12 dashboard → **Companion → Devices**, generate a device token.
2. Pair the relay with that token + your org's ingest URL.
3. Run it. It self-identifies your handle from the log and forwards scoped events.

```
carbon12-relay pair --endpoint https://carbon-12.gg/dashboard/api/companion/ingest --token <DEVICE_TOKEN> --log "C:\Program Files\Roberts Space Industries\StarCitizen\LIVE\Game.log"
carbon12-relay run
```

Config is stored at `~/.carbon12-relay/config.json`.

## Welcome-back digest
The relay keeps a local history of your haul (`~/.carbon12-relay/events.jsonl`). When
you start it, it greets you with a summary of your last session — e.g.
*"Welcome back. Last night you logged 3 blueprints (…) · 2 kills."* It also fires a
digest when a fresh in-game session begins. Print it on demand with:

```
carbon12-relay digest
```

## Backfill past sessions
Catch up on blueprints/kills from your historical logs (the SC Logbackups folder):

```
carbon12-relay backfill "C:\\...\\StarCitizen\\LIVE\\logbackups"
```

In the headless build the digest prints to the console; the Tauri GUI will deliver it
as a native desktop notification. If the relay is paired, it also sends the recap to
Carbon-12, which **DMs you the same summary on Discord** — so you get it on your phone
even when you're away from the PC. Each session's recap is shown/sent exactly once.

## Events
| event | sent to org | status |
|---|---|---|
| `handle_detected` | no (local identity) | CONFIRMED on real 4.8.184 log |
| `session_start` | no (context) | CONFIRMED |
| `blueprint_earned` | yes | marker proven by Warchest; pending a real blueprint session |
| `actor_death` | yes (future) | community-known format; pending a combat session |

## Privacy
Passive, read-only, log-only — it reads `Game.log` and nothing else. No injection,
no other files. The device token lives in your local config and is revocable from
the dashboard. You control what's shared.

## Next
- Validate `blueprint_earned` / `actor_death` against logs that contain them.
- Tauri tray GUI: pairing screen, on/off toggle, live event feed, auto-update.

## Desktop app (Electron)
A tray GUI wraps the same tested core: pairing screen, start/stop, live activity, and
the welcome-back digest delivered as a **native desktop notification**.

```
npm install        # pulls electron (first run only)
npm run gui
```

It lives in the tray; closing the window keeps it running. Paired settings persist in
`~/.carbon12-relay/config.json`.

> Built and syntax-verified, but not run in CI — give it a quick check on your machine:
> `npm run gui`, pair, hit Start, and confirm the activity log shows "identified as <you>".
> Package an installer later with electron-builder.

## Installing it (for members — no terminal)
Cody builds the installer once, members just download and run it.

**Build the installer (one time):**
```
npm install
npm run dist        # -> dist/Carbon-12 Relay Setup x.y.z.exe  (+ portable .exe)
```
Host that `.exe` (GitHub release, your site, or pin it in Discord).

**Each member:**
1. Download and run the installer (one-click, adds a desktop shortcut).
2. Open the Carbon-12 dashboard → **Companion → Devices** → **Generate token** → copy.
3. Paste the token into the relay, click **Start**. That's it — the endpoint is pre-filled.

## How it connects to the bot
```
Relay (member PC)                         Carbon-12 (one shared host, e.g. carbon-12.gg)
  tails Game.log
  parses events  ──HTTPS POST──►  /dashboard/api/companion/ingest
  Authorization: Bearer <device token>          │ token → (org, member)
                                                 ▼
                                        member_blueprints (that member, that org)
                                        session_recap → DM to that member
```
No extra server. The relay talks to the bot's existing dashboard host. The **token** is
what identifies you — it's minted per member from the dashboard and stored only as a hash
on the server.

## Multi-user & multi-org
Same multi-tenant model as the bot:
- **Many members, one org** — each member generates their own token (tied to their Discord
  id + org). Ten people in BDC run ten relays; each token routes to the right member.
- **Other orgs** — a member of another org generates a token from *their* org's dashboard;
  it carries that org's id and writes only to that org's data (row-level isolation, exactly
  like the bot). One Carbon-12 host serves every org; the token decides where data lands.
- Revoking a token (dashboard → Devices) instantly cuts off that one device.

## Member of more than one org?
Add a token for each org. The relay sends your in-game events to **every** paired org,
each through its own token, so your blueprint/kill coverage shows up in all of them. The
welcome-back recap DM goes to your primary (first) org only, so you're not pinged twice.
Remove an org anytime — the others keep working.

```
carbon12-relay pair --token <BDC token>   --label "Black Diamond"
carbon12-relay pair --token <other token> --label "Second Org"
carbon12-relay list
```

## Connection check, health, and startup
- On Start the relay **confirms each token** with the bot and logs `connected \u2713 (Org)` — so
  you know pairing worked before any in-game event.
- The **Connection** panel shows live status per org: `synced 2m ago \u00b7 0 queued` (green) or
  `offline \u00b7 3 queued` (amber) if the network drops.
- **Launch at login** (checkbox) starts the relay hidden in the tray with your PC, so the
  welcome-back digest always has the full session.
