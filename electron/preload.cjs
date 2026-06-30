'use strict';
const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('relay', {
  getConfig: () => ipcRenderer.invoke('getConfig'),
  addPairing: (patch) => ipcRenderer.invoke('addPairing', patch),
  removePairing: (i) => ipcRenderer.invoke('removePairing', i),
  saveLogPath: (p) => ipcRenderer.invoke('saveLogPath', p),
  start: () => ipcRenderer.invoke('start'),
  stop: () => ipcRenderer.invoke('stop'),
  digest: () => ipcRenderer.invoke('digest'),
  onStatus: (cb) => ipcRenderer.on('status', (_e, line) => cb(line)),
  onRefresh: (cb) => ipcRenderer.on('refresh', () => cb()),
  getLoginItem: () => ipcRenderer.invoke('getLoginItem'),
  setLoginItem: (on) => ipcRenderer.invoke('setLoginItem', on),
  onHealth: (cb) => ipcRenderer.on('health', (_e, h) => cb(h)),
});
