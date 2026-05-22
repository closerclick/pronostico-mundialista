// Librería de pronósticos guardada en localStorage: los míos (editables) y los
// importados de otras personas (firmados, solo lectura).

import type { GameMode, Results } from './standings'

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
}

export function getActiveId (): string | null {
  return localStorage.getItem(ACTIVE_KEY)
}
export function setActiveId (id: string): void {
  try { localStorage.setItem(ACTIVE_KEY, id) } catch { /* */ }
}
