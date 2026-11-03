import { describe, expect, it } from 'vitest'
import {
  addContractEvent,
  allowedEventKinds,
  contractStatus,
  createContract,
  currentAmount,
  parseContractEventKind,
  parseContractKind,
  removeLastContractEvent,
  updateContractDetails,
  type Contract,
  type ContractEventKind
} from '@domain/contract'
import { ariary } from '@domain/shared/ariary'
import { DomainError } from '@domain/shared/errors'

const contract = (signedOn: string | null = '2026-03-01'): Contract =>
  createContract({
    id: 'k1',
    reference: 'M-001/2026',
    kind: 'MARCHE',
    procedureId: 'p1',
    holderId: 'c1',
    object: 'Fourniture de mobilier',
    amount: ariary(10_000),
    signedOn
  })

const codeOf = (action: () => unknown): string => {
  try {
    action()
  } catch (error) {
    if (error instanceof DomainError) return error.code
    throw error
  }
  return 'AUCUNE_ERREUR'
}

let counter = 0
/** Ajoute des événements successifs, chacun daté du jour suivant. */
const play = (base: Contract, kinds: readonly ContractEventKind[], amountDelta = 500): Contract =>
  kinds.reduce((current, kind) => {
    counter += 1
    return addContractEvent(current, {
      id: `e${String(counter)}`,
      kind,
      occurredOn: `2026-04-${String(10 + current.events.length).padStart(2, '0')}`,
      amountDelta: kind === 'AVENANT' ? amountDelta : null
    })
  }, base)

describe('situation d’exécution', () => {
  it.each([
    [[], 'NOT_STARTED'],
    [['ORDRE_SERVICE_DEMARRAGE'], 'IN_PROGRESS'],
    [['ORDRE_SERVICE_DEMARRAGE', 'ORDRE_SERVICE_ARRET'], 'STOPPED'],
    [['ORDRE_SERVICE_DEMARRAGE', 'ORDRE_SERVICE_ARRET', 'ORDRE_SERVICE_REPRISE'], 'IN_PROGRESS'],
    [['ORDRE_SERVICE_DEMARRAGE', 'RECEPTION_PROVISOIRE'], 'PROVISIONALLY_RECEIVED'],
    [
      ['ORDRE_SERVICE_DEMARRAGE', 'RECEPTION_PROVISOIRE', 'RECEPTION_DEFINITIVE'],
      'FINALLY_RECEIVED'
    ],
    [
      ['ORDRE_SERVICE_DEMARRAGE', 'RECEPTION_PROVISOIRE', 'RECEPTION_DEFINITIVE', 'CLOTURE'],
      'CLOSED'
    ]
  ] as const)('%j -> %s', (kinds, status) => {
    expect(contractStatus(play(contract(), kinds))).toBe(status)
  })
})

describe('événements autorisés', () => {
  it('aucun sans date de signature', () => {
    expect(allowedEventKinds(contract(null))).toEqual([])
    expect(
      codeOf(() =>
        addContractEvent(contract(null), {
          id: 'e',
          kind: 'ORDRE_SERVICE_DEMARRAGE',
          occurredOn: '2026-04-01'
        })
      )
    ).toBe('SIGNATURE_REQUIRED')
  })

  it('suivent le déroulement : démarrer, arrêter/reprendre, réceptions, clôture', () => {
    expect(allowedEventKinds(contract())).toEqual(['ORDRE_SERVICE_DEMARRAGE', 'AVENANT'])
    expect(allowedEventKinds(play(contract(), ['ORDRE_SERVICE_DEMARRAGE']))).toEqual([
      'ORDRE_SERVICE_ARRET',
      'RECEPTION_PROVISOIRE',
      'AVENANT'
    ])
    expect(
      allowedEventKinds(play(contract(), ['ORDRE_SERVICE_DEMARRAGE', 'ORDRE_SERVICE_ARRET']))
    ).toEqual(['ORDRE_SERVICE_REPRISE', 'AVENANT'])
    expect(
      allowedEventKinds(play(contract(), ['ORDRE_SERVICE_DEMARRAGE', 'RECEPTION_PROVISOIRE']))
    ).toEqual(['RECEPTION_DEFINITIVE'])
    expect(
      allowedEventKinds(
        play(contract(), [
          'ORDRE_SERVICE_DEMARRAGE',
          'RECEPTION_PROVISOIRE',
          'RECEPTION_DEFINITIVE'
        ])
      )
    ).toEqual(['CLOTURE'])
  })

  it.each([
    ['réception provisoire avant le démarrage', [], 'RECEPTION_PROVISOIRE'],
    ['arrêt avant le démarrage', [], 'ORDRE_SERVICE_ARRET'],
    ['deuxième démarrage', ['ORDRE_SERVICE_DEMARRAGE'], 'ORDRE_SERVICE_DEMARRAGE'],
    ['reprise sans arrêt', ['ORDRE_SERVICE_DEMARRAGE'], 'ORDRE_SERVICE_REPRISE'],
    [
      'réception provisoire pendant un arrêt',
      ['ORDRE_SERVICE_DEMARRAGE', 'ORDRE_SERVICE_ARRET'],
      'RECEPTION_PROVISOIRE'
    ],
    [
      'réception définitive sans réception provisoire',
      ['ORDRE_SERVICE_DEMARRAGE'],
      'RECEPTION_DEFINITIVE'
    ],
    [
      'clôture sans réception définitive',
      ['ORDRE_SERVICE_DEMARRAGE', 'RECEPTION_PROVISOIRE'],
      'CLOTURE'
    ],
    [
      'avenant après la réception provisoire',
      ['ORDRE_SERVICE_DEMARRAGE', 'RECEPTION_PROVISOIRE'],
      'AVENANT'
    ],
    [
      'ordre d’arrêt après la réception provisoire',
      ['ORDRE_SERVICE_DEMARRAGE', 'RECEPTION_PROVISOIRE'],
      'ORDRE_SERVICE_ARRET'
    ]
  ] as const)('refuse : %s', (_label, before, kind) => {
    const base = play(contract(), before)
    expect(
      codeOf(() =>
        addContractEvent(base, {
          id: 'x',
          kind,
          occurredOn: '2026-12-31',
          amountDelta: kind === 'AVENANT' ? 1 : null
        })
      )
    ).toBe('EVENT_NOT_ALLOWED')
  })

  it('refuse tout événement après la clôture', () => {
    const closed = play(contract(), [
      'ORDRE_SERVICE_DEMARRAGE',
      'RECEPTION_PROVISOIRE',
      'RECEPTION_DEFINITIVE',
      'CLOTURE'
    ])
    expect(
      codeOf(() =>
        addContractEvent(closed, {
          id: 'x',
          kind: 'AVENANT',
          occurredOn: '2026-12-31',
          amountDelta: 1
        })
      )
    ).toBe('CONTRACT_CLOSED')
  })

  it('le message d’erreur nomme l’événement refusé et la situation', () => {
    try {
      addContractEvent(contract(), {
        id: 'x',
        kind: 'RECEPTION_PROVISOIRE',
        occurredOn: '2026-04-01'
      })
    } catch (error) {
      expect((error as DomainError).message).toContain('Réception provisoire')
      expect((error as DomainError).message).toContain('Non démarré')
      return
    }
    throw new Error('erreur attendue')
  })
})

describe('dates des événements', () => {
  it('refuse une date antérieure à la signature', () => {
    expect(
      codeOf(() =>
        addContractEvent(contract('2026-03-01'), {
          id: 'x',
          kind: 'ORDRE_SERVICE_DEMARRAGE',
          occurredOn: '2026-02-28'
        })
      )
    ).toBe('EVENT_DATE_BEFORE_SIGNATURE')
    expect(() =>
      addContractEvent(contract('2026-03-01'), {
        id: 'x',
        kind: 'ORDRE_SERVICE_DEMARRAGE',
        occurredOn: '2026-03-01'
      })
    ).not.toThrow()
  })

  it('refuse une date antérieure à celle de l’événement précédent', () => {
    const started = addContractEvent(contract(), {
      id: 'a',
      kind: 'ORDRE_SERVICE_DEMARRAGE',
      occurredOn: '2026-05-10'
    })
    expect(
      codeOf(() =>
        addContractEvent(started, {
          id: 'b',
          kind: 'ORDRE_SERVICE_ARRET',
          occurredOn: '2026-05-09'
        })
      )
    ).toBe('EVENT_DATE_BEFORE_PREVIOUS')
    expect(() =>
      addContractEvent(started, { id: 'b', kind: 'ORDRE_SERVICE_ARRET', occurredOn: '2026-05-10' })
    ).not.toThrow()
  })

  it('refuse une date invalide', () => {
    expect(
      codeOf(() =>
        addContractEvent(contract(), {
          id: 'x',
          kind: 'ORDRE_SERVICE_DEMARRAGE',
          occurredOn: '2026-02-30'
        })
      )
    ).toBe('INVALID_DATE')
  })
})

describe('avenants et montant', () => {
  it('cumule les avenants dans le montant actuel', () => {
    const amended = play(contract(), ['AVENANT', 'AVENANT'], 2_000)
    expect(currentAmount(amended)).toBe(14_000)
  })

  it('accepte un avenant négatif ou nul, refuse de passer sous zéro', () => {
    expect(currentAmount(play(contract(), ['AVENANT'], -3_000))).toBe(7_000)
    expect(currentAmount(play(contract(), ['AVENANT'], 0))).toBe(10_000)
    expect(
      codeOf(() =>
        addContractEvent(contract(), {
          id: 'x',
          kind: 'AVENANT',
          occurredOn: '2026-04-01',
          amountDelta: -10_001
        })
      )
    ).toBe('AMOUNT_BELOW_ZERO')
  })

  it('exige la variation de montant', () => {
    expect(
      codeOf(() =>
        addContractEvent(contract(), { id: 'x', kind: 'AVENANT', occurredOn: '2026-04-01' })
      )
    ).toBe('AMOUNT_DELTA_REQUIRED')
  })
})

describe('annulation du dernier événement', () => {
  it('retire seulement le dernier et rétablit la situation précédente', () => {
    const received = play(contract(), ['ORDRE_SERVICE_DEMARRAGE', 'RECEPTION_PROVISOIRE'])
    const undone = removeLastContractEvent(received)

    expect(undone.events).toHaveLength(1)
    expect(contractStatus(undone)).toBe('IN_PROGRESS')
    expect(received.events).toHaveLength(2) // l'original n'est pas modifié
  })

  it('refuse quand il n’y a aucun événement', () => {
    expect(codeOf(() => removeLastContractEvent(contract()))).toBe('NO_EVENT')
  })

  it('permet de rouvrir un contrat clôturé', () => {
    const closed = play(contract(), [
      'ORDRE_SERVICE_DEMARRAGE',
      'RECEPTION_PROVISOIRE',
      'RECEPTION_DEFINITIVE',
      'CLOTURE'
    ])
    expect(contractStatus(removeLastContractEvent(closed))).toBe('FINALLY_RECEIVED')
  })
})

describe('en-tête du contrat', () => {
  const input = {
    reference: 'M-002/2026',
    object: '  Mobilier de bureau ',
    holderId: 'c2',
    ppmLineId: 'l1',
    amount: ariary(12_000),
    signedOn: '2026-03-05'
  }

  it('modifie tous les champs tant qu’aucun événement n’est enregistré', () => {
    const updated = updateContractDetails(contract(), input)
    expect(updated).toMatchObject({
      reference: 'M-002/2026',
      object: 'Mobilier de bureau',
      holderId: 'c2',
      amount: 12_000,
      signedOn: '2026-03-05'
    })
  })

  it('fige le montant et la date de signature dès le premier événement, pas le reste', () => {
    const started = play(contract(), ['ORDRE_SERVICE_DEMARRAGE'])
    expect(codeOf(() => updateContractDetails(started, input))).toBe('CONTRACT_STARTED')
    expect(
      updateContractDetails(started, { ...input, amount: ariary(10_000), signedOn: '2026-03-01' })
        .reference
    ).toBe('M-002/2026')
  })

  it('refuse une référence ou un objet vide', () => {
    expect(codeOf(() => updateContractDetails(contract(), { ...input, reference: ' ' }))).toBe(
      'REQUIRED_FIELD'
    )
    expect(codeOf(() => updateContractDetails(contract(), { ...input, object: '' }))).toBe(
      'REQUIRED_FIELD'
    )
  })
})

describe('codes reconnus', () => {
  it('accepte les types connus et refuse le reste', () => {
    expect(parseContractKind('CONVENTION')).toBe('CONVENTION')
    expect(parseContractEventKind('AVENANT')).toBe('AVENANT')
    expect(codeOf(() => parseContractKind('autre'))).toBe('INVALID_VALUE')
    expect(codeOf(() => parseContractEventKind('autre'))).toBe('INVALID_VALUE')
  })
})
