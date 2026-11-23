import { spawn } from 'node:child_process'
import { existsSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
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
  const clickByText = (prefix) =>
    evaluate(`(() => {
      const b = [...document.querySelectorAll('button')].find((x) => x.textContent.trim().startsWith(${JSON.stringify(prefix)}))
      if (!b || b.disabled) return false
      b.click()
      return true
    })()`)
  const clickByLabel = (label) =>
    evaluate(`(() => {
      const b = document.querySelector('button[aria-label=' + JSON.stringify(${JSON.stringify(label)}) + ']')
      if (!b || b.disabled) return false
      b.click()
      return true
    })()`)
  const REFERENCE = 'DCP-001/2026'
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

  // 2c. Procédures de passation, pilotées par l'INTERFACE réelle
  check('clic « Procédures » (menu)', await clickButton('Procédures'))
  await waitUntil(
    pageHas('Aucune procédure de passation pour cette région.'),
    'liste vide des procédures'
  )
  check('interface : liste des procédures vide', true)
  check('clic « Nouvelle procédure »', await clickButton('Nouvelle procédure'))
  await waitUntil(
    pageHas('Les cinq étapes sont créées automatiquement.'),
    'formulaire de procédure'
  )

  const lineValue = await evaluate(
    "[...document.querySelectorAll('#proc-line option')].map((o) => o.value).find((v) => v !== '') ?? ''"
  )
  check('la ligne du plan est proposée dans la liste de rattachement', lineValue !== '', lineValue)
  await setField('#proc-line', lineValue)
  await waitUntil(
    `document.querySelector('#proc-object')?.value === ${JSON.stringify(OBJECT)}`,
    'préremplissage par la ligne'
  )
  check(
    'interface : choisir la ligne préremplit objet, mode et montant',
    (await evaluate("document.querySelector('#proc-method')?.value")) === 'DCP' &&
      (await evaluate("document.querySelector('#proc-estimate')?.value.replace(/\\s/g, '')")) ===
        '1750000'
  )
  await setField('#proc-reference', REFERENCE)
  check('clic « Créer la procédure »', await clickButton('Créer la procédure'))
  await waitUntil(pageHas('Procédure ' + REFERENCE), 'détail de la procédure')
  check(
    'interface : procédure créée, non démarrée, rattachée à la ligne du plan',
    (await evaluate(pageHas('0 sur 5 — Non démarrée'))) && (await evaluate(pageHas('Plan n° 1')))
  )

  check(
    'interface : on ne peut pas valider la 2e étape avant la 1re (bouton inactif)',
    !(await clickByLabel('Valider l’étape Ouverture des plis'))
  )
  check(
    'interface : valider sans date réelle est refusé avec le motif',
    (await clickByLabel('Valider l’étape Publication de l’avis')) &&
      (await waitUntil(pageHas('Renseignez la date réelle'), 'refus sans date réelle'))
  )

  check(
    'clic « Dates » de la publication',
    await clickByLabel('Modifier les dates de Publication de l’avis')
  )
  await waitUntil('!!document.querySelector("#actual-PUBLICATION")', 'champs de dates')
  await setField('#planned-PUBLICATION', '2026-01-05')
  await setField('#actual-PUBLICATION', '2026-01-07')
  check('clic « Enregistrer les dates »', await clickButton('Enregistrer les dates'))
  await waitUntil(pageHas('07/01/2026'), 'date réelle affichée')
  check(
    'clic « Valider » la publication',
    await clickByLabel('Valider l’étape Publication de l’avis')
  )
  await waitUntil(pageHas('1 sur 5 — En cours'), 'avancement 1 sur 5')
  check(
    'interface : publication validée, avancement 1 sur 5, prochaine étape signalée',
    (await evaluate(pageHas('Validée le'))) &&
      (await evaluate(pageHas('Prochaine étape à valider')))
  )

  check(
    'clic « Rouvrir » la publication',
    await clickByLabel('Rouvrir l’étape Publication de l’avis')
  )
  await waitUntil(pageHas('0 sur 5 — Non démarrée'), 'réouverture')
  check('interface : la réouverture remet l’avancement à 0 sur 5', true)
  check('clic « Valider » à nouveau', await clickByLabel('Valider l’étape Publication de l’avis'))
  await waitUntil(pageHas('1 sur 5 — En cours'), 'revalidation')
  const shotProc = await send('Page.captureScreenshot', { format: 'png' })
  writeFileSync(join(outputDir, '4-procedure.png'), Buffer.from(shotProc.data, 'base64'))

  check('clic « Retour à la liste »', await clickButton('Retour à la liste'))
  await waitUntil(pageHas('1 sur 5 — En cours'), 'liste avec la procédure')
  const shotProcList = await send('Page.captureScreenshot', { format: 'png' })
  writeFileSync(join(outputDir, '4a-procedures.png'), Buffer.from(shotProcList.data, 'base64'))

  // 2d. Candidats et offres, pilotés par l'INTERFACE réelle
  check('clic « Candidats » (menu)', await clickButton('Candidats'))
  await waitUntil(
    pageHas('Aucun candidat enregistré pour cette région.'),
    'liste vide des candidats'
  )
  check('interface : liste des candidats vide', true)

  const createCandidateViaUi = async (name, nif) => {
    await clickButton('Nouveau candidat')
    await waitUntil(pageHas('Seul le nom est obligatoire'), 'formulaire de candidat')
    await setField('#cand-name', name)
    await setField('#cand-nif', nif)
    await clickButton('Créer le candidat')
  }
  await createCandidateViaUi('SARL Alpha', '1234567890')
  await waitUntil(pageHas('SARL Alpha'), 'candidat Alpha dans la liste')
  await createCandidateViaUi('Beta Construction', '555')
  await waitUntil(pageHas('Beta Construction'), 'candidat Beta dans la liste')
  check(
    'interface : deux candidats créés (affichés par ordre alphabétique)',
    (await evaluate(
      "[...document.querySelectorAll('tbody tr td:first-child strong')].map((e) => e.textContent).join('|')"
    )) === 'Beta Construction|SARL Alpha'
  )
  const shotCandidates = await send('Page.captureScreenshot', { format: 'png' })
  writeFileSync(join(outputDir, '5-candidats.png'), Buffer.from(shotCandidates.data, 'base64'))

  await clickButton('Nouveau candidat')
  await waitUntil(pageHas('Seul le nom est obligatoire'), 'formulaire (doublon)')
  await setField('#cand-name', 'Autre société')
  await setField('#cand-nif', '12 34 567 890')
  await clickButton('Créer le candidat')
  await waitUntil(pageHas('déjà enregistré avec le NIF'), 'refus du NIF en double')
  check('interface : un NIF déjà utilisé est refusé (espaces ignorés)', true)
  await clickButton('Annuler')
  await waitUntil(pageHas('Candidats'), 'retour à la liste des candidats')

  // Offres dans la procédure
  check('clic « Procédures » (menu)', await clickButton('Procédures'))
  await waitUntil(pageHas('1 sur 5 — En cours'), 'liste avec la procédure')
  check('ouverture de la procédure', await clickByLabel('Ouvrir la procédure ' + REFERENCE))
  await waitUntil(pageHas('Offres reçues'), 'panneau des offres')
  const optionValue = (label) =>
    evaluate(
      `[...document.querySelectorAll('#bid-candidate option')].find((o) => o.textContent === ${JSON.stringify(label)})?.value ?? ''`
    )
  const addBidViaUi = async (candidateLabel, amountText) => {
    await waitUntil(
      `!!document.querySelector('#bid-candidate option[value]:not([value=""])')`,
      'candidats proposés'
    )
    await setField('#bid-candidate', await optionValue(candidateLabel))
    await setField('#bid-amount', amountText)
    return clickButton('Ajouter l’offre')
  }
  check('ajout de l’offre de SARL Alpha (900 000 Ar)', await addBidViaUi('SARL Alpha', '900 000'))
  await waitUntil(pageHas('900 000 Ar'), 'offre Alpha affichée')
  check(
    'ajout de l’offre de Beta Construction (800 000 Ar)',
    await addBidViaUi('Beta Construction', '800000')
  )
  await waitUntil(pageHas('800 000 Ar'), 'offre Beta affichée')
  check(
    'interface : deux offres affichées, aucun candidat restant à proposer',
    await evaluate(pageHas('Tous les candidats enregistrés ont déjà déposé une offre'))
  )

  // Amener la procédure jusqu'à l'attribution (la publication est déjà validée)
  const validateStepViaUi = async (kind, label, date) => {
    await clickByLabel(`Modifier les dates de ${label}`)
    await waitUntil(`!!document.querySelector("#actual-${kind}")`, `champs de dates (${label})`)
    await setField(`#actual-${kind}`, date)
    await clickButton('Enregistrer les dates')
    await waitUntil(pageHas(date.split('-').reverse().join('/')), `date réelle (${label})`)
    return clickByLabel(`Valider l’étape ${label}`)
  }
  check(
    'validation de l’ouverture des plis',
    await validateStepViaUi('OUVERTURE_PLIS', 'Ouverture des plis', '2026-01-10')
  )
  await waitUntil(pageHas('2 sur 5 — En cours'), '2 sur 5')
  check(
    'validation de l’évaluation',
    await validateStepViaUi('EVALUATION', 'Évaluation des offres', '2026-01-15')
  )
  await waitUntil(pageHas('3 sur 5 — En cours'), '3 sur 5')

  await clickByLabel('Modifier les dates de Attribution')
  await waitUntil(
    '!!document.querySelector("#actual-ATTRIBUTION")',
    'champs de dates (attribution)'
  )
  await setField('#actual-ATTRIBUTION', '2026-01-20')
  await clickButton('Enregistrer les dates')
  await waitUntil(pageHas('20/01/2026'), 'date réelle de l’attribution')
  check(
    'clic « Valider » l’attribution sans offre retenue',
    await clickByLabel('Valider l’étape Attribution')
  )
  await waitUntil(pageHas('Désignez l’offre retenue'), 'refus sans offre retenue')
  check('interface : valider l’attribution sans offre retenue est refusé avec le motif', true)

  check(
    'clic « Retenir » l’offre de Beta Construction',
    await clickByLabel('Retenir l’offre de Beta Construction')
  )
  await waitUntil(pageHas('Offre retenue'), 'offre retenue')
  check('clic « Valider » l’attribution', await clickByLabel('Valider l’étape Attribution'))
  await waitUntil(pageHas('4 sur 5 — En cours'), '4 sur 5')
  await waitUntil(pageHas('les offres ne peuvent plus être modifiées'), 'verrou des offres')
  check(
    'interface : attribution validée, offres verrouillées (retrait impossible)',
    !(await clickByLabel('Retirer l’offre de SARL Alpha'))
  )
  const shotBids = await send('Page.captureScreenshot', {
    format: 'png',
    captureBeyondViewport: true
  })
  writeFileSync(join(outputDir, '5a-offres.png'), Buffer.from(shotBids.data, 'base64'))

  check('clic « Rouvrir » l’attribution', await clickByLabel('Rouvrir l’étape Attribution'))
  await waitUntil(pageHas('3 sur 5 — En cours'), 'attribution rouverte')
  check(
    'interface : la réouverture libère les offres',
    await evaluate("!document.body.innerText.includes('les offres ne peuvent plus être modifiées')")
  )
  check(
    'clic « Valider » l’attribution à nouveau',
    await clickByLabel('Valider l’étape Attribution')
  )
  await waitUntil(pageHas('4 sur 5 — En cours'), 'attribution revalidée')

  check('clic « Retour à la liste »', await clickButton('Retour à la liste'))
  await waitUntil(pageHas('Beta Construction'), 'attributaire dans la liste des procédures')
  check(
    'interface : la liste des procédures indique l’attributaire',
    await evaluate(
      "[...document.querySelectorAll('tbody tr')].some((r) => r.innerText.includes('Beta Construction') && r.innerText.includes('4 sur 5'))"
    )
  )

  // 2e. Contrats et exécution, pilotés par l'INTERFACE réelle
  check('clic « Procédures » (menu)', await clickButton('Procédures'))
  await waitUntil(pageHas('Beta Construction'), 'liste des procédures')
  check(
    'ouverture de la procédure attribuée',
    await clickByLabel('Ouvrir la procédure ' + REFERENCE)
  )
  await waitUntil(
    pageHas('le marché peut être créé pour l’attributaire'),
    'invitation à créer le marché'
  )
  check(
    'interface : la procédure attribuée propose de créer le marché de l’attributaire',
    await evaluate(pageHas('le marché peut être créé pour l’attributaire (Beta Construction)'))
  )
  check('clic « Créer le marché »', await clickButton('Créer le marché'))
  await waitUntil(pageHas('Nouveau contrat'), 'formulaire de contrat')
  await waitUntil(
    `document.querySelector('#ct-object')?.value === ${JSON.stringify(OBJECT)}`,
    'préremplissage du marché par la procédure'
  )
  check(
    'interface : la procédure préremplit objet et montant de l’offre retenue (800 000 Ar)',
    (await evaluate("document.querySelector('#ct-amount')?.value.replace(/\\s/g, '')")) === '800000'
  )
  await setField('#ct-reference', 'M-001/2026')
  await setField('#ct-signed', '2026-02-01')
  check('clic « Créer le contrat »', await clickButton('Créer le contrat'))
  await waitUntil(pageHas('Contrat M-001/2026'), 'détail du contrat')
  check(
    'interface : marché créé pour l’attributaire, non démarré',
    (await evaluate(pageHas('Titulaire Beta Construction'))) &&
      (await evaluate(pageHas('Situation Non démarré'))) &&
      (await evaluate(pageHas('Procédure ' + REFERENCE)))
  )

  const allowedOptions = () =>
    evaluate(
      "[...document.querySelectorAll('#ev-kind option')].map((o) => o.textContent).join('|')"
    )
  check(
    'interface : au départ, seuls le démarrage et l’avenant sont proposés',
    (await allowedOptions()) === 'Ordre de service de démarrage|Avenant',
    await allowedOptions()
  )
  const addEventViaUi = async (kindCode, date, delta = '') => {
    await waitUntil('!!document.querySelector("#ev-kind")', 'formulaire d’événement')
    await setField('#ev-kind', kindCode)
    await setField('#ev-date', date)
    if (delta !== '') {
      await waitUntil('!!document.querySelector("#ev-delta")', 'champ de variation')
      await setField('#ev-delta', delta)
    }
    return clickButton('Enregistrer l’événement')
  }
  check('démarrage du contrat', await addEventViaUi('ORDRE_SERVICE_DEMARRAGE', '2026-02-15'))
  await waitUntil(pageHas('Situation En cours d’exécution'), 'contrat en cours')
  check('avenant de +150 000 Ar', await addEventViaUi('AVENANT', '2026-03-01', '150 000'))
  await waitUntil(pageHas('Montant actuel 950 000 Ar'), 'montant actuel avec avenant')
  check(
    'interface : l’avenant porte le montant actuel à 950 000 Ar, le montant initial reste 800 000 Ar',
    await evaluate(pageHas('Montant initial 800 000 Ar'))
  )

  check(
    'un événement antérieur à la signature est tenté',
    await addEventViaUi('ORDRE_SERVICE_ARRET', '2026-01-01')
  )
  await waitUntil(pageHas('précéder la date de signature'), 'refus daté avant la signature')
  check('interface : une date antérieure à la signature est refusée avec le motif', true)

  check('réception provisoire', await addEventViaUi('RECEPTION_PROVISOIRE', '2026-04-01'))
  await waitUntil(pageHas('Situation Reçu provisoirement'), 'réception provisoire')
  check(
    'interface : après la réception provisoire, seule la réception définitive est proposée (plus d’avenant)',
    (await allowedOptions()) === 'Réception définitive',
    await allowedOptions()
  )
  check('réception définitive', await addEventViaUi('RECEPTION_DEFINITIVE', '2026-10-01'))
  await waitUntil(pageHas('Situation Reçu définitivement'), 'réception définitive')
  check('clôture du contrat', await addEventViaUi('CLOTURE', '2026-10-10'))
  await waitUntil(pageHas('Le contrat est clôturé'), 'contrat clôturé')
  check(
    'interface : contrat clôturé, plus aucun événement possible',
    (await evaluate(pageHas('Situation Clôturé'))) &&
      !(await evaluate("!!document.querySelector('#ev-kind')"))
  )
  const shotContract = await send('Page.captureScreenshot', {
    format: 'png',
    captureBeyondViewport: true
  })
  writeFileSync(join(outputDir, '6-contrat.png'), Buffer.from(shotContract.data, 'base64'))

  check(
    'annulation du dernier événement (clôture)',
    await clickButton('Annuler le dernier événement')
  )
  await waitUntil(pageHas('Confirmer l’annulation'), 'confirmation d’annulation')
  check('confirmation', await clickByText('Confirmer l’annulation'))
  await waitUntil(pageHas('Situation Reçu définitivement'), 'contrat rouvert')
  check('interface : l’annulation de la clôture rouvre le contrat', true)
  check('clôture à nouveau', await addEventViaUi('CLOTURE', '2026-10-10'))
  await waitUntil(pageHas('Le contrat est clôturé'), 'contrat reclôturé')

  check('clic « Retour à la liste »', await clickButton('Retour à la liste'))
  await waitUntil(pageHas('M-001/2026'), 'contrat dans la liste')
  check(
    'interface : la liste des contrats indique type, titulaire, montant actuel et situation',
    await evaluate(
      "[...document.querySelectorAll('tbody tr')].some((r) => { const t = r.innerText.replace(/\\s/g, ' '); return t.includes('M-001/2026') && t.includes('Marché') && t.includes('Beta Construction') && t.includes('950 000 Ar') && t.includes('Clôturé') })"
    )
  )
  const shotContracts = await send('Page.captureScreenshot', { format: 'png' })
  writeFileSync(join(outputDir, '6a-contrats.png'), Buffer.from(shotContracts.data, 'base64'))

  // Depuis la procédure, on retrouve son marché
  check('clic « Procédures » (menu)', await clickButton('Procédures'))
  await waitUntil(pageHas('Beta Construction'), 'liste des procédures')
  await clickByLabel('Ouvrir la procédure ' + REFERENCE)
  await waitUntil(pageHas('Ouvrir le marché'), 'lien vers le marché')
  check(
    'interface : la procédure renvoie vers son marché',
    await evaluate(pageHas('a donné lieu au marché M-001/2026'))
  )
  check('clic « Ouvrir le marché »', await clickButton('Ouvrir le marché'))
  await waitUntil(pageHas('Contrat M-001/2026'), 'marché ouvert depuis la procédure')
  check('interface : le marché s’ouvre depuis la page de la procédure', true)

  // 2f. Documents joints, pilotés par l'INTERFACE réelle (sélecteur de fichier piloté par DevTools)
  const DOC_NAME = 'PV e2e secret.pdf'
  const DOC_MARKER = 'CONFIDENTIEL-E2E-12345678'
  const regionFilesDir = join(dataDir, 'regions', `${r1.value.region.id}.files`)
  const filesOnDisk = () => (existsSync(regionFilesDir) ? readdirSync(regionFilesDir) : [])
  const goodPdf = join(outputDir, DOC_NAME)
  writeFileSync(goodPdf, `%PDF-1.7\n${DOC_MARKER}\n`)
  const fakePdf = join(outputDir, 'faux.pdf')
  writeFileSync(fakePdf, Buffer.from([0x4d, 0x5a, 0x90, 0x00, 0x03, 0x00, 0x00, 0x00]))
  const badType = join(outputDir, 'script.exe')
  writeFileSync(badType, 'MZ programme')

  const attachFile = async (path) => {
    const { root } = await send('DOM.getDocument', { depth: -1 })
    const { nodeId } = await send('DOM.querySelector', {
      nodeId: root.nodeId,
      selector: '#attachment-file-CONTRACT'
    })
    await send('DOM.setFileInputFiles', { files: [path], nodeId })
  }
  const submitAttachment = async () => {
    await waitUntil(
      "[...document.querySelectorAll('button')].some((b) => b.textContent.trim() === 'Joindre le document' && !b.disabled)",
      'bouton « Joindre le document » actif'
    )
    return clickButton('Joindre le document')
  }

  await waitUntil(pageHas('Aucun document joint.'), 'panneau des documents du contrat')
  check('interface : le contrat n’a encore aucun document joint', true)
  await attachFile(goodPdf)
  await setField('#attachment-note-CONTRACT', 'Contrat signé en deux exemplaires')
  check('clic « Joindre le document »', await submitAttachment())
  await waitUntil(pageHas(DOC_NAME), 'document affiché')
  check(
    'interface : document joint, avec son type, sa note et sa taille',
    (await evaluate(pageHas('Contrat signé en deux exemplaires'))) &&
      (await evaluate(pageHas('PDF')))
  )

  check(
    'disque : un seul fichier chiffré, nommé par un identifiant (pas par le nom d’origine)',
    filesOnDisk().length === 1 &&
      !filesOnDisk()[0].includes('PV') &&
      /^[0-9a-f-]{36}$/.test(filesOnDisk()[0]),
    filesOnDisk().join(',')
  )
  const encryptedBytes = readFileSync(join(regionFilesDir, filesOnDisk()[0]))
  check(
    'disque : le contenu du document n’est pas lisible',
    !encryptedBytes.includes(DOC_MARKER) && !encryptedBytes.includes('%PDF')
  )

  await attachFile(fakePdf)
  check('tentative : exécutable renommé en .pdf', await submitAttachment())
  await waitUntil(pageHas('ne correspond pas à son type'), 'refus du faux PDF')
  check('interface : un exécutable renommé en .pdf est refusé avec le motif', true)
  await attachFile(badType)
  check('tentative : fichier .exe', await submitAttachment())
  await waitUntil(pageHas('n’est pas accepté'), 'refus du type de fichier')
  check('interface : un type de fichier non accepté est refusé avec le motif', true)
  check('disque : les fichiers refusés n’ont rien laissé', filesOnDisk().length === 1)

  const shotDocs = await send('Page.captureScreenshot', {
    format: 'png',
    captureBeyondViewport: true
  })
  writeFileSync(join(outputDir, '7-documents.png'), Buffer.from(shotDocs.data, 'base64'))

  check('clic « Retirer » le document', await clickByLabel('Retirer le document ' + DOC_NAME))
  check('confirmation du retrait', await clickByText('Confirmer le retrait'))
  await waitUntil(pageHas('Aucun document joint.'), 'document retiré')
  check('disque : retirer le document efface son fichier', filesOnDisk().length === 0)

  await attachFile(goodPdf)
  await setField('#attachment-note-CONTRACT', 'Contrat signé en deux exemplaires')
  check('document joint à nouveau', await submitAttachment())
  await waitUntil(pageHas(DOC_NAME), 'document rejoint')

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

  const procs = await evaluate('window.api.listProcedures()')
  check(
    'API : une procédure, 4 étapes validées sur 5, attribuée à Beta Construction',
    procs.ok &&
      procs.value.length === 1 &&
      procs.value[0].validatedCount === 4 &&
      procs.value[0].awardedCandidate === 'Beta Construction' &&
      procs.value[0].reference === REFERENCE,
    JSON.stringify(procs.ok ? procs.value[0] : procs.error)
  )
  const procId = procs.value[0].id
  const dupRef = await evaluate(
    `window.api.createProcedure({reference:${JSON.stringify('  dcp-001/2026 ')},object:'x',method:'DAO',ppmLineId:null,estimatedAmount:null})`
  )
  check(
    'référence déjà utilisée refusée (majuscules et espaces ignorés)',
    !dupRef.ok && dupRef.error.code === 'DUPLICATE_REFERENCE',
    dupRef.ok ? 'ACCEPTÉE !' : dupRef.error.code
  )
  // Procédure neuve et jetable : valider l'évaluation avant l'ouverture des plis doit être refusé.
  const scratch = await evaluate(
    `window.api.createProcedure({reference:'AOR-TEMP/2026',object:'Procédure jetable',method:'AOR',ppmLineId:null,estimatedAmount:null})`
  )
  const outOfOrder = await evaluate(
    `window.api.validateStep({procedureId:${JSON.stringify(scratch.value.id)},step:'EVALUATION'})`
  )
  check(
    'API : valider une étape avant la précédente est refusé',
    !outOfOrder.ok && outOfOrder.error.code === 'PREVIOUS_STEP_NOT_VALIDATED',
    outOfOrder.ok ? 'ACCEPTÉE !' : outOfOrder.error.code
  )
  const outOfOrderAward = await evaluate(
    `window.api.setAward({procedureId:${JSON.stringify(scratch.value.id)},bidId:'inexistante'})`
  )
  check(
    'API : désigner une offre inexistante est refusé',
    !outOfOrderAward.ok && outOfOrderAward.error.code === 'BID_NOT_FOUND',
    outOfOrderAward.ok ? 'ACCEPTÉE !' : outOfOrderAward.error.code
  )
  await evaluate(`window.api.deleteProcedure({procedureId:${JSON.stringify(scratch.value.id)}})`)
  const alreadyValidated = await evaluate(
    `window.api.validateStep({procedureId:${JSON.stringify(procId)},step:'EVALUATION'})`
  )
  check(
    'API : valider une étape déjà validée est refusé',
    !alreadyValidated.ok && alreadyValidated.error.code === 'STEP_ALREADY_VALIDATED',
    alreadyValidated.ok ? 'ACCEPTÉE !' : alreadyValidated.error.code
  )
  const badStep = await evaluate(
    `window.api.validateStep({procedureId:${JSON.stringify(procId)},step:'AUTRE'})`
  )
  check(
    'API : étape inconnue rejetée à la frontière',
    !badStep.ok && badStep.error.code === 'INVALID_REQUEST'
  )
  const lineInUse = await evaluate(
    `window.api.removePpmLine({ppmId:${JSON.stringify(planId)},lineId:${JSON.stringify(lineValue)}})`
  )
  check(
    'la ligne du plan rattachée à la procédure ne peut plus être supprimée',
    !lineInUse.ok && lineInUse.error.code === 'PPM_LINE_IN_USE',
    lineInUse.ok ? 'SUPPRIMÉE !' : lineInUse.error.code
  )

  const cands = await evaluate('window.api.listCandidates()')
  check(
    'API : deux candidats, chacun avec une offre',
    cands.ok && cands.value.length === 2 && cands.value.every((c) => c.bidCount === 1),
    JSON.stringify(cands.ok ? cands.value.map((c) => [c.name, c.bidCount]) : cands.error)
  )
  const alphaId = cands.value.find((c) => c.name === 'SARL Alpha').id
  const delUsed = await evaluate(
    `window.api.deleteCandidate({candidateId:${JSON.stringify(alphaId)}})`
  )
  check(
    'un candidat qui a déposé une offre ne peut pas être supprimé',
    !delUsed.ok && delUsed.error.code === 'CANDIDATE_IN_USE',
    delUsed.ok ? 'SUPPRIMÉ !' : delUsed.error.code
  )
  const badBid = await evaluate(
    `window.api.addBid({procedureId:${JSON.stringify(procId)},candidateId:${JSON.stringify(alphaId)},amount:-5})`
  )
  check(
    'API : un montant négatif est rejeté à la frontière',
    !badBid.ok && badBid.error.code === 'INVALID_REQUEST'
  )
  const dupBid = await evaluate(
    `window.api.addBid({procedureId:${JSON.stringify(procId)},candidateId:${JSON.stringify(alphaId)},amount:100})`
  )
  check(
    'API : les offres sont verrouillées une fois l’attribution validée',
    !dupBid.ok && dupBid.error.code === 'BIDS_LOCKED',
    dupBid.ok ? 'ACCEPTÉE !' : dupBid.error.code
  )

  const contracts = await evaluate('window.api.listContracts()')
  check(
    'API : un contrat, clôturé, montant actuel 950 000 Ar',
    contracts.ok &&
      contracts.value.length === 1 &&
      contracts.value[0].status === 'CLOSED' &&
      contracts.value[0].currentAmount === 950000,
    JSON.stringify(contracts.ok ? contracts.value[0] : contracts.error)
  )
  const contractId = contracts.value[0].id
  const betaId = cands.value.find((c) => c.name === 'Beta Construction').id
  const secondContract = await evaluate(
    `window.api.createContract({kind:'MARCHE',procedureId:${JSON.stringify(procId)},reference:'M-002/2026',object:'Doublon',holderId:${JSON.stringify(betaId)},ppmLineId:null,amount:1,signedOn:null})`
  )
  check(
    'API : un second marché pour la même procédure est refusé',
    !secondContract.ok && secondContract.error.code === 'PROCEDURE_ALREADY_CONTRACTED',
    secondContract.ok ? 'ACCEPTÉ !' : secondContract.error.code
  )
  const closedEvent = await evaluate(
    `window.api.addContractEvent({contractId:${JSON.stringify(contractId)},kind:'AVENANT',occurredOn:'2026-11-01',amountDelta:1,note:null})`
  )
  check(
    'API : aucun événement après la clôture',
    !closedEvent.ok && closedEvent.error.code === 'CONTRACT_CLOSED',
    closedEvent.ok ? 'ACCEPTÉ !' : closedEvent.error.code
  )
  const badKind = await evaluate(
    `window.api.addContractEvent({contractId:${JSON.stringify(contractId)},kind:'AUTRE',occurredOn:'2026-11-01',amountDelta:null,note:null})`
  )
  check(
    'API : un événement inconnu est rejeté à la frontière',
    !badKind.ok && badKind.error.code === 'INVALID_REQUEST'
  )
  const delContract = await evaluate(
    `window.api.deleteContract({contractId:${JSON.stringify(contractId)}})`
  )
  check(
    'API : un contrat qui a des événements ne peut pas être supprimé',
    !delContract.ok && delContract.error.code === 'CONTRACT_HAS_EVENTS',
    delContract.ok ? 'SUPPRIMÉ !' : delContract.error.code
  )
  const delProc = await evaluate(
    `window.api.deleteProcedure({procedureId:${JSON.stringify(procId)}})`
  )
  check(
    'API : une procédure qui a un marché ne peut pas être supprimée',
    !delProc.ok && delProc.error.code === 'PROCEDURE_IN_USE',
    delProc.ok ? 'SUPPRIMÉE !' : delProc.error.code
  )
  const delHolder = await evaluate(
    `window.api.deleteCandidate({candidateId:${JSON.stringify(betaId)}})`
  )
  check(
    'API : le titulaire d’un contrat ne peut pas être supprimé',
    !delHolder.ok && delHolder.error.code === 'CANDIDATE_IN_USE',
    delHolder.ok ? 'SUPPRIMÉ !' : delHolder.error.code
  )

  const docs = await evaluate(
    `window.api.listAttachments({ownerKind:'CONTRACT',ownerId:${JSON.stringify(contractId)}})`
  )
  check(
    'API : un document joint au contrat',
    docs.ok &&
      docs.value.length === 1 &&
      docs.value[0].name === DOC_NAME &&
      docs.value[0].mimeType === 'application/pdf',
    JSON.stringify(docs.ok ? docs.value : docs.error)
  )
  const hugeFile = await evaluate(
    `window.api.addAttachment({ownerKind:'CONTRACT',ownerId:${JSON.stringify(contractId)},fileName:'enorme.pdf',bytes:new Uint8Array(21*1024*1024),note:null})`
  )
  check(
    'API : un fichier de plus de 20 Mo est rejeté à la frontière',
    !hugeFile.ok && hugeFile.error.code === 'INVALID_REQUEST',
    hugeFile.ok ? 'ACCEPTÉ !' : hugeFile.error.code
  )
  const unknownOwner = await evaluate(
    `window.api.addAttachment({ownerKind:'CONTRACT',ownerId:'inexistant',fileName:'a.pdf',bytes:new Uint8Array([0x25,0x50,0x44,0x46,0x2d]),note:null})`
  )
  check(
    'API : on ne peut pas joindre un document à un objet inexistant',
    !unknownOwner.ok && unknownOwner.error.code === 'OWNER_NOT_FOUND',
    unknownOwner.ok ? 'ACCEPTÉ !' : unknownOwner.error.code
  )
  const badOwnerKind = await evaluate(`window.api.listAttachments({ownerKind:'PPM',ownerId:'x'})`)
  check(
    'API : un type d’objet inconnu est rejeté à la frontière',
    !badOwnerKind.ok && badOwnerKind.error.code === 'INVALID_REQUEST'
  )

  // Isolation : la région 2 ne voit rien du plan de la région 1
  const toRegion2 = await evaluate(
    `window.api.openRegion({regionId:${JSON.stringify(r2.value.region.id)},password:${JSON.stringify(P2)}})`
  )
  check('connexion à la région 2', toRegion2.ok, toRegion2.ok ? '' : toRegion2.error.message)
  const plansOf2 = await evaluate('window.api.listPpms()')
  check('région 2 : aucun plan visible', plansOf2.ok && plansOf2.value.length === 0)
  const procsOf2 = await evaluate('window.api.listProcedures()')
  check('région 2 : aucune procédure visible', procsOf2.ok && procsOf2.value.length === 0)
  const candsOf2 = await evaluate('window.api.listCandidates()')
  check('région 2 : aucun candidat visible', candsOf2.ok && candsOf2.value.length === 0)
  const contractsOf2 = await evaluate('window.api.listContracts()')
  check('région 2 : aucun contrat visible', contractsOf2.ok && contractsOf2.value.length === 0)
  const docsOf2 = await evaluate(
    `window.api.listAttachments({ownerKind:'CONTRACT',ownerId:${JSON.stringify(contractId)}})`
  )
  check(
    'région 2 : les documents de la région 1 sont inaccessibles',
    !docsOf2.ok && docsOf2.error.code === 'OWNER_NOT_FOUND',
    docsOf2.ok ? 'VISIBLES !' : docsOf2.error.code
  )
  const foreignContract = await evaluate(
    `window.api.getContract({contractId:${JSON.stringify(contractId)}})`
  )
  check(
    'région 2 : le contrat de la région 1 est introuvable même avec son identifiant',
    !foreignContract.ok && foreignContract.error.code === 'CONTRACT_NOT_FOUND',
    foreignContract.ok ? 'VISIBLE !' : foreignContract.error.code
  )
  const foreignProc = await evaluate(
    `window.api.getProcedure({procedureId:${JSON.stringify(procId)}})`
  )
  check(
    'région 2 : la procédure de la région 1 est introuvable même avec son identifiant',
    !foreignProc.ok && foreignProc.error.code === 'PROCEDURE_NOT_FOUND',
    foreignProc.ok ? 'VISIBLE !' : foreignProc.error.code
  )
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
  const procsAgain = await evaluate('window.api.listProcedures()')
  const contractsAgain = await evaluate('window.api.listContracts()')
  const plansAgain = await evaluate('window.api.listPpms()')
  check(
    'retour à la région 1 : le plan est toujours là',
    backTo1.ok && plansAgain.ok && plansAgain.value.length === 1
  )
  check(
    'retour à la région 1 : le contrat clôturé est toujours là',
    contractsAgain.ok &&
      contractsAgain.value.length === 1 &&
      contractsAgain.value[0].status === 'CLOSED'
  )
  check(
    'retour à la région 1 : la procédure et son avancement sont toujours là',
    procsAgain.ok && procsAgain.value.length === 1 && procsAgain.value[0].validatedCount === 4
  )

  // 2g. Alertes d'échéances. La région 1 est ouverte par l'API : on recharge la page, l'application retrouve la session.
  const addDaysIso = (iso, days) => {
    const [y, m, d] = iso.split('-').map(Number)
    return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10)
  }
  const base = await evaluate('window.api.listAlerts()')
  check(
    'API : aucune alerte tant qu’aucune date n’est prévue',
    base.ok && base.value.items.length === 0 && base.value.horizonDays === 15,
    JSON.stringify(base.ok ? base.value : base.error)
  )
  const TODAY = base.value.today
  const api = (call) => evaluate(`window.api.${call}`)

  const alertProc = await api(
    `createProcedure({reference:'AOR-ALERTE/2026',object:'Procédure avec échéances',method:'AOR',ppmLineId:null,estimatedAmount:null})`
  )
  const planStep = (procedureId, step, plannedDate) =>
    api(
      `saveStepDates({procedureId:${JSON.stringify(procedureId)},step:'${step}',plannedDate:${JSON.stringify(plannedDate)},actualDate:null})`
    )
  await planStep(alertProc.value.id, 'OUVERTURE_PLIS', addDaysIso(TODAY, -6)) // en retard de 6 jours
  await planStep(alertProc.value.id, 'EVALUATION', addDaysIso(TODAY, 4)) // dans 4 jours
  await planStep(alertProc.value.id, 'PUBLICATION', addDaysIso(TODAY, 40)) // au-delà du délai de 15 jours
  const lateLine = await api(
    `savePpmLine({ppmId:${JSON.stringify(planId)},lineId:null,nature:'FOURNITURES',object:'Ligne à lancer',financing:null,accounts:[],plannedLaunchDate:${JSON.stringify(addDaysIso(TODAY, -2))},plannedBidOpeningDate:null,plannedAwardDate:null,beneficiaries:[{service:'SAF',amount:1000}],method:'DAO',procedureLead:null})`
  )
  // Un marché signé il y a 40 jours et jamais démarré : échéance de démarrage dépassée de 10 jours.
  const gamma = await api(
    `createCandidate({name:'Gamma Services',nif:'G-777',stat:null,address:null,phone:null,email:null})`
  )
  const lateProc = await api(
    `createProcedure({reference:'DAO-ALERTE/2026',object:'Travaux',method:'DAO',ppmLineId:null,estimatedAmount:null})`
  )
  const lateBid = await api(
    `addBid({procedureId:${JSON.stringify(lateProc.value.id)},candidateId:${JSON.stringify(gamma.value.id)},amount:700000})`
  )
  await api(
    `setAward({procedureId:${JSON.stringify(lateProc.value.id)},bidId:${JSON.stringify(lateBid.value.bids[0].id)}})`
  )
  for (const [index, step] of [
    'PUBLICATION',
    'OUVERTURE_PLIS',
    'EVALUATION',
    'ATTRIBUTION'
  ].entries()) {
    await api(
      `saveStepDates({procedureId:${JSON.stringify(lateProc.value.id)},step:'${step}',plannedDate:null,actualDate:${JSON.stringify(addDaysIso(TODAY, -80 + index))}})`
    )
    await api(`validateStep({procedureId:${JSON.stringify(lateProc.value.id)},step:'${step}'})`)
  }
  const lateContract = await api(
    `createContract({kind:'MARCHE',procedureId:${JSON.stringify(lateProc.value.id)},reference:'M-ALERTE/2026',object:'Travaux',holderId:${JSON.stringify(gamma.value.id)},ppmLineId:null,amount:700000,signedOn:${JSON.stringify(addDaysIso(TODAY, -40))}})`
  )
  check(
    'API : données d’essai des alertes créées',
    [alertProc, lateLine, gamma, lateProc, lateBid, lateContract].every((r) => r.ok),
    JSON.stringify([alertProc, lateLine, gamma, lateProc, lateBid, lateContract].find((r) => !r.ok))
  )

  const alertsApi = await evaluate('window.api.listAlerts()')
  check(
    'API : 3 échéances dépassées et 1 à venir, les retards les plus anciens en tête',
    alertsApi.ok &&
      alertsApi.value.overdueCount === 3 &&
      alertsApi.value.upcomingCount === 1 &&
      alertsApi.value.items.map((a) => `${a.kind}:${a.daysLeft}`).join('|') ===
        'CONTRACT_NOT_STARTED:-10|PROCEDURE_STEP:-6|PPM_LINE_LAUNCH:-2|PROCEDURE_STEP:4',
    JSON.stringify(
      alertsApi.ok ? alertsApi.value.items.map((a) => `${a.kind}:${a.daysLeft}`) : alertsApi.error
    )
  )
  const badHorizon = await evaluate('window.api.saveAlertHorizon({days:10})')
  check(
    'API : un délai d’alerte hors des choix proposés est rejeté à la frontière',
    !badHorizon.ok && badHorizon.error.code === 'INVALID_REQUEST',
    badHorizon.ok ? 'ACCEPTÉ !' : badHorizon.error.code
  )

  await send('Page.reload')
  await waitUntil(
    "!!document.querySelector('.nav-item__count--overdue')",
    'pastille des alertes dans le menu'
  )
  check(
    'interface : l’entrée « Alertes » du menu affiche 4 échéances, en rouge (retards)',
    await evaluate(
      "document.querySelector('.nav-item__count--overdue').innerText.trim().startsWith('4')"
    )
  )
  check(
    'interface : la page d’accueil résume les échéances',
    (await evaluate(pageHas('3 échéance(s) dépassée(s)'))) &&
      (await evaluate(pageHas('1 à venir dans les 15 prochains jours')))
  )
  const shotHomeAlerts = await send('Page.captureScreenshot', { format: 'png' })
  writeFileSync(
    join(outputDir, '8a-accueil-alertes.png'),
    Buffer.from(shotHomeAlerts.data, 'base64')
  )
  check('clic « Voir les alertes »', await clickButton('Voir les alertes'))
  await waitUntil(pageHas('Alertes d’échéances'), 'page des alertes')
  await waitUntil(pageHas('En retard (3)'), 'groupe des retards')
  check(
    'interface : groupes « En retard (3) » et « À venir (1) », avec les échéances décrites',
    (await evaluate(pageHas('À venir (1)'))) &&
      (await evaluate(pageHas('En retard de 10 jours'))) &&
      (await evaluate(pageHas('En retard de 6 jours'))) &&
      (await evaluate(pageHas('En retard de 2 jours'))) &&
      (await evaluate(pageHas('Dans 4 jours')))
  )
  const shotAlerts = await send('Page.captureScreenshot', { format: 'png' })
  writeFileSync(join(outputDir, '8-alertes.png'), Buffer.from(shotAlerts.data, 'base64'))

  check(
    'clic « Ouvrir » sur l’alerte de la procédure',
    await clickByLabel('Ouvrir AOR-ALERTE/2026 : Ouverture des plis')
  )
  await waitUntil(pageHas('Procédure AOR-ALERTE/2026'), 'procédure ouverte depuis l’alerte')
  check('interface : l’alerte ouvre directement la procédure concernée', true)

  check('clic « Alertes » (menu)', await clickByText('Alertes'))
  await waitUntil(pageHas('Alertes d’échéances'), 'retour aux alertes')
  check(
    'clic « Ouvrir » sur l’alerte du marché',
    await clickByLabel('Ouvrir M-ALERTE/2026 : Émettre l’ordre de service de démarrage')
  )
  await waitUntil(pageHas('Contrat M-ALERTE/2026'), 'marché ouvert depuis l’alerte')
  check('interface : l’alerte ouvre directement le marché concerné', true)

  check('clic « Alertes » (menu)', await clickByText('Alertes'))
  await waitUntil(pageHas('Régler le délai'), 'bouton de réglage')
  check('clic « Régler le délai »', await clickButton('Régler le délai'))
  await waitUntil('!!document.querySelector("#alert-horizon")', 'réglage du délai')
  await setField('#alert-horizon', '60')
  check('clic « Enregistrer le délai »', await clickButton('Enregistrer le délai'))
  await waitUntil(pageHas('Délai enregistré.'), 'délai enregistré')
  check('clic « Alertes » (menu)', await clickByText('Alertes'))
  await waitUntil(pageHas('À venir (2)'), 'échéance lointaine désormais signalée')
  check('interface : avec 60 jours, l’échéance à 40 jours apparaît (À venir (2))', true)
  const horizonOnDisk = JSON.parse(readFileSync(join(dataDir, 'settings.json'), 'utf8'))
  check(
    'disque : le délai de 60 jours est enregistré dans settings.json, le nom de la PRMP est conservé',
    horizonOnDisk.alertHorizonDays === 60 && horizonOnDisk.organizationName === ORG
  )
  await evaluate('window.api.saveAlertHorizon({days:15})')

  // 2h. Tableau de bord : indicateurs exacts du jeu de données (calculés à l'affichage)
  const dash = await evaluate('window.api.getDashboard()')
  const d = dash.ok ? dash.value : null
  check(
    'API : réalisation du plan — 2 lignes dont 1 lancée, 1 751 000 Ar prévus, 950 000 Ar contractualisés',
    d !== null &&
      d.plans.length === 1 &&
      d.plans[0].lineCount === 2 &&
      d.plans[0].launchedLineCount === 1 &&
      d.plans[0].plannedAmount === 1751000 &&
      d.plans[0].contractedAmount === 950000,
    JSON.stringify(d ? d.plans : dash.error)
  )
  check(
    'API : procédures — 3 (1 non démarrée, 2 en cours, 2 attribuées), par mode DAO, AOR, DCP',
    d !== null &&
      d.procedures.total === 3 &&
      d.procedures.notStarted === 1 &&
      d.procedures.inProgress === 2 &&
      d.procedures.completed === 0 &&
      d.procedures.awarded === 2 &&
      d.procedures.byMethod.map((m) => `${m.method}:${m.count}:${m.estimatedAmount}`).join('|') ===
        'DAO:1:0|AOR:1:0|DCP:1:1750000',
    JSON.stringify(d ? d.procedures : dash.error)
  )
  check(
    'API : contrats — 2 (1 clôturé, 1 non démarré), 1 500 000 Ar initiaux, +150 000 Ar d’avenants, 1 650 000 Ar actuels',
    d !== null &&
      d.contracts.total === 2 &&
      d.contracts.byStatus.CLOSED === 1 &&
      d.contracts.byStatus.NOT_STARTED === 1 &&
      d.contracts.initialAmount === 1500000 &&
      d.contracts.amendmentsAmount === 150000 &&
      d.contracts.currentAmount === 1650000,
    JSON.stringify(d ? d.contracts : dash.error)
  )
  check(
    'API : 3 candidats, 3 offres reçues, 2 offres retenues',
    d !== null &&
      d.candidates.total === 3 &&
      d.candidates.bids === 3 &&
      d.candidates.awardedBids === 2,
    JSON.stringify(d ? d.candidates : dash.error)
  )

  check('clic « Accueil » (menu)', await clickByText('Accueil'))
  await waitUntil(pageHas('Réalisation du plan'), 'tableau de bord sur l’accueil')
  check(
    'interface : l’accueil affiche la réalisation du plan (1 sur 2, 50 %)',
    (await evaluate(pageHas('1 sur 2 (50 %)'))) && (await evaluate(pageHas('Plan n° 1')))
  )
  check(
    'interface : les blocs Procédures, Contrats, Candidats et offres sont affichés avec leurs montants',
    (await evaluate(pageHas('Attribuées'))) &&
      (await evaluate(pageHas('Montant initial 1 500 000 Ar'))) &&
      (await evaluate(pageHas('Avenants +150 000 Ar'))) &&
      (await evaluate(pageHas('Montant actuel 1 650 000 Ar'))) &&
      (await evaluate(pageHas('Offres retenues')))
  )
  const shotDashboard = await send('Page.captureScreenshot', {
    format: 'png',
    captureBeyondViewport: true
  })
  writeFileSync(join(outputDir, '9-tableau-de-bord.png'), Buffer.from(shotDashboard.data, 'base64'))
  check('clic « Voir les contrats »', await clickButton('Voir les contrats'))
  await waitUntil(
    pageHas('Marchés, conventions et achats directs'),
    'module des contrats depuis le tableau de bord'
  )
  check('interface : « Voir les contrats » mène au module des contrats', true)

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
    'settings.json contient uniquement le nom de la PRMP et le délai d’alerte (aucun secret)',
    settings.organizationName === ORG &&
      Object.keys(settings).sort().join() === 'alertHorizonDays,organizationName,version',
    JSON.stringify(settings)
  )
  const readableAnywhere = dbFiles.some((f) => {
    const bytes = readFileSync(join(dataDir, f))
    return (
      bytes.includes(OBJECT) ||
      bytes.includes('SAF') ||
      bytes.includes(REFERENCE) ||
      bytes.includes('Beta Construction') ||
      bytes.includes('1234567890') ||
      bytes.includes('M-001/2026') ||
      bytes.includes('CREATE TABLE')
    )
  })
  check('aucun texte du plan (objet, service) ni schéma lisible dans les bases', !readableAnywhere)
  const everyDocument = files
    .filter((f) => f.endsWith('.files'))
    .flatMap((dir) =>
      readdirSync(join(dataDir, dir)).map((f) => readFileSync(join(dataDir, dir, f)))
    )
  check(
    'tous les documents joints sont chiffrés sur le disque (ni contenu ni nom lisibles, aussi dans les bases)',
    everyDocument.length === 1 &&
      everyDocument.every((bytes) => !bytes.includes(DOC_MARKER) && !bytes.includes('%PDF')) &&
      !dbFiles.some((f) => readFileSync(join(dataDir, f)).includes('PV e2e secret'))
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
