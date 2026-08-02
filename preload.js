'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('pulse', {
  get: () => ipcRenderer.invoke('data:get'),
  refresh: () => ipcRenderer.invoke('data:refresh'),
  onUpdate: (cb) => {
    const handler = (_e, patch) => cb(patch);
    ipcRenderer.on('data:update', handler);
    return () => ipcRenderer.removeListener('data:update', handler);
  },
  portfolio: {
    read: () => ipcRenderer.invoke('portfolio:read'),
    add: (h) => ipcRenderer.invoke('portfolio:add', h),
    update: (id, patch) => ipcRenderer.invoke('portfolio:update', { id, patch }),
    remove: (id, sellPrice) => ipcRenderer.invoke('portfolio:remove', { id, sellPrice }),
    sell: (id, sale) => ipcRenderer.invoke('portfolio:sell', { id, sale }),
    setBase: (c) => ipcRenderer.invoke('portfolio:base', c),
    setCash: (a) => ipcRenderer.invoke('portfolio:cash', a),
    import: (d) => ipcRenderer.invoke('portfolio:import', d)
  },
  settings: {
    get: () => ipcRenderer.invoke('settings:get'),
    set: (patch) => ipcRenderer.invoke('settings:set', patch)
  },
  win: {
    minimize: () => ipcRenderer.invoke('win:minimize'),
    hide: () => ipcRenderer.invoke('win:hide'),
    quit: () => ipcRenderer.invoke('win:quit'),
    toggleMaximize: () => ipcRenderer.invoke('win:toggleMaximize'),
    toggleFullscreen: () => ipcRenderer.invoke('win:toggleFullscreen'),
    state: () => ipcRenderer.invoke('win:state')
  },
  openExternal: (url) => ipcRenderer.invoke('shell:open', url),
  lookup: (symbol) => ipcRenderer.invoke('search:quote', symbol),
  search: (query) => ipcRenderer.invoke('search:symbols', query),
  priceAt: (symbol, ts) => ipcRenderer.invoke('search:priceAt', { symbol, ts }),
  history: (symbol, range) => ipcRenderer.invoke('search:history', { symbol, range })
});
