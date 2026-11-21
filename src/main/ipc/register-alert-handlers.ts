import { ipcMain } from 'electron'
import type {
  ListAlertsUseCase,
  SaveAlertHorizonUseCase
} from '@application/alerts/alert-use-cases'
import type { AlertHorizonDto, AlertsDto } from '@shared/api'
import { IpcChannels } from '@shared/ipc-channels'
import { saveAlertHorizonInputSchema } from '@shared/ipc-schemas'
import { parseInput, runSafely } from './safe-handler'

export interface AlertUseCases {
  readonly listAlerts: ListAlertsUseCase
  readonly saveAlertHorizon: SaveAlertHorizonUseCase
}

/** Alertes d'échéances : lecture (région ouverte obligatoire) et réglage du délai (général, sans région). */
export function registerAlertHandlers(useCases: AlertUseCases): void {
  ipcMain.handle(IpcChannels.alertList, () =>
    runSafely((): AlertsDto => useCases.listAlerts.execute())
  )

  ipcMain.handle(IpcChannels.settingsSaveAlertHorizon, (_event, input: unknown) =>
    runSafely((): AlertHorizonDto =>
      useCases.saveAlertHorizon.execute(parseInput(saveAlertHorizonInputSchema, input))
    )
  )
}
