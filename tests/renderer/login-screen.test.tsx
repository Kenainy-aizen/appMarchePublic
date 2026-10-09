// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { RegionSummaryDto } from '@shared/api'
import { LoginScreen } from '../../src/renderer/src/screens/LoginScreen'
import { fail, installApiMock, ok } from './helpers'

afterEach(cleanup)

const regions: RegionSummaryDto[] = [
  { id: 'r1', name: 'Analamanga' },
  { id: 'r2', name: 'Haute Matsiatra' }
]

function setup(canCreate = true): {
  api: ReturnType<typeof installApiMock>
  onOpened: ReturnType<typeof vi.fn>
  onCreateRequested: ReturnType<typeof vi.fn>
} {
  const api = installApiMock()
  const onOpened = vi.fn()
  const onCreateRequested = vi.fn()
  render(
    <LoginScreen
      regions={regions}
      canCreate={canCreate}
      onOpened={onOpened}
      onCreateRequested={onCreateRequested}
    />
  )
  return { api, onOpened, onCreateRequested }
}

describe('LoginScreen', () => {
  it('liste les régions et sélectionne la première', () => {
    setup()
    const select = screen.getByLabelText<HTMLSelectElement>('Région')
    expect(Array.from(select.options).map((option) => option.text)).toEqual([
      'Analamanga',
      'Haute Matsiatra'
    ])
    expect(select.value).toBe('r1')
  })

  it('envoie la région choisie et le mot de passe saisi, puis prévient la fenêtre parente', async () => {
    const user = userEvent.setup()
    const { api, onOpened } = setup()
    api.openRegion.mockResolvedValue(ok(regions[1] as RegionSummaryDto))

    await user.selectOptions(screen.getByLabelText('Région'), 'r2')
    await user.type(screen.getByLabelText('Mot de passe de la région'), 'ma phrase de passe')
    await user.click(screen.getByRole('button', { name: 'Ouvrir la région' }))

    await waitFor(() => {
      expect(onOpened).toHaveBeenCalledWith(regions[1])
    })
    expect(api.openRegion).toHaveBeenCalledWith({
      regionId: 'r2',
      password: 'ma phrase de passe'
    })
  })

  it('affiche le message d’erreur reçu et efface le mot de passe saisi', async () => {
    const user = userEvent.setup()
    const { api, onOpened } = setup()
    api.openRegion.mockResolvedValue(fail('INVALID_PASSWORD', 'Mot de passe incorrect.'))

    const field = screen.getByLabelText<HTMLInputElement>('Mot de passe de la région')
    await user.type(field, 'mauvais')
    await user.click(screen.getByRole('button', { name: 'Ouvrir la région' }))

    expect((await screen.findByRole('alert')).textContent).toBe('Mot de passe incorrect.')
    expect(field.value).toBe('')
    expect(onOpened).not.toHaveBeenCalled()
  })

  it('transmet tel quel le message de blocage temporaire', async () => {
    const user = userEvent.setup()
    const { api } = setup()
    api.openRegion.mockResolvedValue(
      fail('RATE_LIMITED', 'Trop de tentatives. Réessayez dans 30 secondes.')
    )

    await user.type(screen.getByLabelText('Mot de passe de la région'), 'x')
    await user.click(screen.getByRole('button', { name: 'Ouvrir la région' }))

    expect((await screen.findByRole('alert')).textContent).toContain('30 secondes')
  })

  it('désactive le bouton tant qu’aucun mot de passe n’est saisi', async () => {
    const user = userEvent.setup()
    setup()
    const button = screen.getByRole<HTMLButtonElement>('button', { name: 'Ouvrir la région' })
    expect(button.disabled).toBe(true)

    await user.type(screen.getByLabelText('Mot de passe de la région'), 'a')
    expect(button.disabled).toBe(false)
  })

  it('ne propose « Créer une région » que si une région peut encore être créée', async () => {
    const user = userEvent.setup()
    const { onCreateRequested } = setup(true)
    await user.click(screen.getByRole('button', { name: 'Créer une région' }))
    expect(onCreateRequested).toHaveBeenCalledTimes(1)

    cleanup()
    setup(false)
    expect(screen.queryByRole('button', { name: 'Créer une région' })).toBeNull()
  })
})
