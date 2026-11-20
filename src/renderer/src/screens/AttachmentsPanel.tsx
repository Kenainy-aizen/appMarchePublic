import { useEffect, useState, type SyntheticEvent } from 'react'
import type { AttachmentDto } from '@shared/api'
import {
  type AttachmentOwnerCode,
  FILE_INPUT_ACCEPT,
  MAX_ATTACHMENT_BYTES
} from '@shared/attachment-options'
import { messageOf, unwrap } from '../api-errors'
import { emptyToNull, formatDate, formatFileSize } from '../format'
import { Alert } from '../ui/Alert'
import { Icon } from '../ui/Icon'

interface Props {
  readonly ownerKind: AttachmentOwnerCode
  readonly ownerId: string
}

/** Lit le contenu d'un fichier choisi (Blob.arrayBuffer, ou FileReader si l'environnement ne l'offre pas). */
async function readBytes(file: File): Promise<Uint8Array<ArrayBuffer>> {
  if (typeof file.arrayBuffer === 'function') return new Uint8Array(await file.arrayBuffer())
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      resolve(new Uint8Array(reader.result as ArrayBuffer))
    }
    reader.onerror = () => {
      reject(new Error('Lecture du fichier impossible.'))
    }
    reader.readAsArrayBuffer(file)
  })
}

const extensionLabel = (name: string): string => {
  const dot = name.lastIndexOf('.')
  return dot < 0 ? '—' : name.slice(dot + 1).toUpperCase()
}

/** Documents joints à un objet (procédure, contrat, candidat) : ils sont chiffrés comme les données de la région. */
export function AttachmentsPanel({ ownerKind, ownerId }: Props): React.JSX.Element {
  const [attachments, setAttachments] = useState<readonly AttachmentDto[] | null>(null)
  const [file, setFile] = useState<File | null>(null)
  const [fileInputKey, setFileInputKey] = useState(0)
  const [note, setNote] = useState('')
  const [confirming, setConfirming] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    const alive = { current: true }
    void (async () => {
      try {
        const list = unwrap(await window.api.listAttachments({ ownerKind, ownerId }))
        if (alive.current) setAttachments(list)
      } catch (failure) {
        if (alive.current) setError(messageOf(failure))
      }
    })()
    return () => {
      alive.current = false
    }
  }, [ownerKind, ownerId])

  async function add(event: SyntheticEvent): Promise<void> {
    event.preventDefault()
    if (file === null) return
    if (file.size > MAX_ATTACHMENT_BYTES) {
      setError(
        `Le fichier dépasse la taille maximale de ${String(MAX_ATTACHMENT_BYTES / (1024 * 1024))} Mo.`
      )
      return
    }
    setBusy(true)
    setError(null)
    setCopied(false)
    try {
      const bytes = await readBytes(file)
      const added = unwrap(
        await window.api.addAttachment({
          ownerKind,
          ownerId,
          fileName: file.name,
          bytes,
          note: emptyToNull(note)
        })
      )
      setAttachments((current) => [added, ...(current ?? [])])
      setFile(null)
      setNote('')
      setFileInputKey((key) => key + 1)
    } catch (failure) {
      setError(messageOf(failure))
    } finally {
      setBusy(false)
    }
  }

  async function remove(attachment: AttachmentDto): Promise<void> {
    setBusy(true)
    setError(null)
    try {
      unwrap(await window.api.removeAttachment({ attachmentId: attachment.id }))
      setAttachments((current) => current?.filter((item) => item.id !== attachment.id) ?? null)
    } catch (failure) {
      setError(messageOf(failure))
    } finally {
      setBusy(false)
      setConfirming(null)
    }
  }

  async function saveCopy(attachment: AttachmentDto): Promise<void> {
    setBusy(true)
    setError(null)
    setCopied(false)
    try {
      const result = unwrap(await window.api.exportAttachment({ attachmentId: attachment.id }))
      setCopied(result.saved)
    } catch (failure) {
      setError(messageOf(failure))
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="panel" aria-labelledby={`docs-title-${ownerKind}`}>
      <h2 className="panel__title" id={`docs-title-${ownerKind}`}>
        Documents joints
      </h2>
      <p className="panel__lead">
        Procès-verbaux, avis, contrats signés, scans. Les documents sont chiffrés comme les données
        de la région.
      </p>

      {error && <Alert tone="error">{error}</Alert>}
      {copied && <Alert tone="success">Copie enregistrée.</Alert>}

      {attachments === null && !error && <p role="status">Chargement…</p>}

      {attachments?.length === 0 && (
        <p className="hint" style={{ marginTop: '1rem' }}>
          Aucun document joint.
        </p>
      )}

      {attachments !== null && attachments.length > 0 && (
        <div className="table-wrap" style={{ marginTop: '1rem' }}>
          <table>
            <caption className="visually-hidden">Documents joints</caption>
            <thead>
              <tr>
                <th scope="col">Document</th>
                <th scope="col">Type</th>
                <th scope="col" className="number">
                  Taille
                </th>
                <th scope="col">Ajouté le</th>
                <th scope="col">
                  <span className="visually-hidden">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {attachments.map((attachment) => (
                <tr key={attachment.id}>
                  <td>
                    <strong>{attachment.name}</strong>
                    {attachment.note && <div className="cell-note">{attachment.note}</div>}
                  </td>
                  <td>{extensionLabel(attachment.name)}</td>
                  <td className="number">{formatFileSize(attachment.size)}</td>
                  <td>{formatDate(attachment.addedOn)}</td>
                  <td>
                    <div className="row-actions row-actions--inline">
                      {confirming === attachment.id ? (
                        <>
                          <button
                            type="button"
                            className="danger small"
                            disabled={busy}
                            onClick={() => void remove(attachment)}
                          >
                            Confirmer le retrait de {attachment.name}
                          </button>
                          <button
                            type="button"
                            className="secondary small"
                            onClick={() => {
                              setConfirming(null)
                            }}
                          >
                            Annuler
                          </button>
                        </>
                      ) : (
                        <>
                          <button
                            type="button"
                            className="secondary small"
                            disabled={busy}
                            aria-label={`Enregistrer une copie de ${attachment.name}`}
                            onClick={() => void saveCopy(attachment)}
                          >
                            <Icon name="copy" size={15} />
                            Copie
                          </button>
                          <button
                            type="button"
                            className="secondary small danger-outline"
                            aria-label={`Retirer le document ${attachment.name}`}
                            onClick={() => {
                              setConfirming(attachment.id)
                              setError(null)
                            }}
                          >
                            <Icon name="trash" size={15} />
                            Retirer
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <form className="inline-form" onSubmit={(event) => void add(event)}>
        <h3>Joindre un document</h3>
        <label htmlFor={`attachment-file-${ownerKind}`}>Fichier à joindre</label>
        <input
          key={fileInputKey}
          id={`attachment-file-${ownerKind}`}
          type="file"
          accept={FILE_INPUT_ACCEPT}
          onChange={(event) => {
            setFile(event.target.files?.[0] ?? null)
            setError(null)
          }}
        />
        <p className="hint">
          Types acceptés : PDF, JPG, PNG, Word (.docx) et Excel (.xlsx), 20 Mo au maximum.
        </p>
        <label htmlFor={`attachment-note-${ownerKind}`}>Note sur le document (facultative)</label>
        <input
          id={`attachment-note-${ownerKind}`}
          type="text"
          value={note}
          maxLength={500}
          onChange={(event) => {
            setNote(event.target.value)
          }}
        />
        <div className="actions" style={{ marginTop: '1rem' }}>
          <button type="submit" disabled={busy || file === null}>
            <Icon name="plus" size={16} />
            {busy ? 'Envoi…' : 'Joindre le document'}
          </button>
        </div>
      </form>
    </section>
  )
}
