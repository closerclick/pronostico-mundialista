// Equipos del Mundial 2026 según el sorteo final (5 dic 2025, Washington D.C.).
// 48 selecciones, 12 grupos (A-L) de 4 en orden de bombo del sorteo.
//
// El índice global de cada equipo es estable: groupIndex * 4 + posición de
// sorteo (0..3). Ese índice es lo único que viaja en el código compartido,
// así que el orden de esta lista NO debe cambiarse una vez publicado.

export interface Team {
  /** Índice global estable 0..47 */
  id: number
  name: string
  /** Emoji de bandera */
  flag: string
  /** Letra de grupo A..L */
  group: string
}

export interface Group {
  letter: string
  /** Los 4 equipos en orden de sorteo */
  teams: Team[]
}

// [nombre, emoji] en orden de sorteo, grupo por grupo A..L.
const RAW: [string, string][][] = [
  // A
  [['México', '🇲🇽'], ['Sudáfrica', '🇿🇦'], ['Corea del Sur', '🇰🇷'], ['Chequia', '🇨🇿']],
  // B
  [['Canadá', '🇨🇦'], ['Bosnia y Herzegovina', '🇧🇦'], ['Catar', '🇶🇦'], ['Suiza', '🇨🇭']],
  // C
  [['Brasil', '🇧🇷'], ['Marruecos', '🇲🇦'], ['Haití', '🇭🇹'], ['Escocia', '🏴\u{E0067}\u{E0062}\u{E0073}\u{E0063}\u{E0074}\u{E007F}']],
  // D
  [['Estados Unidos', '🇺🇸'], ['Paraguay', '🇵🇾'], ['Australia', '🇦🇺'], ['Turquía', '🇹🇷']],
  // E
  [['Alemania', '🇩🇪'], ['Curazao', '🇨🇼'], ['Costa de Marfil', '🇨🇮'], ['Ecuador', '🇪🇨']],
  // F
  [['Países Bajos', '🇳🇱'], ['Japón', '🇯🇵'], ['Suecia', '🇸🇪'], ['Túnez', '🇹🇳']],
  // G
  [['Bélgica', '🇧🇪'], ['Egipto', '🇪🇬'], ['Irán', '🇮🇷'], ['Nueva Zelanda', '🇳🇿']],
  // H
  [['España', '🇪🇸'], ['Cabo Verde', '🇨🇻'], ['Arabia Saudita', '🇸🇦'], ['Uruguay', '🇺🇾']],
  // I
  [['Francia', '🇫🇷'], ['Senegal', '🇸🇳'], ['Irak', '🇮🇶'], ['Noruega', '🇳🇴']],
  // J
  [['Argentina', '🇦🇷'], ['Argelia', '🇩🇿'], ['Austria', '🇦🇹'], ['Jordania', '🇯🇴']],
  // K
  [['Portugal', '🇵🇹'], ['RD Congo', '🇨🇩'], ['Uzbekistán', '🇺🇿'], ['Colombia', '🇨🇴']],
  // L
  [['Inglaterra', '🏴\u{E0067}\u{E0062}\u{E0065}\u{E006E}\u{E0067}\u{E007F}'], ['Croacia', '🇭🇷'], ['Ghana', '🇬🇭'], ['Panamá', '🇵🇦']],
]

export const GROUP_LETTERS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L']

export const TEAMS: Team[] = []
export const GROUPS: Group[] = RAW.map((raw, gi) => {
  const letter = GROUP_LETTERS[gi]!
  const teams = raw.map(([name, flag], pi) => {
    const team: Team = { id: gi * 4 + pi, name: name!, flag: flag!, group: letter }
    TEAMS.push(team)
    return team
  })
  return { letter, teams }
})

export function teamById (id: number): Team {
  return TEAMS[id]!
}

/** Índice de grupo (0..11) a partir de la letra. */
export function groupIndex (letter: string): number {
  return GROUP_LETTERS.indexOf(letter)
}
