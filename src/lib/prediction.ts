// Estado del pronóstico y su resolución a equipos concretos en cada partido.

import { GROUPS } from './teams'
import {
  R32, ALL_LATER, FINAL, THIRD_PLACE, THIRD_SLOTS, allocateThirds,
  type Slot, type R32Match, type LaterMatch,
} from './bracket'
import { computeStandings, certainGroupOrder, type GameMode, type Results } from './standings'

export interface Prediction {
  // Modo de juego: 'winlose' (solo gana/empata/pierde) o 'score' (con marcador).
  mode: GameMode
  // Resultados de los 72 partidos de grupos (entrada del usuario). Las
  // posiciones se CALCULAN desde aquí, pero solo se aplican al confirmar.
  results: Results
  // Posiciones CONFIRMADAS. Para cada grupo (0..11): los 4 team id en el orden
  // [1º, 2º, 3º, 4º]. Es la "foto" que alimenta llaves, codec y compartir.
  groupOrder: number[][]
  // Ranking confirmado de los 12 terceros (permutación de índices de grupo).
  thirdsRank: number[]
  // Posiciones en BORRADOR que el usuario edita en modo 'manual' (arrastrando).
  // Las confirmadas siguen siendo groupOrder/thirdsRank (alimentan llaves/codec).
  draftGroupOrder: number[][]
  // Ranking de terceros en borrador (modo 'manual').
  draftThirdsRank: number[]
  // Para cada partido de eliminatorias: el team id que el usuario eligió como
  // ganador. Si ese equipo deja de estar en la llave (por un cambio en la fase
  // de grupos), el pick se invalida solo y la llave vuelve a quedar vacía.
  picks: Record<number, number>
}

export function defaultPrediction (): Prediction {
  return {
    mode: 'manual',
    results: {},
    groupOrder: GROUPS.map((g) => g.teams.map((t) => t.id)),
    thirdsRank: GROUPS.map((_, i) => i),
    draftGroupOrder: GROUPS.map((g) => g.teams.map((t) => t.id)),
    draftThirdsRank: GROUPS.map((_, i) => i),
    picks: {},
  }
}

export function clonePrediction (p: Prediction): Prediction {
  return {
    mode: p.mode,
    // Clon JSON (results es data plana); structuredClone falla con proxies reactivos de Vue.
    results: JSON.parse(JSON.stringify(p.results)) as Results,
    groupOrder: p.groupOrder.map((g) => [...g]),
    thirdsRank: [...p.thirdsRank],
    draftGroupOrder: p.draftGroupOrder.map((g) => [...g]),
    draftThirdsRank: [...p.draftThirdsRank],
    picks: { ...p.picks },
  }
}

/**
 * Aplica los resultados a las posiciones: recalcula groupOrder/thirdsRank desde
 * `results`+`mode` y poda los picks de llaves que dejan de ser válidos. Llamar
 * al "Confirmar cambios". Devuelve true si cambió algo.
 */
export function confirmStandings (p: Prediction): boolean {
  const next = draftStandings(p)
  const changed = JSON.stringify(next.groupOrder) !== JSON.stringify(p.groupOrder) ||
    JSON.stringify(next.thirdsRank) !== JSON.stringify(p.thirdsRank)
  if (changed) {
    p.groupOrder = next.groupOrder.map((g) => [...g])
    p.thirdsRank = [...next.thirdsRank]
    prunePicks(p)
  }
  return changed
}

/**
 * Posiciones "en borrador" que aún no se aplican a las llaves:
 *   - 'manual': lo que el usuario arrastra (draftGroupOrder/draftThirdsRank).
 *   - winlose/score: lo calculado desde los resultados cargados.
 */
export function draftStandings (p: Prediction): { groupOrder: number[][]; thirdsRank: number[] } {
  if (p.mode === 'manual') return { groupOrder: p.draftGroupOrder, thirdsRank: p.draftThirdsRank }
  return computeStandings(p.results, p.mode)
}

/** ¿Hay cambios sin confirmar (el borrador difiere de lo confirmado)? */
export function hasPendingChanges (p: Prediction): boolean {
  const next = draftStandings(p)
  return JSON.stringify(next.groupOrder) !== JSON.stringify(p.groupOrder) ||
    JSON.stringify(next.thirdsRank) !== JSON.stringify(p.thirdsRank)
}

// Tercer equipo de un grupo según las posiciones confirmadas (para terceros).
function groupThird (p: Prediction, group: number): number { return p.groupOrder[group]![2]! }

/** Grupos cuyos terceros clasifican (8 mejores), en orden de ranking. */
export function qualifiedThirdGroups (p: Prediction): number[] {
  return p.thirdsRank.slice(0, 8)
}

/** thirdSlot (0..7) → equipo tercero asignado, o null si no resoluble. */
export function thirdSlotTeams (p: Prediction): (number | null)[] {
  const alloc = allocateThirds(qualifiedThirdGroups(p))
  return alloc.map((group) => (group == null ? null : groupThird(p, group)))
}

// effGO[group] = posiciones efectivas del grupo (team id o null si aún no es
// segura). En 'manual' son las posiciones explícitas; en 'winlose'/'score' son
// las CIERTAS según los resultados cargados (null mientras no se sepan).
function resolveSlot (slot: Slot, effGO: (number | null)[][], thirds: (number | null)[]): number | null {
  switch (slot.kind) {
    case 'W': return effGO[slot.group]?.[0] ?? null
    case 'RU': return effGO[slot.group]?.[1] ?? null
    case '3rd': return thirds[slot.thirdSlot] ?? null
  }
}

export interface ResolvedMatch {
  num: number
  home: number | null
  away: number | null
  /** equipo que avanza */
  winner: number | null
  /** equipo que cae (útil para el 3er puesto) */
  loser: number | null
}

/**
 * Resuelve todos los partidos a equipos concretos aplicando los picks.
 * Devuelve un mapa por número de partido. Los cupos sin resolver quedan null.
 */
export function resolveMatches (p: Prediction): Map<number, ResolvedMatch> {
  // En modos con resultados (no manual), un cupo solo se llena cuando la
  // posición ya es SEGURA con lo cargado; si no, queda null (placeholder).
  // En 'manual' valen las posiciones explícitas (lo que el usuario ordenó).
  const useCertain = p.mode !== 'manual'
  const effGO: (number | null)[][] = useCertain
    ? GROUPS.map((_, g) => certainGroupOrder(g, p.results, p.mode))
    : p.groupOrder.map((g) => [...g])

  let thirds: (number | null)[]
  if (useCertain) {
    // Los mejores terceros requieren conocer y comparar el 3.º de TODOS los
    // grupos; solo se asignan cuando todas las posiciones son seguras.
    const allCertain = effGO.every((go) => go.every((x) => x != null))
    if (allCertain) {
      const st = computeStandings(p.results, p.mode)
      thirds = thirdSlotTeams({ ...p, groupOrder: st.groupOrder, thirdsRank: st.thirdsRank })
    } else {
      thirds = new Array(THIRD_SLOTS.length).fill(null)
    }
  } else {
    thirds = thirdSlotTeams(p)
  }

  const out = new Map<number, ResolvedMatch>()

  const decide = (num: number, home: number | null, away: number | null): ResolvedMatch => {
    let winner: number | null = null
    let loser: number | null = null
    // Solo hay ganador si el equipo elegido sigue siendo uno de los dos cupos.
    // Si no (o no hay elección), la llave queda vacía y no propaga adelante.
    // Se permite elegir ganador aunque el rival aún esté vacío: basta con que
    // el equipo elegido sea el cupo presente (home o away).
    const chosen = p.picks[num]
    if (chosen != null && (chosen === home || chosen === away)) {
      winner = chosen
      loser = chosen === home ? away : home
    }
    const m: ResolvedMatch = { num, home, away, winner, loser }
    out.set(num, m)
    return m
  }

  // Dieciseisavos
  for (const m of R32 as R32Match[]) {
    decide(m.num, resolveSlot(m.home, effGO, thirds), resolveSlot(m.away, effGO, thirds))
  }

  // Rondas posteriores. ALL_LATER está ordenado de octavos hacia la final,
  // con el 3er puesto antes de la final; ambos dependen de las semifinales,
  // ya resueltas para entonces.
  for (const m of ALL_LATER as LaterMatch[]) {
    if (m.num === THIRD_PLACE.num) {
      // Perdedores de las semifinales.
      const a = out.get(m.from[0])?.loser ?? null
      const b = out.get(m.from[1])?.loser ?? null
      decide(m.num, a, b)
    } else {
      const a = out.get(m.from[0])?.winner ?? null
      const b = out.get(m.from[1])?.winner ?? null
      decide(m.num, a, b)
    }
  }

  return out
}

export function champion (p: Prediction): number | null {
  return resolveMatches(p).get(FINAL.num)?.winner ?? null
}

/**
 * Elimina (in place) los picks cuyo equipo elegido ya no está en su llave,
 * propagando en cascada: al borrar un pick, las llaves que dependían de él
 * quedan vacías y sus picks también se invalidan. Devuelve true si cambió algo.
 * Llamar tras editar la fase de grupos.
 */
export function prunePicks (p: Prediction): boolean {
  let changed = false
  for (;;) {
    const resolved = resolveMatches(p)
    let removedThisPass = false
    for (const [num, chosen] of Object.entries(p.picks)) {
      const m = resolved.get(Number(num))
      const valid = m && (chosen === m.home || chosen === m.away)
      if (!valid) {
        delete p.picks[Number(num)]
        removedThisPass = true
        changed = true
      }
    }
    if (!removedThisPass) break
  }
  return changed
}

export { THIRD_SLOTS }
