// Sincronización EN VIVO de una sala usando el cliente ESTÁNDAR del ecosistema
// (`@gatoseya/closer-click-proxy-client`, vía connection.ts). Cada sala es un
// canal público `mundial-room-<roomId>`: los miembros conectados se publican,
// se descubren (list / channel_joined) y se intercambian sus pronósticos
// firmados con `client.send` (que usa WebRTC con fallback al proxy).
//
// Los mensajes son objetos JSON con un campo `type`:
//   { type:'ROOM_PREDICTION', roomId, frag }   pronóstico firmado de un miembro
//   { type:'ROOM_REQUEST', roomId }            pedir el pronóstico a un peer

import type { WebSocketProxyClient } from '@gatoseya/closer-click-proxy-client'
import { ensureConnected, getProxyClient } from './connection'

const CHANNEL_PREFIX = 'mundial-room-'

export interface RoomSyncHandlers {
  onPrediction: (frag: string) => void
  onPeerCount?: (n: number) => void
  onStatus?: (s: 'connecting' | 'online' | 'offline') => void
}

interface RoomMsg { type?: string; roomId?: string; frag?: string }

/** Mantiene viva la sincronización de UNA sala mientras está en pantalla. */
export class RoomSync {
  private roomId: string
  private myFrag: string | null
  private handlers: RoomSyncHandlers
  private peers = new Set<string>()
  private offFns: Array<() => void> = []
  private stopped = false

  constructor (roomId: string, myFrag: string | null, handlers: RoomSyncHandlers) {
    this.roomId = roomId
    this.myFrag = myFrag
    this.handlers = handlers
  }

  private get channelName () { return CHANNEL_PREFIX + this.roomId }

  async start () {
    this.stopped = false
    this.handlers.onStatus?.('connecting')
    const c = await ensureConnected()
    if (this.stopped) return
    this.registerHandlers(c)
    try {
      await c.publish(this.channelName)
      const tokens = await c.list(this.channelName)
      for (const tk of tokens) if (tk !== c.token) this.peers.add(tk)
      this.handlers.onStatus?.('online')
      this.emitCount()
      const list = [...this.peers]
      this.broadcastPrediction(list)
      this.requestPredictions(list)
    } catch (e) {
      console.warn('No se pudo publicar/listar el canal de la sala:', e)
      this.handlers.onStatus?.(c.isConnected ? 'online' : 'offline')
    }
  }

  stop () {
    this.stopped = true
    const c = getProxyClient()
    try { c.unpublish(this.channelName).catch(() => {}) } catch { /* */ }
    for (const off of this.offFns) { try { off() } catch { /* */ } }
    this.offFns = []
    this.peers.clear()
    this.handlers.onStatus?.('offline')
  }

  /** Re-difunde mi pronóstico (al aportarlo o cambiarlo). */
  updateMyFrag (frag: string | null) {
    this.myFrag = frag
    this.broadcastPrediction([...this.peers])
  }

  private emitCount () { this.handlers.onPeerCount?.(this.peers.size + 1) }

  private send (tokens: string[], msg: RoomMsg) {
    if (!tokens.length) return
    getProxyClient().send(tokens, msg)
  }
  private broadcastPrediction (tokens: string[]) {
    if (!this.myFrag) return
    this.send(tokens, { type: 'ROOM_PREDICTION', roomId: this.roomId, frag: this.myFrag })
  }
  private requestPredictions (tokens: string[]) {
    this.send(tokens, { type: 'ROOM_REQUEST', roomId: this.roomId })
  }

  private registerHandlers (c: WebSocketProxyClient) {
    this.offFns.push(c.on('message', (from: string, payload: unknown) => {
      const msg = (typeof payload === 'object' && payload ? payload : {}) as RoomMsg
      if (msg.roomId !== this.roomId) return
      if (msg.type === 'ROOM_PREDICTION' && typeof msg.frag === 'string') {
        this.handlers.onPrediction(msg.frag)
      } else if (msg.type === 'ROOM_REQUEST' && from) {
        this.broadcastPrediction([from])
      }
    }))
    this.offFns.push(c.on('channel_joined', (channel: string, token: string) => {
      if (channel !== this.channelName || token === c.token) return
      this.peers.add(token)
      this.emitCount()
      this.broadcastPrediction([token])
      this.requestPredictions([token])
    }))
    const drop = (channel: string, token: string) => {
      if (channel && channel !== this.channelName) return
      if (this.peers.delete(token)) this.emitCount()
    }
    this.offFns.push(c.on('channel_left', drop))
    this.offFns.push(c.on('peer_disconnected', (token: string, channel?: string) => drop(channel ?? '', token)))
  }
}
