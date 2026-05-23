<script setup lang="ts">
import { ref, watch, nextTick } from 'vue'
import { useI18n } from 'vue-i18n'
import QRCode from 'qrcode'
import { buildShareUrl } from '../lib/share'
import SocialShareButtons from './SocialShareButtons.vue'

const { t } = useI18n()

const props = defineProps<{ code: string; open: boolean; name?: string; presetUrl?: string | null }>()
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
    // Pronóstico ajeno: reusamos su enlace original (ya firmado por su autor),
    // sin volver a firmar con la identidad propia.
    if (props.presetUrl) {
      url.value = props.presetUrl
      nickname.value = undefined
    } else {
      const res = await buildShareUrl(props.code, props.name)
      url.value = res.url
      nickname.value = res.nickname
    }
    state.value = 'ready'
    await nextTick()
    if (canvas.value) {
      await QRCode.toCanvas(canvas.value, url.value, { width: 256, margin: 1, errorCorrectionLevel: 'M' })
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
        <SocialShareButtons :url="url" class="social-row" />
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
.social-row { margin-top: 0.9rem; }
</style>
