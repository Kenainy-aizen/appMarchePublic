/** Informations d'identité de l'application. */
export interface AppInfo {
  readonly name: string
  readonly version: string
}

/** Port : fournit les informations de l'application (implémenté par l'infrastructure). */
export interface AppInfoProvider {
  getAppInfo(): AppInfo
}
