// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { CreateRegionScreen } from '../../src/renderer/src/screens/CreateRegionScreen'
import { RecoveryKeyScreen } from '../../src/renderer/src/screens/RecoveryKeyScreen'
import { fail, installApiMock, ok } from './helpers'

afterEach(cleanup)

const result = {
  region: { id: 'r1', name: 'Région 1' },
  recoveryKey: 'ABCD-EFGH-IJKL-MNOP-QRST-UVWX-YZ23-4567'
}

describe('CreateRegionScreen', () => {
  it('propose le nom suggéré et envoie nom, mot de passe et confirmation', async () => {
    const user = userEvent.setup()
    const api = installApiMock()
    api.createRegion.mockResolvedValue(ok(result))
    const onCreated = vi.fn()
    render(<CreateRegionScreen suggestedName="Région 1" onCreated={onCreated} />)

    expect(screen.getByLabelText<HTMLInputElement>('Nom de la région').value).toBe('Région 1')
    await user.type(screen.getByLabelText(/^Mot de passe/), 'une phrase de passe valide')
    await user.type(
      screen.getByLabelText('Confirmer le mot de passe'),
      'une phrase de passe valide'
    )
    await user.click(screen.getByRole('button', { name: 'Créer la région' }))

    await waitFor(() => {
      expect(onCreated).toHaveBeenCalledWith(result)
    })
    expect(api.createRegion).toHaveBeenCalledWith({
      name: 'Région 1',
      password: 'une phrase de passe valide',
      passwordConfirmation: 'une phrase de passe valide'
    })
  })

  it('affiche l’erreur et ne passe pas à l’étape suivante', async () => {
    const user = userEvent.setup()
    const api = installApiMock()
    api.createRegion.mockResolvedValue(
      fail('PASSWORD_ALREADY_USED', 'Ce mot de passe est déjà utilisé par une autre région.')
    )
    const onCreated = vi.fn()
    render(<CreateRegionScreen suggestedName="Région 2" onCreated={onCreated} />)

    await user.type(screen.getByLabelText(/^Mot de passe/), 'une phrase de passe valide')
    await user.type(
      screen.getByLabelText('Confirmer le mot de passe'),
      'une phrase de passe valide'
    )
    await user.click(screen.getByRole('button', { name: 'Créer la région' }))

    expect((await screen.findByRole('alert')).textContent).toContain('déjà utilisé')
    expect(onCreated).not.toHaveBeenCalled()
  })

  it('n’affiche « Annuler » que s’il y a un écran où revenir', async () => {
    const user = userEvent.setup()
    installApiMock()
    render(<CreateRegionScreen suggestedName="Région 1" onCreated={vi.fn()} />)
    expect(screen.queryByRole('button', { name: 'Annuler' })).toBeNull()

    cleanup()
    const onCancel = vi.fn()
    render(<CreateRegionScreen suggestedName="Région 2" onCreated={vi.fn()} onCancel={onCancel} />)
    await user.click(screen.getByRole('button', { name: 'Annuler' }))
    expect(onCancel).toHaveBeenCalledTimes(1)
  })
})

describe('RecoveryKeyScreen', () => {
  it('affiche la clé et le nom de la région', () => {
    render(
      <RecoveryKeyScreen
        regionName="Région 1"
        recoveryKey={result.recoveryKey}
        onContinue={vi.fn()}
      />
    )
    expect(screen.getByLabelText('Clé de récupération').textContent).toBe(result.recoveryKey)
    expect(screen.getByRole('heading').textContent).toContain('Région 1')
  })

  it('n’autorise à continuer qu’après la confirmation explicite', async () => {
    const user = userEvent.setup()
    const onContinue = vi.fn()
    render(
      <RecoveryKeyScreen
        regionName="Région 1"
        recoveryKey={result.recoveryKey}
        onContinue={onContinue}
      />
    )
    const next = screen.getByRole<HTMLButtonElement>('button', { name: 'Continuer' })
    expect(next.disabled).toBe(true)

    await user.click(screen.getByRole('checkbox'))
    expect(next.disabled).toBe(false)
    await user.click(next)
    expect(onContinue).toHaveBeenCalledTimes(1)
  })

  it('copie la clé dans le presse-papiers', async () => {
    const user = userEvent.setup()
    render(
      <RecoveryKeyScreen
        regionName="Région 1"
        recoveryKey={result.recoveryKey}
        onContinue={vi.fn()}
      />
    )
    await user.click(screen.getByRole('button', { name: 'Copier' }))

    expect(await navigator.clipboard.readText()).toBe(result.recoveryKey)
    expect(await screen.findByRole('button', { name: 'Copiée' })).toBeDefined()
  })

  it('lance l’impression', async () => {
    const user = userEvent.setup()
    const print = vi.fn()
    window.print = print
    render(
      <RecoveryKeyScreen
        regionName="Région 1"
        recoveryKey={result.recoveryKey}
        onContinue={vi.fn()}
      />
    )
    await user.click(screen.getByRole('button', { name: 'Imprimer' }))
    expect(print).toHaveBeenCalledTimes(1)
  })
})
