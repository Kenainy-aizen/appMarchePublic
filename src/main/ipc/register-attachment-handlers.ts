import { ipcMain } from 'electron'
import type {
  AddAttachmentUseCase,
  ListAttachmentsUseCase,
  ReadAttachmentUseCase,
  RemoveAttachmentUseCase
} from '@application/attachments/attachment-use-cases'
import type { AttachmentDto, ExportResultDto } from '@shared/api'
import { IpcChannels } from '@shared/ipc-channels'
import {
  addAttachmentInputSchema,
  attachmentIdInputSchema,
  attachmentOwnerInputSchema
} from '@shared/ipc-schemas'
import { parseInput, runSafely } from './safe-handler'

export interface AttachmentUseCases {
  readonly listAttachments: ListAttachmentsUseCase
  readonly addAttachment: AddAttachmentUseCase
  readonly removeAttachment: RemoveAttachmentUseCase
  readonly readAttachment: ReadAttachmentUseCase
}

/** Enregistre une copie en clair d'un document (boîte de dialogue du système, fournie par le composition root). */
export type SaveCopy = (suggestedName: string, bytes: Uint8Array) => Promise<boolean>

/** Documents joints : région ouverte obligatoire ; le contenu déchiffré ne sort que par « enregistrer une copie ». */
export function registerAttachmentHandlers(useCases: AttachmentUseCases, saveCopy: SaveCopy): void {
  ipcMain.handle(IpcChannels.attachmentList, (_event, input: unknown) =>
    runSafely((): readonly AttachmentDto[] =>
      useCases.listAttachments.execute(parseInput(attachmentOwnerInputSchema, input))
    )
  )

  ipcMain.handle(IpcChannels.attachmentAdd, (_event, input: unknown) =>
    runSafely((): AttachmentDto =>
      useCases.addAttachment.execute(parseInput(addAttachmentInputSchema, input))
    )
  )

  ipcMain.handle(IpcChannels.attachmentRemove, (_event, input: unknown) =>
    runSafely(() => {
      useCases.removeAttachment.execute(parseInput(attachmentIdInputSchema, input))
      return null
    })
  )

  ipcMain.handle(IpcChannels.attachmentExport, (_event, input: unknown) =>
    runSafely(async (): Promise<ExportResultDto> => {
      const document = useCases.readAttachment.execute(parseInput(attachmentIdInputSchema, input))
      return { saved: await saveCopy(document.name, document.bytes) }
    })
  )
}
