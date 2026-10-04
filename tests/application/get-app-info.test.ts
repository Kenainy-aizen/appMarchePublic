import { describe, expect, it } from 'vitest'
import { GetAppInfoUseCase } from '@application/get-app-info'
import type { AppInfoProvider } from '@domain/app-info'

describe('GetAppInfoUseCase', () => {
  it("retourne l'identité fournie par le port", () => {
    const provider: AppInfoProvider = {
      getAppInfo: () => ({ name: 'Suivi des marchés publics', version: '0.1.0' })
    }

    const info = new GetAppInfoUseCase(provider).execute()

    expect(info).toEqual({ name: 'Suivi des marchés publics', version: '0.1.0' })
  })
})
