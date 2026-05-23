// Estado COMPARTIDO de salas (módulo singleton) para que la barra lateral y la
// página de salas vean lo mismo: las salas, cuál está activa y la sincronización
// en vivo. Las salas son "otra página" del app: se crean/seleccionan desde la
// barra lateral (igual que los pronósticos) y el área principal muestra la activa.

import { ref, computed } from 'vue'
import type { PeerInfo } from '@gatoseya/closer-click-identity'
import { getIdentity } from '../lib/identity'
import {
  loadRooms, saveRooms, getActiveRoomId, setActiveRoomId, upsertMember, hydrateRooms,
  type Room, type RoomMode,
} from '../lib/roomStore'
import {
  genRoomId, TOURNAMENT_START, parseRoomInvite, parseMemberContrib, memberFromEnvelope,
} from '../lib/room'
import { RoomSync } from '../lib/roomSync'

// --- Estado a nivel de módulo (compartido por todos los componentes) --------
const rooms = ref<Room[]>([])
const activeRoomId = ref<string | null>(null)
const peerCount = ref(0)
const syncStatus = ref<'connecting' | 'online' | 'offline'>('offline')
const myPubkey = ref<string | null>(null)
const myNick = ref<string>('')
const contacts = ref<PeerInfo[]>([])
const unreachable = ref(false)
// Sub-pestaña de la sala activa (compartida para que la barra lateral y el
// header puedan llevar al usuario a la sección de invitar/compartir).
const roomTab = ref<'table' | 'compare' | 'members'>('table')

let sync: RoomSync | null = null
let inited = false

const activeRoom = computed(() => rooms.value.find((r) => r.id === activeRoomId.value) ?? null)

function persist () { saveRooms(rooms.value) }

/** Re-lee las salas desde localStorage (tras una escritura externa). */
function reloadRooms () {
  rooms.value = loadRooms()
}

async function loadIdentityInfo () {
  const idi = await getIdentity()
  if (!idi) { unreachable.value = true; return }
  unreachable.value = false
  myPubkey.value = idi.me?.publickey ?? null
  myNick.value = idi.me?.nickname ?? ''
  contacts.value = await idi.listContacts().catch(() => [])
}

async function initRooms () {
  rooms.value = loadRooms()
  await loadIdentityInfo()
  inited = true
  void inited
  // Restaura la última sala activa (sin arrancar sync hasta entrar a la sección).
  const last = getActiveRoomId()
  if (last && rooms.value.some((r) => r.id === last)) activeRoomId.value = last
  // Rehidratación desde el store del ecosistema, en segundo plano (no bloquea).
  hydrateRooms(rooms.value)
    .then(({ rooms: merged, changed }) => { if (changed) { rooms.value = merged; saveRooms(merged) } })
    .catch(() => { /* sin nube, seguimos local */ })
}

/** Arranca el sync de la sala activa (al entrar a la sección Salas). */
function ensureSync () {
  const r = activeRoom.value
  if (r && !sync) startSync(r)
}

// --- Sincronización ---------------------------------------------------------
function startSync (room: Room) {
  stopSync()
  const myEnv = room.members.find((m) => m.publickey === myPubkey.value)?.env ?? null
  sync = new RoomSync(room.id, myEnv, {
    onPrediction: (env) => applyEnvelope(env),
    onPeerCount: (n) => { peerCount.value = n },
    onStatus: (s) => { syncStatus.value = s },
    // Miembros conocidos (sin mí): para entrega online + cola offline por pubkey.
    memberPubkeys: () => {
      const r = activeRoom.value
      if (!r) return []
      return r.members.map((m) => m.publickey).filter((pk) => pk && pk !== myPubkey.value)
    },
    // Todos los sobres firmados que conozco, para reenviarlos (gossip).
    allEnvelopes: () => {
      const r = activeRoom.value
      if (!r) return []
      return r.members.map((m) => m.env).filter((e): e is string => !!e)
    },
  })
  sync.start()
}

function stopSync () {
  if (sync) { sync.stop(); sync = null }
  peerCount.value = 0
  syncStatus.value = 'offline'
}

/** Re-difunde mi sobre (aporte o retract) en la sala activa. */
function updateSyncFrag (env: string | null) {
  sync?.updateMyEnv(env)
}

/**
 * Aplica un sobre firmado recibido a la sala que indica (verificado y por
 * last-write-wins). Sirve tanto para la sync de la sala activa como para el
 * buzón GLOBAL (aportes que el proxy entregó por la cola offline al reconectar,
 * aunque no estés mirando esa sala). Como el sobre va firmado, reenviarlo es
 * seguro y un retract solo lo aplica quien lo firmó.
 */
async function applyEnvelope (env: string) {
  const parsed = await memberFromEnvelope(env)
  if (!parsed || !parsed.member.verified) return // identidad obligatoria
  const room = rooms.value.find((r) => r.id === parsed.roomId)
  if (!room) return
  if (upsertMember(room, parsed.member)) persist()
}

// --- Navegación -------------------------------------------------------------
function openRoom (id: string) {
  activeRoomId.value = id
  setActiveRoomId(id)
  roomTab.value = 'table'
  const r = activeRoom.value
  if (r) startSync(r)
}

/** Abre la sala y la deja en la sub-pestaña de invitar/compartir. */
function shareRoom (id: string) {
  openRoom(id)
  roomTab.value = 'members'
}

function closeRoom () {
  stopSync()
  activeRoomId.value = null
  setActiveRoomId(null)
}

// --- Crear / unirse / salir -------------------------------------------------
async function createRoom (input: { name: string; mode: RoomMode; sealed: boolean }): Promise<Room | null> {
  const idi = await getIdentity()
  if (!idi?.me?.publickey) { unreachable.value = true; return null }
  const now = Date.now()
  const room: Room = {
    id: genRoomId(),
    name: input.name.trim().slice(0, 60),
    mode: input.mode,
    sealedUntil: input.sealed ? TOURNAMENT_START : 0,
    hostPubkey: idi.me.publickey,
    hostNick: idi.me.nickname || undefined,
    mine: true,
    createdAt: now,
    updatedAt: now,
    members: [],
  }
  rooms.value.push(room)
  persist()
  openRoom(room.id)
  return room
}

function extractFragment (text: string): string {
  const s = text.trim()
  const h = s.lastIndexOf('#')
  return h >= 0 ? s.slice(h + 1) : s
}

/** Une por enlace de invitación pegado. Devuelve el id de sala o lanza. */
async function joinByLink (text: string): Promise<string> {
  const parsed = await parseRoomInvite(extractFragment(text))
  if (!parsed) throw new Error('invalid')
  return upsertRoomFromInvite(parsed.id, parsed.name, parsed.mode, parsed.sealedUntil, parsed.hostPubkey, parsed.createdAt)
}

/** Crea/actualiza una sala desde un descriptor de invitación ya verificado. */
function upsertRoomFromInvite (id: string, name: string, mode: RoomMode, sealedUntil: number, hostPubkey: string, createdAt: number): string {
  let room = rooms.value.find((r) => r.id === id)
  if (!room) {
    room = {
      id, name, mode, sealedUntil, hostPubkey,
      mine: hostPubkey === myPubkey.value,
      createdAt, updatedAt: Date.now(), members: [],
    }
    rooms.value.push(room)
    persist()
  }
  return id
}

function leaveRoom (id: string) {
  rooms.value = rooms.value.filter((r) => r.id !== id)
  persist()
  if (activeRoomId.value === id) closeRoom()
}

// --- Importación desde enlaces (#room= / #rm=) ------------------------------
async function importRoomInvite (frag: string): Promise<string | null> {
  const parsed = await parseRoomInvite(frag)
  if (!parsed) return null
  reloadRooms()
  return upsertRoomFromInvite(parsed.id, parsed.name, parsed.mode, parsed.sealedUntil, parsed.hostPubkey, parsed.createdAt)
}

async function importMemberContrib (frag: string): Promise<string | null> {
  const parsed = parseMemberContrib(frag)
  if (!parsed) return null
  const env = await memberFromEnvelope(parsed.env)
  if (!env || !env.member.verified) return null
  reloadRooms()
  const room = rooms.value.find((r) => r.id === env.roomId)
  if (!room) return 'NOROOM'
  upsertMember(room, env.member)
  persist()
  return env.roomId
}

export function useRooms () {
  return {
    rooms, activeRoom, activeRoomId, peerCount, syncStatus, myPubkey, myNick, contacts, unreachable, roomTab,
    initRooms, reloadRooms, loadIdentityInfo,
    openRoom, shareRoom, closeRoom, createRoom, joinByLink, leaveRoom, persist,
    startSync, stopSync, ensureSync, updateSyncFrag,
    importRoomInvite, importMemberContrib, applyEnvelope, getActiveRoomId,
  }
}
