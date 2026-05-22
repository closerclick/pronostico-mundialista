<script setup lang="ts">
import { reactive, ref, computed, watch, onMounted, onUnmounted, nextTick } from 'vue'
import { useI18n } from 'vue-i18n'
import { setLocale, type Locale } from './i18n'
import { GROUPS, teamById } from './lib/teams'
import {
  defaultPrediction, clonePrediction, champion, prunePicks,
  confirmStandings, hasPendingChanges, completeness, type Prediction,
} from './lib/prediction'
import type { GameMode } from './lib/standings'
import { encodePrediction, decodePrediction } from './lib/codec'
import { parseShareFragment, buildShareUrl } from './lib/share'
import {
  loadLibrary, saveLibrary, getActiveId, setActiveId, genId, type SavedPrediction,
} from './lib/store'
import GroupCard from './components/GroupCard.vue'
import StandingsTable from './components/StandingsTable.vue'
import ResultsTab from './components/ResultsTab.vue'
import ThirdsBlock from './components/ThirdsBlock.vue'
import BracketTab from './components/BracketTab.vue'
import ScoresTab from './components/ScoresTab.vue'
import ShareModal from './components/ShareModal.vue'
import PrintView from './components/PrintView.vue'
import Sidebar from './components/Sidebar.vue'
import ScoringInfo from './components/ScoringInfo.vue'
import QRCode from 'qrcode'
import IdentityPanel from './components/IdentityPanel.vue'
import jsPDF from 'jspdf'
import html2canvas from 'html2canvas'

const { t, locale } = useI18n()

const library = ref<SavedPrediction[]>([])
const activeId = ref<string | null>(null)
const pred = reactive<Prediction>(defaultPrediction())
const tab = ref<'grupos' | 'resultados' | 'llaves' | 'puntajes'>('grupos')
const sidebarOpen = ref(false)
const shareOpen = ref(false)
const shareEntryId = ref<string | null>(null)
const identityOpen = ref(false)
const scoringOpen = ref(false)
const identityFocus = ref<string | null>(null)
const importOpen = ref(false)
const importText = ref('')
const importError = ref('')
const importing = ref(false)

// --- Instalación PWA --------------------------------------------------------
let deferredPrompt: { prompt: () => void; userChoice: Promise<unknown> } | null = null
const isStandalone = ref(
  window.matchMedia('(display-mode: standalone)').matches ||
  (navigator as unknown as { standalone?: boolean }).standalone === true,
)
const canInstall = ref(false)
const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) &&
  !(window as unknown as { MSStream?: unknown }).MSStream

function onBeforeInstallPrompt (e: Event) {
  e.preventDefault()
  deferredPrompt = e as unknown as typeof deferredPrompt
  canInstall.value = true
}
function onAppInstalled () {
  deferredPrompt = null
  canInstall.value = false
  isStandalone.value = true
}
async function installApp () {
  if (deferredPrompt) {
    deferredPrompt.prompt()
    await deferredPrompt.userChoice
    deferredPrompt = null
    canInstall.value = false
    return
  }
  if (isIOS) alert(t('install.ios'))
  else alert(t('install.other'))
}

let loading = false // evita persistir mientras cargamos un pronóstico

const activeEntry = computed(() => library.value.find((p) => p.id === activeId.value) ?? null)
const readonly = computed(() => (activeEntry.value ? !activeEntry.value.mine : false))
// La entrada de RESULTADOS oficiales NO es un pronóstico: solo se cargan los
// marcadores de los partidos; sin modos, sin "Confirmar", sin arrastre. Las
// posiciones y llaves se derivan solas de los resultados.
const isOfficial = computed(() => !!activeEntry.value?.official)
// Entrada de resultados oficiales (base de comparación para los puntajes).
const officialEntry = computed(() => library.value.find((p) => p.official) ?? null)
const championId = computed(() => champion(pred))

// --- Modo de juego y resultados --------------------------------------------
// El modo (tipo) se elige al CREAR el pronóstico y queda FIJO. Para cambiarlo
// se clona a otro tipo (cloneToType). Etiqueta legible del modo activo:
const activeModeName = computed(() => modeName(pred.mode))

// ¿Hay resultados sin confirmar? (solo aplica en winlose/score). Reactivo: el
// watch profundo de `pred` reevalúa este computed al cambiar resultados/modo.
const pending = computed(() => hasPendingChanges(pred))

// Aplica los resultados a las posiciones confirmadas y poda las llaves.
function confirmChanges () {
  if (readonly.value) return
  confirmStandings(pred) // persiste vía el watch profundo de `pred`
}

// Cambio de pestaña con guarda: si hay cambios sin aplicar (afectan las llaves),
// se pregunta si aplicarlos o ignorarlos antes de cambiar de sección.
type Tab = 'grupos' | 'resultados' | 'llaves' | 'puntajes'
const tabSwitch = ref<Tab | null>(null)
function goTab (target: Tab) {
  if (target === tab.value) return
  if (pending.value && !readonly.value && !isOfficial.value) { tabSwitch.value = target; return }
  tab.value = target
}
function applyAndGo () {
  confirmChanges()
  if (tabSwitch.value) tab.value = tabSwitch.value
  tabSwitch.value = null
}
function ignoreAndGo () {
  if (tabSwitch.value) tab.value = tabSwitch.value
  tabSwitch.value = null
}

// Código a firmar/compartir: el del pronóstico elegido en la barra lateral
// (o el activo si se comparte sin elegir).
const shareCode = computed(() => {
  const entry = library.value.find((p) => p.id === shareEntryId.value)
  if (entry) return entry.id === activeId.value ? encodePrediction(pred) : entry.code
  return encodePrediction(pred)
})

// Nombre del pronóstico que se está compartiendo (viaja en el enlace, máx 50).
const shareName = computed(() => library.value.find((p) => p.id === shareEntryId.value)?.name)

function openShare (id: string) {
  shareEntryId.value = id
  shareOpen.value = true
}

// Si el pronóstico está incompleto, avisamos antes de compartir/imprimir/PDF
// (no se bloquea: el usuario puede continuar igual).
const warn = ref<null | { pct: number; run: () => void }>(null)
function guardComplete (id: string, run: () => void) {
  const p = predForEntry(id)
  const pct = p ? completeness(p).pct : 100
  if (pct >= 100) { run(); return }
  warn.value = { pct, run }
}
function confirmWarn () {
  const w = warn.value
  warn.value = null
  w?.run()
}
function tryShare (id: string) { guardComplete(id, () => openShare(id)) }
function tryPrint (id: string) { guardComplete(id, () => printEntry(id)) }
function tryPdf (id: string) { guardComplete(id, () => pdfEntry(id)) }

// Datos para la vista de impresión (PrintView).
const printQr = ref('')
const printPred = ref<Prediction | null>(null)
const printTitle = ref('')
const printAuthor = ref<string | undefined>(undefined)
// Modo captura del PrintView: cuando es true, la hoja se renderiza visible
// (fuera de pantalla) para poder rasterizarla con html2canvas.
const pdfCapturing = ref(false)
const printView = ref<HTMLElement | null>(null)

// Pronóstico que se va a imprimir: el del entry compartido. Si es el activo,
// usamos el estado reactivo en vivo; si no, decodificamos su código guardado.
function predForEntry (id: string | null): Prediction | null {
  const entry = library.value.find((p) => p.id === id)
  if (!entry) return clonePrediction(pred)
  if (entry.id === activeId.value) return clonePrediction(pred)
  // Para un pronóstico NO activo, el código solo trae posiciones/llaves; le
  // adjuntamos modo y resultados locales del entry para que PrintView elija el
  // template correcto (Simple/Medio/Completo) y muestre puntos/marcadores.
  try {
    const p = decodePrediction(entry.code)
    if (entry.mode) p.mode = entry.mode
    if (entry.results) p.results = JSON.parse(JSON.stringify(entry.results))
    return p
  } catch { return null }
}

// Disparado por ShareModal con la URL firmada ya armada: generamos el QR de esa
// misma URL, poblamos PrintView y lanzamos el diálogo de impresión del navegador.
async function handlePrint (url: string) {
  const entry = library.value.find((p) => p.id === shareEntryId.value)
  printPred.value = predForEntry(shareEntryId.value)
  if (!printPred.value) return
  printTitle.value = entry?.name || activeEntry.value?.name || t('store.defaultTitle')
  printAuthor.value = entry?.author?.nickname ?? activeEntry.value?.author?.nickname
  printQr.value = await QRCode.toDataURL(url, { margin: 1, width: 512 })
  shareOpen.value = false
  await nextTick()
  window.print()
}

// Genera y DESCARGA un PDF con la misma hoja de PrintView, sin pasar por el
// diálogo de impresión: renderiza la hoja en modo captura (oculta fuera de
// pantalla), la rasteriza con html2canvas y la incrusta en un A4 portrait.
function sanitizeFilename (name: string): string {
  // Quita acentos (rango de marcas combinantes ̀-ͯ) y caracteres no seguros.
  const base = name.normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9 _-]/g, '').trim().replace(/\s+/g, '-')
  return (base || 'pronostico') + '.pdf'
}

async function downloadPdf (url: string) {
  const entry = library.value.find((p) => p.id === shareEntryId.value)
  printPred.value = predForEntry(shareEntryId.value)
  if (!printPred.value) return
  printTitle.value = entry?.name || activeEntry.value?.name || t('store.defaultTitle')
  printAuthor.value = entry?.author?.nickname ?? activeEntry.value?.author?.nickname
  try {
    printQr.value = await QRCode.toDataURL(url, { margin: 1, width: 512 })
    shareOpen.value = false
    pdfCapturing.value = true
    await nextTick()
    // El contenedor envuelve al PrintView; capturamos su primer hijo (la hoja).
    const el = printView.value?.firstElementChild as HTMLElement | null
    if (!el) throw new Error(t('pdf.sheetNotFound'))
    const canvas = await html2canvas(el, { scale: 2, backgroundColor: '#fff', useCORS: true })
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
    const pageW = 210
    const pageH = 297
    let imgW = pageW
    let imgH = (canvas.height / canvas.width) * imgW
    // Si excede el alto de página, reescalamos para que entre en una página.
    if (imgH > pageH) {
      imgH = pageH
      imgW = (canvas.width / canvas.height) * imgH
    }
    const x = (pageW - imgW) / 2
    doc.addImage(canvas.toDataURL('image/png'), 'PNG', x, 0, imgW, imgH)
    doc.save(sanitizeFilename(printTitle.value))
  } catch (e: unknown) {
    alert(t('pdf.error') + (e instanceof Error ? e.message : ''))
  } finally {
    pdfCapturing.value = false
  }
}

// Exportar a PDF directamente (sin abrir el modal): firma el código y dispara
// la descarga del PDF con la misma hoja.
async function pdfEntry (id: string) {
  const entry = library.value.find((p) => p.id === id)
  if (!entry) return
  shareEntryId.value = id
  const code = id === activeId.value ? encodePrediction(pred) : entry.code
  try {
    const { url } = await buildShareUrl(code, entry.name)
    await downloadPdf(url)
  } catch (e: unknown) {
    alert(t('pdf.error') + (e instanceof Error ? e.message : ''))
  }
}

// Imprimir directamente desde la barra lateral: firma el código para armar la
// URL del QR y dispara el mismo flujo de impresión que el modal de compartir.
async function printEntry (id: string) {
  const entry = library.value.find((p) => p.id === id)
  if (!entry) return
  shareEntryId.value = id
  const code = id === activeId.value ? encodePrediction(pred) : entry.code
  try {
    const { url } = await buildShareUrl(code, entry.name)
    await handlePrint(url)
  } catch (e: unknown) {
    alert(t('pdf.printError') + (e instanceof Error ? e.message : ''))
  }
}

// Cambia el idioma de la interfaz (ES/EN) y persiste la preferencia.
function changeLocale (l: Locale) {
  setLocale(l)
}

function openProfile () {
  identityFocus.value = null
  identityOpen.value = true
  sidebarOpen.value = false
}

function rateAuthor () {
  identityFocus.value = activeEntry.value?.author?.publickey ?? null
  identityOpen.value = true
}

// Edición inline del nombre del pronóstico activo en la cabecera.
const editingName = ref(false)
const nameDraft = ref('')
const nameInput = ref<HTMLInputElement | null>(null)

function startEditName () {
  if (readonly.value || isOfficial.value || !activeEntry.value) return
  nameDraft.value = activeEntry.value.name
  editingName.value = true
  nextTick(() => nameInput.value?.focus())
}

function commitName () {
  if (!editingName.value) return
  const entry = activeEntry.value
  const name = nameDraft.value.trim()
  if (entry && name) { entry.name = name; saveLibrary(library.value) }
  editingName.value = false
}

function applyPrediction (p: Prediction) {
  loading = true
  pred.mode = p.mode
  pred.results = p.results
  pred.groupOrder = p.groupOrder
  pred.thirdsRank = p.thirdsRank
  pred.draftGroupOrder = p.draftGroupOrder
  pred.draftThirdsRank = p.draftThirdsRank
  pred.picks = p.picks
  nextTick(() => { loading = false })
}

function persistActive () {
  const entry = activeEntry.value
  if (!entry || !entry.mine) return
  // El oficial no es un pronóstico: sus posiciones/llaves se derivan solas de
  // los resultados (sin paso de "Confirmar"). Forzamos modo 'score'.
  if (entry.official) { pred.mode = 'score'; confirmStandings(pred) }
  prunePicks(pred)
  entry.code = encodePrediction(pred)
  // Modo y resultados son datos locales (no van en el código compartido).
  entry.mode = pred.mode
  entry.results = pred.results
  entry.draftGroupOrder = pred.draftGroupOrder
  entry.draftThirdsRank = pred.draftThirdsRank
  entry.updatedAt = Date.now()
  saveLibrary(library.value)
}

watch(pred, () => { if (!loading) persistActive() }, { deep: true })

function select (id: string) {
  const entry = library.value.find((p) => p.id === id)
  if (!entry) return
  activeId.value = id
  setActiveId(id)
  try { applyPrediction(decodePrediction(entry.code)) }
  catch { applyPrediction(defaultPrediction()) }
  // Modo/resultados: si el entry los tiene guardados (míos), úsalos; si no
  // (importados), quedan los que ya trae el código decodificado.
  if (entry.mode) pred.mode = entry.mode
  if (entry.results) pred.results = JSON.parse(JSON.stringify(entry.results))
  // El borrador local del entry, si existe; si no, arranca == confirmado.
  pred.draftGroupOrder = entry.draftGroupOrder
    ? entry.draftGroupOrder.map((a) => [...a])
    : pred.groupOrder.map((a) => [...a])
  pred.draftThirdsRank = entry.draftThirdsRank ? [...entry.draftThirdsRank] : [...pred.thirdsRank]
  // El oficial siempre en modo marcador y abriendo directo en "Resultados".
  if (entry.official) { pred.mode = 'score'; tab.value = 'resultados' }
  // La pestaña Resultados no existe en modo Simple: si estaba activa, volvemos a Grupos.
  else if (pred.mode === 'manual' && tab.value === 'resultados') tab.value = 'grupos'
  sidebarOpen.value = false
}

// Garantiza que exista EXACTAMENTE una entrada de resultados oficiales. Si no
// hay ninguna, la crea y persiste; no se duplica en cada arranque.
function ensureOfficialEntry () {
  if (library.value.some((p) => p.official)) return
  const entry: SavedPrediction = {
    id: genId(),
    name: t('store.officialName'),
    mine: true,
    official: true,
    mode: 'score',
    results: {},
    code: encodePrediction(defaultPrediction()),
    updatedAt: Date.now(),
  }
  library.value.push(entry)
  saveLibrary(library.value)
}

function uniqueName () {
  const n = library.value.filter((p) => p.mine).length + 1
  return t('store.defaultName', { n })
}

// Nombre legible del modo (para nombres de clones, etc.).
function modeName (m: GameMode): string {
  return m === 'winlose' ? t('modes.medium') : m === 'score' ? t('modes.full') : t('modes.simple')
}

// Crea un pronóstico NUEVO con un tipo (modo) fijo elegido al crearlo.
function create (mode: GameMode = 'manual') {
  const p = defaultPrediction()
  p.mode = mode
  const entry: SavedPrediction = {
    id: genId(), name: uniqueName(),
    code: encodePrediction(p), mode, results: {},
    updatedAt: Date.now(), mine: true,
  }
  library.value.push(entry)
  saveLibrary(library.value)
  select(entry.id)
  tab.value = mode === 'manual' ? 'grupos' : 'resultados'
}

// Clona un pronóstico a OTRO tipo (modo): conserva sus datos y cambia el modo.
function cloneToType (id: string, mode: GameMode) {
  const src = library.value.find((p) => p.id === id)
  if (!src) return
  let p: Prediction
  try { p = decodePrediction(src.code) } catch { p = defaultPrediction() }
  p.mode = mode
  if (src.results) p.results = JSON.parse(JSON.stringify(src.results))
  const entry: SavedPrediction = {
    id: genId(), name: src.name + ' · ' + modeName(mode),
    code: encodePrediction(p), mode, results: p.results,
    draftGroupOrder: src.draftGroupOrder, draftThirdsRank: src.draftThirdsRank,
    updatedAt: Date.now(), mine: true,
  }
  library.value.push(entry)
  saveLibrary(library.value)
  select(entry.id)
  tab.value = mode === 'manual' ? 'grupos' : 'resultados'
}

// Selector de tipo (modal): para "Nuevo" o "Clonar a otro tipo".
const typePicker = ref<null | { action: 'new' } | { action: 'clone'; id: string }>(null)
function cloneActive () {
  if (activeId.value) typePicker.value = { action: 'clone', id: activeId.value }
}
function pickType (mode: GameMode) {
  const p = typePicker.value
  typePicker.value = null
  if (!p) return
  if (p.action === 'new') create(mode)
  else cloneToType(p.id, mode)
}

function remove (id: string) {
  const entry = library.value.find((p) => p.id === id)
  if (!entry) return
  if (!confirm(t('store.confirmDelete', { name: entry.name }))) return
  library.value = library.value.filter((p) => p.id !== id)
  saveLibrary(library.value)
  if (activeId.value === id) {
    const next = library.value[0]
    if (next) select(next.id)
    else create()
  }
}

function rename (id: string) {
  const entry = library.value.find((p) => p.id === id)
  if (!entry) return
  const name = prompt(t('store.promptRename'), entry.name)
  if (name && name.trim()) { entry.name = name.trim(); saveLibrary(library.value) }
}

function copyToMine (id: string) {
  const entry = library.value.find((p) => p.id === id)
  if (!entry) return
  const copy: SavedPrediction = {
    id: genId(), name: entry.name + t('store.copySuffix'), code: entry.code,
    updatedAt: Date.now(), mine: true,
  }
  library.value.push(copy)
  saveLibrary(library.value)
  select(copy.id)
}

function extractFragment (text: string): string {
  const t = text.trim()
  const hash = t.lastIndexOf('#')
  return hash >= 0 ? t.slice(hash + 1) : t
}

async function doImport () {
  importError.value = ''
  importing.value = true
  try {
    const parsed = await parseShareFragment(extractFragment(importText.value))
    if (!parsed) throw new Error(t('store.invalidLink'))
    decodePrediction(parsed.code) // valida
    const entry: SavedPrediction = {
      id: genId(),
      name: (parsed.name || parsed.nickname || t('store.importedName')),
      code: parsed.code,
      updatedAt: Date.now(),
      mine: false,
      author: { publickey: parsed.publickey, nickname: parsed.nickname, verified: parsed.verified },
    }
    library.value.push(entry)
    saveLibrary(library.value)
    select(entry.id)
    tab.value = 'llaves'
    importOpen.value = false
    importText.value = ''
  } catch (e: unknown) {
    importError.value = e instanceof Error ? e.message : String(e)
  } finally {
    importing.value = false
  }
}

// Importa el pronóstico que viene en el #fragmento. Devuelve true si lo importó
// (o si ya existía y lo seleccionó). Limpia el hash de la URL al terminar.
async function importFromHash (frag: string): Promise<boolean> {
  // Borramos el hash apenas lo leemos (antes de la verificación async), para que
  // no quede en la URL ni se reprocese.
  history.replaceState(null, '', location.pathname + location.search)
  const parsed = await parseShareFragment(frag)
  if (!parsed) return false
  try { decodePrediction(parsed.code) } catch { return false }
  // Si ya tenemos ese pronóstico importado, no duplicamos: lo seleccionamos.
  const existing = library.value.find((p) => !p.mine && !p.official && p.code === parsed.code)
  if (existing) {
    if (parsed.name) existing.name = parsed.name
    select(existing.id)
    tab.value = 'llaves'
    return true
  }
  const entry: SavedPrediction = {
    id: genId(), name: parsed.name || parsed.nickname || t('store.sharedName'),
    code: parsed.code, updatedAt: Date.now(), mine: false,
    author: { publickey: parsed.publickey, nickname: parsed.nickname, verified: parsed.verified },
  }
  library.value.push(entry)
  saveLibrary(library.value)
  select(entry.id)
  tab.value = 'llaves'
  return true
}

// Si el hash cambia estando la app ya cargada (pegar otro link en la misma
// pestaña no recarga la página), reimportamos.
async function onHashChange () {
  const frag = location.hash.replace(/^#/, '')
  if (frag) await importFromHash(frag)
}

onMounted(async () => {
  window.addEventListener('beforeinstallprompt', onBeforeInstallPrompt)
  window.addEventListener('appinstalled', onAppInstalled)
  window.addEventListener('hashchange', onHashChange)

  library.value = loadLibrary()
  ensureOfficialEntry()

  const frag = location.hash.replace(/^#/, '')
  if (frag && await importFromHash(frag)) return

  const saved = getActiveId()
  if (saved && library.value.some((p) => p.id === saved)) select(saved)
  else if (library.value.length) select(library.value[0]!.id)
  else create()
})

onUnmounted(() => {
  window.removeEventListener('beforeinstallprompt', onBeforeInstallPrompt)
  window.removeEventListener('appinstalled', onAppInstalled)
  window.removeEventListener('hashchange', onHashChange)
})
</script>

<template>
  <div class="shell">
    <Sidebar
      :open="sidebarOpen"
      :library="library"
      :active-id="activeId"
      @close="sidebarOpen = false"
      @select="select"
      @create="typePicker = { action: 'new' }; sidebarOpen = false"
      @import="importOpen = true; sidebarOpen = false"
      @remove="remove"
      @rename="rename"
      @copy="copyToMine"
      @clonetype="(id) => { typePicker = { action: 'clone', id }; sidebarOpen = false }"
      @share="tryShare"
      @print="tryPrint"
      @pdf="tryPdf"
      @scoring="scoringOpen = true; sidebarOpen = false"
    />
    <div class="main">
    <header class="scoreboard">
      <button class="menu" data-testid="menu-btn" @click="sidebarOpen = true" :aria-label="t('header.menu')">☰</button>
      <img src="/favicon.svg" :alt="t('header.logo')" class="brand-logo" />
      <div class="title">
        <span class="cup">{{ t('header.cup') }}</span>
        <h1>{{ t('header.title') }} <em>2026</em></h1>
      </div>
      <div class="hdr-right">
        <!-- Selector de idioma compacto (ES | EN) -->
        <div class="lang-selector" data-testid="lang-selector" role="group" :aria-label="t('lang.label')">
          <button data-testid="lang-es" :class="{ on: locale === 'es' }" @click="changeLocale('es')">{{ t('lang.es') }}</button>
          <button data-testid="lang-en" :class="{ on: locale === 'en' }" @click="changeLocale('en')">{{ t('lang.en') }}</button>
        </div>
        <!-- Botón circular de identidad (siempre visible) -->
        <button class="identity-btn" data-testid="identity-btn" @click="openProfile" :aria-label="t('header.identity')" :title="t('header.identity')">👤</button>
      </div>
    </header>

    <div class="active-bar">
      <button v-if="!isStandalone" class="install-float" data-testid="install-btn" @click="installApp">{{ t('active.install') }}</button>
      <span class="dot" :class="{ ro: readonly }"></span>
      <input
        v-if="editingName"
        ref="nameInput"
        v-model="nameDraft"
        class="name-input"
        data-testid="name-input"
        maxlength="40"
        @keydown.enter="commitName"
        @keydown.esc="editingName = false"
        @blur="commitName"
      />
      <button
        v-else
        class="active-name"
        data-testid="active-name"
        :class="{ editable: !readonly && !isOfficial }"
        :title="(readonly || isOfficial) ? '' : t('active.editName')"
        @click="startEditName"
      >
        {{ activeEntry?.name || t('active.placeholder') }}<span v-if="!readonly && !isOfficial" class="pen">✎</span>
      </button>
      <span v-if="readonly" class="ro-badge">
        {{ activeEntry?.author?.verified ? t('active.signed') : t('active.unverified') }}
        · {{ activeEntry?.author?.nickname || t('common.anonymous') }}
        <button class="mini" @click="rateAuthor">{{ t('active.rateAuthor') }}</button>
        <button class="mini" @click="activeEntry && copyToMine(activeEntry.id)">{{ t('active.editCopy') }}</button>
      </span>
      <span v-else-if="championId != null" class="champ-chip">
        🏆 {{ teamById(championId).flag }} {{ teamById(championId).code }}
      </span>

      <!-- Acciones del pronóstico ACTIVO (alineadas a la derecha) -->
      <div v-if="activeId" class="bar-actions" data-testid="bar-actions">
        <button class="share-i" data-testid="bar-share" :title="t('common.share')" @click="tryShare(activeId)">
          <svg viewBox="0 0 24 24" width="17" height="17" fill="currentColor" aria-hidden="true">
            <path d="M18 16.08c-.76 0-1.44.3-1.96.77L8.91 12.7c.05-.23.09-.46.09-.7s-.04-.47-.09-.7l7.05-4.11c.54.5 1.25.81 2.04.81 1.66 0 3-1.34 3-3s-1.34-3-3-3-3 1.34-3 3c0 .24.04.47.09.7L8.04 9.81C7.5 9.31 6.79 9 6 9c-1.66 0-3 1.34-3 3s1.34 3 3 3c.79 0 1.5-.31 2.04-.81l7.12 4.16c-.05.21-.08.43-.08.65 0 1.61 1.31 2.92 2.92 2.92s2.92-1.31 2.92-2.92-1.31-2.92-2.92-2.92z" />
          </svg>
        </button>
        <button :title="t('common.print')" data-testid="bar-print" @click="tryPrint(activeId)">🖨</button>
        <button class="pdf-i" data-testid="bar-pdf" :title="t('common.pdf')" @click="tryPdf(activeId)">
          <img src="/pdf.svg" alt="PDF" class="pdf-img" />
        </button>
        <button v-if="!isOfficial" class="clone-i" :title="t('modes.cloneToType')" data-testid="bar-clone" @click="cloneActive()">
          <svg viewBox="0 0 24 24" width="15" height="15" fill="currentColor" aria-hidden="true">
            <path d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z" />
          </svg>
        </button>
        <button v-if="!readonly && !isOfficial" :title="t('common.rename')" data-testid="bar-rename" @click="startEditName">✎</button>
        <button v-if="readonly" :title="t('common.editCopy')" data-testid="bar-copy" @click="copyToMine(activeId)">⎘</button>
        <button v-if="!isOfficial" class="danger-i" data-testid="bar-delete" :title="t('common.delete')" @click="remove(activeId)">🗑</button>
      </div>
    </div>

    <!-- Selector de modo de juego (oculto en pronósticos importados). -->
    <!-- El tipo (modo) se fija al crear; aquí solo se muestra y se puede clonar
         a otro tipo. -->
    <div v-if="!readonly && !isOfficial" class="mode-bar" data-testid="mode-bar">
      <span class="mode-label">{{ t('modes.label') }} <strong class="mode-cur">{{ activeModeName }}</strong></span>
    </div>

    <!-- Franja de confirmación: visible cuando hay resultados sin aplicar. -->
    <div v-if="!readonly && !isOfficial && pending" class="confirm-bar" data-testid="confirm-bar">
      <span class="confirm-msg">{{ t('confirm.msg') }}</span>
      <button class="confirm-btn" data-testid="confirm-btn" @click="confirmChanges">{{ t('confirm.btn') }}</button>
    </div>

    <nav class="tabs">
      <button data-testid="tab-grupos" :class="{ active: tab === 'grupos' }" @click="goTab('grupos')">{{ t('tabs.groups') }}</button>
      <button data-testid="tab-llaves" :class="{ active: tab === 'llaves' }" @click="goTab('llaves')">{{ t('tabs.bracket') }}</button>
      <button
        v-if="pred.mode !== 'manual'"
        data-testid="tab-resultados"
        :class="{ active: tab === 'resultados' }"
        @click="goTab('resultados')"
      >{{ t('tabs.results') }}</button>
      <button
        v-if="!isOfficial"
        data-testid="tab-puntajes"
        :class="{ active: tab === 'puntajes' }"
        @click="goTab('puntajes')"
      >{{ t('tabs.scores') }}</button>
    </nav>

    <main class="content">
      <section v-show="tab === 'grupos'" class="scrolly" data-testid="zone-grupos">
        <!-- Modo manual: tablas arrastrables (comportamiento clásico). -->
        <template v-if="pred.mode === 'manual'">
          <p class="tab-hint">
            {{ readonly ? t('groupsTab.hintReadonly') : t('groupsTab.hintDrag') }}
          </p>
          <div class="groups-grid">
            <GroupCard
              v-for="(g, i) in GROUPS"
              :key="g.letter"
              :pred="pred"
              :group="i"
              :letter="g.letter"
              :readonly="readonly"
            />
          </div>
          <ThirdsBlock :pred="pred" :readonly="readonly" class="thirds-wrap" />
        </template>

        <!-- Modos winlose/score: tablas CALCULADAS en solo lectura. -->
        <template v-else>
          <p class="tab-hint">
            {{ t('groupsTab.hintCalc') }}
          </p>
          <div class="groups-grid">
            <StandingsTable
              v-for="(g, i) in GROUPS"
              :key="g.letter"
              :pred="pred"
              :group="i"
              :letter="g.letter"
            />
          </div>
        </template>
      </section>

      <section v-show="tab === 'resultados' && pred.mode !== 'manual'" class="scrolly" data-testid="zone-resultados">
        <ResultsTab :pred="pred" :readonly="readonly" :official="isOfficial ? null : officialEntry" />
      </section>

      <section v-show="tab === 'llaves'" data-testid="zone-llaves">
        <BracketTab :pred="pred" :readonly="readonly || isOfficial" :official="isOfficial ? null : officialEntry" />
      </section>

      <section v-show="tab === 'puntajes'" class="scrolly" data-testid="zone-puntajes">
        <ScoresTab :entry="activeEntry" :official="officialEntry" />
      </section>
    </main>

    <footer class="footer">
      <span class="eco">{{ t('footer.eco') }} <a href="https://closer.click" target="_blank" rel="noopener">Closer Click</a></span>
    </footer>

    <ShareModal
      :code="shareCode"
      :name="shareName"
      :open="shareOpen"
      @close="shareOpen = false"
      @print="handlePrint"
      @pdf="downloadPdf"
    />

    <ScoringInfo :open="scoringOpen" @close="scoringOpen = false" />

    <IdentityPanel
      :open="identityOpen"
      :focus-pubkey="identityFocus"
      @close="identityOpen = false"
      @changed="library = [...library]"
    />

    <!-- Cambios sin aplicar al cambiar de sección: aplicar o ignorar. -->
    <div v-if="tabSwitch" class="overlay" @click.self="tabSwitch = null">
      <div class="warn-modal" data-testid="tabswitch-modal">
        <h3>⚠ {{ t('tabSwitch.title') }}</h3>
        <p>{{ t('tabSwitch.msg') }}</p>
        <div class="warn-actions">
          <button class="warn-cancel" data-testid="tabswitch-ignore" @click="ignoreAndGo">{{ t('tabSwitch.ignore') }}</button>
          <button class="warn-go" data-testid="tabswitch-apply" @click="applyAndGo">{{ t('tabSwitch.apply') }}</button>
        </div>
      </div>
    </div>

    <!-- Aviso de pronóstico incompleto al compartir/imprimir. -->
    <div v-if="warn" class="overlay" @click.self="warn = null">
      <div class="warn-modal" data-testid="warn-incomplete">
        <h3>⚠ {{ t('warn.title') }}</h3>
        <p>{{ t('warn.msg', { pct: warn.pct }) }}</p>
        <div class="warn-actions">
          <button class="warn-cancel" @click="warn = null">{{ t('warn.cancel') }}</button>
          <button class="warn-go" @click="confirmWarn">{{ t('warn.continue') }}</button>
        </div>
      </div>
    </div>

    <!-- Selector de tipo (Nuevo / Clonar a otro tipo). -->
    <div v-if="typePicker" class="overlay" @click.self="typePicker = null">
      <div class="type-modal" data-testid="type-picker">
        <button class="x" @click="typePicker = null" :aria-label="t('common.close')">×</button>
        <h3>{{ typePicker.action === 'new' ? t('typePicker.newTitle') : t('typePicker.cloneTitle') }}</h3>
        <button class="type-opt" data-testid="type-manual" @click="pickType('manual')">
          <strong>{{ t('modes.simple') }}</strong><span>{{ t('typePicker.simpleDesc') }}</span>
        </button>
        <button class="type-opt" data-testid="type-winlose" @click="pickType('winlose')">
          <strong>{{ t('modes.medium') }}</strong><span>{{ t('typePicker.mediumDesc') }}</span>
        </button>
        <button class="type-opt" data-testid="type-score" @click="pickType('score')">
          <strong>{{ t('modes.full') }}</strong><span>{{ t('typePicker.fullDesc') }}</span>
        </button>
      </div>
    </div>

    <div v-if="importOpen" class="overlay" @click.self="importOpen = false">
      <div class="import-modal" data-testid="import-modal">
        <button class="x" @click="importOpen = false" :aria-label="t('common.close')">×</button>
        <h3>{{ t('import.title') }}</h3>
        <p class="imp-help">{{ t('import.help', { hash: '#' }) }}</p>
        <textarea
          v-model="importText"
          rows="3"
          :placeholder="t('import.placeholder')"
          @keydown.stop
        ></textarea>
        <p v-if="importError" class="imp-err">{{ importError }}</p>
        <button class="imp-go" :disabled="importing || !importText.trim()" @click="doImport">
          {{ importing ? t('import.verifying') : t('import.go') }}
        </button>
      </div>
    </div>
    </div>
  </div>

  <!-- Hoja de impresión / captura. Durante la captura de PDF la posicionamos
       fuera de pantalla (el usuario no la ve) para rasterizarla con html2canvas. -->
  <div
    ref="printView"
    :class="{ 'print-host': true, capturing: pdfCapturing }"
  >
    <PrintView
      v-if="printPred"
      :pred="printPred"
      :title="printTitle"
      :author="printAuthor"
      :qr-data-url="printQr"
      :capture="pdfCapturing"
    />
  </div>
</template>

<style scoped>
/* Contenedor de la hoja de impresión/captura. En captura lo sacamos de la
   vista (fuera de pantalla) para que html2canvas lea la hoja sin mostrarla. */
.print-host.capturing {
  position: fixed; left: -10000px; top: 0; z-index: -1;
}

.shell { width: 100%; max-width: 100%; margin: 0; min-height: 100vh; }
.main { display: flex; flex-direction: column; min-height: 100vh; min-width: 0; }

/* En escritorio: layout tipo "app-shell". La barra lateral ocupa el 100% del
   alto del viewport y la página no scrollea; es el área de contenido la que
   maneja (si hace falta) su propio scroll interno. */
@media (min-width: 960px) {
  /* App-shell: la barra lateral ocupa todo el alto y NO scrollea la página.
     El área de contenido tiene su PROPIO scroll, así nada se recorta y la
     barra lateral siempre llega al fondo. */
  .shell { display: flex; align-items: stretch; height: 100vh; overflow: hidden; }
  .main { flex: 1; height: 100vh; min-height: 0; display: flex; flex-direction: column; }
  .menu { display: none; }
  .scoreboard { padding-left: 1.2rem; }

  /* El contenido scrollea internamente (grupos+terceros o llaves completas). */
  .content { flex: 1; min-height: 0; overflow-y: auto; }
  .footer { flex-shrink: 0; }
}

/* XL: en pantallas muy anchas acolchamos el contenido a los lados para que el
   ancho útil quede parecido al de "lg" (no se estira de borde a borde). */
@media (min-width: 1400px) {
  .content { padding-inline: clamp(1rem, calc((100% - 1100px) / 2), 16rem); }
  .active-bar { padding-inline: clamp(1rem, calc((100% - 1100px) / 2), 16rem); }
}

.hdr-right { display: flex; align-items: center; gap: 0.5rem; flex-shrink: 0; }
/* Selector de idioma compacto (ES | EN) */
.lang-selector {
  display: inline-flex; border: 1px solid var(--line); border-radius: 8px;
  overflow: hidden; background: rgba(65, 180, 255, 0.08);
}
.lang-selector button {
  background: transparent; color: var(--muted); border: none; cursor: pointer;
  font-family: inherit; font-weight: 800; font-size: 0.72rem; letter-spacing: 0.04em;
  padding: 0.35rem 0.5rem; line-height: 1;
}
.lang-selector button:hover { background: rgba(65, 180, 255, 0.16); color: var(--text); }
.lang-selector button.on { background: var(--azure); color: #042038; }
.identity-btn {
  display: flex; align-items: center; justify-content: center; flex-shrink: 0;
  width: 42px; height: 42px; border-radius: 50%; font-size: 1.2rem; cursor: pointer;
  background: rgba(65, 180, 255, 0.12); color: var(--text); border: 1px solid var(--line);
}
.identity-btn:hover { background: rgba(65, 180, 255, 0.22); }
/* Botón flotante centrado dentro de la barra del pronóstico (active-bar). */
.install-float {
  position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%);
  z-index: 30; background: var(--azure); color: #042038; border: none;
  border-radius: 50px; padding: 0.5rem 1.4rem; font-weight: 800; font-size: 0.95rem;
  cursor: pointer; white-space: nowrap; box-shadow: 0 6px 22px rgba(0, 0, 0, 0.5);
}
.install-float:hover { filter: brightness(1.06); }

/* Scoreboard header */
.scoreboard {
  display: flex; align-items: center; gap: 0.6rem;
  padding: 0.7rem 0.9rem; position: sticky; top: 0; z-index: 50;
  background: linear-gradient(180deg, rgba(16, 42, 82, 0.96), rgba(10, 23, 48, 0.96));
  backdrop-filter: blur(8px);
  border-bottom: 1px solid var(--line);
}
.menu {
  background: rgba(65, 180, 255, 0.12); color: var(--text);
  border: 1px solid var(--line); border-radius: 10px; cursor: pointer;
  width: 42px; height: 42px; font-size: 1.3rem; flex-shrink: 0;
}
.menu:hover { background: rgba(65, 180, 255, 0.22); }
.brand-logo { width: 38px; height: 38px; flex-shrink: 0; object-fit: contain; }
.title { flex: 1; text-align: center; line-height: 1; }
.cup { font-size: 0.6rem; letter-spacing: 0.28em; color: var(--azure); font-weight: 700; text-transform: uppercase; }
.title h1 { font-size: 1.5rem; margin-top: 2px; }
.title h1 em { color: var(--azure); font-style: normal; }

.active-bar {
  position: relative;
  display: flex; align-items: center; gap: 0.5rem; flex-wrap: wrap;
  padding: 0.5rem 1rem; font-size: 0.85rem;
  background: rgba(255, 255, 255, 0.02); border-bottom: 1px solid var(--line-soft);
}
.dot { width: 9px; height: 9px; border-radius: 50%; background: var(--azure); box-shadow: 0 0 8px var(--azure); }
.dot.ro { background: var(--gold); box-shadow: 0 0 8px var(--gold); }
.active-name {
  font-weight: 700; background: none; border: none; color: var(--text);
  font-size: 0.85rem; cursor: default; padding: 0.1rem 0.2rem; border-radius: 6px;
  display: inline-flex; align-items: center; gap: 0.35rem; font-family: inherit;
}
.active-name.editable { cursor: pointer; }
.active-name.editable:hover { background: rgba(255, 255, 255, 0.06); }
.active-name .pen { color: var(--azure); font-size: 0.75rem; opacity: 0.7; }
.name-input {
  background: var(--bg); border: 1px solid var(--azure); border-radius: 6px;
  color: var(--text); font-size: 0.85rem; font-weight: 700; padding: 0.2rem 0.45rem;
  font-family: inherit; max-width: 220px;
}
.ro-badge { color: var(--muted); font-size: 0.78rem; }
.mini { background: none; border: 1px solid var(--line); color: var(--azure); border-radius: 6px; padding: 0.05rem 0.4rem; margin-left: 0.3rem; cursor: pointer; font-size: 0.72rem; }
.champ-chip { margin-left: auto; color: var(--gold); font-weight: 700; }
/* Acciones-ícono del pronóstico activo, alineadas a la derecha (coherente con .tools del Sidebar). */
.bar-actions { display: flex; align-items: center; gap: 0.15rem; margin-left: auto; flex-shrink: 0; }
.bar-actions button {
  background: none; border: none; color: var(--muted); cursor: pointer;
  font-size: 0.85rem; line-height: 1; padding: 0.2rem 0.35rem; border-radius: 5px;
  font-family: inherit; display: inline-flex; align-items: center; justify-content: center;
}
.bar-actions svg { display: block; }
.bar-actions .pdf-img { display: block; width: 15px; height: 18px; }
.bar-actions button:hover { background: rgba(255, 255, 255, 0.1); color: var(--text); }
.bar-actions .share-i { color: var(--azure); }
.bar-actions .share-i:hover { background: rgba(65, 180, 255, 0.18); color: var(--azure); }
.bar-actions .danger-i:hover { background: rgba(255, 80, 80, 0.18); color: #ff8585; }

/* Selector de modo de juego */
.mode-bar {
  display: flex; align-items: center; gap: 0.6rem; flex-wrap: wrap;
  padding: 0.5rem 1rem; border-bottom: 1px solid var(--line-soft);
  background: rgba(255, 255, 255, 0.015);
}
.mode-label { color: var(--muted); font-size: 0.8rem; font-weight: 700; }
.mode-cur { color: var(--azure); }
.mode-clone {
  margin-left: auto; background: transparent; color: var(--azure);
  border: 1px solid var(--line); border-radius: 50px; padding: 0.3rem 0.8rem;
  cursor: pointer; font-family: inherit; font-weight: 700; font-size: 0.78rem;
}
.mode-clone:hover { background: rgba(65, 180, 255, 0.14); }

/* Modal selector de tipo (Nuevo / Clonar) */
.type-modal {
  background: var(--panel); border: 1px solid var(--line); border-radius: 16px;
  padding: 1.4rem; max-width: 360px; width: 100%; position: relative; box-shadow: var(--shadow);
}
.type-modal h3 { color: var(--azure); margin-bottom: 0.9rem; }
.type-opt {
  display: flex; flex-direction: column; gap: 0.15rem; width: 100%; text-align: left;
  background: var(--bg); border: 1px solid var(--line); border-radius: 10px;
  padding: 0.7rem 0.85rem; margin-bottom: 0.5rem; cursor: pointer; color: var(--text);
}
.type-opt:hover { border-color: var(--azure); background: var(--panel-2); }
.type-opt strong { color: var(--azure); }
.type-opt span { color: var(--muted); font-size: 0.78rem; }
.type-modal .x {
  position: absolute; top: 0.5rem; right: 0.7rem; background: none; border: none;
  color: var(--muted); font-size: 1.5rem; cursor: pointer; line-height: 1;
}

/* Aviso de incompleto */
.warn-modal {
  background: var(--panel); border: 1px solid var(--gold); border-radius: 16px;
  padding: 1.4rem; max-width: 360px; width: 100%; box-shadow: var(--shadow);
}
.warn-modal h3 { color: var(--gold); margin-bottom: 0.6rem; }
.warn-modal p { font-size: 0.88rem; color: var(--text); margin-bottom: 1rem; }
.warn-actions { display: flex; gap: 0.5rem; justify-content: flex-end; }
.warn-cancel {
  background: transparent; color: var(--muted); border: 1px solid var(--line);
  border-radius: 8px; padding: 0.5rem 1rem; cursor: pointer; font-weight: 700;
}
.warn-go {
  background: var(--gold); color: #3a2e00; border: none; border-radius: 8px;
  padding: 0.5rem 1rem; cursor: pointer; font-weight: 800;
}

/* Franja de confirmación de cambios pendientes */
.confirm-bar {
  display: flex; align-items: center; justify-content: space-between; gap: 0.7rem;
  flex-wrap: wrap; padding: 0.6rem 1rem;
  background: linear-gradient(90deg, rgba(255, 207, 63, 0.16), rgba(255, 207, 63, 0.06));
  border-bottom: 1px solid var(--gold);
}
.confirm-msg { color: var(--gold); font-size: 0.82rem; font-weight: 700; }
.confirm-btn {
  background: var(--gold); color: #2a1d00; border: none; border-radius: 50px;
  padding: 0.5rem 1.1rem; font-weight: 800; cursor: pointer; font-family: inherit;
  font-size: 0.85rem; white-space: nowrap; box-shadow: 0 4px 16px rgba(255, 207, 63, 0.35);
}
.confirm-btn:hover { filter: brightness(1.06); }

.tabs { display: flex; gap: 0.4rem; padding: 0.8rem 1rem 0; }
.tabs button {
  flex: 1; max-width: 240px; background: transparent; color: var(--muted);
  border: 1px solid var(--line); border-bottom: none;
  padding: 0.7rem; border-radius: 10px 10px 0 0; cursor: pointer; font-weight: 700;
  font-family: var(--font-display); letter-spacing: 0.02em; font-size: 0.95rem;
}
.tabs button.active { background: var(--panel); color: var(--text); border-color: var(--azure); box-shadow: 0 -2px 12px rgba(65,180,255,0.15); }

.content { flex: 1; padding: 1rem; }
.tab-hint { color: var(--muted); font-size: 0.83rem; margin-bottom: 0.9rem; text-align: center; }

.groups-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(230px, 1fr)); gap: 0.85rem; }
.thirds-wrap { display: block; margin-top: 1.2rem; max-width: 520px; }

.footer { display: flex; justify-content: center; padding: 1.5rem 1rem; color: var(--muted); font-size: 0.82rem; }

/* Import modal */
.overlay {
  position: fixed; inset: 0; background: rgba(0, 0, 0, 0.65);
  display: flex; align-items: center; justify-content: center; z-index: 300; padding: 1rem;
}
.import-modal {
  background: var(--panel); border: 1px solid var(--line); border-radius: 16px;
  padding: 1.4rem; max-width: 380px; width: 100%; position: relative; box-shadow: var(--shadow);
}
.import-modal .x { position: absolute; top: 0.5rem; right: 0.7rem; background: none; border: none; color: var(--muted); font-size: 1.5rem; cursor: pointer; }
.import-modal h3 { color: var(--azure); margin-bottom: 0.4rem; }
.imp-help { font-size: 0.82rem; color: var(--muted); margin-bottom: 0.7rem; }
.import-modal textarea {
  width: 100%; background: var(--bg); border: 1px solid var(--line); border-radius: 10px;
  color: var(--text); padding: 0.6rem; font-size: 0.85rem; resize: vertical; font-family: monospace;
}
.imp-err { color: #ff6b6b; font-size: 0.8rem; margin-top: 0.5rem; }
.imp-go {
  margin-top: 0.8rem; width: 100%; background: var(--azure); color: #042038; border: none;
  border-radius: 10px; padding: 0.7rem; font-weight: 800; cursor: pointer;
}
.imp-go:disabled { opacity: 0.5; cursor: default; }

@media (max-width: 480px) {
  .title h1 { font-size: 1.25rem; }
  .cup { letter-spacing: 0.2em; }
}
</style>
