import { contextBridge, ipcRenderer } from 'electron'
import type { Api, ImportProgress } from '../shared/types'

const api: Api = {
  clients: {
    list: () => ipcRenderer.invoke('clients:list'),
    save: (c) => ipcRenderer.invoke('clients:save', c),
    remove: (id) => ipcRenderer.invoke('clients:remove', id)
  },
  sessions: {
    list: (filter) => ipcRenderer.invoke('sessions:list', filter),
    get: (id) => ipcRenderer.invoke('sessions:get', id),
    save: (s) => ipcRenderer.invoke('sessions:save', s),
    remove: (id) => ipcRenderer.invoke('sessions:remove', id)
  },
  photos: {
    list: (sessionId) => ipcRenderer.invoke('photos:list', sessionId),
    update: (ids, patch) => ipcRenderer.invoke('photos:update', ids, patch),
    remove: (ids) => ipcRenderer.invoke('photos:remove', ids),
    importFiles: (sessionId) => ipcRenderer.invoke('photos:import', sessionId),
    exportPicks: (sessionId) => ipcRenderer.invoke('photos:exportPicks', sessionId),
    reveal: (id) => ipcRenderer.invoke('photos:reveal', id),
    onImportProgress: (cb) => {
      const listener = (_e: unknown, p: ImportProgress) => cb(p)
      ipcRenderer.on('photos:import-progress', listener)
      return () => ipcRenderer.removeListener('photos:import-progress', listener)
    }
  },
  stats: () => ipcRenderer.invoke('stats'),
  mediaUrl: (key) => `foto://media/${encodeURIComponent(key)}`
}

contextBridge.exposeInMainWorld('api', api)
