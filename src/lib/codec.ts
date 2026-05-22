// Codificación compacta del pronóstico en la cadena más corta posible.
//
// Layout de bits (MSB primero):
//   - versión            4 bits  (=2)
//   - 12 grupos × 5 bits         (rango factorial 0..23 de cada permutación de 4)
//   - terceros          29 bits  (rango factorial 0..12!-1 de la permutación de 12)
//   - 32 picks × 2 bits          (0 sin decidir, 1 = home/arriba, 2 = away/abajo)
// Total: 157 bits ≈ 20 bytes ≈ 27 caracteres base64url.

import { GROUPS } from './teams'
import { R32, R16, QF, SF, THIRD_PLACE, FINAL } from './bracket'
import { defaultPrediction, resolveMatches, type Prediction } from './prediction'

const VERSION = 2

// Orden fijo de partidos para los picks (debe permanecer estable).
export const PICK_ORDER: number[] = [
  ...R32.map((m) => m.num),
  ...R16.map((m) => m.num),
  ...QF.map((m) => m.num),
  ...SF.map((m) => m.num),
  THIRD_PLACE.num,
  FINAL.num,
]

// ---- permutaciones (sistema factorial / código de Lehmer) ----------------

function factorial (n: number): number {
  let f = 1
  for (let i = 2; i <= n; i++) f *= i
  return f
}

function permToIndex (perm: number[], base: number[]): number {
  const remaining = [...base]
  const n = base.length
  let rank = 0
  for (let i = 0; i < n; i++) {
    const pos = remaining.indexOf(perm[i]!)
    rank += pos * factorial(n - 1 - i)
    remaining.splice(pos, 1)
  }
  return rank
}

function indexToPerm (rank: number, base: number[]): number[] {
  const remaining = [...base]
  const n = base.length
  const out: number[] = []
  for (let i = 0; i < n; i++) {
    const f = factorial(n - 1 - i)
    const pos = Math.floor(rank / f)
    rank %= f
    out.push(remaining[pos]!)
    remaining.splice(pos, 1)
  }
  return out
}

// ---- escritor/lector de bits ----------------------------------------------

class BitWriter {
  private bits: number[] = []
  write (value: number, nbits: number) {
    for (let i = nbits - 1; i >= 0; i--) this.bits.push((value >> i) & 1)
  }
  toBytes (): Uint8Array {
    const bytes = new Uint8Array(Math.ceil(this.bits.length / 8))
    for (let i = 0; i < this.bits.length; i++) {
      if (this.bits[i]) bytes[i >> 3]! |= 1 << (7 - (i & 7))
    }
    return bytes
  }
}

class BitReader {
  private pos = 0
  private bytes: Uint8Array
  constructor (bytes: Uint8Array) { this.bytes = bytes }
  read (nbits: number): number {
    let v = 0
    for (let i = 0; i < nbits; i++) {
      const bit = ((this.bytes[this.pos >> 3] ?? 0) >> (7 - (this.pos & 7))) & 1
      v = (v << 1) | bit
      this.pos++
    }
    return v
  }
}

// ---- base64url -------------------------------------------------------------

function bytesToB64url (bytes: Uint8Array): string {
  let bin = ''
  for (const b of bytes) bin += String.fromCharCode(b)
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function b64urlToBytes (s: string): Uint8Array {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/')
  const bin = atob(b64)
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return bytes
}

// ---- API -------------------------------------------------------------------

export function encodePrediction (p: Prediction): string {
  const w = new BitWriter()
  w.write(VERSION, 4)
  for (let g = 0; g < 12; g++) {
    const base = GROUPS[g]!.teams.map((t) => t.id)
    w.write(permToIndex(p.groupOrder[g]!, base), 5)
  }
  w.write(permToIndex(p.thirdsRank, [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]), 29)
  // El pick se guarda como lado (1=home, 2=away) según en qué cupo está hoy el
  // equipo elegido; 0 si no hay elección o el equipo ya no está en la llave.
  const resolved = resolveMatches(p)
  for (const num of PICK_ORDER) {
    const m = resolved.get(num)
    const chosen = p.picks[num]
    let side = 0
    if (m && chosen != null) {
      if (chosen === m.home) side = 1
      else if (chosen === m.away) side = 2
    }
    w.write(side, 2)
  }
  return bytesToB64url(w.toBytes())
}

export function decodePrediction (code: string): Prediction {
  const r = new BitReader(b64urlToBytes(code))
  const version = r.read(4)
  if (version !== VERSION) throw new Error(`Versión de código no soportada: ${version}`)
  const p = defaultPrediction()
  for (let g = 0; g < 12; g++) {
    const base = GROUPS[g]!.teams.map((t) => t.id)
    p.groupOrder[g] = indexToPerm(r.read(5), base)
  }
  p.thirdsRank = indexToPerm(r.read(29), [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11])
  // Lee los lados y reconstruye los team id resolviendo de forma incremental:
  // cada partido depende solo de los anteriores en PICK_ORDER (R32→final), que
  // ya quedaron decididos al llegar a él.
  p.picks = {}
  const sides = PICK_ORDER.map(() => r.read(2))
  PICK_ORDER.forEach((num, i) => {
    const side = sides[i]
    if (side === 1 || side === 2) {
      const m = resolveMatches(p).get(num)
      const teamId = side === 1 ? m?.home : m?.away
      if (teamId != null) p.picks[num] = teamId
    }
  })
  return p
}
