// Salas de pronósticos guardadas en localStorage. Una SALA reúne los
// pronósticos firmados de varias personas para compararlos entre sí y contra
// los resultados oficiales (tabla de posiciones + comparación lado a lado).
//
// Filosofía CloserClick: el estado vive 100% en cada cliente (sin servidor
// autoritativo). El proxy y los enlaces/QR solo reparten/sincronizan; cada
// quien guarda en SU localStorage los pronósticos de las salas en las que está.

import type { GameMode, Results } from './standings'
import { pullThread, syncThread, THREAD_ROOMS } from './cloud'

/** Modo exigido por la sala: uno fijo o 'free' (cualquier tipo). */
export type RoomMode = GameMode | 'free'

/** El pronóstico firmado que un miembro aportó a la sala. */
export interface RoomMember {
  /** clave pública JWK (string) del autor — identifica al miembro */
  publickey: string
  nickname?: string
  /** la firma del pronóstico verificó (autoría confiable) */
  verified: boolean
  /** fragmento firmado original del pronóstico (blob base64url del enlace) */
  frag: string
  /** código compacto del pronóstico (decodificable para puntuar/comparar) */
  code: string
  /** modo y resultados locales del pronóstico (no viajan en el código) */
  mode?: GameMode
  results?: Results
  /** sello de tiempo del sellador: cuándo existió este pronóstico (ms epoch) */
  sealedAt?: number
  /** ¿el sello del sellador verificó contra la pubkey pineada? */
  sealValid?: boolean
  /** tombstone: el autor borró su aporte (se conserva como lápida para que un
   *  reenvío de un sobre viejo no lo "reviva"). */
  deleted?: boolean
  /** sobre FIRMADO por el autor (`{r,f|d,t}`), tal cual viaja: permite reenviarlo
   *  a terceros sin alterarlo (gossip). */
  env?: string
  /** versión puesta por el AUTOR (ms epoch del sobre): clave de last-write-wins.
   *  Mayor gana → re-aportar/borrar le gana a lo anterior. Ausente = legacy (0). */
  version?: number
  /** marca temporal local de la última versión recibida (bookkeeping/cloud) */
  updatedAt: number
}

export interface Room {
  id: string
  name: string
  /** modo de juego exigido a los miembros (o 'free') */
  mode: RoomMode
  /** privacidad: 0 = pronósticos visibles desde ya; o un timestamp (ms) hasta el
   *  que los pronósticos ajenos quedan "sellados" (ocultos para evitar copia). */
  sealedUntil: number
  /** clave pública del creador (host lógico, NO autoritativo) */
  hostPubkey: string
  hostNick?: string
  /** ¿soy yo el creador de esta sala? */
  mine: boolean
  createdAt: number
  updatedAt: number
  members: RoomMember[]
}

const ROOMS_KEY = 'mundial.rooms.v1'
const ACTIVE_ROOM_KEY = 'mundial.activeRoomId.v1'

export function loadRooms (): Room[] {
  try {
    const raw = localStorage.getItem(ROOMS_KEY)
    if (!raw) return []
    const arr = JSON.parse(raw)
    return Array.isArray(arr) ? arr : []
  } catch { return [] }
}

export function saveRooms (rooms: Room[]): void {
  try { localStorage.setItem(ROOMS_KEY, JSON.stringify(rooms)) } catch { /* */ }
  // Espejo en la nube (fire-and-forget; no bloquea ni rompe si el store no está).
  void syncThread(THREAD_ROOMS, rooms.map((r) => ({ id: r.id, ts: r.updatedAt, data: r })))
}

/**
 * Trae las salas del store del ecosistema y las fusiona con las locales
 * (last-writer-wins por `updatedAt`; los miembros igual reconvergen por el canal
 * en vivo). Devuelve la lista fusionada y si cambió.
 */
export async function hydrateRooms (local: Room[]): Promise<{ rooms: Room[]; changed: boolean }> {
  const remote = await pullThread<Room>(THREAD_ROOMS)
  if (!remote.length) return { rooms: local, changed: false }
  const byId = new Map(local.map((r) => [r.id, r]))
  let changed = false
  for (const r of remote) {
    if (!r?.id) continue
    const cur = byId.get(r.id)
    if (!cur || (r.updatedAt || 0) > (cur.updatedAt || 0)) { byId.set(r.id, r); changed = true }
  }
  return { rooms: [...byId.values()], changed }
}

export function getActiveRoomId (): string | null {
  return localStorage.getItem(ACTIVE_ROOM_KEY)
}
export function setActiveRoomId (id: string | null): void {
  try {
    if (id) localStorage.setItem(ACTIVE_ROOM_KEY, id)
    else localStorage.removeItem(ACTIVE_ROOM_KEY)
  } catch { /* */ }
}

/** ¿El pronóstico de este miembro está sellado (oculto) para mí ahora mismo? */
export function isMemberSealed (room: Room, member: RoomMember, myPubkey: string | null): boolean {
  if (member.publickey === myPubkey) return false // los míos siempre los veo
  return room.sealedUntil > Date.now()
}

/**
 * Inserta o reemplaza un miembro (por publickey) con last-write-wins por la
 * VERSIÓN del autor (`version`, ms del sobre firmado). Un tombstone con version
 * mayor le gana al pronóstico; re-aportar con version mayor le gana al tombstone.
 * Devuelve true si cambió el estado.
 */
export function upsertMember (room: Room, member: RoomMember): boolean {
  const i = room.members.findIndex((m) => m.publickey === member.publickey)
  if (i < 0) { room.members.push(member); room.updatedAt = Date.now(); return true }
  if ((member.version ?? 0) >= (room.members[i]!.version ?? 0)) {
    room.members[i] = member
    room.updatedAt = Date.now()
    return true
  }
  return false
}
