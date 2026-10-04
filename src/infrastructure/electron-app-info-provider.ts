import { app } from 'electron'
import type { AppInfo, AppInfoProvider } from '@domain/app-info'

export class ElectronAppInfoProvider implements AppInfoProvider {
  getAppInfo(): AppInfo {
    return { name: app.getName(), version: app.getVersion() }
  }
}
