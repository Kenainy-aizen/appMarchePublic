// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it } from 'vitest'
import type { RegionsOverviewDto } from '@shared/api'
import { App } from '../../src/renderer/src/App'
import { fail, installApiMock, ok } from './helpers'

afterEach(cleanup)

const empty: RegionsOverviewDto = { regions: [], canCreate: true, suggestedName: 'Région 1' }
const withOne: RegionsOverviewDto = {
  regions: [{ id: 'r1', name: 'Région 1' }],
  canCreate: true,
  suggestedName: 'Région 2'
}
const created = {
  region: { id: 'r1', name: 'Région 1' },
  recoveryKey: 'ABCD-EFGH-IJKL-MNOP-QRST-UVWX-YZ23-4567'
}

describe('parcours de l’application', () => {
  it('première utilisation : création, clé de récupération, puis connexion', async () => {
    const user = userEvent.setup()
    const api = installApiMock()
    api.getRegionsOverview.mockResolvedValueOnce(ok(empty)).mockResolvedValueOnce(ok(withOne))
    api.createRegion.mockResolvedValue(ok(created))
    render(<App />)

    expect(await screen.findByRole('heading', { name: 'Créer une région' })).toBeDefined()
    await user.type(screen.getByLabelText(/^Mot de passe/), 'une phrase de passe valide')
    await user.type(
      screen.getByLabelText('Confirmer le mot de passe'),
      'une phrase de passe valide'
    )
    await user.click(screen.getByRole('button', { name: 'Créer la région' }))

    expect(await screen.findByLabelText('Clé de récupération')).toBeDefined()
    await user.click(screen.getByRole('checkbox'))
    await user.click(screen.getByRole('button', { name: 'Continuer' }))

    expect(await screen.findByRole('heading', { name: 'Connexion à une région' })).toBeDefined()
  })

  it('connexion, puis changement de région : la session est fermée côté principal', async () => {
    const user = userEvent.setup()
    const api = installApiMock()
    api.getRegionsOverview.mockResolvedValue(ok(withOne))
    api.openRegion.mockResolvedValue(ok({ id: 'r1', name: 'Région 1' }))
    render(<App />)

    await user.type(await screen.findByLabelText('Mot de passe de la région'), 'ma phrase de passe')
    await user.click(screen.getByRole('button', { name: 'Ouvrir la région' }))
    expect(await screen.findByRole('heading', { name: 'Région : Région 1' })).toBeDefined()

    await user.click(screen.getByRole('button', { name: 'Changer de région' }))

    expect(await screen.findByRole('heading', { name: 'Connexion à une région' })).toBeDefined()
    expect(api.closeSession).toHaveBeenCalledTimes(1)
  })

  it('reprend directement la région si une session est déjà ouverte', async () => {
    const api = installApiMock()
    api.getSession.mockResolvedValue(ok({ region: { id: 'r1', name: 'Région 1' } }))
    render(<App />)

    expect(await screen.findByRole('heading', { name: 'Région : Région 1' })).toBeDefined()
    expect(api.getRegionsOverview).not.toHaveBeenCalled()
  })

  it('affiche une erreur claire si le processus principal ne répond pas correctement', async () => {
    const api = installApiMock()
    api.getRegionsOverview.mockResolvedValue(
      fail('UNEXPECTED', 'Une erreur inattendue est survenue.')
    )
    render(<App />)

    expect((await screen.findByRole('alert')).textContent).toBe(
      'Une erreur inattendue est survenue.'
    )
  })
})
