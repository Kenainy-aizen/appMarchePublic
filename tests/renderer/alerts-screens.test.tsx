// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { AlertDto, AlertsDto, ProcedureDetailDto, RegionsOverviewDto } from '@shared/api'
import { App } from '../../src/renderer/src/App'
import { AlertsScreen, describeDue } from '../../src/renderer/src/screens/AlertsScreen'
import { SettingsScreen } from '../../src/renderer/src/screens/SettingsScreen'
import { fail, installApiMock, ok } from './helpers'

afterEach(cleanup)

const alert = (overrides: Partial<AlertDto> = {}): AlertDto => ({
  key: 'step:p1:PUBLICATION',
  kind: 'PROCEDURE_STEP',
  severity: 'OVERDUE',
  dueOn: '2026-06-10',
  daysLeft: -5,
  subject: 'DAO-001/2026',
  action: 'Publication de l’avis',
  target: { kind: 'PROCEDURE', id: 'p1' },
  ...overrides
})

const alerts = (items: readonly AlertDto[], horizonDays = 15): AlertsDto => ({
  today: '2026-06-15',
  horizonDays,
  overdueCount: items.filter((item) => item.severity === 'OVERDUE').length,
  upcomingCount: items.filter((item) => item.severity === 'UPCOMING').length,
  items
})

const text = (element: HTMLElement): string => element.textContent.replace(/\s/g, ' ')

describe('describeDue', () => {
  it.each([
    [-1, 'En retard de 1 jour'],
    [-5, 'En retard de 5 jours'],
    [0, 'Aujourd’hui'],
    [1, 'Demain'],
    [2, 'Dans 2 jours'],
    [15, 'Dans 15 jours']
  ])('%i -> %s', (daysLeft, expected) => {
    expect(describeDue(daysLeft)).toBe(expected)
  })
})

describe('AlertsScreen', () => {
  const setup = (
    value: AlertsDto | null,
    error: string | null = null
  ): { onOpen: ReturnType<typeof vi.fn>; onOpenSettings: ReturnType<typeof vi.fn> } => {
    const onOpen = vi.fn()
    const onOpenSettings = vi.fn()
    render(
      <AlertsScreen alerts={value} error={error} onOpen={onOpen} onOpenSettings={onOpenSettings} />
    )
    return { onOpen, onOpenSettings }
  }

  it('indique le chargement tant que les alertes ne sont pas là', () => {
    setup(null)
    expect(screen.getByRole('status').textContent).toBe('Chargement…')
  })

  it('explique l’absence d’alerte et d’où elles viendront', () => {
    setup(alerts([], 30))
    expect(screen.getByText('Aucune échéance à surveiller')).toBeDefined()
    expect(text(document.body)).toContain('rien à signaler dans les 30 jours à venir')
    expect(text(document.body)).toContain('dates prévues des étapes')
  })

  it('sépare les retards et les échéances à venir, avec leur nombre, et décrit chaque échéance', () => {
    setup(
      alerts([
        alert(),
        alert({
          key: 'k2',
          severity: 'OVERDUE',
          daysLeft: -1,
          subject: 'M-001/2026',
          kind: 'CONTRACT_NOT_STARTED',
          action: 'Émettre l’ordre de service de démarrage',
          target: { kind: 'CONTRACT', id: 'k1' }
        }),
        alert({
          key: 'k3',
          severity: 'UPCOMING',
          daysLeft: 0,
          subject: 'Plan n° 1 (2026) : Mobilier',
          kind: 'PPM_LINE_LAUNCH',
          action: 'Lancer la procédure de cette ligne',
          target: { kind: 'PPM', id: 'ppm1' }
        }),
        alert({
          key: 'k4',
          severity: 'UPCOMING',
          daysLeft: 7,
          subject: 'DAO-002/2026',
          dueOn: '2026-06-22'
        })
      ])
    )

    expect(screen.getByRole('heading', { name: 'En retard (2)' })).toBeDefined()
    expect(screen.getByRole('heading', { name: 'À venir (2)' })).toBeDefined()
    const rows = screen.getAllByRole('row')
    expect(text(rows[1] as HTMLElement)).toContain('En retard de 5 jours')
    expect(text(rows[1] as HTMLElement)).toContain('10/06/2026')
    expect(text(rows[1] as HTMLElement)).toContain('Étape de procédure')
    expect(text(rows[2] as HTMLElement)).toContain('Marché non démarré')
    expect(text(rows[4] as HTMLElement)).toContain('Aujourd’hui')
    expect(text(rows[4] as HTMLElement)).toContain('Lancement prévu au plan')
    expect(text(rows[5] as HTMLElement)).toContain('Dans 7 jours')
  })

  it('n’affiche pas un groupe vide', () => {
    setup(alerts([alert({ severity: 'UPCOMING', daysLeft: 3 })]))
    expect(screen.queryByRole('heading', { name: /En retard/ })).toBeNull()
    expect(screen.getByRole('heading', { name: 'À venir (1)' })).toBeDefined()
  })

  it('ouvre l’élément concerné, de la bonne sorte', async () => {
    const user = userEvent.setup()
    const { onOpen } = setup(
      alerts([
        alert(),
        alert({
          key: 'k2',
          subject: 'M-001/2026',
          action: 'Émettre l’ordre de service de démarrage',
          target: { kind: 'CONTRACT', id: 'k1' }
        })
      ])
    )

    await user.click(
      screen.getByRole('button', {
        name: 'Ouvrir M-001/2026 : Émettre l’ordre de service de démarrage'
      })
    )
    expect(onOpen).toHaveBeenCalledWith({ kind: 'CONTRACT', id: 'k1' })

    await user.click(
      screen.getByRole('button', { name: 'Ouvrir DAO-001/2026 : Publication de l’avis' })
    )
    expect(onOpen).toHaveBeenLastCalledWith({ kind: 'PROCEDURE', id: 'p1' })
  })

  it('propose de régler le délai, et affiche une erreur de chargement', async () => {
    const user = userEvent.setup()
    const { onOpenSettings } = setup(null, 'Aucune région n’est ouverte.')

    expect(screen.getByRole('alert').textContent).toBe('Aucune région n’est ouverte.')
    await user.click(screen.getByRole('button', { name: 'Régler le délai' }))
    expect(onOpenSettings).toHaveBeenCalled()
  })
})

describe('réglage du délai (écran des paramètres)', () => {
  const setup = (): {
    onSaved: ReturnType<typeof vi.fn>
    api: ReturnType<typeof installApiMock>
  } => {
    const api = installApiMock()
    const onSaved = vi.fn()
    render(
      <SettingsScreen
        organizationName="PRMP"
        appInfo={{ name: 'Suivi', version: '1.0.0' }}
        onSaved={vi.fn()}
        alertHorizonDays={15}
        onAlertHorizonSaved={onSaved}
      />
    )
    return { onSaved, api }
  }

  it('propose 7, 15, 30 et 60 jours, avec la valeur actuelle sélectionnée', () => {
    setup()
    const select = screen.getByLabelText<HTMLSelectElement>('Signaler les échéances à l’avance')
    expect(select.value).toBe('15')
    expect(
      within(select)
        .getAllByRole('option')
        .map((option) => option.textContent)
    ).toEqual(['7 jours', '15 jours', '30 jours', '60 jours'])
  })

  it('enregistre le nouveau délai et prévient la page', async () => {
    const user = userEvent.setup()
    const { onSaved, api } = setup()
    api.saveAlertHorizon.mockResolvedValue(ok({ alertHorizonDays: 30 }))

    await user.selectOptions(screen.getByLabelText('Signaler les échéances à l’avance'), '30 jours')
    await user.click(screen.getByRole('button', { name: 'Enregistrer le délai' }))

    expect(api.saveAlertHorizon).toHaveBeenCalledWith({ days: 30 })
    expect(await screen.findByText('Délai enregistré.')).toBeDefined()
    expect(onSaved).toHaveBeenCalledWith(30)
  })

  it('affiche l’erreur sans rien confirmer', async () => {
    const user = userEvent.setup()
    const { onSaved, api } = setup()
    api.saveAlertHorizon.mockResolvedValue(fail('INVALID_VALUE', 'Délai d’alerte invalide.'))

    await user.click(screen.getByRole('button', { name: 'Enregistrer le délai' }))

    expect((await screen.findByRole('alert')).textContent).toContain('Délai d’alerte invalide')
    expect(screen.queryByText('Délai enregistré.')).toBeNull()
    expect(onSaved).not.toHaveBeenCalled()
  })
})

describe('alertes dans l’application', () => {
  const overview: RegionsOverviewDto = {
    organizationName: 'PRMP de Fianarantsoa',
    alertHorizonDays: 15,
    regions: [{ id: 'r1', name: 'Région 1' }],
    canCreate: true,
    suggestedName: 'Région 2'
  }

  const openWorkspace = (value: AlertsDto): ReturnType<typeof installApiMock> => {
    const api = installApiMock()
    api.getRegionsOverview.mockResolvedValue(ok(overview))
    api.getSession.mockResolvedValue(ok({ region: { id: 'r1', name: 'Région 1' } }))
    api.listAlerts.mockResolvedValue(ok(value))
    render(<App />)
    return api
  }

  it('l’entrée « Alertes » du menu porte le nombre d’échéances, en rouge s’il y a un retard', async () => {
    openWorkspace(alerts([alert(), alert({ key: 'k2', severity: 'UPCOMING', daysLeft: 4 })]))
    const nav = await screen.findByRole('navigation', { name: 'Navigation principale' })

    const entry = await within(nav).findByRole('button', { name: /Alertes/ })
    expect(text(entry)).toContain('2')
    expect(text(entry)).toContain('dont 1 en retard')
    expect(entry.querySelector('.nav-item__count--overdue')).not.toBeNull()
  })

  it('sans retard, la pastille n’est pas rouge ; sans alerte, il n’y en a pas', async () => {
    openWorkspace(alerts([alert({ severity: 'UPCOMING', daysLeft: 4 })]))
    const nav = await screen.findByRole('navigation', { name: 'Navigation principale' })
    const entry = await within(nav).findByRole('button', { name: /Alertes/ })
    await vi.waitFor(() => {
      expect(entry.querySelector('.nav-item__count')).not.toBeNull()
    })
    expect(entry.querySelector('.nav-item__count--overdue')).toBeNull()
  })

  it('l’accueil résume les échéances et mène à la page des alertes', async () => {
    const user = userEvent.setup()
    openWorkspace(alerts([alert(), alert({ key: 'k2', severity: 'UPCOMING', daysLeft: 4 })]))

    const summary = await screen.findByText(/1 échéance\(s\) dépassée\(s\)/)
    expect(text(summary.closest('[role="alert"], .alert') as HTMLElement)).toContain(
      '1 à venir dans les 15 prochains jours'
    )
    await user.click(screen.getByRole('button', { name: 'Voir les alertes' }))

    expect(await screen.findByRole('heading', { name: 'Alertes d’échéances' })).toBeDefined()
    expect(screen.getByRole('heading', { name: 'En retard (1)' })).toBeDefined()
  })

  it('l’accueil ne mentionne aucune alerte quand il n’y en a pas', async () => {
    openWorkspace(alerts([]))
    await screen.findByRole('navigation', { name: 'Navigation principale' })
    await vi.waitFor(() => {
      expect(screen.queryByText(/échéance\(s\)/)).toBeNull()
    })
    expect(screen.queryByRole('button', { name: 'Voir les alertes' })).toBeNull()
  })

  it('« Ouvrir » sur une alerte de procédure ouvre directement cette procédure', async () => {
    const user = userEvent.setup()
    const api = openWorkspace(alerts([alert()]))
    const detail: ProcedureDetailDto = {
      id: 'p1',
      reference: 'DAO-001/2026',
      object: 'Fourniture',
      method: 'DAO',
      estimatedAmount: null,
      createdOn: '2026-01-01',
      validatedCount: 0,
      totalSteps: 5,
      status: 'NOT_STARTED',
      nextStep: 'PUBLICATION',
      awardedCandidate: null,
      ppmLine: null,
      steps: [],
      bids: [],
      bidsLocked: false,
      contract: null,
      canCreateContract: false
    }
    api.getProcedure.mockResolvedValue(ok(detail))

    await user.click(await screen.findByRole('button', { name: 'Voir les alertes' }))
    await user.click(
      await screen.findByRole('button', { name: 'Ouvrir DAO-001/2026 : Publication de l’avis' })
    )

    expect(await screen.findByRole('heading', { name: 'Procédure DAO-001/2026' })).toBeDefined()
    expect(api.getProcedure).toHaveBeenCalledWith({ procedureId: 'p1' })
  })

  it('« Ouvrir » sur une alerte de marché ouvre directement ce marché', async () => {
    const user = userEvent.setup()
    const api = openWorkspace(
      alerts([
        alert({
          key: 'k',
          subject: 'M-001/2026',
          action: 'Émettre l’ordre de service de démarrage',
          kind: 'CONTRACT_NOT_STARTED',
          target: { kind: 'CONTRACT', id: 'k1' }
        })
      ])
    )
    api.getContract.mockResolvedValue(fail('CONTRACT_NOT_FOUND', 'Ce contrat n’existe pas.'))

    await user.click(await screen.findByRole('button', { name: 'Voir les alertes' }))
    await user.click(await screen.findByRole('button', { name: /Ouvrir M-001\/2026/ }))

    expect(api.getContract).toHaveBeenCalledWith({ contractId: 'k1' })
  })

  it('« Ouvrir » sur une alerte du plan ouvre directement ce plan', async () => {
    const user = userEvent.setup()
    const api = openWorkspace(
      alerts([
        alert({
          key: 'k',
          kind: 'PPM_LINE_LAUNCH',
          subject: 'Plan n° 1 (2026) : Mobilier',
          action: 'Lancer la procédure de cette ligne',
          target: { kind: 'PPM', id: 'ppm1' }
        })
      ])
    )
    api.getPpm.mockResolvedValue(fail('PPM_NOT_FOUND', 'Ce plan n’existe pas.'))

    await user.click(await screen.findByRole('button', { name: 'Voir les alertes' }))
    await user.click(await screen.findByRole('button', { name: /Ouvrir Plan n° 1/ }))

    expect(api.getPpm).toHaveBeenCalledWith({ ppmId: 'ppm1' })
  })

  it('« Régler le délai » mène aux paramètres', async () => {
    const user = userEvent.setup()
    openWorkspace(alerts([alert()]))

    await user.click(await screen.findByRole('button', { name: 'Voir les alertes' }))
    await user.click(await screen.findByRole('button', { name: 'Régler le délai' }))

    expect(await screen.findByLabelText('Signaler les échéances à l’avance')).toBeDefined()
  })
})
