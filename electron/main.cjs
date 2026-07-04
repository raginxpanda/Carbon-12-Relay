'use strict';
const { app, Tray, Menu, BrowserWindow, Notification, ipcMain, nativeImage, dialog } = require('electron');
const path = require('node:path');
let autoUpdater = null;
try { ({ autoUpdater } = require('electron-updater')); } catch {}
let tray = null, win = null, relay = null, mods = null;
let isUpdating = false; // set during an update so window-all-closed doesn't block the quit

async function load() {
  if (mods) return mods;
  mods = { config: await import('../src/config.mjs'), relay: await import('../src/relay.mjs'), store: await import('../src/store.mjs'), digest: await import('../src/digest.mjs') };
  return mods;
}
function notify(t, b) { if (Notification.isSupported()) new Notification({ title: t, body: b }).show(); }
function status(l) { if (win && !win.isDestroyed()) win.webContents.send('status', String(l)); }
async function startRelay() {
  const { config, relay: relayMod } = await load();
  const cfg = config.loadConfig();
  if (!cfg.pairings.length) { status('not paired — pair from your dashboard or add a token below'); updateTray(false); return { ok: false, reason: 'unpaired' }; }
  if (relay) relay.stop();
  relay = relayMod.startRelay({
    config: cfg,
    notify: (m) => notify('Carbon-12 Relay', m),
    log: status,
    onHaulChanged: () => { if (win && !win.isDestroyed()) win.webContents.send('refresh'); },
  });
  status(`relay running -> ${cfg.pairings.length} org(s)`); updateTray(true); return { ok: true };
}
function stopRelay() { if (relay) { relay.stop(); relay = null; } status('relay stopped'); updateTray(false); }
function createWindow() {
  if (win && !win.isDestroyed()) { win.show(); win.focus(); return; }
  win = new BrowserWindow({ width: 560, height: 680, title: 'Carbon-12 Relay', icon: path.join(__dirname, 'icon.png'),
    webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, nodeIntegration: false } });
  win.loadFile(path.join(__dirname, 'index.html'));
  win.on('close', (e) => { e.preventDefault(); win.hide(); });
}
function updateTray(running) {
  if (!tray) return;
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: running ? '\u25cf Relay: running' : '\u25cb Relay: stopped', enabled: false }, { type: 'separator' },
    { label: 'Open', click: createWindow }, { label: running ? 'Stop' : 'Start', click: () => (running ? stopRelay() : startRelay()) },
    { type: 'separator' }, { label: 'Quit', click: () => { stopRelay(); app.exit(0); } },
  ]));
}
function setupAutoUpdate() {
  if (!autoUpdater) return;
  try {
    autoUpdater.autoDownload = true;
    autoUpdater.on('update-available', (i) => status(`update available: v${i.version} — downloading in background`));
    autoUpdater.on('update-downloaded', (i) => {
      status(`update v${i.version} ready`);
      notify('Carbon-12 Relay', `Update v${i.version} ready. Click "Restart & Update" in the app.`);
      // tell the window to show the in-app "Restart & Update" banner
      if (win && !win.isDestroyed()) win.webContents.send('update-ready', { version: i.version });
    });
    autoUpdater.on('error', (e) => status(`update check failed: ${e && e.message}`));
    autoUpdater.checkForUpdatesAndNotify().catch(() => {});
    setInterval(() => autoUpdater.checkForUpdatesAndNotify().catch(() => {}), 6 * 60 * 60 * 1000);
  } catch (e) { status(`auto-update unavailable: ${e.message}`); }
}
// One-click pairing: dashboard opens carbon12://pair?token=...&label=...&endpoint=...
// SECURITY: this deep link can be triggered by ANY webpage with an attacker-chosen
// label + endpoint, so we allowlist the endpoint host to the official server.
const OFFICIAL_HOST = 'carbon-12.gg';
function endpointHost(ep) { try { return new URL(ep).host.toLowerCase(); } catch { return null; } }
function isOfficialEndpoint(ep) {
  if (!ep) return true;
  const h = endpointHost(ep);
  return h === OFFICIAL_HOST || h === `www.${OFFICIAL_HOST}`;
}
async function handlePairUrl(url) {
  if (!url) return;
  let u; try { u = new URL(url); } catch { return; }
  if (u.host !== 'pair') return;
  const token = u.searchParams.get('token'); if (!token) return;
  const label = u.searchParams.get('label') || 'this org';
  const endpoint = u.searchParams.get('endpoint') || undefined;
  const { config } = await load();
  const cfg = config.loadConfig();
  const official = isOfficialEndpoint(endpoint);
  if (!official && !cfg.allowCustomEndpoint) {
    await dialog.showMessageBox({ type: 'warning', buttons: ['OK'], defaultId: 0,
      title: 'Carbon-12 Relay — pairing blocked',
      message: 'This pairing link points to an unofficial server.',
      detail: `For your safety, Carbon-12 only pairs with ${OFFICIAL_HOST} by default.\n\nRequested server: ${endpointHost(endpoint) || endpoint}\n\nIf you really mean to use a custom server, enable "Allow custom endpoints" in Settings first, then try again.` });
    status('pairing blocked: unofficial endpoint');
    return;
  }
  const detail = official
    ? `Your in-game progress will sync to ${label} on the official Carbon-12 server (${OFFICIAL_HOST}).`
    : `\u26a0\ufe0f CUSTOM SERVER\n\nThis sends your telemetry to a NON-official server:\n${endpointHost(endpoint)}\n\nOnly continue if you set this up yourself.`;
  const r = await dialog.showMessageBox({ type: official ? 'question' : 'warning', buttons: ['Add', 'Cancel'], defaultId: official ? 0 : 1, cancelId: 1,
    title: 'Carbon-12 Relay', message: `Pair this device with ${label}?`, detail });
  if (r.response !== 0) return;
  config.addPairing(cfg, { token, label, endpoint }); config.saveConfig(cfg);
  notify('Carbon-12 Relay', `Paired with ${label}.`); status(`paired with ${label}`);
  createWindow(); if (win && !win.isDestroyed()) win.webContents.send('refresh');
  startRelay();
}

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) { app.quit(); }
else {
  app.setAsDefaultProtocolClient('carbon12');
  app.on('second-instance', (_e, argv) => { const url = argv.find((a) => a.startsWith('carbon12://')); if (url) handlePairUrl(url); if (win) { win.show(); win.focus(); } });
  app.on('open-url', (e, url) => { e.preventDefault(); handlePairUrl(url); }); // macOS
  app.whenReady().then(async () => {
    let img = nativeImage.createFromPath(path.join(__dirname, 'icon.png')); if (img.isEmpty()) img = nativeImage.createEmpty();
    tray = new Tray(img); tray.setToolTip(`Carbon-12 Relay v${(() => { try { return app.getVersion(); } catch { return '?'; } })()}`); tray.on('click', createWindow); updateTray(false); createWindow();
    ipcMain.handle('getVersion', () => { try { return app.getVersion(); } catch { return '?'; } });
  ipcMain.handle('getConfig', async () => { const { config } = await load(); const c = config.loadConfig();
      return { logPath: c.logPath, logBackupsPath: c.logBackupsPath || '', pairings: c.pairings.map((p) => ({ label: p.label, endpoint: p.endpoint, tokenMasked: '\u2022\u2022\u2022\u2022' + String(p.token).slice(-4) })) }; });
    ipcMain.handle('addPairing', async (_e, patch) => { const { config } = await load(); const cfg = config.loadConfig(); config.addPairing(cfg, patch); config.saveConfig(cfg); return { ok: true }; });
    ipcMain.handle('removePairing', async (_e, i) => { const { config } = await load(); const cfg = config.loadConfig(); config.removePairing(cfg, i); config.saveConfig(cfg); return { ok: true }; });
    ipcMain.handle('saveLogPath', async (_e, p) => { const { config } = await load(); const cfg = config.loadConfig(); cfg.logPath = p; config.saveConfig(cfg); return { ok: true }; });
    ipcMain.handle('saveLogBackupsPath', async (_e, p) => { const { config } = await load(); const cfg = config.loadConfig(); config.setLogBackupsPath(cfg, p); config.saveConfig(cfg); return { ok: true }; });
    ipcMain.handle('start', () => startRelay());
    ipcMain.handle('installUpdate', () => {
      if (!autoUpdater) return { ok: false, reason: 'no-updater' };
      isUpdating = true;
      status('installing update — closing app…');
      // Release everything that could hold the executable open, or Windows can't
      // swap the .exe and the installer sits on a "close the app / retry" prompt.
      try { if (relay) { relay.stop(); relay = null; } } catch {}
      try { if (tray) { tray.destroy(); tray = null; } } catch {}
      try { for (const w of BrowserWindow.getAllWindows()) { w.removeAllListeners('close'); w.destroy(); } } catch {}
      // quitAndInstall on the next tick, after teardown settles.
      setImmediate(() => {
        try { autoUpdater.quitAndInstall(false, true); } // isSilent=false, forceRunAfter=true
        catch (e) { status(`update install failed: ${e.message}`); }
        // Hard fallback: if the app is still alive shortly after, force-exit so the
        // installer's file lock clears and it can finish. quitAndInstall relaunches us.
        setTimeout(() => { try { app.exit(0); } catch {} }, 4000);
      });
      return { ok: true };
    });
    ipcMain.handle('stop', () => { stopRelay(); return { ok: true }; });
    ipcMain.handle('digest', async () => { const { store, digest } = await load(); return digest.formatDigest(store.mostRecentSession()) || 'No recorded haul yet.'; });
  ipcMain.handle('haul', async () => {
    const { config, relay: relayMod } = await load();
    const cfg = config.loadConfig();
    if (!cfg.pairings.length) return { ok: false, reason: 'unpaired' };
    const clients = relayMod.makeClients(cfg.pairings);
    return await clients[0].client.haul();
  });
  ipcMain.handle('catchUp', async () => {
    const { config, relay: relayMod } = await load();
    const cfg = config.loadConfig();
    if (!cfg.pairings.length) return { ok: false, reason: 'unpaired' };
    const backfill = await import('../src/backfill.mjs');
    const dir = config.resolveBackupsDir(cfg, path);
    const back = backfill.scanLogs(dir);
    const cur = backfill.scanFile(cfg.logPath);
    const rawEvents = [...back.events, ...cur];
    // Dedupe blueprint_earned across the WHOLE scan (logs echo the same BP many times,
    // and the same BP appears across multiple backups). One event per unique name.
    const seen = new Set();
    const events = [];
    for (const ev of rawEvents) {
      if (ev.type === 'blueprint_earned') {
        const key = (ev.name || '').trim().toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
      }
      events.push(ev);
    }
    const rawCount = rawEvents.length;
    if (!events.length) return { ok: true, files: back.files, found: 0, sent: 0, dir, rawLines: back.rawLines || 0, allFiles: back.allFiles || 0, scanError: back.error || null };
    const clients = relayMod.makeClients(cfg.pairings);
    let sent = 0;
    let lastErr = null;
    for (const { client } of clients) { client.enqueueAll(events); const r = await client.drainAll(1000); if (r.ok) sent += (r.sent || 0); else lastErr = r.reason + (r.status ? ' ' + r.status : ''); }
    return { ok: true, files: back.files, found: events.length, rawCount, sent, dir, rawLines: back.rawLines || 0, allFiles: back.allFiles || 0, sendError: lastErr };
  });
    ipcMain.handle('getLoginItem', () => { try { return { openAtLogin: app.getLoginItemSettings().openAtLogin }; } catch { return { openAtLogin: false }; } });
    ipcMain.handle('setLoginItem', (_e, on) => { try { app.setLoginItemSettings({ openAtLogin: !!on, openAsHidden: true }); } catch {} return { ok: true }; });
    startRelay(); setupAutoUpdate();
    setInterval(() => {
      if (!relay || !relay.clients || !win || win.isDestroyed()) return;
      const now = Date.now();
      const health = relay.clients.map(({ label, client }) => { const h = client.health(); return { label, pending: h.pending, status: h.status, agoMs: h.lastSuccessAt ? now - h.lastSuccessAt : null }; });
      win.webContents.send('health', health);
    }, 5000);
    const initial = process.argv.find((a) => a.startsWith('carbon12://')); if (initial) handlePairUrl(initial);
  });
  app.on('window-all-closed', () => { if (isUpdating) { try { app.quit(); } catch {} } });
}
