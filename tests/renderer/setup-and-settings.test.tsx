// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { SettingsScreen } from '../../src/renderer/src/screens/SettingsScreen'
import { SetupScreen } from '../../src/renderer/src/screens/SetupScreen'
import { fail, installApiMock, ok } from './helpers'

afterEach(cleanup)

const created = {
  region: { id: 'r1', name: 'Région 1' },
  recoveryKey: 'ABCD-EFGH-IJKL-MNOP-QRST-UVWX-YZ23-4567'
}

async function fillRegionPasswords(user: ReturnType<typeof userEvent.setup>): Promise<void> {
  await user.type(screen.getByLabelText(/^Mot de passe/), 'une phrase de passe valide')
  await user.type(screen.getByLabelText('Confirmer le mot de passe'), 'une phrase de passe valide')
}

describe('SetupScreen', () => {
  it('enregistre d’abord le nom de la PRMP, puis crée la région, et transmet les deux', async () => {
    const user = userEvent.setup()
    const api = installApiMock()
    const order: string[] = []
    api.saveOrganization.mockImplementation(() => {
      order.push('organisation')
      return Promise.resolve(ok({ name: 'PRMP Haute Matsiatra' }))
    })
    api.createRegion.mockImplementation(() => {
      order.push('région')
      return Promise.resolve(ok(created))
    })
    const onCreated = vi.fn()
    render(
      <SetupScreen
        initialOrganizationName={null}
        suggestedRegionName="Région 1"
        onCreated={onCreated}
      />
    )

    await user.type(screen.getByLabelText('Nom de la PRMP'), '  PRMP   Haute Matsiatra ')
    await fillRegionPasswords(user)
    await user.click(screen.getByRole('button', { name: 'Créer la région' }))

    await waitFor(() => {
      expect(onCreated).toHaveBeenCalledWith(created, 'PRMP Haute Matsiatra')
    })
    expect(order).toEqual(['organisation', 'région'])
    expect(api.saveOrganization).toHaveBeenCalledWith({ name: '  PRMP   Haute Matsiatra ' }) // le domaine nettoie
    expect(api.createRegion).toHaveBeenCalledWith({
      name: 'Région 1',
      password: 'une phrase de passe valide',
      passwordConfirmation: 'une phrase de passe valide'
    })
  })

  it('reprend un nom déjà enregistré par une tentative précédente interrompue', () => {
    installApiMock()
    render(
      <SetupScreen
        initialOrganizationName="PRMP Fianarantsoa"
        suggestedRegionName="Région 1"
        onCreated={vi.fn()}
      />
    )
    expect(screen.getByLabelText<HTMLInputElement>('Nom de la PRMP').value).toBe(
      'PRMP Fianarantsoa'
    )
  })

  it('n’essaie pas de créer la région si le nom est refusé', async () => {
    const user = userEvent.setup()
    const api = installApiMock()
    api.saveOrganization.mockResolvedValue(
      fail('ORGANIZATION_NAME_TOO_LONG', 'Le nom de la PRMP ne doit pas dépasser 120 caractères.')
    )
    const onCreated = vi.fn()
    render(
      <SetupScreen
        initialOrganizationName={null}
        suggestedRegionName="Région 1"
        onCreated={onCreated}
      />
    )

    await user.type(screen.getByLabelText('Nom de la PRMP'), 'x')
    await fillRegionPasswords(user)
    await user.click(screen.getByRole('button', { name: 'Créer la région' }))

    expect((await screen.findByRole('alert')).textContent).toContain('120 caractères')
    expect(api.createRegion).not.toHaveBeenCalled()
    expect(onCreated).not.toHaveBeenCalled()
  })

  it('affiche l’erreur de création de région sans passer à l’étape suivante', async () => {
    const user = userEvent.setup()
    const api = installApiMock()
    api.createRegion.mockResolvedValue(fail('WEAK_PASSWORD', 'Le mot de passe est trop court.'))
    const onCreated = vi.fn()
    render(
      <SetupScreen
        initialOrganizationName={null}
        suggestedRegionName="Région 1"
        onCreated={onCreated}
      />
    )

    await user.type(screen.getByLabelText('Nom de la PRMP'), 'PRMP')
    await fillRegionPasswords(user)
    await user.click(screen.getByRole('button', { name: 'Créer la région' }))

    expect((await screen.findByRole('alert')).textContent).toBe('Le mot de passe est trop court.')
    expect(onCreated).not.toHaveBeenCalled()
  })
})

describe('SettingsScreen', () => {
  it('affiche le nom actuel et la version, enregistre une correction, et prévient la fenêtre parente', async () => {
    const user = userEvent.setup()
    const api = installApiMock()
    api.saveOrganization.mockResolvedValue(ok({ name: 'PRMP corrigée' }))
    const onSaved = vi.fn()
    render(
      <SettingsScreen
        organizationName="PRMP à corriger"
        appInfo={{ name: 'x', version: '1.2.3' }}
        onSaved={onSaved}
      />
    )

    expect(screen.getByText('1.2.3')).toBeDefined()
    const field = screen.getByLabelText<HTMLInputElement>('Nom de la PRMP')
    expect(field.value).toBe('PRMP à corriger')

    await user.clear(field)
    await user.type(field, 'PRMP corrigée')
    await user.click(screen.getByRole('button', { name: 'Enregistrer le nom' }))

    expect(await screen.findByText('Nom enregistré.')).toBeDefined()
    expect(onSaved).toHaveBeenCalledWith('PRMP corrigée')
  })

  it('affiche l’erreur de validation sans prévenir la fenêtre parente', async () => {
    const user = userEvent.setup()
    const api = installApiMock()
    api.saveOrganization.mockResolvedValue(
      fail('REQUIRED_FIELD', 'Le champ « nom de la PRMP » est obligatoire.')
    )
    const onSaved = vi.fn()
    render(<SettingsScreen organizationName="PRMP" appInfo={null} onSaved={onSaved} />)

    await user.clear(screen.getByLabelText('Nom de la PRMP'))
    await user.type(screen.getByLabelText('Nom de la PRMP'), ' ')
    await user.click(screen.getByRole('button', { name: 'Enregistrer le nom' }))

    expect((await screen.findByRole('alert')).textContent).toContain('obligatoire')
    expect(screen.queryByText('Nom enregistré.')).toBeNull()
    expect(onSaved).not.toHaveBeenCalled()
  })
})
