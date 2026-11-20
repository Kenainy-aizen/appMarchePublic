import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { app, BrowserWindow, dialog } from 'electron'
import { extensionOf } from '@domain/attachment'

/**
 * Enregistre une copie en clair d'un document à l'endroit choisi par l'utilisateur. La copie est un geste
 * volontaire : le document déchiffré ne touche le disque qu'à cet endroit, jamais ailleurs.
 * Retourne false si l'utilisateur ferme la fenêtre sans choisir.
 */
export async function saveCopyWithDialog(
  suggestedName: string,
  bytes: Uint8Array
): Promise<boolean> {
  const extension = extensionOf(suggestedName)
  const window = BrowserWindow.getFocusedWindow()
  const options = {
    title: 'Enregistrer une copie du document',
    defaultPath: join(app.getPath('documents'), suggestedName),
    filters: extension === '' ? [] : [{ name: `Fichier .${extension}`, extensions: [extension] }]
  }
  const result = window
    ? await dialog.showSaveDialog(window, options)
    : await dialog.showSaveDialog(options)
  if (result.canceled || !result.filePath) return false
  writeFileSync(result.filePath, bytes, { mode: 0o600 })
  return true
}
