import { contextBridge } from 'electron'

// 必要に応じてElectron APIをRendererプロセスに公開する
contextBridge.exposeInMainWorld('electronAPI', {
  platform: process.platform,
})
