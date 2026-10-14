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

  const waitUntil = async (expression, label, timeoutMs = 20000) => {
    const start = Date.now()
    while (Date.now() - start < timeoutMs) {
      try {
        if (await evaluate(expression)) return true
      } catch {
        /* page en cours de chargement : on réessaie */
      }
      await sleep(250)
    }
    throw new Error(`délai dépassé : ${label}`)
  }
  const pageHas = (text) =>
    `(document.body?.innerText ?? '').replace(/\\s/g,' ').includes(${JSON.stringify(text)})`
  const setField = (selector, value) =>
    evaluate(`(() => {
      const el = document.querySelector(${JSON.stringify(selector)})
      if (!el) return false
      const proto = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype
        : el.tagName === 'SELECT' ? HTMLSelectElement.prototype : HTMLInputElement.prototype
      Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, ${JSON.stringify(value)})
      el.dispatchEvent(new Event(el.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true }))
      return true
    })()`)
  const clickButton = (label) =>
    evaluate(`(() => {
      const b = [...document.querySelectorAll('button')].find((x) => x.textContent.trim() === ${JSON.stringify(label)})
      if (!b || b.disabled) return false
      b.click()
      return true
    })()`)
  const OBJECT = 'Gardiennage du site de Fianarantsoa'
  const ORG = 'PRMP du Ministère de l’Environnement, Fianarantsoa'
  const P1 = 'phrase de passe region un',
    P2 = 'phrase de passe region deux'

  // 1. Première utilisation, pilotée par l'INTERFACE réelle : nom de la PRMP, première région, clé de récupération
  await waitUntil(pageHas('Configurer l’application'), 'écran de configuration initiale')
  const bodyText = await evaluate('document.body.innerText')
  check(
    'première ouverture : écran « Configurer l’application » avec le champ « Nom de la PRMP »',
    bodyText.includes('Configurer l’application') && bodyText.includes('Nom de la PRMP'),
    bodyText.replace(/\\s+/g, ' ').slice(0, 90)
  )
  check(
    'window.api exposé par le preload',
    await evaluate("typeof window.api === 'object' && typeof window.api.openRegion === 'function'")
  )
  check(
    'Node non exposé à l’interface (isolation)',
    await evaluate("typeof require === 'undefined' && typeof process === 'undefined'")
  )
  check(
    'police embarquée chargée (aucun accès réseau nécessaire)',
    await evaluate(
      "document.fonts.ready.then(() => [...document.fonts].some((f) => f.family.includes('Public Sans') && f.status === 'loaded'))"
    )
  )

  await send('Page.enable')
  const shotSetup = await send('Page.captureScreenshot', { format: 'png' })
  writeFileSync(join(outputDir, '1-configuration.png'), Buffer.from(shotSetup.data, 'base64'))

  await setField('#organization', ORG)
  await setField('#new-password', P1)
  await setField('#confirmation', P1)
  check('clic « Créer la région » (vrai chiffrement)', await clickButton('Créer la région'))
  await waitUntil(
    '!!document.querySelector(".recovery-key")',
    'clé de récupération affichée',
    90000
  )
  const keyText = await evaluate("document.querySelector('.recovery-key')?.textContent ?? ''")
  check(
    'clé de récupération affichée, au bon format',
    /^([A-Z2-7]{4}-){7}[A-Z2-7]{4}$/.test(keyText),
    keyText
  )
  check(
    'étape 3 signalée dans le panneau (aria-current)',
    await evaluate(
      "document.querySelector('.brand__steps li[aria-current=\"step\"]')?.textContent === 'Clé de récupération'"
    )
  )
  const shotKey = await send('Page.captureScreenshot', { format: 'png' })
  writeFileSync(join(outputDir, '1b-cle.png'), Buffer.from(shotKey.data, 'base64'))
  check(
    '« Continuer » bloqué tant que la clé n’est pas confirmée',
    !(await clickButton('Continuer'))
  )
  await evaluate("document.querySelector('input[type=checkbox]').click()")
  check('clic « Continuer » après confirmation', await clickButton('Continuer'))
  await waitUntil(pageHas('Connexion à une région'), 'écran de connexion')
  check(
    'connexion : le nom de la PRMP s’affiche en grand sur le panneau',
    await evaluate(`document.querySelector('.brand__name')?.textContent === ${JSON.stringify(ORG)}`)
  )
  const shotLogin = await send('Page.captureScreenshot', { format: 'png' })
  writeFileSync(join(outputDir, '2-connexion.png'), Buffer.from(shotLogin.data, 'base64'))

  // 2. Suite du parcours avec vrai chiffrement (scrypt N=2^17) et vrai SQLite
  const overview1 = await evaluate('window.api.getRegionsOverview()')
  const r1 = {
    ok: overview1.ok && overview1.value.regions.length === 1,
    value: { region: overview1.value.regions[0], recoveryKey: keyText }
  }
  check(
    'la région 1 créée par l’interface est enregistrée et le nom de la PRMP est conservé',
    r1.ok && r1.value.region.name === 'Région 1' && overview1.value.organizationName === ORG,
    JSON.stringify(overview1.value)
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

  // 2b. Plan de passation, piloté par l'INTERFACE réelle (clics et saisies), puis par l'API

  await send('Page.reload')
  await waitUntil(pageHas('Connexion à une région'), 'écran de connexion après rechargement')
  check('après rechargement : écran de connexion (régions existantes)', true)

  await setField('#password', P1)
  check('clic « Ouvrir la région »', await clickButton('Ouvrir la région'))
  await waitUntil(pageHas('Plan de passation (PPM)'), 'accueil de la région')
  check('interface : accueil de la région 1 affiché', await evaluate(pageHas('Région : Région 1')))
  check(
    'interface : le nom de la PRMP est affiché dans le bandeau du haut',
    await evaluate(`document.querySelector('.topbar__org')?.textContent === ${JSON.stringify(ORG)}`)
  )
  await waitUntil(pageHas('Aucun plan de passation dans cette région'), 'accueil sans plan')
  const shotHome = await send('Page.captureScreenshot', { format: 'png' })
  writeFileSync(join(outputDir, '2b-accueil.png'), Buffer.from(shotHome.data, 'base64'))

  check('clic « Plan de passation (PPM) »', await clickButton('Plan de passation (PPM)'))
  await waitUntil(pageHas('Aucun plan de passation pour cette région.'), 'liste vide')
  check('interface : liste des plans vide', true)

  check('clic « Créer le plan »', await clickButton('Créer le plan'))
  await waitUntil(pageHas('Ce plan ne contient encore aucune ligne.'), 'détail du nouveau plan')
  check(
    'interface : plan n° 1 créé, sans ligne',
    await evaluate(pageHas('Plan de passation n° 1')),
    (await evaluate('document.querySelector("h3")?.textContent')) ?? ''
  )

  check('clic « Ajouter une ligne »', await clickButton('Ajouter une ligne'))
  await waitUntil(pageHas('Nouvelle ligne du plan'), 'formulaire de ligne')
  await setField('#line-nature', 'SERVICES')
  await setField('#line-object', OBJECT)
  await setField('#line-method', 'DCP')
  await clickButton('Ajouter un service')
  await waitUntil('!!document.querySelector("#service-0")', 'champ service')
  await setField('#service-0', 'SAF')
  await setField('#amount-0', '1 500 000')
  await clickButton('Ajouter un service')
  await waitUntil('!!document.querySelector("#service-1")', 'second service')
  await setField('#service-1', 'SRH')
  await setField('#amount-1', '250000')
  await waitUntil(
    pageHas('Montant total de la ligne : 1 750 000 Ar'),
    'total en direct du formulaire'
  )
  check('interface : total de la ligne calculé en direct (1 750 000 Ar)', true)

  const shotForm = await send('Page.captureScreenshot', {
    format: 'png',
    captureBeyondViewport: true
  })
  writeFileSync(join(outputDir, '3a-formulaire-ligne.png'), Buffer.from(shotForm.data, 'base64'))
  check('clic « Enregistrer la ligne »', await clickButton('Enregistrer la ligne'))
  await waitUntil(pageHas(OBJECT), 'ligne affichée dans le plan')
  check(
    'interface : ligne enregistrée, libellés français et total du plan',
    (await evaluate(pageHas('Services'))) &&
      (await evaluate(pageHas('Consultation de prix (DCP)'))) &&
      (await evaluate(pageHas('Total du plan 1 750 000 Ar')))
  )

  check('clic « Enregistrer une mise à jour »', await clickButton('Enregistrer une mise à jour'))
  await waitUntil(pageHas('(n° 1)'), 'mise à jour enregistrée')
  check('interface : mise à jour n° 1 enregistrée', true)

  const shotPpm = await send('Page.captureScreenshot', { format: 'png' })
  writeFileSync(join(outputDir, '3-plan.png'), Buffer.from(shotPpm.data, 'base64'))

  // Accueil avec un plan, puis page Paramètres
  check('clic « Accueil »', await clickButton('Accueil'))
  await waitUntil(pageHas('Montant total prévu'), 'accueil avec situation')
  check(
    'interface : accueil avec le total prévu (1 750 000 Ar)',
    await evaluate(pageHas('Montant total prévu 1 750 000 Ar'))
  )
  const shotHome2 = await send('Page.captureScreenshot', { format: 'png' })
  writeFileSync(join(outputDir, '3b-accueil-plan.png'), Buffer.from(shotHome2.data, 'base64'))

  check('clic « Paramètres »', await clickButton('Paramètres'))
  await waitUntil(pageHas('Identité de la PRMP'), 'page Paramètres')
  check(
    'interface : Paramètres affiche le nom de la PRMP à corriger',
    await evaluate(`document.querySelector('#organization')?.value === ${JSON.stringify(ORG)}`)
  )
  const shotSettings = await send('Page.captureScreenshot', { format: 'png' })
  writeFileSync(join(outputDir, '3c-parametres.png'), Buffer.from(shotSettings.data, 'base64'))

  // Même parcours côté API (la session de la région 1 est ouverte par l'interface)
  const plans = await evaluate('window.api.listPpms()')
  check(
    'API : un plan, une ligne, 1 750 000 Ar',
    plans.ok &&
      plans.value.length === 1 &&
      plans.value[0].lineCount === 1 &&
      plans.value[0].total === 1750000,
    JSON.stringify(plans.ok ? plans.value[0] : plans.error)
  )
  const planId = plans.value[0].id

  const badNature = await evaluate(
    `window.api.savePpmLine({ppmId:${JSON.stringify(planId)},lineId:null,nature:'AUTRE',object:'x',financing:null,accounts:[],plannedLaunchDate:null,plannedBidOpeningDate:null,plannedAwardDate:null,beneficiaries:[],method:null,procedureLead:null})`
  )
  check(
    'entrée invalide (nature inconnue) rejetée à la frontière',
    !badNature.ok && badNature.error.code === 'INVALID_REQUEST',
    badNature.ok ? '' : badNature.error.code
  )
  const emptyObject = await evaluate(
    `window.api.savePpmLine({ppmId:${JSON.stringify(planId)},lineId:null,nature:'TRAVAUX',object:'   ',financing:null,accounts:[],plannedLaunchDate:null,plannedBidOpeningDate:null,plannedAwardDate:null,beneficiaries:[],method:null,procedureLead:null})`
  )
  check(
    'règle métier : objet vide refusé avec un message en français',
    !emptyObject.ok &&
      emptyObject.error.code === 'REQUIRED_FIELD' &&
      /obligatoire/.test(emptyObject.error.message),
    emptyObject.ok ? '' : emptyObject.error.message
  )
  const unknownLine = await evaluate(
    `window.api.removePpmLine({ppmId:${JSON.stringify(planId)},lineId:'inexistante'})`
  )
  check(
    'ligne inconnue : refus propre (LINE_NOT_FOUND)',
    !unknownLine.ok && unknownLine.error.code === 'LINE_NOT_FOUND',
    unknownLine.ok ? '' : unknownLine.error.code
  )

  // Isolation : la région 2 ne voit rien du plan de la région 1
  const toRegion2 = await evaluate(
    `window.api.openRegion({regionId:${JSON.stringify(r2.value.region.id)},password:${JSON.stringify(P2)}})`
  )
  check('connexion à la région 2', toRegion2.ok, toRegion2.ok ? '' : toRegion2.error.message)
  const plansOf2 = await evaluate('window.api.listPpms()')
  check('région 2 : aucun plan visible', plansOf2.ok && plansOf2.value.length === 0)
  const foreign = await evaluate(`window.api.getPpm({ppmId:${JSON.stringify(planId)}})`)
  check(
    'région 2 : le plan de la région 1 est introuvable même avec son identifiant',
    !foreign.ok && foreign.error.code === 'PPM_NOT_FOUND',
    foreign.ok ? 'VISIBLE !' : foreign.error.code
  )

  // Retour à la région 1 : les données sont toujours là
  const backTo1 = await evaluate(
    `window.api.openRegion({regionId:${JSON.stringify(r1.value.region.id)},password:${JSON.stringify(P1)}})`
  )
  const plansAgain = await evaluate('window.api.listPpms()')
  check(
    'retour à la région 1 : le plan est toujours là',
    backTo1.ok && plansAgain.ok && plansAgain.value.length === 1
  )

  await evaluate('window.api.closeSession()')
  const noRegion = await evaluate('window.api.listPpms()')
  check(
    'sans région ouverte : le plan est inaccessible (NO_ACTIVE_REGION)',
    !noRegion.ok && noRegion.error.code === 'NO_ACTIVE_REGION',
    noRegion.ok ? 'ACCESSIBLE !' : noRegion.error.code
  )

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
  const settings = JSON.parse(readFileSync(join(dataDir, 'settings.json'), 'utf8'))
  check(
    'settings.json contient uniquement le nom de la PRMP (aucun secret)',
    settings.organizationName === ORG &&
      Object.keys(settings).sort().join() === 'organizationName,version',
    JSON.stringify(settings)
  )
  const readableAnywhere = dbFiles.some((f) => {
    const bytes = readFileSync(join(dataDir, f))
    return bytes.includes(OBJECT) || bytes.includes('SAF') || bytes.includes('CREATE TABLE')
  })
  check('aucun texte du plan (objet, service) ni schéma lisible dans les bases', !readableAnywhere)
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
