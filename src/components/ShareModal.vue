<script setup lang="ts">
import { ref, watch, nextTick } from 'vue'
import { useI18n } from 'vue-i18n'
import QRCode from 'qrcode'
import { buildShareUrl } from '../lib/share'

const { t } = useI18n()

const props = defineProps<{ code: string; open: boolean }>()
const emit = defineEmits<{ close: []; print: [url: string]; pdf: [url: string] }>()

const canvas = ref<HTMLCanvasElement | null>(null)
const url = ref('')
const nickname = ref<string | undefined>(undefined)
const state = ref<'loading' | 'ready' | 'error'>('loading')
const error = ref('')
const copied = ref(false)

async function generate () {
  state.value = 'loading'
  error.value = ''
  copied.value = false
  try {
    const res = await buildShareUrl(props.code)
    url.value = res.url
    nickname.value = res.nickname
    state.value = 'ready'
    await nextTick()
    if (canvas.value) {
      await QRCode.toCanvas(canvas.value, res.url, { width: 256, margin: 1, errorCorrectionLevel: 'M' })
    }
  } catch (e: unknown) {
    state.value = 'error'
    error.value = e instanceof Error ? e.message : String(e)
  }
}

watch(() => props.open, (o) => { if (o) generate() })

async function copy () {
  try {
    await navigator.clipboard.writeText(url.value)
    copied.value = true
    setTimeout(() => { copied.value = false }, 1800)
  } catch { /* ignore */ }
}

// Texto corto para compartir en redes sociales (traducido).
const shareText = () => t('share.shareText')

// Abre un enlace de compartir en una pestaña nueva (sin acceso al opener)
function openShare (href: string): void {
  window.open(href, '_blank', 'noopener')
}

// WhatsApp: texto + enlace en el mismo parámetro
function shareWhatsApp (): void {
  openShare('https://wa.me/?text=' + encodeURIComponent(shareText() + ' ' + url.value))
}

// Telegram: enlace y texto en parámetros separados
function shareTelegram (): void {
  openShare('https://t.me/share/url?url=' + encodeURIComponent(url.value) + '&text=' + encodeURIComponent(shareText()))
}

// X (Twitter): intent de tweet
function shareX (): void {
  openShare('https://twitter.com/intent/tweet?text=' + encodeURIComponent(shareText()) + '&url=' + encodeURIComponent(url.value))
}

// Facebook: sharer clásico
function shareFacebook (): void {
  openShare('https://www.facebook.com/sharer/sharer.php?u=' + encodeURIComponent(url.value))
}

// "Más" / Instagram: usa la Web Share API nativa (en móvil permite elegir Instagram u otras apps).
// Si no está disponible, copia el enlace como fallback.
async function shareNative (): Promise<void> {
  if (typeof navigator.share === 'function') {
    try {
      await navigator.share({ title: shareText(), text: shareText(), url: url.value })
    } catch { /* el usuario canceló o falló: lo ignoramos */ }
  } else {
    await copy()
  }
}
</script>

<template>
  <div v-if="open" class="overlay" @click.self="emit('close')">
    <div class="modal">
      <button class="close" @click="emit('close')" :aria-label="t('common.close')">×</button>
      <h3>{{ t('share.title') }}</h3>

      <div v-if="state === 'loading'" class="status">{{ t('share.signing') }}</div>

      <div v-else-if="state === 'error'" class="status err">
        <p>{{ t('share.signError') }}</p>
        <p class="detail">{{ error }}</p>
        <button class="retry" @click="generate">{{ t('common.retry') }}</button>
      </div>

      <template v-else>
        <i18n-t keypath="share.signedBy" tag="p" class="author" scope="global">
          <template #name><strong>{{ nickname || t('share.anonIdentity') }}</strong></template>
        </i18n-t>
        <canvas ref="canvas" class="qr"></canvas>
        <p class="caption">{{ t('share.scan') }} <strong>mundial.closer.click</strong></p>
        <div class="url-row">
          <input :value="url" readonly @focus="($event.target as HTMLInputElement).select()" />
          <button class="copy" @click="copy">{{ copied ? '✓' : t('common.copy') }}</button>
        </div>
        <div class="social" role="group" :aria-label="t('share.socialGroup')">
          <button class="ico wa" @click="shareWhatsApp" :aria-label="t('share.shareWhatsApp')" title="WhatsApp">
            <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor" aria-hidden="true"><path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2Zm0 18.2a8.2 8.2 0 0 1-4.2-1.2l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 1 1 12 20.2Zm4.5-6.1c-.2-.1-1.4-.7-1.7-.8-.2-.1-.4-.1-.5.1l-.7.9c-.1.2-.3.2-.5.1a6.7 6.7 0 0 1-2-1.2 7.4 7.4 0 0 1-1.4-1.7c-.1-.2 0-.4.1-.5l.4-.4.2-.4c.1-.1 0-.3 0-.4l-.7-1.7c-.2-.5-.4-.4-.5-.4h-.5a.9.9 0 0 0-.7.3 2.8 2.8 0 0 0-.9 2.1c0 1.2.9 2.4 1 2.6.1.2 1.8 2.7 4.3 3.8.6.3 1.1.4 1.5.5.6.2 1.2.2 1.6.1.5-.1 1.4-.6 1.6-1.1.2-.6.2-1 .1-1.1l-.4-.2Z"/></svg>
          </button>
          <button class="ico tg" @click="shareTelegram" :aria-label="t('share.shareTelegram')" title="Telegram">
            <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor" aria-hidden="true"><path d="M21.9 4.3 18.6 19.7c-.2 1.1-.9 1.4-1.8.9l-4.9-3.6-2.4 2.3c-.3.3-.5.5-1 .5l.3-4.9 9-8.1c.4-.3-.1-.5-.6-.2L6.3 13l-4.8-1.5c-1-.3-1-1 .2-1.5L20.6 2.8c.9-.3 1.6.2 1.3 1.5Z"/></svg>
          </button>
          <button class="ico x" @click="shareX" :aria-label="t('share.shareX')" title="X">
            <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true"><path d="M18.2 2h3.3l-7.2 8.3L23 22h-6.6l-5.2-6.8L5.3 22H2l7.7-8.8L1.4 2H8l4.7 6.2L18.2 2Zm-1.2 18h1.8L7.1 3.9H5.2L17 20Z"/></svg>
          </button>
          <button class="ico fb" @click="shareFacebook" :aria-label="t('share.shareFacebook')" title="Facebook">
            <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor" aria-hidden="true"><path d="M22 12a10 10 0 1 0-11.6 9.9v-7H7.9V12h2.5V9.8c0-2.5 1.5-3.9 3.8-3.9 1.1 0 2.2.2 2.2.2v2.5h-1.2c-1.2 0-1.6.8-1.6 1.6V12h2.7l-.4 2.9h-2.3v7A10 10 0 0 0 22 12Z"/></svg>
          </button>
          <button class="ico ig" @click="shareNative" :aria-label="t('share.shareNative')" :title="t('share.shareMore')">
            <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor" aria-hidden="true"><path d="M12 2.2c3.2 0 3.6 0 4.9.1 1.2.1 1.8.3 2.2.4.6.2 1 .5 1.4.9.4.4.7.8.9 1.4.2.4.3 1 .4 2.2.1 1.3.1 1.7.1 4.9s0 3.6-.1 4.9c-.1 1.2-.3 1.8-.4 2.2-.2.6-.5 1-.9 1.4-.4.4-.8.7-1.4.9-.4.2-1 .3-2.2.4-1.3.1-1.7.1-4.9.1s-3.6 0-4.9-.1c-1.2-.1-1.8-.3-2.2-.4a3.8 3.8 0 0 1-1.4-.9 3.8 3.8 0 0 1-.9-1.4c-.2-.4-.3-1-.4-2.2C2.2 15.6 2.2 15.2 2.2 12s0-3.6.1-4.9c.1-1.2.3-1.8.4-2.2.2-.6.5-1 .9-1.4.4-.4.8-.7 1.4-.9.4-.2 1-.3 2.2-.4C8.4 2.2 8.8 2.2 12 2.2Zm0 1.8c-3.1 0-3.5 0-4.7.1-.9 0-1.4.2-1.7.3-.4.2-.7.4-1 .7-.3.3-.5.6-.7 1-.1.3-.3.8-.3 1.7-.1 1.2-.1 1.6-.1 4.7s0 3.5.1 4.7c0 .9.2 1.4.3 1.7.2.4.4.7.7 1 .3.3.6.5 1 .7.3.1.8.3 1.7.3 1.2.1 1.6.1 4.7.1s3.5 0 4.7-.1c.9 0 1.4-.2 1.7-.3.4-.2.7-.4 1-.7.3-.3.5-.6.7-1 .1-.3.3-.8.3-1.7.1-1.2.1-1.6.1-4.7s0-3.5-.1-4.7c0-.9-.2-1.4-.3-1.7a2.8 2.8 0 0 0-.7-1 2.8 2.8 0 0 0-1-.7c-.3-.1-.8-.3-1.7-.3-1.2-.1-1.6-.1-4.7-.1Zm0 3.1a4.9 4.9 0 1 1 0 9.8 4.9 4.9 0 0 1 0-9.8Zm0 8.1a3.2 3.2 0 1 0 0-6.4 3.2 3.2 0 0 0 0 6.4Zm6.2-8.3a1.1 1.1 0 1 1-2.3 0 1.1 1.1 0 0 1 2.3 0Z"/></svg>
          </button>
        </div>
        <div class="print-row">
          <button class="act-btn print" @click="emit('print', url)">
            <span class="ico">🖨</span> {{ t('common.print') }}
          </button>
          <button class="act-btn pdf" @click="emit('pdf', url)">
            <img src="/pdf.svg" alt="" class="pdf-ico" /> {{ t('common.pdf') }}
          </button>
        </div>
      </template>
    </div>
  </div>
</template>

<style scoped>
.overlay {
  position: fixed; inset: 0; background: rgba(0, 0, 0, 0.65);
  display: flex; align-items: center; justify-content: center; z-index: 1000; padding: 1rem;
}
.modal {
  background: var(--panel); border: 1px solid var(--line); border-radius: 16px;
  padding: 1.5rem; max-width: 340px; width: 100%; position: relative; text-align: center;
  box-shadow: var(--shadow);
}
.close {
  position: absolute; top: 0.5rem; right: 0.7rem; background: none; border: none;
  color: var(--muted); font-size: 1.6rem; cursor: pointer; line-height: 1;
}
h3 { margin-bottom: 1rem; color: var(--green); }
.status { padding: 1.5rem 0; color: var(--muted); }
.status.err { color: #e74c3c; }
.detail { font-size: 0.8rem; margin-top: 0.5rem; word-break: break-word; }
.retry, .copy {
  background: var(--green-d); color: #fff; border: none; padding: 0.5rem 1rem;
  border-radius: 8px; cursor: pointer; font-weight: 600;
}
.retry { margin-top: 0.8rem; }
.print-row { display: flex; gap: 0.5rem; margin-top: 0.8rem; }
.act-btn {
  flex: 1; border: none; border-radius: 8px; padding: 0.6rem; font-weight: 800;
  cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 0.4rem;
}
.act-btn .ico { font-size: 1.05rem; }
.act-btn .pdf-ico { display: block; width: 15px; height: 18px; flex-shrink: 0; }
.act-btn:hover { filter: brightness(1.06); }
/* Imprimir: contorno azul (acción "ligera"). */
.act-btn.print { background: transparent; color: var(--azure); border: 1.5px solid var(--azure); }
/* Descargar PDF: fondo claro con borde rojo para que se vea el ícono oficial. */
.act-btn.pdf { background: #fff; color: #b3160c; border: 1.5px solid #d4362d; }
.author { font-size: 0.9rem; margin-bottom: 0.8rem; }
.qr { width: 256px; height: 256px; max-width: 100%; border-radius: 8px; background: #fff; }
.caption { font-size: 0.82rem; color: var(--muted); margin: 0.7rem 0; }
.url-row { display: flex; gap: 0.4rem; }
.url-row input {
  flex: 1; min-width: 0; background: var(--bg); border: 1px solid var(--line);
  border-radius: 8px; padding: 0.5rem; color: var(--text); font-size: 0.78rem;
}
/* Fila de botones de redes sociales */
.social {
  display: flex; flex-wrap: wrap; gap: 0.5rem; justify-content: center;
  margin-top: 0.9rem;
}
.ico {
  width: 40px; height: 40px; border-radius: 50%; border: none; cursor: pointer;
  display: inline-flex; align-items: center; justify-content: center;
  color: #fff; transition: filter 0.15s ease, transform 0.1s ease;
}
.ico:hover { filter: brightness(1.1); }
.ico:active { transform: scale(0.94); }
.ico.wa { background: #25d366; }
.ico.tg { background: #2aabee; }
.ico.x  { background: #000; border: 1px solid var(--line); }
.ico.fb { background: #1877f2; }
.ico.ig { background: linear-gradient(45deg, #feda75, #fa7e1e, #d62976, #962fbf, #4f5bd5); }
</style>
