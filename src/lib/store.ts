// Librería de pronósticos guardada en localStorage: los míos (editables) y los
// importados de otras personas (firmados, solo lectura).

import type { GameMode, Results } from './standings'
import { pullThread, syncThread, THREAD_PREDICTIONS } from './cloud'

export interface SavedAuthor {
  publickey: string
  nickname?: string
  verified: boolean
}

export interface SavedPrediction {
  id: string
  name: string
  /** código compacto del pronóstico (lo que viaja en el QR/enlace) */
  code: string
  updatedAt: number
  /** true = propio y editable; false = importado de otra persona (solo lectura) */
  mine: boolean
  /** true = entrada de RESULTADOS oficiales (única; sección aparte en la barra). */
  official?: boolean
  author?: SavedAuthor
  /** Enlace original firmado (solo importados): se reusa al compartir/imprimir
   *  un pronóstico ajeno, sin re-firmarlo con la identidad propia. */
  sharedUrl?: string
  // Datos de resultados (solo locales; no viajan en el código compartido).
  mode?: GameMode
  results?: Results
  // Borrador de posiciones del modo manual (solo local; no viaja en el código).
  draftGroupOrder?: number[][]
  draftThirdsRank?: number[]
}

const LIB_KEY = 'mundial.library.v1'
const ACTIVE_KEY = 'mundial.activeId.v1'

export function genId (): string {
  return (crypto.randomUUID?.() ?? 'p' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8))
}

export function loadLibrary (): SavedPrediction[] {
  try {
    const raw = localStorage.getItem(LIB_KEY)
    if (!raw) return []
    const arr = JSON.parse(raw)
    return Array.isArray(arr) ? arr : []
  } catch { return [] }
}

export function saveLibrary (list: SavedPrediction[]): void {
  try { localStorage.setItem(LIB_KEY, JSON.stringify(list)) } catch { /* */ }
  // Espejo en la nube (fire-and-forget; no bloquea ni rompe si el store no está).
  void syncThread(THREAD_PREDICTIONS, list.map((p) => ({ id: p.id, ts: p.updatedAt, data: p })))
}

/**
 * Trae los pronósticos del store del ecosistema y los fusiona con la lista local
 * (last-writer-wins por `updatedAt`). Devuelve la lista fusionada y si cambió.
 * Pensado para correr en segundo plano al arrancar (no bloquea el render).
 */
export async function hydrateLibrary (local: SavedPrediction[]): Promise<{ list: SavedPrediction[]; changed: boolean }> {
  const remote = await pullThread<SavedPrediction>(THREAD_PREDICTIONS)
  if (!remote.length) return { list: local, changed: false }
  const byId = new Map(local.map((p) => [p.id, p]))
  let changed = false
  for (const r of remote) {
    if (!r?.id) continue
    const cur = byId.get(r.id)
    if (!cur || (r.updatedAt || 0) > (cur.updatedAt || 0)) { byId.set(r.id, r); changed = true }
  }
  return { list: [...byId.values()], changed }
}

export function getActiveId (): string | null {
  return localStorage.getItem(ACTIVE_KEY)
}
export function setActiveId (id: string): void {
  try { localStorage.setItem(ACTIVE_KEY, id) } catch { /* */ }
}
