<script setup lang="ts">
import { reactive, ref, computed, watch, onMounted, onUnmounted, nextTick } from 'vue'
import { GROUPS, teamById } from './lib/teams'
import { defaultPrediction, clonePrediction, champion, prunePicks, type Prediction } from './lib/prediction'
import { encodePrediction, decodePrediction } from './lib/codec'
import { parseShareFragment, buildShareUrl } from './lib/share'
import {
  loadLibrary, saveLibrary, getActiveId, setActiveId, genId, type SavedPrediction,
} from './lib/store'
import GroupCard from './components/GroupCard.vue'
import ThirdsBlock from './components/ThirdsBlock.vue'
import BracketTab from './components/BracketTab.vue'
import ShareModal from './components/ShareModal.vue'
import PrintView from './components/PrintView.vue'
import Sidebar from './components/Sidebar.vue'
import QRCode from 'qrcode'
import IdentityPanel from './components/IdentityPanel.vue'
import jsPDF from 'jspdf'
import html2canvas from 'html2canvas'

const library = ref<SavedPrediction[]>([])
const activeId = ref<string | null>(null)
const pred = reactive<Prediction>(defaultPrediction())
const tab = ref<'grupos' | 'llaves'>('grupos')
const sidebarOpen = ref(false)
const shareOpen = ref(false)
const shareEntryId = ref<string | null>(null)
const identityOpen = ref(false)
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
  if (isIOS) alert('Para instalar: pulsa el botón Compartir y luego "Añadir a pantalla de inicio".')
  else alert('Usa el menú de tu navegador para instalar la app.')
}

let loading = false // evita persistir mientras cargamos un pronóstico

const activeEntry = computed(() => library.value.find((p) => p.id === activeId.value) ?? null)
const readonly = computed(() => (activeEntry.value ? !activeEntry.value.mine : false))
const championId = computed(() => champion(pred))

// Código a firmar/compartir: el del pronóstico elegido en la barra lateral
// (o el activo si se comparte sin elegir).
const shareCode = computed(() => {
  const entry = library.value.find((p) => p.id === shareEntryId.value)
  if (entry) return entry.id === activeId.value ? encodePrediction(pred) : entry.code
  return encodePrediction(pred)
})

function openShare (id: string) {
  shareEntryId.value = id
  shareOpen.value = true
}

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
  try { return decodePrediction(entry.code) } catch { return null }
}

// Disparado por ShareModal con la URL firmada ya armada: generamos el QR de esa
// misma URL, poblamos PrintView y lanzamos el diálogo de impresión del navegador.
async function handlePrint (url: string) {
  const entry = library.value.find((p) => p.id === shareEntryId.value)
  printPred.value = predForEntry(shareEntryId.value)
  if (!printPred.value) return
  printTitle.value = entry?.name || activeEntry.value?.name || 'Pronóstico Mundial 2026'
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
  printTitle.value = entry?.name || activeEntry.value?.name || 'Pronóstico Mundial 2026'
  printAuthor.value = entry?.author?.nickname ?? activeEntry.value?.author?.nickname
  try {
    printQr.value = await QRCode.toDataURL(url, { margin: 1, width: 512 })
    shareOpen.value = false
    pdfCapturing.value = true
    await nextTick()
    // El contenedor envuelve al PrintView; capturamos su primer hijo (la hoja).
    const el = printView.value?.firstElementChild as HTMLElement | null
    if (!el) throw new Error('No se encontró la hoja a capturar.')
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
    alert('No se pudo generar el PDF. ' + (e instanceof Error ? e.message : ''))
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
    const { url } = await buildShareUrl(code)
    await downloadPdf(url)
  } catch (e: unknown) {
    alert('No se pudo generar el PDF. ' + (e instanceof Error ? e.message : ''))
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
    const { url } = await buildShareUrl(code)
    await handlePrint(url)
  } catch (e: unknown) {
    alert('No se pudo preparar la impresión. ' + (e instanceof Error ? e.message : ''))
  }
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
  if (readonly.value || !activeEntry.value) return
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
  pred.groupOrder = p.groupOrder
  pred.thirdsRank = p.thirdsRank
  pred.picks = p.picks
  nextTick(() => { loading = false })
}

function persistActive () {
  const entry = activeEntry.value
  if (!entry || !entry.mine) return
  prunePicks(pred)
  entry.code = encodePrediction(pred)
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
  sidebarOpen.value = false
}

function uniqueName () {
  const n = library.value.filter((p) => p.mine).length + 1
  return `Mi pronóstico ${n}`
}

function create () {
  const entry: SavedPrediction = {
    id: genId(), name: uniqueName(),
    code: encodePrediction(defaultPrediction()),
    updatedAt: Date.now(), mine: true,
  }
  library.value.push(entry)
  saveLibrary(library.value)
  select(entry.id)
  tab.value = 'grupos'
}

function remove (id: string) {
  const entry = library.value.find((p) => p.id === id)
  if (!entry) return
  if (!confirm(`¿Eliminar "${entry.name}"?`)) return
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
  const name = prompt('Nombre del pronóstico', entry.name)
  if (name && name.trim()) { entry.name = name.trim(); saveLibrary(library.value) }
}

function copyToMine (id: string) {
  const entry = library.value.find((p) => p.id === id)
  if (!entry) return
  const copy: SavedPrediction = {
    id: genId(), name: entry.name + ' (copia)', code: entry.code,
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
    if (!parsed) throw new Error('No se pudo leer un pronóstico válido del enlace.')
    decodePrediction(parsed.code) // valida
    const entry: SavedPrediction = {
      id: genId(),
      name: (parsed.nickname || 'Pronóstico importado'),
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

onMounted(async () => {
  window.addEventListener('beforeinstallprompt', onBeforeInstallPrompt)
  window.addEventListener('appinstalled', onAppInstalled)

  library.value = loadLibrary()

  const frag = location.hash.replace(/^#/, '')
  if (frag) {
    const parsed = await parseShareFragment(frag)
    history.replaceState(null, '', location.pathname + location.search)
    if (parsed) {
      try {
        decodePrediction(parsed.code)
        const entry: SavedPrediction = {
          id: genId(), name: parsed.nickname || 'Pronóstico compartido',
          code: parsed.code, updatedAt: Date.now(), mine: false,
          author: { publickey: parsed.publickey, nickname: parsed.nickname, verified: parsed.verified },
        }
        library.value.push(entry)
        saveLibrary(library.value)
        select(entry.id)
        tab.value = 'llaves'
        return
      } catch { /* cae al flujo normal */ }
    }
  }

  const saved = getActiveId()
  if (saved && library.value.some((p) => p.id === saved)) select(saved)
  else if (library.value.length) select(library.value[0]!.id)
  else create()
})

onUnmounted(() => {
  window.removeEventListener('beforeinstallprompt', onBeforeInstallPrompt)
  window.removeEventListener('appinstalled', onAppInstalled)
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
      @create="create"
      @import="importOpen = true; sidebarOpen = false"
      @remove="remove"
      @rename="rename"
      @copy="copyToMine"
      @share="openShare"
      @print="printEntry"
      @pdf="pdfEntry"
    />
    <div class="main">
    <header class="scoreboard">
      <button class="menu" @click="sidebarOpen = true" aria-label="Mis pronósticos">☰</button>
      <img src="/favicon.svg" alt="Logo" class="brand-logo" />
      <div class="title">
        <span class="cup">Mundial · 48 selecciones</span>
        <h1>Pronóstico <em>2026</em></h1>
      </div>
      <div class="hdr-right">
        <!-- Botón circular de identidad (siempre visible) -->
        <button class="identity-btn" @click="openProfile" aria-label="Mi identidad" title="Mi identidad">👤</button>
      </div>
    </header>

    <div class="active-bar">
      <button v-if="!isStandalone" class="install-float" @click="installApp">Instalar App</button>
      <span class="dot" :class="{ ro: readonly }"></span>
      <input
        v-if="editingName"
        ref="nameInput"
        v-model="nameDraft"
        class="name-input"
        maxlength="40"
        @keydown.enter="commitName"
        @keydown.esc="editingName = false"
        @blur="commitName"
      />
      <button
        v-else
        class="active-name"
        :class="{ editable: !readonly }"
        :title="readonly ? '' : 'Editar nombre'"
        @click="startEditName"
      >
        {{ activeEntry?.name || '—' }}<span v-if="!readonly" class="pen">✎</span>
      </button>
      <span v-if="readonly" class="ro-badge">
        {{ activeEntry?.author?.verified ? '✓ firmado' : '⚠ sin verificar' }}
        · {{ activeEntry?.author?.nickname || 'anónimo' }}
        <button class="mini" @click="rateAuthor">valorar autor</button>
        <button class="mini" @click="activeEntry && copyToMine(activeEntry.id)">editar copia</button>
      </span>
      <span v-else-if="championId != null" class="champ-chip">
        🏆 {{ teamById(championId).flag }} {{ teamById(championId).code }}
      </span>

      <!-- Acciones del pronóstico ACTIVO (alineadas a la derecha) -->
      <div v-if="activeId" class="bar-actions">
        <button class="share-i" title="Compartir" @click="openShare(activeId)">
          <svg viewBox="0 0 24 24" width="17" height="17" fill="currentColor" aria-hidden="true">
            <path d="M18 16.08c-.76 0-1.44.3-1.96.77L8.91 12.7c.05-.23.09-.46.09-.7s-.04-.47-.09-.7l7.05-4.11c.54.5 1.25.81 2.04.81 1.66 0 3-1.34 3-3s-1.34-3-3-3-3 1.34-3 3c0 .24.04.47.09.7L8.04 9.81C7.5 9.31 6.79 9 6 9c-1.66 0-3 1.34-3 3s1.34 3 3 3c.79 0 1.5-.31 2.04-.81l7.12 4.16c-.05.21-.08.43-.08.65 0 1.61 1.31 2.92 2.92 2.92s2.92-1.31 2.92-2.92-1.31-2.92-2.92-2.92z" />
          </svg>
        </button>
        <button title="Imprimir" @click="printEntry(activeId)">🖨</button>
        <button class="pdf-i" title="Descargar PDF" @click="pdfEntry(activeId)">
          <img src="/pdf.svg" alt="PDF" class="pdf-img" />
        </button>
        <button v-if="!readonly" title="Renombrar" @click="startEditName">✎</button>
        <button v-if="readonly" title="Editar copia" @click="copyToMine(activeId)">⎘</button>
        <button class="danger-i" title="Eliminar" @click="remove(activeId)">🗑</button>
      </div>
    </div>

    <nav class="tabs">
      <button :class="{ active: tab === 'grupos' }" @click="tab = 'grupos'">Fase de grupos</button>
      <button :class="{ active: tab === 'llaves' }" @click="tab = 'llaves'">Llaves</button>
    </nav>

    <main class="content">
      <section v-show="tab === 'grupos'" class="scrolly">
        <p class="tab-hint">
          {{ readonly ? 'Pronóstico de solo lectura.' : 'Arrastra para ordenar cada grupo (1.º y 2.º clasifican directo).' }}
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
      </section>

      <section v-show="tab === 'llaves'">
        <BracketTab :pred="pred" :readonly="readonly" />
      </section>
    </main>

    <footer class="footer">
      <span class="eco">Ecosistema <a href="https://closer.click" target="_blank" rel="noopener">Closer Click</a></span>
    </footer>

    <ShareModal
      :code="shareCode"
      :open="shareOpen"
      @close="shareOpen = false"
      @print="handlePrint"
      @pdf="downloadPdf"
    />

    <IdentityPanel
      :open="identityOpen"
      :focus-pubkey="identityFocus"
      @close="identityOpen = false"
      @changed="library = [...library]"
    />

    <div v-if="importOpen" class="overlay" @click.self="importOpen = false">
      <div class="import-modal">
        <button class="x" @click="importOpen = false" aria-label="Cerrar">×</button>
        <h3>Importar pronóstico</h3>
        <p class="imp-help">Pega el enlace (o el código tras <code>#</code>) que te compartieron.</p>
        <textarea
          v-model="importText"
          rows="3"
          placeholder="https://mundial.closer.click/#..."
          @keydown.stop
        ></textarea>
        <p v-if="importError" class="imp-err">{{ importError }}</p>
        <button class="imp-go" :disabled="importing || !importText.trim()" @click="doImport">
          {{ importing ? 'Verificando…' : 'Importar y verificar' }}
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
  .shell { display: flex; align-items: stretch; height: 100vh; overflow: hidden; }
  .main { flex: 1; height: 100vh; min-height: 0; }
  .menu { display: none; }
  .scoreboard { padding-left: 1.2rem; }

  /* El contenido es una columna flexible que llena el alto restante. */
  .content { display: flex; flex-direction: column; overflow: hidden; min-height: 0; }
  .content > section { flex: 1; min-height: 0; display: flex; flex-direction: column; }

  /* Grupos: muchos grupos, se permite scroll vertical interno. */
  .content > section.scrolly { overflow-y: auto; }

  /* Llaves: sin scroll; el bracket llena el alto disponible. */

  /* En escritorio el footer no debe empujar el alto. */
  .footer { flex-shrink: 0; }
}

/* XL: en pantallas muy anchas acolchamos el contenido a los lados para que el
   ancho útil quede parecido al de "lg" (no se estira de borde a borde). */
@media (min-width: 1400px) {
  .content { padding-inline: clamp(1rem, calc((100% - 1100px) / 2), 16rem); }
  .active-bar { padding-inline: clamp(1rem, calc((100% - 1100px) / 2), 16rem); }
}

.hdr-right { display: flex; align-items: center; gap: 0.5rem; flex-shrink: 0; }
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
