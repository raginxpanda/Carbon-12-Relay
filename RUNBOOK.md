# Carbon-12 Relay — Setup & Update Runbook

Everything from zero to live, plus how you push updates afterward. Three pieces:
the **bot** (already on Railway), the **relay app** (the desktop client you hand out),
and the **members** who install it.

---

## PART 1 — Bot (one time, on your server)

The relay talks to Carbon-12's existing dashboard host. Nothing new to host. You just
need the companion feature deployed.

From your Carbon-12 deploy (Railway):

1. Push / deploy the **r243** code.
2. Run pending migrations (adds `companion_devices`, the contract channel column, etc.):
   ```
   npm run migrate
   ```
3. Re-register slash commands (a couple of setup options were added):
   ```
   npm run deploy
   ```
4. Restart the service.

That's the safe order: **migrate → deploy → restart**. If you've been keeping up and only
the handler changed, a restart alone is enough — but running all three never hurts.

**Verify:** open your dashboard, pick an org, and confirm a **Companion** section shows up
with a **Devices** panel. If it's there, the ingest endpoint is live at
`https://carbon-12.gg/dashboard/api/companion/ingest`.

---

## PART 2 — Build & publish the relay app (one time, then once per update)

Do this on your machine. SC is Windows, so you're building a Windows installer.

**One-time GitHub setup (enables auto-update):**
1. Create a **public** repo named `carbon12-relay` and push this folder to it.
2. In `package.json`, under `build.publish`, replace `YOUR_GITHUB_USERNAME` with your
   GitHub username. (Repo stays `carbon12-relay`.)

**Build + publish a release:**
```
npm install
npm version patch          # bumps version, creates a git tag like v0.2.1
git push --follow-tags
```
Pushing the tag triggers the included GitHub Action (`.github/workflows/release.yml`),
which builds the installer and publishes it to your repo's **Releases**. That's where both
members and the auto-updater get it.

Prefer to skip Actions and publish straight from your machine? That works too:
```
set GH_TOKEN=your_personal_access_token
npx electron-builder --win --publish always
```

Either way you end up with `Carbon-12 Relay Setup x.y.z.exe` (plus a portable .exe and a
`latest.yml` the updater reads) attached to a GitHub Release.

Hand members the **Releases page link** (or pin the installer in Discord).

---

## PART 3 — Each member (about 5 minutes, no terminal)

1. Download and run **Carbon-12 Relay Setup**. One-click install, drops a desktop shortcut.
2. In a browser: open the Carbon-12 dashboard → **Companion → Devices → Generate token** →
   copy it.
3. Open the relay. Paste the token, give the org a label, click **Add org**, then **Start**.
4. Confirm the activity log shows **"identified as &lt;your handle&gt;"**. Done — it lives in
   the system tray and starts watching your `Game.log`.

If the path is wrong (custom SC install), open **Advanced** and set the `Game.log` path.

### Member of more than one org?
Repeat step 2–3 with a token from each org's dashboard. Your in-game progress fans out to
every org you add. You only get the welcome-back DM from your **first** org, so no double pings.

---

## PART 4 — Go live (prove the chain end to end)

1. Launch SC and play a session that **earns a blueprint** or **gets you a kill**.
2. The relay sends it; the bot records it.
3. Check in Discord with **/blueprint mine** (or the dashboard) — the new blueprint should
   be there under your name.
4. Next time you start the relay (or relaunch the game), you get the **welcome-back digest**
   as a desktop notification, and a **Discord DM** of the same recap.

That last session is also the one to **save the `Game.log` from** and send over — it's the
only thing still needed to fully lock the blueprint/kill parsers against real data.

---

## PART 5 — Pushing updates (three independent channels)

### A. Bot code — new features or fixes
Deploy to Railway, then:
- Migration added? → `npm run migrate`
- Slash command/option changed? → `npm run deploy`
- Otherwise just **restart**.
Safe default if unsure: migrate → deploy → restart.

### B. Bot data — game content (new patch)
- **Ship/item loadouts:** `npm run ingest:sc` (also runs automatically on patch days via the
  scheduler).
- **Blueprint catalog:** it's a bundled file (`src/data/blueprints.json`). Update it and
  redeploy the bot. No migration.

### C. Relay app — the desktop client
This is the easy one, because of auto-update:
```
npm version patch          # or minor / major
git push --follow-tags
```
GitHub Actions builds and publishes the new installer. **Installed relays update themselves**
— they check on launch and every 6 hours, download in the background, and apply on the next
restart. Members do nothing; they just see "Update ready — restart to apply."

The **only** manual download anyone ever does is the very first install.

---

## Quick reference

| Task | Command |
|---|---|
| Bot: apply DB changes | `npm run migrate` |
| Bot: register commands | `npm run deploy` |
| Bot: refresh game data | `npm run ingest:sc` |
| Relay: build installer locally | `npm run dist` |
| Relay: ship an update | `npm version patch && git push --follow-tags` |
| Relay: pair from CLI | `carbon12-relay pair --token <t> --label "Org"` |
| Relay: list paired orgs | `carbon12-relay list` |
| Relay: catch up on old logs | `carbon12-relay backfill <logbackups folder>` |

## Troubleshooting

- **"not paired"** → add a token in the relay.
- **"identified as" never shows** → wrong `Game.log` path; set it under Advanced.
- **No Discord DM** → your Discord DMs are closed, or you don't share a server with the bot.
- **SmartScreen warning on install** → the .exe isn't code-signed yet (see below). Members
  can click "More info → Run anyway," but it looks unofficial.

## Known gaps (honest list)

1. **First `npm run dist` / first Action run** hasn't been executed here — confirm it builds
   on your machine. If it errors, send me the output.
2. **Code signing** — without it, Windows SmartScreen warns on first run. Worth setting up
   before a wide rollout; it needs a code-signing certificate. Say the word and I'll add the
   signing config.
3. **blueprint_earned / actor_death parsers** are format-correct but not yet proven on a real
   log that contains them — see Part 4.
