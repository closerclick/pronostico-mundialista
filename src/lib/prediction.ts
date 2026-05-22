// Estado del pronóstico y su resolución a equipos concretos en cada partido.

import { GROUPS } from './teams'
import {
  R32, ALL_LATER, FINAL, THIRD_PLACE, THIRD_SLOTS, allocateThirds,
  type Slot, type R32Match, type LaterMatch,
} from './bracket'

export interface Prediction {
  // Para cada grupo (0..11): los 4 team id en el orden pronosticado
  // [1º, 2º, 3º, 4º].
  groupOrder: number[][]
  // Ranking de los 12 terceros, como permutación de índices de grupo (0..11),
  // de mejor a peor tercero. Los 8 primeros clasifican.
  thirdsRank: number[]
  // Para cada partido de eliminatorias: el team id que el usuario eligió como
  // ganador. Si ese equipo deja de estar en la llave (por un cambio en la fase
  // de grupos), el pick se invalida solo y la llave vuelve a quedar vacía.
  picks: Record<number, number>
}

export function defaultPrediction (): Prediction {
  return {
    groupOrder: GROUPS.map((g) => g.teams.map((t) => t.id)),
    thirdsRank: GROUPS.map((_, i) => i),
    picks: {},
  }
}

export function clonePrediction (p: Prediction): Prediction {
  return {
    groupOrder: p.groupOrder.map((g) => [...g]),
    thirdsRank: [...p.thirdsRank],
    picks: { ...p.picks },
  }
}

// Equipo en cada posición de grupo según el pronóstico.
function groupWinner (p: Prediction, group: number): number { return p.groupOrder[group]![0]! }
function groupRunnerUp (p: Prediction, group: number): number { return p.groupOrder[group]![1]! }
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

function resolveSlot (p: Prediction, slot: Slot, thirds: (number | null)[]): number | null {
  switch (slot.kind) {
    case 'W': return groupWinner(p, slot.group)
    case 'RU': return groupRunnerUp(p, slot.group)
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
  const thirds = thirdSlotTeams(p)
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
    decide(m.num, resolveSlot(p, m.home, thirds), resolveSlot(p, m.away, thirds))
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
