// Enlaces de SALA: invitación (descriptor firmado por el creador) y contribución
// (el pronóstico firmado de un miembro asociado a una sala). Reutiliza el
// empaquetado de blob firmado de share.ts (punto comprimido P-256 + ECDSA).
//
// Dos formas de fragmento (#...):
//   #room=<blob>   → descriptor de sala firmado por el creador (invitación)
//   #rm=<b64url>   → contribución de un miembro: { r:roomId, f:fragPronóstico }
//
// El pronóstico que aporta un miembro es un enlace de pronóstico NORMAL (el
// mismo blob firmado de share.ts), así reusamos toda la verificación existente.

import { signBlob, verifyBlob, parseShareFragment, SHARE_BASE } from './share'
import { decodePrediction } from './codec'
import type { Room, RoomMode, RoomMember } from './roomStore'

export const ROOM_PAYLOAD_VERSION = 2

/** Inicio del Mundial 2026 (primer partido): tope de "sellado" por defecto. */
export const TOURNAMENT_START = Date.UTC(2026, 5, 11, 0, 0, 0)

export const ROOM_INVITE_PREFIX = 'room='
export const ROOM_MEMBER_PREFIX = 'rm='

// --- Descriptor de sala (lo que firma el creador) ---------------------------

interface RoomDescriptor {
  i: string // id
  n: string // nombre
  m: RoomMode // modo exigido
  s: number // sealedUntil (0 = visible)
  c: number // createdAt
}

/** Datos mínimos del creador para construir la invitación. */
export interface RoomInit {
  id: string
  name: string
  mode: RoomMode
  sealedUntil: number
  createdAt: number
}

/** Firma el descriptor de la sala y arma el enlace de invitación. */
export async function buildRoomInviteUrl (init: RoomInit): Promise<{ url: string; hostPubkey: string; hostNick?: string }> {
  const desc: RoomDescriptor = { i: init.id, n: init.name.slice(0, 60), m: init.mode, s: init.sealedUntil, c: init.createdAt }
  const { blob, publickey, nickname } = await signBlob(JSON.stringify(desc), ROOM_PAYLOAD_VERSION)
  return { url: `${SHARE_BASE}#${ROOM_INVITE_PREFIX}${blob}`, hostPubkey: publickey, hostNick: nickname }
}

export interface ParsedRoomInvite {
  id: string
  name: string
  mode: RoomMode
  sealedUntil: number
  createdAt: number
  hostPubkey: string
  verified: boolean
}

/** Lee y verifica el descriptor de sala de un fragmento `room=<blob>`. */
export async function parseRoomInvite (frag: string): Promise<ParsedRoomInvite | null> {
  const blob = frag.startsWith(ROOM_INVITE_PREFIX) ? frag.slice(ROOM_INVITE_PREFIX.length) : frag
  const res = await verifyBlob(blob, ROOM_PAYLOAD_VERSION)
  if (!res) return null
  let desc: RoomDescriptor
  try { desc = JSON.parse(res.content) } catch { return null }
  if (!desc?.i || !desc?.n) return null
  return {
    id: String(desc.i),
    name: String(desc.n),
    mode: (desc.m ?? 'free') as RoomMode,
    sealedUntil: Number(desc.s) || 0,
    createdAt: Number(desc.c) || Date.now(),
    hostPubkey: res.publickey,
    verified: res.verified,
  }
}

// --- Aporte de un miembro: SOBRE FIRMADO con ts del autor --------------------
//
// El aporte viaja como un sobre que el autor FIRMA con su vault:
//   { r:roomId, f:fragFirmado, t:tsAutor }            contribución
//   { r:roomId, d:1,           t:tsAutor }            retract (tombstone)
// El `t` (ms del reloj del autor) ordena versiones: re-aportar o BORRAR le gana
// a lo anterior (last-write-wins por `t`). Como el sobre va firmado:
//   - un peer puede REENVIAR sobres ajenos sin poder alterarlos (gossip seguro),
//   - solo el autor puede borrar lo suyo (nadie puede falsear el borrado ajeno).

export const MEMBER_ENV_VERSION = 3

interface MemberEnv { r: string; f?: string; d?: 1; t: number }

/** Firma el sobre de contribución (mi pronóstico) para una sala. */
export async function buildMemberEnvelope (roomId: string, frag: string, ts: number): Promise<string> {
  const env: MemberEnv = { r: roomId, f: frag, t: ts }
  const { blob } = await signBlob(JSON.stringify(env), MEMBER_ENV_VERSION)
  return blob
}

/** Firma el sobre de RETRACT (tombstone): borra mi aporte de la sala. */
export async function buildRetractEnvelope (roomId: string, ts: number): Promise<string> {
  const env: MemberEnv = { r: roomId, d: 1, t: ts }
  const { blob } = await signBlob(JSON.stringify(env), MEMBER_ENV_VERSION)
  return blob
}

/** Arma el enlace `#rm=` con el sobre firmado del aporte de un miembro. */
export function buildMemberContribUrl (envBlob: string): string {
  return `${SHARE_BASE}#${ROOM_MEMBER_PREFIX}${envBlob}`
}

export interface ParsedMemberContrib { env: string }

/** Lee el sobre de un fragmento `rm=<blob>`. */
export function parseMemberContrib (frag: string): ParsedMemberContrib | null {
  const env = frag.startsWith(ROOM_MEMBER_PREFIX) ? frag.slice(ROOM_MEMBER_PREFIX.length) : frag
  return env ? { env } : null
}

export interface ParsedMemberEnv { roomId: string; member: RoomMember }

/**
 * Verifica un sobre firmado y arma el miembro (o el tombstone si es retract).
 * Rechaza si la firma no valida o si el sobre no lo firmó el MISMO autor del
 * pronóstico que envuelve. Null si inválido.
 */
export async function memberFromEnvelope (envBlob: string): Promise<ParsedMemberEnv | null> {
  const res = await verifyBlob(envBlob, MEMBER_ENV_VERSION)
  if (!res || !res.verified) return null
  let env: MemberEnv
  try { env = JSON.parse(res.content) } catch { return null }
  if (!env.r || typeof env.t !== 'number') return null
  const author = res.publickey
  if (env.d) {
    return {
      roomId: env.r,
      member: { publickey: author, verified: true, deleted: true, frag: '', code: '', env: envBlob, version: env.t, updatedAt: Date.now() },
    }
  }
  if (!env.f) return null
  const m = await memberFromFrag(env.f)
  if (!m) return null
  if (m.publickey !== author) return null // el sobre debe firmarlo el mismo autor del pronóstico
  m.env = envBlob
  m.version = env.t
  m.updatedAt = Date.now()
  return { roomId: env.r, member: m }
}

/** Reconoce el tipo de fragmento de la URL. */
export function fragKind (frag: string): 'room' | 'member' | 'prediction' {
  if (frag.startsWith(ROOM_INVITE_PREFIX)) return 'room'
  if (frag.startsWith(ROOM_MEMBER_PREFIX)) return 'member'
  return 'prediction'
}

/** ¿El pronóstico de un miembro respeta el modo exigido por la sala? */
export function modeAllowed (roomMode: RoomMode, predMode: string | undefined): boolean {
  if (roomMode === 'free') return true
  return roomMode === predMode
}

/**
 * Verifica un fragmento de pronóstico firmado y arma el miembro de sala
 * correspondiente (decodifica modo y resultados del código). Null si no es válido.
 */
export async function memberFromFrag (frag: string): Promise<RoomMember | null> {
  const parsed = await parseShareFragment(frag)
  if (!parsed) return null
  let mode: RoomMember['mode']
  let results: RoomMember['results']
  try { const p = decodePrediction(parsed.code); mode = p.mode; results = p.results } catch { /* */ }
  return {
    publickey: parsed.publickey,
    nickname: parsed.nickname,
    verified: parsed.verified,
    frag,
    code: parsed.code,
    mode,
    results,
    sealedAt: parsed.sealedAt,
    sealValid: parsed.sealValid,
    updatedAt: Date.now(),
  }
}

/** Genera un id de sala estable. */
export function genRoomId (): string {
  return crypto.randomUUID?.() ?? 'r' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8)
}

export type { Room }
