import { ipcMain } from 'electron'
import type { GetDashboardUseCase } from '@application/dashboard/get-dashboard'
import type { DashboardDto } from '@shared/api'
import { IpcChannels } from '@shared/ipc-channels'
import { runSafely } from './safe-handler'

export interface DashboardUseCases {
  readonly getDashboard: GetDashboardUseCase
}

/** Tableau de bord : lecture seule, région ouverte obligatoire. */
export function registerDashboardHandlers(useCases: DashboardUseCases): void {
  ipcMain.handle(IpcChannels.dashboardGet, () =>
    runSafely((): DashboardDto => useCases.getDashboard.execute())
  )
}
