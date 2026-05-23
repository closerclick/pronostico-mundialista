<script setup lang="ts">
import { ref, computed, watch, nextTick, inject } from 'vue'
import { useI18n } from 'vue-i18n'
import QRCode from 'qrcode'
import { buildShareUrl } from '../lib/share'
import type { SavedPrediction } from '../lib/store'
import { decodePrediction } from '../lib/codec'
import { isMemberSealed, upsertMember, type RoomMode, type RoomMember } from '../lib/roomStore'
import { buildRoomInviteUrl, buildMemberContribUrl, buildMemberEnvelope, buildRetractEnvelope, memberFromEnvelope, modeAllowed, TOURNAMENT_START } from '../lib/room'
import { sendRoomInvites } from '../lib/inbox'
import { useRooms } from '../composables/useRooms'
import { shortKey } from '../lib/rating'
import RoomLeaderboard from './RoomLeaderboard.vue'
import RoomCompare from './RoomCompare.vue'
import SocialShareButtons from './SocialShareButtons.vue'

const { t } = useI18n()

// Exige apodo antes de firmar (provisto por App): aportar a una sala firma con
// la identidad, igual que compartir, así que requiere tener apodo.
const ensureNick = inject<(run: () => void) => void>('ensureNick', (run) => run())

const props = defineProps<{
  library: SavedPrediction[]
  official: SavedPrediction | null
}>()

const {
  activeRoom, myPubkey, myNick, contacts, unreachable, roomTab,
  createRoom, joinByLink, persist, updateSyncFrag,
} = useRooms()

// --- Home (sin sala activa): crear + unirse, inline ------------------------
const cName = ref('')
const cMode = ref<RoomMode>('free')
const cSealed = ref(false)
const creating = ref(false)
const joinText = ref('')
const joinError = ref('')
const joining = ref(false)

async function doCreate () {
  if (creating.value || !cName.value.trim()) return
  creating.value = true
  try {
    await createRoom({ name: cName.value, mode: cMode.value, sealed: cSealed.value })
    cName.value = ''; cMode.value = 'free'; cSealed.value = false
  } finally { creating.value = false }
}

async function doJoin () {
  joinError.value = ''
  if (joining.value || !joinText.value.trim()) return
  joining.value = true
  try {
    await joinByLink(joinText.value)
    joinText.value = ''
  } catch { joinError.value = t('rooms.invalidInvite') } finally { joining.value = false }
}

// --- Detalle de sala --------------------------------------------------------
// La sub-pestaña activa vive en useRooms (compartida con barra lateral/header).
const rtab = roomTab

const myPredictions = computed(() => props.library.filter((p) => p.mine && !p.official))
function entryMode (p: SavedPrediction): string {
  if (p.mode) return p.mode
  try { return decodePrediction(p.code).mode } catch { return 'manual' }
}
const myMember = computed(() => activeRoom.value?.members.find((m) => m.publickey === myPubkey.value && !m.deleted) ?? null)
// Miembros visibles (sin lápidas de borrado).
const liveMembers = computed(() => activeRoom.value?.members.filter((m) => !m.deleted) ?? [])

// Estado del sello de tiempo de un miembro: cuándo existió su pronóstico, según
// el sellador (signer.closer.click). 'a tiempo' = sellado antes del inicio.
function sealInfo (m: RoomMember): { cls: string; icon: string; text: string } {
  const fmt = (ts: number) => new Date(ts).toLocaleString()
  if (m.sealedAt == null) return { cls: 'none', icon: '—', text: t('rooms.sealNone') }
  if (!m.sealValid) return { cls: 'bad', icon: '⚠', text: t('rooms.sealInvalid') }
  if (m.sealedAt < TOURNAMENT_START) return { cls: 'ok', icon: '🕓', text: t('rooms.sealOkAt', { date: fmt(m.sealedAt) }) }
  return { cls: 'late', icon: '⚠', text: t('rooms.sealLate', { date: fmt(m.sealedAt) }) }
}

function modeName (m: RoomMode): string {
  if (m === 'free') return t('rooms.modeFree')
  if (m === 'winlose') return t('modes.medium')
  if (m === 'score') return t('modes.full')
  return t('modes.simple')
}

// Contribuir mi pronóstico
const contributing = ref(false)
const contribError = ref('')
const contribShared = ref(false)
function contribute (entry: SavedPrediction) {
  const room = activeRoom.value
  if (!room || contributing.value) return
  contribError.value = ''
  if (!modeAllowed(room.mode, entryMode(entry))) { contribError.value = t('rooms.modeMismatch'); return }
  // Igual que al compartir: exige apodo (abre el perfil si falta) antes de firmar.
  ensureNick(() => { void doContribute(entry) })
}
async function doContribute (entry: SavedPrediction) {
  const room = activeRoom.value
  if (!room) return
  contributing.value = true
  try {
    const { url } = await buildShareUrl(entry.code, entry.name)
    const frag = url.split('#')[1] ?? ''
    // Sobre firmado por el autor con ts: ordena versiones (LWW) y habilita borrado.
    const env = await buildMemberEnvelope(room.id, frag, Date.now())
    const parsed = await memberFromEnvelope(env)
    if (!parsed) throw new Error(t('rooms.contribError'))
    parsed.member.nickname = parsed.member.nickname || myNick.value || undefined
    upsertMember(room, parsed.member)
    persist()
    updateSyncFrag(env)
  } catch (e) { contribError.value = e instanceof Error ? e.message : String(e) } finally { contributing.value = false }
}
async function removeMyContrib () {
  const room = activeRoom.value
  if (!room || !myPubkey.value) return
  if (!confirm(t('rooms.confirmRemoveContrib'))) return
  // Tombstone FIRMADO: solo yo puedo borrar lo mío, y al ir firmado con ts mayor
  // le gana a cualquier reenvío viejo de mi aporte (no se "revive").
  const env = await buildRetractEnvelope(room.id, Date.now())
  const parsed = await memberFromEnvelope(env)
  if (!parsed) return
  upsertMember(room, parsed.member)
  persist()
  updateSyncFrag(env) // difundo la lápida (online + cola offline)
}
async function shareMyContrib () {
  const room = activeRoom.value
  if (!room || !myMember.value?.env) return
  const url = buildMemberContribUrl(myMember.value.env)
  if (navigator.share) navigator.share({ url, title: room.name }).catch(() => {})
  else { try { await navigator.clipboard.writeText(url); contribShared.value = true; setTimeout(() => { contribShared.value = false }, 1800) } catch { /* */ } }
}

// Invitación (QR + enlace + contactos)
const inviteUrl = ref('')
const inviteQr = ref('')
const inviteCopied = ref(false)
const selectedContacts = ref<Set<string>>(new Set())
const inviting = ref(false)
const inviteStatus = ref('')

async function buildInvite () {
  const room = activeRoom.value
  inviteUrl.value = ''; inviteQr.value = ''
  if (!room) return
  try {
    const { url } = await buildRoomInviteUrl({
      id: room.id, name: room.name, mode: room.mode, sealedUntil: room.sealedUntil, createdAt: room.createdAt,
    })
    inviteUrl.value = url
    await nextTick()
    inviteQr.value = await QRCode.toDataURL(url, { margin: 1, width: 360 })
  } catch (e) { console.warn('No se pudo armar la invitación:', e) }
}
async function copyInvite () {
  try { await navigator.clipboard.writeText(inviteUrl.value); inviteCopied.value = true; setTimeout(() => { inviteCopied.value = false }, 1800) } catch { /* */ }
}
function shareInviteNative () {
  if (navigator.share) navigator.share({ url: inviteUrl.value, title: activeRoom.value?.name }).catch(() => {})
  else copyInvite()
}
function toggleContact (pk: string) {
  const s = new Set(selectedContacts.value)
  if (s.has(pk)) s.delete(pk); else s.add(pk)
  selectedContacts.value = s
}
async function inviteSelected () {
  if (inviting.value || !selectedContacts.value.size || !inviteUrl.value) return
  inviting.value = true
  inviteStatus.value = t('rooms.inviting')
  try {
    const sent = await sendRoomInvites([...selectedContacts.value], inviteUrl.value)
    inviteStatus.value = t('rooms.invited', { n: sent })
    selectedContacts.value = new Set()
  } finally { inviting.value = false }
}

// Reconstruir invitación al cambiar de sala. (La sub-pestaña la fija openRoom /
// shareRoom en useRooms, así la barra lateral puede abrir directo en "compartir".)
watch(activeRoom, (r) => {
  selectedContacts.value = new Set()
  inviteStatus.value = ''
  if (r) buildInvite()
}, { immediate: true })
</script>

<template>
  <!-- HOME: sin sala activa → crear / unirse (inline, como página) -->
  <div v-if="!activeRoom" class="home scrolly">
    <i18n-t v-if="unreachable" keypath="identity.unreachable" tag="p" class="warn" scope="global">
      <template #vault><code>id.closer.click</code></template>
    </i18n-t>

    <div class="cards">
      <section class="card">
        <h3>➕ {{ t('rooms.create') }}</h3>
        <label class="lbl">{{ t('rooms.name') }}</label>
        <input v-model="cName" maxlength="60" :placeholder="t('rooms.namePlaceholder')" @keydown.stop @keyup.enter="doCreate" />
        <label class="lbl">{{ t('rooms.mode') }}</label>
        <select v-model="cMode" class="sel">
          <option value="free">{{ t('rooms.modeFree') }}</option>
          <option value="manual">{{ t('modes.simple') }}</option>
          <option value="winlose">{{ t('modes.medium') }}</option>
          <option value="score">{{ t('modes.full') }}</option>
        </select>
        <label class="check"><input type="checkbox" v-model="cSealed" /><span>{{ t('rooms.sealOption') }}</span></label>
        <p class="hint">{{ cSealed ? t('rooms.sealOn') : t('rooms.sealOff') }}</p>
        <button class="primary full" :disabled="creating || !cName.trim()" @click="doCreate">{{ creating ? '…' : t('rooms.createConfirm') }}</button>
      </section>

      <section class="card">
        <h3>📥 {{ t('rooms.joinByLink') }}</h3>
        <input v-model="joinText" :placeholder="t('rooms.joinPlaceholder')" @keydown.stop @keyup.enter="doJoin" />
        <button class="primary full" :disabled="joining || !joinText.trim()" @click="doJoin">{{ joining ? '…' : t('rooms.join') }}</button>
        <p v-if="joinError" class="err">{{ joinError }}</p>
        <p class="hint">{{ t('rooms.selectHint') }}</p>
      </section>
    </div>
  </div>

  <!-- DETALLE: contenido de la sala activa -->
  <div v-else class="room scrolly">
    <!-- Aportar mi pronóstico -->
    <div v-if="!myMember" class="contribute">
      <p class="contribute-h">{{ t('rooms.contributePrompt') }}</p>
      <p v-if="!myPredictions.length" class="empty">{{ t('rooms.noMyPreds') }}</p>
      <div v-for="p in myPredictions" :key="p.id" class="pick">
        <span class="pick-nm">{{ p.name }} <small>{{ modeName(entryMode(p) as RoomMode) }}</small></span>
        <button class="go" :disabled="contributing || !modeAllowed(activeRoom.mode, entryMode(p))"
          :title="!modeAllowed(activeRoom.mode, entryMode(p)) ? t('rooms.modeMismatch') : ''" @click="contribute(p)">{{ t('rooms.contribute') }}</button>
      </div>
      <p v-if="contribError" class="err">{{ contribError }}</p>
    </div>
    <div v-else class="mine-note">
      <span>✓ {{ t('rooms.contributed') }}</span>
      <span class="mine-actions">
        <button class="go ghost mini-share" @click="shareMyContrib">{{ contribShared ? t('rooms.copied') : t('rooms.shareContrib') }}</button>
        <button class="go danger mini-share" @click="removeMyContrib">{{ t('rooms.removeContrib') }}</button>
      </span>
    </div>

    <nav class="rtabs">
      <button :class="{ on: rtab === 'table' }" @click="rtab = 'table'">{{ t('rooms.tabTable') }}</button>
      <button :class="{ on: rtab === 'compare' }" @click="rtab = 'compare'">{{ t('rooms.tabCompare') }}</button>
      <button :class="{ on: rtab === 'members' }" @click="rtab = 'members'">{{ t('rooms.tabMembers') }}</button>
    </nav>

    <RoomLeaderboard v-if="rtab === 'table'" :room="activeRoom" :official="official" :my-pubkey="myPubkey" />
    <RoomCompare v-else-if="rtab === 'compare'" :room="activeRoom" :official="official" :my-pubkey="myPubkey" />

    <template v-else>
      <h4 class="grp-h">{{ t('rooms.invite') }}</h4>
      <div class="invite-box">
        <img v-if="inviteQr" :src="inviteQr" class="qr" :alt="t('rooms.inviteQr')" />
        <div class="invite-actions">
          <button class="go" @click="copyInvite">{{ inviteCopied ? t('rooms.copied') : t('rooms.copyLink') }}</button>
          <button class="go ghost" @click="shareInviteNative">{{ t('common.share') }}</button>
        </div>
      </div>
      <SocialShareButtons v-if="inviteUrl" :url="inviteUrl" :text="activeRoom.name" class="social-row" />

      <h4 class="grp-h">{{ t('rooms.inviteContacts') }}</h4>
      <p v-if="!contacts.length" class="empty">{{ t('identity.noContacts') }}</p>
      <div v-for="c in contacts" :key="c.publickey" class="contact" @click="toggleContact(c.publickey)">
        <input type="checkbox" :checked="selectedContacts.has(c.publickey)" @click.stop="toggleContact(c.publickey)" />
        <span class="c-nm">{{ c.nickname || t('identity.noNick') }}</span>
        <span class="mono">{{ shortKey(c.publickey) }}</span>
      </div>
      <button v-if="contacts.length" class="primary full" :disabled="inviting || !selectedContacts.size" @click="inviteSelected">
        {{ inviting ? '…' : t('rooms.sendInvites', { n: selectedContacts.size }) }}
      </button>
      <p v-if="inviteStatus" class="status">{{ inviteStatus }}</p>

      <h4 class="grp-h">{{ t('rooms.membersList') }} ({{ liveMembers.length }})</h4>
      <p v-if="!liveMembers.length" class="empty">{{ t('rooms.noMembers') }}</p>
      <div v-for="m in liveMembers" :key="m.publickey" class="member">
        <span class="badge" :class="{ ok: m.verified }">{{ m.verified ? '✓' : '⚠' }}</span>
        <span class="c-nm">{{ m.nickname || t('common.anonymous') }}<span v-if="m.publickey === myPubkey" class="you">{{ t('rooms.you') }}</span></span>
        <span v-if="isMemberSealed(activeRoom, m, myPubkey)" class="tag gold">🔒</span>
        <span class="seal" :class="sealInfo(m).cls" :title="sealInfo(m).text">{{ sealInfo(m).icon }}</span>
        <span class="mono">{{ shortKey(m.publickey) }}</span>
      </div>
    </template>
  </div>
</template>

<style scoped>
.scrolly { padding: 1rem; }
.warn { color: var(--gold); font-size: 0.85rem; margin-bottom: 0.8rem; }
.cards { display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 1rem; max-width: 760px; }
.card { background: var(--panel); border: 1px solid var(--line); border-radius: 14px; padding: 1.1rem; }
.card h3 { color: var(--azure); margin-bottom: 0.7rem; font-size: 1.05rem; }
.lbl { display: block; font-size: 0.72rem; color: var(--muted); text-transform: uppercase; letter-spacing: 0.04em; margin: 0.6rem 0 0.3rem; }
input, .sel { width: 100%; background: var(--bg); border: 1px solid var(--line); border-radius: 8px; color: var(--text); padding: 0.55rem; font-size: 0.9rem; font-family: inherit; }
.check { display: flex; align-items: center; gap: 0.5rem; margin-top: 0.7rem; cursor: pointer; }
.check input { width: auto; }
.check span { font-size: 0.85rem; }
.hint { font-size: 0.78rem; color: var(--muted); margin-top: 0.4rem; }
.primary { background: var(--azure); color: #042038; border: none; border-radius: 8px; padding: 0.6rem 1rem; font-weight: 800; cursor: pointer; font-family: inherit; }
.primary.full { width: 100%; margin-top: 0.8rem; }
.primary:disabled { opacity: 0.5; cursor: default; }
.err { color: #ff6b6b; font-size: 0.8rem; margin-top: 0.4rem; }
.status { color: var(--azure); font-size: 0.8rem; margin-top: 0.4rem; }
.empty { color: var(--muted); font-style: italic; font-size: 0.85rem; padding: 0.4rem 0; }

.contribute { border: 1px solid var(--azure); border-radius: 12px; padding: 0.9rem; margin-bottom: 0.9rem; background: rgba(65,180,255,0.06); }
.contribute-h { font-size: 0.88rem; font-weight: 700; margin-bottom: 0.5rem; }
.pick { display: flex; align-items: center; justify-content: space-between; gap: 0.5rem; padding: 0.35rem 0; }
.pick-nm { font-size: 0.88rem; }
.pick-nm small { color: var(--muted); font-size: 0.72rem; }
.mine-note { font-size: 0.85rem; color: var(--green); margin-bottom: 0.9rem; display: flex; align-items: center; justify-content: space-between; gap: 0.5rem; }
.go { background: var(--azure); color: #042038; border: none; border-radius: 8px; padding: 0.45rem 0.9rem; font-weight: 800; cursor: pointer; white-space: nowrap; font-family: inherit; }
.go.ghost { background: transparent; color: var(--azure); border: 1px solid var(--azure); }
.go.danger { background: transparent; color: #ff6b6b; border: 1px solid #ff6b6b; }
.go:disabled { opacity: 0.5; cursor: default; }
.mini-share { padding: 0.35rem 0.7rem; font-size: 0.78rem; }
.mine-actions { display: inline-flex; gap: 0.4rem; }
.rtabs { display: flex; gap: 0.4rem; margin-bottom: 1rem; max-width: 420px; }
.rtabs button { flex: 1; background: transparent; border: 1px solid var(--line); color: var(--muted); padding: 0.55rem; border-radius: 8px; cursor: pointer; font-weight: 700; font-size: 0.85rem; }
.rtabs button.on { background: var(--panel-2); color: var(--text); border-color: var(--azure); }
.grp-h { color: var(--muted); font-size: 0.74rem; text-transform: uppercase; letter-spacing: 0.05em; margin: 1.1rem 0 0.5rem; }
.invite-box { display: flex; gap: 1rem; align-items: center; flex-wrap: wrap; }
.qr { width: 130px; height: 130px; border-radius: 8px; background: #fff; padding: 4px; }
.invite-actions { display: flex; flex-direction: column; gap: 0.5rem; }
.invite-actions .go { padding: 0.55rem 1.1rem; }
.social-row { margin: 0.7rem 0 0.2rem; justify-content: flex-start; }
.contact, .member { display: flex; align-items: center; gap: 0.5rem; padding: 0.45rem 0; border-top: 1px solid var(--line-soft); max-width: 480px; }
.contact { cursor: pointer; }
.c-nm { flex: 1; min-width: 0; font-weight: 700; font-size: 0.86rem; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.you { font-size: 0.6rem; background: var(--azure); color: #042038; border-radius: 5px; padding: 0 0.25rem; font-weight: 800; margin-left: 0.3rem; }
.mono { font-family: monospace; font-size: 0.66rem; color: var(--muted); }
.badge { font-size: 0.75rem; color: #e0a; }
.badge.ok { color: var(--green); }
.seal { font-size: 0.78rem; cursor: help; flex-shrink: 0; }
.seal.ok { color: var(--green); }
.seal.late, .seal.bad { color: var(--gold); }
.seal.none { color: var(--muted); }
.tag.gold { color: var(--gold); border: 1px solid var(--gold); border-radius: 5px; padding: 0.05rem 0.35rem; font-size: 0.66rem; }
</style>
