const amountFormat = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 })

/** 1500000 -> « 1 500 000 » (séparateur de milliers français). */
export function formatAmount(value: number): string {
  return amountFormat.format(value)
}

/** 1500000 -> « 1 500 000 Ar ». */
export function formatAriary(value: number): string {
  return `${formatAmount(value)} Ar`
}

/** 1536 -> « 1,5 Ko » ; 3 400 000 -> « 3,2 Mo » (taille d'un document). */
export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${String(bytes)} o`
  const oneDecimal = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 1 })
  if (bytes < 1024 * 1024) return `${oneDecimal.format(bytes / 1024)} Ko`
  return `${oneDecimal.format(bytes / (1024 * 1024))} Mo`
}

/** « 2026-10-04 » -> « 04/10/2026 » ; une date absente s'affiche « — ». */
export function formatDate(iso: string | null): string {
  if (iso === null) return '—'
  const [year, month, day] = iso.split('-')
  return `${day ?? ''}/${month ?? ''}/${year ?? ''}`
}

/**
 * Lit un montant saisi par l'utilisateur : chiffres uniquement, espaces tolérés (« 1 500 000 »).
 * Retourne null si le texte n'est pas un entier positif ou nul exploitable.
 */
export function parseAmount(text: string): number | null {
  const digits = text.replace(/[\s\u00a0\u202f]/g, '')
  if (!/^\d{1,15}$/.test(digits)) return null
  return Number(digits)
}

/**
 * Lit une variation de montant saisie (avenant) : entier relatif, espaces tolérés, signe « - » ou « − ».
 * Retourne null si le texte n'est pas un entier exploitable.
 */
export function parseSignedAmount(text: string): number | null {
  const cleaned = text.replace(/[\s\u00a0\u202f]/g, '').replace('\u2212', '-')
  if (!/^-?\d{1,15}$/.test(cleaned)) return null
  return Number(cleaned)
}

/** « 6012, 6013 ; 6014 » -> ['6012', '6013', '6014'] (séparateurs : virgule ou point-virgule). */
export function splitAccounts(text: string): string[] {
  return text
    .split(/[,;]/)
    .map((account) => account.trim())
    .filter((account) => account.length > 0)
}

/** Texte vide -> null (pour les champs facultatifs envoyés au processus principal). */
export function emptyToNull(text: string): string | null {
  const trimmed = text.trim()
  return trimmed.length === 0 ? null : trimmed
}
