// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it } from 'vitest'
import type { RegionsOverviewDto } from '@shared/api'
import { App } from '../../src/renderer/src/App'
import { fail, installApiMock, ok } from './helpers'

afterEach(cleanup)

const empty: RegionsOverviewDto = {
  organizationName: null,
  regions: [],
  canCreate: true,
  suggestedName: 'Région 1'
}
const withOne: RegionsOverviewDto = {
  organizationName: 'PRMP de Fianarantsoa',
  regions: [{ id: 'r1', name: 'Région 1' }],
  canCreate: true,
  suggestedName: 'Région 2'
}
const created = {
  region: { id: 'r1', name: 'Région 1' },
  recoveryKey: 'ABCD-EFGH-IJKL-MNOP-QRST-UVWX-YZ23-4567'
}

describe('première utilisation', () => {
  it('nom de la PRMP, première région, clé de récupération, puis connexion', async () => {
    const user = userEvent.setup()
    const api = installApiMock()
    api.getRegionsOverview.mockResolvedValueOnce(ok(empty)).mockResolvedValueOnce(ok(withOne))
    api.saveOrganization.mockResolvedValue(ok({ name: 'PRMP de Fianarantsoa' }))
    api.createRegion.mockResolvedValue(ok(created))
    render(<App />)

    expect(await screen.findByRole('heading', { name: 'Configurer l’application' })).toBeDefined()
    const steps = screen.getByRole('list', { name: 'Étapes de la première configuration' })
    expect(within(steps).getAllByRole('listitem')).toHaveLength(3)
    expect(within(steps).getByText('Identité de la PRMP').getAttribute('aria-current')).toBe('step')

    await user.type(screen.getByLabelText('Nom de la PRMP'), 'PRMP de Fianarantsoa')
    await user.type(screen.getByLabelText(/^Mot de passe/), 'une phrase de passe valide')
    await user.type(
      screen.getByLabelText('Confirmer le mot de passe'),
      'une phrase de passe valide'
    )
    await user.click(screen.getByRole('button', { name: 'Créer la région' }))

    expect(api.saveOrganization).toHaveBeenCalledWith({ name: 'PRMP de Fianarantsoa' })
    expect(await screen.findByLabelText('Clé de récupération')).toBeDefined()
    expect(
      within(screen.getByRole('list', { name: 'Étapes de la première configuration' }))
        .getByText('Clé de récupération')
        .getAttribute('aria-current')
    ).toBe('step')

    await user.click(screen.getByRole('checkbox'))
    await user.click(screen.getByRole('button', { name: 'Continuer' }))

    expect(await screen.findByRole('heading', { name: 'Connexion à une région' })).toBeDefined()
    expect(screen.getByText('PRMP de Fianarantsoa')).toBeDefined() // nom en grand sur le panneau
  })

  it('ne crée aucune région si le nom de la PRMP est refusé', async () => {
    const user = userEvent.setup()
    const api = installApiMock()
    api.getRegionsOverview.mockResolvedValue(ok(empty))
    api.saveOrganization.mockResolvedValue(
      fail('REQUIRED_FIELD', 'Le champ « nom de la PRMP » est obligatoire.')
    )
    render(<App />)

    await user.type(await screen.findByLabelText('Nom de la PRMP'), '   ')
    await user.type(screen.getByLabelText(/^Mot de passe/), 'une phrase de passe valide')
    await user.type(
      screen.getByLabelText('Confirmer le mot de passe'),
      'une phrase de passe valide'
    )
    await user.click(screen.getByRole('button', { name: 'Créer la région' }))

    expect((await screen.findByRole('alert')).textContent).toContain('nom de la PRMP')
    expect(api.createRegion).not.toHaveBeenCalled()
  })
})

describe('espace de travail', () => {
  it('connexion, puis changement de région : la session est fermée côté principal', async () => {
    const user = userEvent.setup()
    const api = installApiMock()
    api.getRegionsOverview.mockResolvedValue(ok(withOne))
    api.openRegion.mockResolvedValue(ok({ id: 'r1', name: 'Région 1' }))
    render(<App />)

    await user.type(await screen.findByLabelText('Mot de passe de la région'), 'ma phrase de passe')
    await user.click(screen.getByRole('button', { name: 'Ouvrir la région' }))

    expect(await screen.findByText('Région : Région 1')).toBeDefined()
    expect(screen.getByText('PRMP de Fianarantsoa')).toBeDefined() // bandeau du haut

    await user.click(screen.getByRole('button', { name: 'Changer de région' }))

    expect(await screen.findByRole('heading', { name: 'Connexion à une région' })).toBeDefined()
    expect(api.closeSession).toHaveBeenCalledTimes(1)
  })

  it('reprend directement la région si une session est déjà ouverte, avec le nom de la PRMP', async () => {
    const api = installApiMock()
    api.getRegionsOverview.mockResolvedValue(ok(withOne))
    api.getSession.mockResolvedValue(ok({ region: { id: 'r1', name: 'Région 1' } }))
    render(<App />)

    expect(await screen.findByText('Région : Région 1')).toBeDefined()
    expect(screen.getByText('PRMP de Fianarantsoa')).toBeDefined()
  })

  it('la navigation signale la page courante ; seul le module à venir reste inactif', async () => {
    const api = installApiMock()
    api.getRegionsOverview.mockResolvedValue(ok(withOne))
    api.getSession.mockResolvedValue(ok({ region: { id: 'r1', name: 'Région 1' } }))
    render(<App />)
    const nav = await screen.findByRole('navigation', { name: 'Navigation principale' })

    expect(within(nav).getByRole('button', { name: 'Accueil' }).getAttribute('aria-current')).toBe(
      'page'
    )
    expect(within(nav).getByRole('button', { name: 'Procédures' }).hasAttribute('disabled')).toBe(
      false
    )
    expect(
      within(nav)
        .getByRole('button', { name: /^Contrats/ })
        .hasAttribute('disabled')
    ).toBe(true)
  })

  it('invite à renseigner le nom de la PRMP quand il manque, puis l’affiche une fois enregistré', async () => {
    const user = userEvent.setup()
    const api = installApiMock()
    api.getRegionsOverview.mockResolvedValue(ok({ ...withOne, organizationName: null }))
    api.getSession.mockResolvedValue(ok({ region: { id: 'r1', name: 'Région 1' } }))
    api.saveOrganization.mockResolvedValue(ok({ name: 'PRMP de Fianarantsoa' }))
    render(<App />)

    expect(await screen.findByText(/Le nom de la PRMP n’est pas renseigné/)).toBeDefined()
    await user.click(
      screen.getAllByRole('button', { name: 'Renseigner le nom de la PRMP' })[0] as HTMLElement
    )

    await user.type(await screen.findByLabelText('Nom de la PRMP'), 'PRMP de Fianarantsoa')
    await user.click(screen.getByRole('button', { name: 'Enregistrer le nom' }))

    expect(await screen.findByText('Nom enregistré.')).toBeDefined()
    expect(api.saveOrganization).toHaveBeenCalledWith({ name: 'PRMP de Fianarantsoa' })
    expect(screen.getByText('PRMP de Fianarantsoa', { selector: '.topbar__org' })).toBeDefined()
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
