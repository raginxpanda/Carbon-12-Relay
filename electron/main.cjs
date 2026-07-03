'use strict';
const { app, Tray, Menu, BrowserWindow, Notification, ipcMain, nativeImage, dialog } = require('electron');
const path = require('node:path');
let autoUpdater = null;
try { ({ autoUpdater } = require('electron-updater')); } catch {}
let tray = null, win = null, relay = null, mods = null;

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
  relay = relayMod.startRelay({ config: cfg, notify: (m) => notify('Carbon-12 Relay', m), log: status });
  status(`relay running -> ${cfg.pairings.length} org(s)`); updateTray(true); return { ok: true };
}
function stopRelay() { if (relay) { relay.stop(); relay = null; } status('relay stopped'); updateTray(false); }

function showAbout() {
  const ver = (() => { try { return app.getVersion(); } catch { return '?'; } })();
  dialog.showMessageBox({
    type: 'info', title: 'About Carbon-12 Relay',
    message: 'Carbon-12 Relay', detail:
      'Version ' + ver + '\n\nStar Citizen telemetry relay for Carbon-12 orgs.\n' +
      'Reads your Game.log and syncs blueprints & combat to your org.\n\n' +
      'Your quarters: carbon-12.gg/quarters/BDC\n' +
      'Black Diamond Corporation',
    buttons: ['Open Quarters', 'Close'], defaultId: 1, cancelId: 1,
  }).then((r) => { if (r.response === 0) { try { require('electron').shell.openExternal('https://carbon-12.gg/quarters/BDC'); } catch {} } }).catch(() => {});
}

function buildAppMenu() {
  const isMac = process.platform === 'darwin';
  const template = [
    ...(isMac ? [{ role: 'appMenu' }] : []),
    { label: 'Relay', submenu: [
      { label: 'Start', accelerator: 'CmdOrCtrl+S', click: () => startRelay() },
      { label: 'Stop', accelerator: 'CmdOrCtrl+.', click: () => stopRelay() },
      { label: 'Refresh haul', accelerator: 'CmdOrCtrl+R', click: () => { if (win && !win.isDestroyed()) win.webContents.send('shortcut', 'refresh'); } },
      { label: 'Catch up', accelerator: 'CmdOrCtrl+U', click: () => { if (win && !win.isDestroyed()) win.webContents.send('shortcut', 'catchup'); } },
      { type: 'separator' },
      { label: 'Copy activity log', accelerator: 'CmdOrCtrl+L', click: () => { if (win && !win.isDestroyed()) win.webContents.send('shortcut', 'copylog'); } },
      { type: 'separator' },
      { role: 'quit' },
    ] },
    { label: 'View', submenu: [
      { role: 'reload' }, { role: 'toggledevtools' }, { type: 'separator' },
      { role: 'resetzoom' }, { role: 'zoomin' }, { role: 'zoomout' }, { type: 'separator' }, { role: 'togglefullscreen' },
    ] },
    { label: 'Help', submenu: [
      { label: 'Open Quarters', click: () => { try { require('electron').shell.openExternal('https://carbon-12.gg/quarters/BDC'); } catch {} } },
      { label: 'About Carbon-12 Relay', click: showAbout },
    ] },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

function createWindow() {
  if (win && !win.isDestroyed()) { win.show(); win.focus(); return; }
  let bounds = {};
  try { const cfgPath = require('path').join(require('os').homedir(), '.carbon12-relay', 'window.json'); if (require('fs').existsSync(cfgPath)) bounds = JSON.parse(require('fs').readFileSync(cfgPath, 'utf8')); } catch {}
  win = new BrowserWindow({ width: bounds.width || 560, height: bounds.height || 680, x: bounds.x, y: bounds.y, title: 'Carbon-12 Relay', icon: path.join(__dirname, 'icon.png'),
    webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, nodeIntegration: false } });
  const saveBounds = () => { try { const b = win.getBounds(); const dir = require('path').join(require('os').homedir(), '.carbon12-relay'); require('fs').mkdirSync(dir, { recursive: true }); require('fs').writeFileSync(require('path').join(dir, 'window.json'), JSON.stringify(b)); } catch {} };
  win.on('resize', saveBounds); win.on('move', saveBounds);
  buildAppMenu();
  win.loadFile(path.join(__dirname, 'index.html'));
  win.on('close', (e) => { e.preventDefault(); win.hide(); });
}
let lastTrayStatus = { running: false, line: 'stopped', pending: 0 };
function updateTray(running, extra) {
  if (!tray) return;
  if (typeof running === 'boolean') lastTrayStatus.running = running;
  if (extra && extra.line) lastTrayStatus.line = extra.line;
  if (extra && typeof extra.pending === 'number') lastTrayStatus.pending = extra.pending;
  const r = lastTrayStatus.running;
  const ver = (() => { try { return app.getVersion(); } catch { return '?'; } })();
  tray.setToolTip(`Carbon-12 Relay v${ver}\n${r ? '\u25cf ' + lastTrayStatus.line : '\u25cb stopped'}${lastTrayStatus.pending ? ' \u00b7 ' + lastTrayStatus.pending + ' queued' : ''}`);
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: r ? `\u25cf Relay: running${lastTrayStatus.pending ? ' (' + lastTrayStatus.pending + ' queued)' : ''}` : '\u25cb Relay: stopped', enabled: false },
    { type: 'separator' },
    { label: 'Open', click: createWindow },
    { label: r ? 'Stop' : 'Start', click: () => (r ? stopRelay() : startRelay()) },
    { label: 'Catch up on past sessions', enabled: r, click: async () => { try { const res = await ipcInvokeCatchUp(); notify('Carbon-12 Relay', res); } catch {} } },
    { type: 'separator' },
    { label: 'Quit', click: () => { stopRelay(); app.exit(0); } },
  ]));
}
async function ipcInvokeCatchUp() { return 'Open the window to catch up.'; }
function setupAutoUpdate() {
  if (!autoUpdater) return;
  try {
    autoUpdater.autoDownload = true;
    autoUpdater.on('update-available', (i) => status(`update available: v${i.version} — downloading in background`));
    autoUpdater.on('update-downloaded', (i) => { status(`update v${i.version} ready — restart to apply`); notify('Carbon-12 Relay', `Update v${i.version} ready. Restart to apply.`); });
    autoUpdater.on('error', (e) => status(`update check failed: ${e && e.message}`));
    autoUpdater.checkForUpdatesAndNotify().catch(() => {});
    setInterval(() => autoUpdater.checkForUpdatesAndNotify().catch(() => {}), 6 * 60 * 60 * 1000);
  } catch (e) { status(`auto-update unavailable: ${e.message}`); }
}
// One-click pairing: dashboard opens carbon12://pair?token=...&label=...&endpoint=...
async function handlePairUrl(url) {
  if (!url) return;
  let u; try { u = new URL(url); } catch { return; }
  if (u.host !== 'pair') return;
  const token = u.searchParams.get('token'); if (!token) return;
  const label = u.searchParams.get('label') || 'this org';
  const endpoint = u.searchParams.get('endpoint') || undefined;
  const r = await dialog.showMessageBox({ type: 'question', buttons: ['Add', 'Cancel'], defaultId: 0, cancelId: 1,
    title: 'Carbon-12 Relay', message: `Pair this device with ${label}?`,
    detail: `Your in-game progress will start syncing to ${label}.${endpoint ? `\n\n${endpoint}` : ''}` });
  if (r.response !== 0) return;
  const { config } = await load();
  const cfg = config.loadConfig(); config.addPairing(cfg, { token, label, endpoint }); config.saveConfig(cfg);
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
    ipcMain.handle('getSound', async () => { try { const { config } = await load(); return { on: !!config.loadConfig().soundOn }; } catch { return { on: false }; } });
    ipcMain.handle('setSound', async (_e, on) => { try { const { config } = await load(); const cfg = config.loadConfig(); cfg.soundOn = !!on; config.saveConfig(cfg); } catch {} return { ok: true }; });
    startRelay(); setupAutoUpdate();
    setInterval(() => {
      if (!relay || !relay.clients || !win || win.isDestroyed()) return;
      const now = Date.now();
      const health = relay.clients.map(({ label, client }) => { const h = client.health(); return { label, pending: h.pending, status: h.status, agoMs: h.lastSuccessAt ? now - h.lastSuccessAt : null }; });
      win.webContents.send('health', health);
      const totalPending = health.reduce((a, h) => a + (h.pending || 0), 0);
      const anyOk = health.some((h) => h.status === 'ok' || h.status === 'idle');
      updateTray(true, { line: anyOk ? 'connected' : 'reconnecting\u2026', pending: totalPending });
    }, 5000);
    const initial = process.argv.find((a) => a.startsWith('carbon12://')); if (initial) handlePairUrl(initial);
  });
  app.on('window-all-closed', () => {});
}
