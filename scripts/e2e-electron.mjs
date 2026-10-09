import { spawn } from 'node:child_process'
import { mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'

/**
 * Test de bout en bout : lance la VRAIE application compilée (`npm run build` d'abord) et la pilote par le
 * protocole de débogage de Chromium, comme le ferait l'interface. Données dans un dossier jetable.
 * Sous Linux sans écran, utilise xvfb-run (sudo apt install xvfb).
 */
const projectRoot = resolve(fileURLToPath(new URL('..', import.meta.url)))
const electronBinary = createRequire(import.meta.url)('electron')
const mainEntry = join(projectRoot, 'out', 'main', 'index.js')
const outputDir = mkdtempSync(join(tmpdir(), 'prmp-e2e-shots-'))
const dataDir = mkdtempSync(join(tmpdir(), 'prmp-e2e-'))
const PORT = 9333
const log = []
const check = (name, ok, detail = '') => {
  log.push({ name, ok, detail })
  console.log(`${ok ? 'OK    ' : 'ÉCHEC '} ${name}${detail ? ' — ' + detail : ''}`)
}

/** Si une ancienne instance écoute déjà sur ce port, on la piloterait par erreur : on s'arrête avant. */
try {
  await fetch(`http://127.0.0.1:${PORT}/json`)
  console.error(
    `Le port ${PORT} est déjà utilisé (une instance d'Electron tourne encore ?). Arrêtez-la avant de relancer.`
  )
  process.exit(2)
} catch {
  /* port libre : c'est ce que l'on veut */
}

const electronArgs = ['--disable-gpu', `--remote-debugging-port=${PORT}`, mainEntry]
if (process.platform === 'linux') electronArgs.unshift('--no-sandbox') // bac à sable Chromium souvent indisponible en CI / conteneur
const needsVirtualDisplay =
  process.platform === 'linux' && !process.env.DISPLAY && !process.env.WAYLAND_DISPLAY
const app = needsVirtualDisplay
  ? spawn('xvfb-run', ['-a', electronBinary, ...electronArgs], {
      env: { ...process.env, PRMP_DATA_DIR: dataDir },
      stdio: ['ignore', 'pipe', 'pipe'],
      detached: true
    })
  : spawn(electronBinary, electronArgs, {
      env: { ...process.env, PRMP_DATA_DIR: dataDir },
      stdio: ['ignore', 'pipe', 'pipe'],
      detached: true
    })
let stderr = ''
app.stderr.on('data', (d) => {
  stderr += d
})
app.stdout.on('data', (d) => {
  stderr += d
})

/** Arrête toute l'arborescence lancée (le signe moins vise le groupe de processus). */
function stopApplication(signal) {
  try {
    process.kill(-app.pid, signal)
  } catch {
    /* déjà terminé */
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
async function waitForTarget() {
  for (let i = 0; i < 60; i++) {
    try {
      const targets = await (await fetch(`http://127.0.0.1:${PORT}/json`)).json()
      const page = targets.find((t) => t.type === 'page')
      if (page) return page
    } catch {
      /* la fenêtre n'est pas encore prête : on réessaie */
    }
    await sleep(500)
  }
  throw new Error('fenêtre introuvable\n' + stderr.slice(-800))
}

let ws,
  nextId = 1
const pending = new Map()
function send(method, params = {}) {
  return new Promise((resolve, reject) => {
    const id = nextId++
    pending.set(id, { resolve, reject })
    ws.send(JSON.stringify({ id, method, params }))
  })
}
async function evaluate(expression) {
  const res = await send('Runtime.evaluate', {
    expression,
    awaitPromise: true,
    returnByValue: true
  })
  if (res.exceptionDetails) throw new Error(JSON.stringify(res.exceptionDetails).slice(0, 400))
  return res.result.value
}

try {
  const page = await waitForTarget()
  ws = new WebSocket(page.webSocketDebuggerUrl)
  await new Promise((r, j) => {
    ws.onopen = r
    ws.onerror = j
  })
  ws.onmessage = (m) => {
    const d = JSON.parse(m.data)
    const p = pending.get(d.id)
    if (p) {
      pending.delete(d.id)
      if (d.error) p.reject(new Error(d.error.message))
      else p.resolve(d.result)
    }
  }
  await sleep(1500)

  // 1. L'interface s'affiche : écran de création (aucune région)
  const bodyText = await evaluate('document.body.innerText')
  check(
    'première ouverture : écran « Créer une région »',
    bodyText.includes('Créer une région'),
    bodyText.replace(/\s+/g, ' ').slice(0, 90)
  )
  check(
    'window.api exposé par le preload',
    await evaluate("typeof window.api === 'object' && typeof window.api.openRegion === 'function'")
  )
  check(
    'Node non exposé à l’interface (isolation)',
    await evaluate("typeof require === 'undefined' && typeof process === 'undefined'")
  )

  await send('Page.enable')
  const shot = await send('Page.captureScreenshot', { format: 'png' })
  writeFileSync(join(outputDir, '1-creation.png'), Buffer.from(shot.data, 'base64'))

  // 2. Parcours réel avec vrai chiffrement (scrypt N=2^17) et vrai SQLite
  const P1 = 'phrase de passe region un',
    P2 = 'phrase de passe region deux'
  const r1 = await evaluate(
    `window.api.createRegion({name:'Région 1',password:${JSON.stringify(P1)},passwordConfirmation:${JSON.stringify(P1)}})`
  )
  check(
    'création de la région 1',
    r1.ok && /^([A-Z2-7]{4}-){7}[A-Z2-7]{4}$/.test(r1.value.recoveryKey),
    r1.ok ? r1.value.recoveryKey : JSON.stringify(r1)
  )
  const dup = await evaluate(
    `window.api.createRegion({name:'Région 2',password:${JSON.stringify(P1)},passwordConfirmation:${JSON.stringify(P1)}})`
  )
  check(
    'mot de passe identique refusé',
    !dup.ok && dup.error.code === 'PASSWORD_ALREADY_USED',
    dup.ok ? 'accepté !' : dup.error.code
  )
  const r2 = await evaluate(
    `window.api.createRegion({name:'Région 2',password:${JSON.stringify(P2)},passwordConfirmation:${JSON.stringify(P2)}})`
  )
  check('création de la région 2 (mot de passe différent)', r2.ok)

  const wrong = await evaluate(
    `window.api.openRegion({regionId:${JSON.stringify(r1.value.region.id)},password:'mauvais mot de passe'})`
  )
  check(
    'mauvais mot de passe refusé',
    !wrong.ok && wrong.error.code === 'INVALID_PASSWORD',
    wrong.ok ? '' : wrong.error.message
  )
  const noSession = await evaluate('window.api.getSession()')
  check('aucune région ouverte après un échec', noSession.ok && noSession.value.region === null)
  const open1 = await evaluate(
    `window.api.openRegion({regionId:${JSON.stringify(r1.value.region.id)},password:${JSON.stringify(P1)}})`
  )
  check('connexion à la région 1', open1.ok && open1.value.name === 'Région 1')
  const open2wrongPw = await evaluate(
    `window.api.openRegion({regionId:${JSON.stringify(r2.value.region.id)},password:${JSON.stringify(P1)}})`
  )
  check(
    'le mot de passe de la région 1 n’ouvre pas la région 2',
    !open2wrongPw.ok && open2wrongPw.error.code === 'INVALID_PASSWORD'
  )
  const stillOpen = await evaluate('window.api.getSession()')
  check(
    'une connexion ratée à une autre région laisse la région 1 ouverte, sans ouvrir la 2',
    stillOpen.ok && stillOpen.value.region?.name === 'Région 1',
    JSON.stringify(stillOpen.value)
  )
  const closed = await evaluate('window.api.closeSession()')
  const afterClose = await evaluate('window.api.getSession()')
  check('déconnexion', closed.ok && afterClose.value.region === null)

  // 3. Entrées invalides et blocage
  const bad = await evaluate(`window.api.openRegion({regionId:123,password:{}})`)
  check(
    'entrée de mauvais type rejetée proprement',
    !bad.ok && bad.error.code === 'INVALID_REQUEST',
    bad.ok ? '' : bad.error.code
  )
  let locked = null
  for (let i = 0; i < 7; i++) {
    locked = await evaluate(
      `window.api.openRegion({regionId:${JSON.stringify(r2.value.region.id)},password:'essai ${i} incorrect'})`
    )
  }
  check(
    'blocage temporaire après des échecs répétés',
    !locked.ok && locked.error.code === 'RATE_LIMITED',
    locked.ok ? '' : locked.error.message
  )

  // 4. Ce qui est réellement écrit sur le disque
  const files = readdirSync(dataDir, { recursive: true }).map(String).sort()
  console.log('fichiers :', files.join(', '))
  const dbFiles = files.filter((f) => f.endsWith('.sqlite'))
  check('deux bases de régions + registre', dbFiles.length === 2 && files.includes('regions.json'))
  const registryText = readFileSync(join(dataDir, 'regions.json'), 'utf8')
  check(
    'aucun mot de passe ni clé de récupération dans regions.json',
    ![P1, P2, r1.value.recoveryKey, r1.value.recoveryKey.replaceAll('-', '')].some((s) =>
      registryText.includes(s)
    )
  )
  const header = readFileSync(join(dataDir, dbFiles[0])).subarray(0, 15).toString('latin1')
  check('bases chiffrées (pas d’en-tête SQLite lisible)', header !== 'SQLite format 3')

  const screenshot2 = await send('Page.captureScreenshot', { format: 'png' })
  writeFileSync(join(outputDir, '2-fin.png'), Buffer.from(screenshot2.data, 'base64'))
} catch (e) {
  check('exécution du scénario', false, String(e.message ?? e))
} finally {
  try {
    ws?.close()
  } catch {
    /* connexion déjà fermée */
  }
  stopApplication('SIGTERM')
  await sleep(800)
  stopApplication('SIGKILL')
  try {
    process.kill(-app.pid)
  } catch {
    /* processus déjà terminé */
  }
  const failed = log.filter((l) => !l.ok).length
  console.log(`\nRésultat : ${log.length - failed}/${log.length} vérifications réussies`)
  console.log(`Captures d'écran : ${outputDir}`)
  if (/UNEXPECTED|erreur inattendue/i.test(stderr))
    console.log(
      'Journal Electron (extrait):',
      stderr
        .split('\n')
        .filter((l) => /IPC|UNEXPECTED|inattendue/.test(l))
        .slice(0, 5)
        .join('\n')
    )
  process.exit(failed ? 1 : 0)
}
