import { type Contract, contractStatus } from './contract'
import { DomainError } from './shared/errors'
import { addDays, daysBetween, type IsoDate, parseIsoDate } from './shared/iso-date'
import type { Ppm } from './ppm'
import { type Procedure, STEP_LABELS } from './procedure'

/** Délais d'alerte proposés à l'utilisateur (en jours), et valeur par défaut. */
export const ALERT_HORIZON_CHOICES = [7, 15, 30, 60] as const
export type AlertHorizonDays = (typeof ALERT_HORIZON_CHOICES)[number]
export const DEFAULT_ALERT_HORIZON_DAYS: AlertHorizonDays = 15

/** Un marché signé doit recevoir son ordre de service de démarrage dans ce délai (ADR-031, à confirmer). */
export const CONTRACT_START_DELAY_DAYS = 30

export function parseAlertHorizon(value: number): AlertHorizonDays {
  const choice = ALERT_HORIZON_CHOICES.find((candidate) => candidate === value)
  if (choice === undefined) {
    throw new DomainError(
      'INVALID_VALUE',
      `Délai d’alerte invalide : choisissez parmi ${ALERT_HORIZON_CHOICES.join(', ')} jours.`
    )
  }
  return choice
}

export type AlertKind = 'PROCEDURE_STEP' | 'PPM_LINE_LAUNCH' | 'CONTRACT_NOT_STARTED'
export type AlertSeverity = 'OVERDUE' | 'UPCOMING'
export type AlertTargetKind = 'PROCEDURE' | 'PPM' | 'CONTRACT'

export interface Alert {
  /** Identifiant stable (une même échéance garde le même identifiant d'un jour à l'autre). */
  readonly key: string
  readonly kind: AlertKind
  readonly severity: AlertSeverity
  readonly dueOn: IsoDate
  /** Jours restants avant l'échéance ; négatif quand elle est dépassée ; 0 le jour même. */
  readonly daysLeft: number
  /** L'élément concerné (référence de procédure, plan, contrat). */
  readonly subject: string
  /** Ce qu'il faut faire. */
  readonly action: string
  readonly target: { readonly kind: AlertTargetKind; readonly id: string }
}

export interface AlertInput {
  readonly today: string
  readonly horizonDays: number
  readonly procedures: readonly Procedure[]
  readonly ppms: readonly Ppm[]
  readonly contracts: readonly Contract[]
}

/** En retard (avant aujourd'hui), à venir (d'aujourd'hui à l'horizon compris), ou sans objet (trop lointaine). */
function severityOf(daysLeft: number, horizonDays: number): AlertSeverity | null {
  if (daysLeft < 0) return 'OVERDUE'
  return daysLeft <= horizonDays ? 'UPCOMING' : null
}

/**
 * Calcule les alertes d'échéances à partir des données de la région (ADR-031). Elles ne sont jamais
 * enregistrées : elles se recalculent à chaque affichage, donc ne peuvent jamais être périmées.
 * Triées : d'abord les retards (le plus ancien en tête), puis les échéances à venir (la plus proche en tête).
 */
export function computeAlerts(input: AlertInput): readonly Alert[] {
  const today = parseIsoDate(input.today)
  const alerts: Alert[] = []

  const consider = (
    due: IsoDate,
    key: string,
    kind: AlertKind,
    subject: string,
    action: string,
    target: Alert['target']
  ): void => {
    const daysLeft = daysBetween(today, due)
    const severity = severityOf(daysLeft, input.horizonDays)
    if (severity !== null) {
      alerts.push({ key, kind, severity, dueOn: due, daysLeft, subject, action, target })
    }
  }

  // 1. Étapes de procédure non validées, avec une date prévue (une procédure terminée n'en a plus aucune).
  for (const procedure of input.procedures) {
    for (const step of procedure.steps) {
      if (step.validatedOn !== null || step.plannedDate === null) continue
      consider(
        step.plannedDate,
        `step:${procedure.id}:${step.kind}`,
        'PROCEDURE_STEP',
        procedure.reference,
        STEP_LABELS[step.kind],
        { kind: 'PROCEDURE', id: procedure.id }
      )
    }
  }

  // 2. Lancement prévu d'une ligne du plan qui n'a donné lieu à aucune procédure ni aucun contrat.
  const usedLines = new Set<string>([
    ...input.procedures.flatMap((procedure) =>
      procedure.ppmLineId === null ? [] : [procedure.ppmLineId]
    ),
    ...input.contracts.flatMap((contract) =>
      contract.ppmLineId === null ? [] : [contract.ppmLineId]
    )
  ])
  for (const ppm of input.ppms) {
    for (const line of ppm.lines) {
      if (line.plannedLaunchDate === null || usedLines.has(line.id)) continue
      consider(
        line.plannedLaunchDate,
        `launch:${ppm.id}:${line.id}`,
        'PPM_LINE_LAUNCH',
        `Plan n° ${String(ppm.number)} (${String(ppm.year)}) : ${line.object}`,
        'Lancer la procédure de cette ligne',
        { kind: 'PPM', id: ppm.id }
      )
    }
  }

  // 3. Marché signé dont l'ordre de service de démarrage tarde.
  for (const contract of input.contracts) {
    if (contract.kind !== 'MARCHE' || contract.signedOn === null) continue
    if (contractStatus(contract) !== 'NOT_STARTED') continue
    consider(
      addDays(contract.signedOn, CONTRACT_START_DELAY_DAYS),
      `start:${contract.id}`,
      'CONTRACT_NOT_STARTED',
      contract.reference,
      'Émettre l’ordre de service de démarrage',
      { kind: 'CONTRACT', id: contract.id }
    )
  }

  return alerts.sort((a, b) => {
    if (a.severity !== b.severity) return a.severity === 'OVERDUE' ? -1 : 1
    return a.daysLeft - b.daysLeft || a.key.localeCompare(b.key)
  })
}

export function countBySeverity(alerts: readonly Alert[]): {
  readonly overdue: number
  readonly upcoming: number
} {
  return {
    overdue: alerts.filter((alert) => alert.severity === 'OVERDUE').length,
    upcoming: alerts.filter((alert) => alert.severity === 'UPCOMING').length
  }
}
