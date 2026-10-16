import { join } from 'node:path'
import { app, BrowserWindow } from 'electron'
import { GetAppInfoUseCase } from '@application/get-app-info'
import { LoginThrottle } from '@application/login-throttle'
import { RegionSession } from '@application/region-session'
import { CloseRegionUseCase, GetSessionUseCase } from '@application/regions/close-and-get-session'
import { CreateRegionUseCase } from '@application/regions/create-region'
import { ListRegionsUseCase } from '@application/regions/list-regions'
import { CreateProcedureUseCase } from '@application/procedures/create-procedure'
import { DeleteProcedureUseCase } from '@application/procedures/delete-procedure'
import { GetProcedureUseCase } from '@application/procedures/get-procedure'
import { ListPpmLinesUseCase, ListProceduresUseCase } from '@application/procedures/list-procedures'
import {
  ReopenStepUseCase,
  SaveStepDatesUseCase,
  ValidateStepUseCase
} from '@application/procedures/step-use-cases'
import { UpdateProcedureUseCase } from '@application/procedures/update-procedure'
import { CreatePpmUseCase } from '@application/ppm/create-ppm'
import { DeletePpmUseCase } from '@application/ppm/delete-ppm'
import { GetPpmUseCase } from '@application/ppm/get-ppm'
import { ListPpmsUseCase } from '@application/ppm/list-ppms'
import { RecordPpmUpdateUseCase } from '@application/ppm/record-ppm-update'
import { RemovePpmLineUseCase } from '@application/ppm/remove-ppm-line'
import { SavePpmLineUseCase } from '@application/ppm/save-ppm-line'
import { SaveOrganizationUseCase } from '@application/organization/save-organization'
import { OpenRegionUseCase } from '@application/regions/open-region'
import { ScryptRegionKeyService } from '@infrastructure/crypto/scrypt-key-service'
import { ElectronAppInfoProvider } from '@infrastructure/electron-app-info-provider'
import { JsonOrganizationSettings } from '@infrastructure/json-organization-settings'
import { JsonRegionRegistry } from '@infrastructure/json-region-registry'
import { SqliteRegionStorage } from '@infrastructure/sqlite/region-storage'
import { SystemClock, UuidGenerator } from '@infrastructure/system-ports'
import { registerIpcHandlers } from './ipc/register-handlers'
import { blockOutgoingNetwork } from './security'
import { createMainWindow } from './window'

/** Nom de dossier FIXE : ne jamais le dériver du nom du produit (un renommage ferait « perdre » les données). */
const DATA_FOLDER_NAME = 'prmp-suivi-marches'

/**
 * Dossier des données : %APPDATA%\prmp-suivi-marches sous Windows, sauf si PRMP_DATA_DIR est défini
 * (utile pour tester avec un dossier jetable sans toucher aux vraies données).
 */
function resolveDataDirectory(): string {
  return process.env['PRMP_DATA_DIR'] ?? join(app.getPath('appData'), DATA_FOLDER_NAME)
}

/** Composition root : seul endroit où les implémentations sont branchées sur les ports. */
function bootstrap(): RegionSession {
  const dataDirectory = resolveDataDirectory()
  const clock = new SystemClock()
  const registry = new JsonRegionRegistry(join(dataDirectory, 'regions.json'))
  const settings = new JsonOrganizationSettings(join(dataDirectory, 'settings.json'))
  const storage = new SqliteRegionStorage(join(dataDirectory, 'regions'))
  const keys = new ScryptRegionKeyService()
  const session = new RegionSession()
  const throttle = new LoginThrottle()
  const ids = new UuidGenerator()

  blockOutgoingNetwork()
  registerIpcHandlers({
    getAppInfo: new GetAppInfoUseCase(new ElectronAppInfoProvider()),
    listRegions: new ListRegionsUseCase(registry, settings),
    saveOrganization: new SaveOrganizationUseCase(settings),
    createRegion: new CreateRegionUseCase(registry, keys, storage, ids, clock, throttle),
    openRegion: new OpenRegionUseCase(registry, keys, storage, session, throttle, clock),
    closeRegion: new CloseRegionUseCase(session),
    getSession: new GetSessionUseCase(session),
    listPpms: new ListPpmsUseCase(session),
    getPpm: new GetPpmUseCase(session),
    createPpm: new CreatePpmUseCase(session, ids, clock),
    savePpmLine: new SavePpmLineUseCase(session, ids),
    removePpmLine: new RemovePpmLineUseCase(session),
    recordPpmUpdate: new RecordPpmUpdateUseCase(session, clock),
    deletePpm: new DeletePpmUseCase(session),
    listPpmLines: new ListPpmLinesUseCase(session),
    listProcedures: new ListProceduresUseCase(session),
    getProcedure: new GetProcedureUseCase(session),
    createProcedure: new CreateProcedureUseCase(session, ids, clock),
    updateProcedure: new UpdateProcedureUseCase(session),
    saveStepDates: new SaveStepDatesUseCase(session),
    validateStep: new ValidateStepUseCase(session, clock),
    reopenStep: new ReopenStepUseCase(session),
    deleteProcedure: new DeleteProcedureUseCase(session)
  })
  createMainWindow()
  return session
}

// Interface en français : sélecteurs de date (jj/mm/aaaa), correcteur orthographique et menus du système.
app.commandLine.appendSwitch('lang', 'fr')

void app.whenReady().then(() => {
  const session = bootstrap()
  // La base de la région ouverte est toujours refermée proprement à la sortie.
  app.on('will-quit', () => {
    session.close()
  })
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createMainWindow()
  })
})

app.on('window-all-closed', () => {
  app.quit()
})
