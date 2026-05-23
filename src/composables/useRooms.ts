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
  genRoomId, TOURNAMENT_START, parseRoomInvite, parseMemberContrib, memberFromFrag,
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
  const frag = room.members.find((m) => m.publickey === myPubkey.value)?.frag ?? null
  sync = new RoomSync(room.id, frag, {
    onPrediction: (f) => receiveMemberFrag(f),
    onPeerCount: (n) => { peerCount.value = n },
    onStatus: (s) => { syncStatus.value = s },
  })
  sync.start()
}

function stopSync () {
  if (sync) { sync.stop(); sync = null }
  peerCount.value = 0
  syncStatus.value = 'offline'
}

function updateSyncFrag (frag: string | null) {
  sync?.updateMyFrag(frag)
}

async function receiveMemberFrag (frag: string) {
  const room = activeRoom.value
  if (!room) return
  const member = await memberFromFrag(frag)
  if (!member || !member.verified) return // identidad obligatoria
  if (upsertMember(room, member)) persist()
}

// --- Navegación -------------------------------------------------------------
function openRoom (id: string) {
  activeRoomId.value = id
  setActiveRoomId(id)
  const r = activeRoom.value
  if (r) startSync(r)
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
  reloadRooms()
  const room = rooms.value.find((r) => r.id === parsed.roomId)
  if (!room) return 'NOROOM'
  const member = await memberFromFrag(parsed.frag)
  if (!member || !member.verified) return null
  upsertMember(room, member)
  persist()
  return parsed.roomId
}

export function useRooms () {
  return {
    rooms, activeRoom, activeRoomId, peerCount, syncStatus, myPubkey, myNick, contacts, unreachable,
    initRooms, reloadRooms, loadIdentityInfo,
    openRoom, closeRoom, createRoom, joinByLink, leaveRoom, persist,
    startSync, stopSync, ensureSync, updateSyncFrag,
    importRoomInvite, importMemberContrib, getActiveRoomId,
  }
}
