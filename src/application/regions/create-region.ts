import {
  MAX_REGIONS,
  type RegionSummary,
  sameRegionName,
  validateNewPassword,
  validateRegionName
} from '@domain/region'
import { DomainError } from '@domain/shared/errors'
import type { Clock, IdGenerator } from '@domain/shared/ports'
import type { LoginThrottle } from '../login-throttle'
import type { RegionKeyService, RegionRegistry, RegionStorage, RegisteredRegion } from '../ports'

export interface CreateRegionInput {
  readonly name: string
  readonly password: string
  readonly passwordConfirmation: string
}

export interface CreateRegionResult {
  readonly region: RegionSummary
  /** Affichée UNE SEULE FOIS : elle n'est conservée nulle part en clair. */
  readonly recoveryKey: string
}

export class CreateRegionUseCase {
  constructor(
    private readonly registry: RegionRegistry,
    private readonly keys: RegionKeyService,
    private readonly storage: RegionStorage,
    private readonly ids: IdGenerator,
    private readonly clock: Clock,
    private readonly throttle: LoginThrottle
  ) {}

  async execute(input: CreateRegionInput): Promise<CreateRegionResult> {
    const name = validateRegionName(input.name)
    validateNewPassword(input.password, input.passwordConfirmation)
    this.assertCanRegister(name)
    await this.assertPasswordUnusedElsewhere(input.password)

    const id = this.ids.newId()
    const { secrets, dataKey, recoveryKey } = await this.keys.createSecrets(id, input.password)

    try {
      // La dérivation de clé est asynchrone : on revérifie juste avant d'écrire.
      this.assertCanRegister(name)
      this.storage.create(id, dataKey)
      this.registry.add({ id, name, createdOn: this.clock.today(), secrets })
    } catch (error) {
      this.storage.remove(id)
      throw error
    } finally {
      dataKey.fill(0)
    }

    return { region: { id, name }, recoveryKey }
  }

  private assertCanRegister(name: string): void {
    const existing = this.registry.list()
    if (existing.length >= MAX_REGIONS) {
      throw new DomainError(
        'REGION_LIMIT_REACHED',
        `Le nombre maximal de régions (${MAX_REGIONS}) est atteint.`
      )
    }
    if (existing.some((region) => sameRegionName(region.name, name))) {
      throw new DomainError('REGION_NAME_TAKEN', 'Une région porte déjà ce nom.')
    }
  }

  /**
   * Chaque région doit avoir son propre mot de passe : on vérifie que celui-ci n'ouvre aucune région existante.
   * Cette vérification est un moyen d'essayer des mots de passe : elle passe donc par le même limiteur
   * d'essais que la connexion (sinon la création de région contournerait le blocage après 5 échecs).
   */
  private async assertPasswordUnusedElsewhere(password: string): Promise<void> {
    for (const region of this.registry.list()) {
      this.throttle.assertAllowed(region.id, this.clock.nowMs())
      if (await this.opens(region, password)) {
        throw new DomainError(
          'PASSWORD_ALREADY_USED',
          'Ce mot de passe est déjà utilisé par une autre région. Chaque région doit avoir son propre mot de passe.'
        )
      }
      this.throttle.recordFailure(region.id, this.clock.nowMs())
    }
  }

  private async opens(region: RegisteredRegion, password: string): Promise<boolean> {
    try {
      const dataKey = await this.keys.unlockWithPassword(region.id, region.secrets, password)
      dataKey.fill(0)
      return true
    } catch (error) {
      if (error instanceof DomainError && error.code === 'INVALID_PASSWORD') return false
      throw error
    }
  }
}
