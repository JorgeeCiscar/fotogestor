import { contextBridge, ipcRenderer } from 'electron'
import type { Api } from '../shared/types'

const invoke = (channel: string) => (...args: unknown[]) => ipcRenderer.invoke(channel, ...args)
function subscribe<T>(channel: string, cb: (p: T) => void): () => void {
  const listener = (_e: unknown, p: T) => cb(p)
  ipcRenderer.on(channel, listener)
  return () => { ipcRenderer.removeListener(channel, listener) }
}

const api: Api = {
  clients: { list: invoke('clients:list'), get: invoke('clients:get'), save: invoke('clients:save'), remove: invoke('clients:remove') },
  sessions: {
    list: invoke('sessions:list'), get: invoke('sessions:get'), save: invoke('sessions:save'), remove: invoke('sessions:remove')
  },
  photos: {
    list: invoke('photos:list'),
    update: invoke('photos:update'),
    remove: invoke('photos:remove'),
    importFiles: invoke('photos:import'),
    exportPicks: invoke('photos:exportPicks'),
    reveal: invoke('photos:reveal'),
    addTag: invoke('photos:addTag'),
    removeTag: invoke('photos:removeTag'),
    onImportProgress: (cb) => subscribe('photos:import-progress', cb)
  },
  library: {
    query: invoke('library:query'),
    ids: invoke('library:ids'),
    copyTo: invoke('library:copyTo'),
    startDrag: (ids: number[]) => ipcRenderer.send('library:startDrag', ids),
    onCopyProgress: (cb) => subscribe('library:copy-progress', cb)
  },
  contacts: { list: invoke('contacts:list'), get: invoke('contacts:get'), save: invoke('contacts:save'), remove: invoke('contacts:remove') },
  tariffs: { list: invoke('tariffs:list'), save: invoke('tariffs:save'), remove: invoke('tariffs:remove') },
  tags: invoke('tags'),
  championships: invoke('championships'),
  search: invoke('search'),
  gallery: {
    export: invoke('gallery:export'),
    importSelection: invoke('gallery:importSelection'),
    onProgress: (cb) => subscribe('gallery:progress', cb)
  },
  settings: { get: invoke('settings:get'), save: invoke('settings:save'), chooseLogo: invoke('settings:chooseLogo') },
  invoices: {
    list: invoke('invoices:list'),
    get: invoke('invoices:get'),
    save: invoke('invoices:save'),
    remove: invoke('invoices:remove'),
    convertToInvoice: invoke('invoices:convert'),
    exportPdf: invoke('invoices:exportPdf')
  },
  stats: invoke('stats'),
  app: {
    version: invoke('app:version'),
    updateStatus: invoke('update:status'),
    checkForUpdates: invoke('update:check'),
    installUpdate: invoke('update:install'),
    onUpdateStatus: (cb) => subscribe('update:status', cb),
    whatsNew: invoke('app:whatsNew'),
    whatsNewSeen: invoke('app:whatsNewSeen')
  },
  mediaUrl: (key) => `foto://media/${encodeURIComponent(key)}`
} as Api

contextBridge.exposeInMainWorld('api', api)
