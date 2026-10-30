import { contextBridge, ipcRenderer } from 'electron'

const api = {
  invoke: (channel: string, ...args: unknown[]) => ipcRenderer.invoke(channel, ...args),
  on: (channel: string, fn: (payload: any) => void) => {
    const listener = (_e: unknown, payload: unknown) => fn(payload)
    ipcRenderer.on(channel, listener)
    return () => void ipcRenderer.removeListener(channel, listener)
  }
}

contextBridge.exposeInMainWorld('easel', api)
export type EaselApi = typeof api
