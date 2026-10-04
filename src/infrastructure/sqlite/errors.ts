/** La base ne s'ouvre pas : clé absente ou incorrecte, ou fichier corrompu. */
export class DatabaseAccessError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options)
    this.name = 'DatabaseAccessError'
  }
}

/** La base a été créée par une version plus récente de l'application. */
export class DatabaseTooNewError extends Error {
  constructor(
    readonly databaseVersion: number,
    readonly supportedVersion: number
  ) {
    super(
      `La base de données est en version ${databaseVersion}, mais cette application ne gère que jusqu'à la version ${supportedVersion}. Mettez l'application à jour.`
    )
    this.name = 'DatabaseTooNewError'
  }
}

/** Une donnée lue en base ne respecte pas le format attendu. */
export class DataIntegrityError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'DataIntegrityError'
  }
}
