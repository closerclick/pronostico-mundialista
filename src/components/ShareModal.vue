<script setup lang="ts">
import { ref, watch, nextTick } from 'vue'
import QRCode from 'qrcode'
import { buildShareUrl } from '../lib/share'

const props = defineProps<{ code: string; open: boolean }>()
const emit = defineEmits<{ close: [] }>()

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
</script>

<template>
  <div v-if="open" class="overlay" @click.self="emit('close')">
    <div class="modal">
      <button class="close" @click="emit('close')" aria-label="Cerrar">×</button>
      <h3>Compartir pronóstico</h3>

      <div v-if="state === 'loading'" class="status">Firmando con tu identidad…</div>

      <div v-else-if="state === 'error'" class="status err">
        <p>No se pudo firmar el pronóstico.</p>
        <p class="detail">{{ error }}</p>
        <button class="retry" @click="generate">Reintentar</button>
      </div>

      <template v-else>
        <p class="author">
          Firmado por <strong>{{ nickname || 'identidad anónima' }}</strong>
        </p>
        <canvas ref="canvas" class="qr"></canvas>
        <p class="caption">Escanea para abrir en <strong>mundial.closer.click</strong></p>
        <div class="url-row">
          <input :value="url" readonly @focus="($event.target as HTMLInputElement).select()" />
          <button class="copy" @click="copy">{{ copied ? '✓' : 'Copiar' }}</button>
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
.author { font-size: 0.9rem; margin-bottom: 0.8rem; }
.qr { width: 256px; height: 256px; max-width: 100%; border-radius: 8px; background: #fff; }
.caption { font-size: 0.82rem; color: var(--muted); margin: 0.7rem 0; }
.url-row { display: flex; gap: 0.4rem; }
.url-row input {
  flex: 1; min-width: 0; background: var(--bg); border: 1px solid var(--line);
  border-radius: 8px; padding: 0.5rem; color: var(--text); font-size: 0.78rem;
}
</style>
