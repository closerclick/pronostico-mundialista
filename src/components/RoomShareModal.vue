<script setup lang="ts">
import { ref, watch, nextTick } from 'vue'
import { useI18n } from 'vue-i18n'
import QRCode from 'qrcode'
import { buildRoomInviteUrl } from '../lib/room'
import { useRooms } from '../composables/useRooms'
import SocialShareButtons from './SocialShareButtons.vue'

const { t } = useI18n()
const { activeRoom, roomShareOpen } = useRooms()

const url = ref('')
const qr = ref('')
const copied = ref(false)
const state = ref<'loading' | 'ready' | 'error'>('loading')

async function generate () {
  const room = activeRoom.value
  url.value = ''; qr.value = ''; copied.value = false
  if (!room) return
  state.value = 'loading'
  try {
    const { url: u } = await buildRoomInviteUrl({
      id: room.id, name: room.name, mode: room.mode, sealedUntil: room.sealedUntil, createdAt: room.createdAt,
    })
    url.value = u
    state.value = 'ready'
    await nextTick()
    qr.value = await QRCode.toDataURL(u, { margin: 1, width: 320 })
  } catch { state.value = 'error' }
}

watch(roomShareOpen, (open) => { if (open) generate() })

function close () { roomShareOpen.value = false }
async function copy () {
  try { await navigator.clipboard.writeText(url.value); copied.value = true; setTimeout(() => { copied.value = false }, 1800) } catch { /* */ }
}
function shareNative () {
  if (navigator.share) navigator.share({ url: url.value, title: activeRoom.value?.name }).catch(() => {})
  else copy()
}
</script>

<template>
  <div v-if="roomShareOpen" class="overlay" @click.self="close">
    <div class="modal">
      <button class="close" @click="close" :aria-label="t('common.close')">×</button>
      <h3>🏟 {{ activeRoom?.name }}</h3>
      <p class="caption">{{ t('rooms.invite') }}</p>

      <div v-if="state === 'error'" class="status err">{{ t('rooms.invalidInvite') }}</div>
      <template v-else>
        <img v-if="qr" :src="qr" class="qr" :alt="t('rooms.inviteQr')" />
        <div class="url-row">
          <input :value="url" readonly @focus="($event.target as HTMLInputElement).select()" />
          <button class="copy" @click="copy">{{ copied ? '✓' : t('rooms.copyLink') }}</button>
        </div>
        <SocialShareButtons v-if="url" :url="url" :text="activeRoom?.name" class="social-row" />
        <button class="native" @click="shareNative">{{ t('common.share') }}</button>
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
h3 { margin-bottom: 0.3rem; color: var(--green); }
.caption { font-size: 0.82rem; color: var(--muted); margin-bottom: 1rem; }
.status.err { color: #e74c3c; padding: 1rem 0; }
.qr { width: 240px; height: 240px; max-width: 100%; border-radius: 8px; background: #fff; padding: 4px; }
.url-row { display: flex; gap: 0.4rem; margin-top: 0.8rem; }
.url-row input {
  flex: 1; min-width: 0; background: var(--bg); border: 1px solid var(--line);
  border-radius: 8px; padding: 0.5rem; color: var(--text); font-size: 0.78rem;
}
.copy {
  background: var(--green-d); color: #fff; border: none; padding: 0.5rem 1rem;
  border-radius: 8px; cursor: pointer; font-weight: 600; white-space: nowrap;
}
.social-row { margin-top: 0.9rem; }
.native {
  margin-top: 0.9rem; width: 100%; background: transparent; color: var(--azure);
  border: 1px solid var(--azure); border-radius: 8px; padding: 0.55rem; font-weight: 700; cursor: pointer;
}
</style>
