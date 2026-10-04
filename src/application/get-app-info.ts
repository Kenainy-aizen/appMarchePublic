import type { AppInfo, AppInfoProvider } from '@domain/app-info'

/** Cas d'utilisation de démonstration (squelette Phase 1) : lire l'identité de l'application. */
export class GetAppInfoUseCase {
  constructor(private readonly provider: AppInfoProvider) {}

  execute(): AppInfo {
    return this.provider.getAppInfo()
  }
}
