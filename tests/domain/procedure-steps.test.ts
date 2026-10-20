import { describe, expect, it } from 'vitest'
import {
  addBid,
  createBid,
  createProcedure,
  parseStepKind,
  procedureProgress,
  reopenStep,
  setAwardedBid,
  setStepDates,
  STEP_KINDS,
  updateProcedureDetails,
  validateStep,
  type Procedure,
  type StepKind
} from '@domain/procedure'
import { ariary } from '@domain/shared/ariary'
import { DomainError } from '@domain/shared/errors'

const fresh = (): Procedure =>
  createProcedure({
    id: 'p1',
    reference: 'DAO-001/2026',
    object: 'Fourniture de mobilier',
    method: 'DAO',
    createdOn: '2026-02-01'
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

/** Renseigne la date réelle puis valide, dans l'ordre. */
const completeUntil = (kinds: readonly StepKind[], base = fresh()): Procedure =>
  kinds.reduce((procedure, kind, index) => {
    const day = String(10 + index).padStart(2, '0')
    // L'attribution exige une offre retenue (ADR-028) : on en ajoute une quand il le faut.
    const ready =
      kind === 'ATTRIBUTION' && !procedure.bids.some((bid) => bid.awarded)
        ? setAwardedBid(
            addBid(
              procedure,
              createBid({ id: 'b-auto', candidateId: 'c-auto', amount: ariary(1_000) })
            ),
            'b-auto'
          )
        : procedure
    const withDate = setStepDates(ready, kind, {
      plannedDate: null,
      actualDate: `2026-03-${day}`
    })
    return validateStep(withDate, kind, `2026-03-${day}`)
  }, base)

describe('avancement', () => {
  it('commence non démarrée, avec la publication comme prochaine étape', () => {
    expect(procedureProgress(fresh())).toEqual({
      validatedCount: 0,
      total: 5,
      status: 'NOT_STARTED',
      nextStep: 'PUBLICATION'
    })
  })

  it('est en cours puis terminée à mesure que les étapes sont validées', () => {
    const two = completeUntil(['PUBLICATION', 'OUVERTURE_PLIS'])
    expect(procedureProgress(two)).toMatchObject({
      validatedCount: 2,
      status: 'IN_PROGRESS',
      nextStep: 'EVALUATION'
    })

    const all = completeUntil([...STEP_KINDS])
    expect(procedureProgress(all)).toMatchObject({
      validatedCount: 5,
      status: 'COMPLETED',
      nextStep: null
    })
  })
})

describe('dates d’une étape', () => {
  it('enregistre les dates prévue et réelle sans modifier l’original', () => {
    const original = fresh()
    const updated = setStepDates(original, 'PUBLICATION', {
      plannedDate: '2026-03-01',
      actualDate: '2026-03-02'
    })

    expect(updated.steps[0]).toMatchObject({
      plannedDate: '2026-03-01',
      actualDate: '2026-03-02',
      validatedOn: null
    })
    expect(original.steps[0]?.plannedDate).toBeNull()
  })

  it('efface une date quand on renvoie null', () => {
    const withDate = setStepDates(fresh(), 'PUBLICATION', {
      plannedDate: '2026-03-01',
      actualDate: '2026-03-02'
    })
    const cleared = setStepDates(withDate, 'PUBLICATION', { plannedDate: null, actualDate: null })
    expect(cleared.steps[0]).toMatchObject({ plannedDate: null, actualDate: null })
  })

  it('refuse une date invalide', () => {
    expect(
      codeOf(() =>
        setStepDates(fresh(), 'PUBLICATION', { plannedDate: '2026-02-30', actualDate: null })
      )
    ).toBe('INVALID_DATE')
  })

  it('refuse une date réelle antérieure à celle de l’étape précédente', () => {
    const published = setStepDates(fresh(), 'PUBLICATION', {
      plannedDate: null,
      actualDate: '2026-03-10'
    })
    expect(
      codeOf(() =>
        setStepDates(published, 'OUVERTURE_PLIS', { plannedDate: null, actualDate: '2026-03-09' })
      )
    ).toBe('STEP_DATE_BEFORE_PREVIOUS')
    expect(() =>
      setStepDates(published, 'OUVERTURE_PLIS', { plannedDate: null, actualDate: '2026-03-10' })
    ).not.toThrow()
  })

  it('refuse une date réelle postérieure à celle de l’étape suivante', () => {
    const opened = setStepDates(fresh(), 'OUVERTURE_PLIS', {
      plannedDate: null,
      actualDate: '2026-03-10'
    })
    expect(
      codeOf(() =>
        setStepDates(opened, 'PUBLICATION', { plannedDate: null, actualDate: '2026-03-11' })
      )
    ).toBe('STEP_DATE_AFTER_NEXT')
  })

  it('les dates prévues ne sont pas contraintes (elles servent de planning)', () => {
    expect(() =>
      setStepDates(
        setStepDates(fresh(), 'PUBLICATION', { plannedDate: '2026-06-01', actualDate: null }),
        'OUVERTURE_PLIS',
        { plannedDate: '2026-01-01', actualDate: null }
      )
    ).not.toThrow()
  })

  it('verrouille les dates d’une étape validée', () => {
    const validated = completeUntil(['PUBLICATION'])
    expect(
      codeOf(() =>
        setStepDates(validated, 'PUBLICATION', { plannedDate: null, actualDate: '2026-04-01' })
      )
    ).toBe('STEP_LOCKED')
  })
})

describe('validation d’une étape', () => {
  it('exige la validation de l’étape précédente, dans l’ordre', () => {
    const withDate = setStepDates(fresh(), 'OUVERTURE_PLIS', {
      plannedDate: null,
      actualDate: '2026-03-10'
    })
    expect(codeOf(() => validateStep(withDate, 'OUVERTURE_PLIS', '2026-03-10'))).toBe(
      'PREVIOUS_STEP_NOT_VALIDATED'
    )
  })

  it('exige une date réelle', () => {
    expect(codeOf(() => validateStep(fresh(), 'PUBLICATION', '2026-03-10'))).toBe(
      'ACTUAL_DATE_REQUIRED'
    )
  })

  it('refuse de valider deux fois', () => {
    const validated = completeUntil(['PUBLICATION'])
    expect(codeOf(() => validateStep(validated, 'PUBLICATION', '2026-03-12'))).toBe(
      'STEP_ALREADY_VALIDATED'
    )
  })

  it('enregistre la date de validation fournie', () => {
    const withDate = setStepDates(fresh(), 'PUBLICATION', {
      plannedDate: null,
      actualDate: '2026-03-10'
    })
    expect(validateStep(withDate, 'PUBLICATION', '2026-03-12').steps[0]?.validatedOn).toBe(
      '2026-03-12'
    )
  })

  it('le message d’erreur nomme l’étape à valider d’abord', () => {
    const withDate = setStepDates(fresh(), 'EVALUATION', {
      plannedDate: null,
      actualDate: '2026-03-10'
    })
    try {
      validateStep(withDate, 'EVALUATION', '2026-03-10')
    } catch (error) {
      expect((error as DomainError).message).toContain('Ouverture des plis')
      return
    }
    throw new Error('erreur attendue')
  })
})

describe('réouverture d’une étape', () => {
  it('rouvre la dernière étape validée, qui redevient modifiable', () => {
    const two = completeUntil(['PUBLICATION', 'OUVERTURE_PLIS'])
    const reopened = reopenStep(two, 'OUVERTURE_PLIS')

    expect(reopened.steps[1]?.validatedOn).toBeNull()
    expect(reopened.steps[1]?.actualDate).toBe('2026-03-11') // la date réelle est conservée
    expect(() =>
      setStepDates(reopened, 'OUVERTURE_PLIS', { plannedDate: null, actualDate: '2026-03-15' })
    ).not.toThrow()
  })

  it('refuse de rouvrir une étape dont une suivante est validée', () => {
    const two = completeUntil(['PUBLICATION', 'OUVERTURE_PLIS'])
    expect(codeOf(() => reopenStep(two, 'PUBLICATION'))).toBe('LATER_STEP_VALIDATED')
  })

  it('refuse de rouvrir une étape non validée', () => {
    expect(codeOf(() => reopenStep(fresh(), 'PUBLICATION'))).toBe('STEP_NOT_VALIDATED')
  })
})

describe('en-tête de la procédure', () => {
  const input = {
    reference: 'DAO-002/2026',
    object: '  Mobilier de bureau ',
    method: 'DAO' as const,
    ppmLineId: 'l1',
    estimatedAmount: ariary(5_000_000)
  }

  it('modifie référence, objet, ligne du plan et montant estimé', () => {
    const updated = updateProcedureDetails(fresh(), input)
    expect(updated).toMatchObject({
      reference: 'DAO-002/2026',
      object: 'Mobilier de bureau',
      ppmLineId: 'l1',
      estimatedAmount: 5_000_000
    })
  })

  it('permet de changer le mode tant qu’aucune étape n’est validée, pas après', () => {
    expect(updateProcedureDetails(fresh(), { ...input, method: 'AOR' }).method).toBe('AOR')
    const started = completeUntil(['PUBLICATION'])
    expect(codeOf(() => updateProcedureDetails(started, { ...input, method: 'AOR' }))).toBe(
      'METHOD_LOCKED'
    )
    expect(() => updateProcedureDetails(started, input)).not.toThrow() // même mode : accepté
  })

  it('refuse une référence ou un objet vide', () => {
    expect(codeOf(() => updateProcedureDetails(fresh(), { ...input, reference: ' ' }))).toBe(
      'REQUIRED_FIELD'
    )
    expect(codeOf(() => updateProcedureDetails(fresh(), { ...input, object: '' }))).toBe(
      'REQUIRED_FIELD'
    )
  })
})

describe('parseStepKind', () => {
  it('accepte les étapes connues et refuse le reste', () => {
    expect(parseStepKind('EVALUATION')).toBe('EVALUATION')
    expect(codeOf(() => parseStepKind('evaluation'))).toBe('INVALID_VALUE')
  })
})
