// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it } from 'vitest'
import type { PpmDetailDto, RegionsOverviewDto } from '@shared/api'
import { App } from '../../src/renderer/src/App'
import { installApiMock, ok } from './helpers'

afterEach(cleanup)

const overview: RegionsOverviewDto = {
  organizationName: 'PRMP de Fianarantsoa',
  regions: [{ id: 'r1', name: 'Région 1' }],
  canCreate: true,
  suggestedName: 'Région 2'
}

const emptyPlan: PpmDetailDto = {
  id: 'p1',
  year: 2026,
  number: 1,
  elaboratedOn: '2026-10-04',
  lastUpdateOn: null,
  updateCount: 0,
  lineCount: 0,
  total: 0,
  lines: []
}

describe('parcours du plan de passation', () => {
  it('connexion, création d’un plan, ajout d’une ligne, retour au plan mis à jour', async () => {
    const user = userEvent.setup()
    const api = installApiMock()
    api.getRegionsOverview.mockResolvedValue(ok(overview))
    api.openRegion.mockResolvedValue(ok({ id: 'r1', name: 'Région 1' }))
    api.listPpms.mockResolvedValue(ok([]))
    api.createPpm.mockResolvedValue(ok(emptyPlan))
    api.getPpm.mockResolvedValueOnce(ok(emptyPlan)).mockResolvedValue(
      ok({
        ...emptyPlan,
        lineCount: 1,
        total: 800_000,
        lines: [
          {
            id: 'l1',
            nature: 'SERVICES',
            object: 'Gardiennage',
            financing: null,
            accounts: [],
            plannedLaunchDate: null,
            plannedBidOpeningDate: null,
            plannedAwardDate: null,
            beneficiaries: [{ service: 'SAF', amount: 800_000 }],
            method: null,
            procedureLead: null,
            total: 800_000
          }
        ]
      })
    )
    api.savePpmLine.mockResolvedValue(ok(emptyPlan))
    render(<App />)

    await user.type(await screen.findByLabelText('Mot de passe de la région'), 'ma phrase de passe')
    await user.click(screen.getByRole('button', { name: 'Ouvrir la région' }))
    await user.click(await screen.findByRole('button', { name: 'Plan de passation (PPM)' }))

    await user.click(await screen.findByRole('button', { name: 'Créer le plan' }))
    expect(
      await screen.findByRole('heading', { name: 'Plan de passation n° 1 — 2026' })
    ).toBeDefined()
    expect(screen.getByText('Ce plan ne contient encore aucune ligne.')).toBeDefined()

    await user.click(screen.getByRole('button', { name: 'Ajouter une ligne' }))
    await user.selectOptions(await screen.findByLabelText('Nature du marché'), 'Services')
    await user.type(screen.getByLabelText('Objet'), 'Gardiennage')
    await user.click(screen.getByRole('button', { name: 'Enregistrer la ligne' }))

    expect(await screen.findByText('Gardiennage')).toBeDefined()
    expect(api.savePpmLine).toHaveBeenCalledWith(
      expect.objectContaining({
        ppmId: 'p1',
        lineId: null,
        nature: 'SERVICES',
        object: 'Gardiennage'
      })
    )
  })

  it('l’entrée « Accueil » quitte le module sans fermer la région', async () => {
    const user = userEvent.setup()
    const api = installApiMock()
    api.getRegionsOverview.mockResolvedValue(ok(overview))
    api.openRegion.mockResolvedValue(ok({ id: 'r1', name: 'Région 1' }))
    api.listPpms.mockResolvedValue(ok([]))
    render(<App />)
    await user.type(await screen.findByLabelText('Mot de passe de la région'), 'ma phrase de passe')
    await user.click(screen.getByRole('button', { name: 'Ouvrir la région' }))
    await user.click(await screen.findByRole('button', { name: 'Plan de passation (PPM)' }))
    await screen.findByRole('heading', { name: 'Plans de passation' })

    await user.click(screen.getByRole('button', { name: 'Accueil' }))

    expect(await screen.findByRole('heading', { name: 'Accueil' })).toBeDefined()
    expect(screen.getByText('Région : Région 1')).toBeDefined()
    expect(api.closeSession).not.toHaveBeenCalled()
  })
})
