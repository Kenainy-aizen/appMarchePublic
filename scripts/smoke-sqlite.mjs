// Lance le test de fumée avec le binaire d'Electron utilisé comme simple moteur Node (multiplateforme).
import { spawnSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const electronBinary = require('electron')
const script = fileURLToPath(new URL('./smoke-sqlite-electron.cjs', import.meta.url))

const result = spawnSync(electronBinary, [script], {
  stdio: 'inherit',
  env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' }
})
process.exit(result.status ?? 1)
