import { app, BrowserWindow } from 'electron'
import { GetAppInfoUseCase } from '@application/get-app-info'
import { ElectronAppInfoProvider } from '@infrastructure/electron-app-info-provider'
import { registerIpcHandlers } from './ipc/register-handlers'
import { blockOutgoingNetwork } from './security'
import { createMainWindow } from './window'

/** Composition root : seul endroit où les implémentations sont branchées sur les ports. */
function bootstrap(): void {
  blockOutgoingNetwork()
  registerIpcHandlers({
    getAppInfo: new GetAppInfoUseCase(new ElectronAppInfoProvider())
  })
  createMainWindow()
}

void app.whenReady().then(() => {
  bootstrap()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createMainWindow()
  })
})

app.on('window-all-closed', () => {
  app.quit()
})
