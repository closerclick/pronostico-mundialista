<script setup lang="ts">
import { computed } from 'vue'
import { teamById, GROUP_LETTERS } from '../lib/teams'
import { resolveMatches, type Prediction, type ResolvedMatch } from '../lib/prediction'
import { R32, R16, QF, SF, FINAL, THIRD_PLACE, type Slot } from '../lib/bracket'
import MatchBox, { type SideView } from './MatchBox.vue'

const props = defineProps<{ pred: Prediction; readonly?: boolean }>()

const resolved = computed(() => resolveMatches(props.pred))
function m (num: number): ResolvedMatch | undefined { return resolved.value.get(num) }

const r32Slots = new Map<number, { home: Slot; away: Slot }>(
  R32.map((x) => [x.num, { home: x.home, away: x.away }]),
)
const laterFrom = new Map<number, [number, number]>(
  [...R16, ...QF, ...SF, THIRD_PLACE, FINAL].map((x) => [x.num, x.from]),
)

function slotLabel (slot: Slot): string {
  if (slot.kind === 'W') return '1.º ' + GROUP_LETTERS[slot.group]
  if (slot.kind === 'RU') return '2.º ' + GROUP_LETTERS[slot.group]
  return '3.º'
}

function side (num: number, top: boolean): SideView {
  const match = m(num)
  const teamId = (top ? match?.home : match?.away) ?? null
  if (teamId != null) {
    const t = teamById(teamId)
    return { teamId, flag: t.flag, code: t.code, label: '' }
  }
  let label = ''
  const r32 = r32Slots.get(num)
  if (r32) label = slotLabel(top ? r32.home : r32.away)
  else if (num === THIRD_PLACE.num) label = 'Perdedor SF'
  else {
    const from = laterFrom.get(num)
    if (from) label = 'Gan. ' + from[top ? 0 : 1]
  }
  return { teamId: null, flag: '', code: '', label }
}

function sides (num: number): [SideView, SideView] { return [side(num, true), side(num, false)] }
function chosen (num: number): number | null { return props.pred.picks[num] ?? null }

function choose (num: number, teamId: number | null) {
  // Se permite elegir aunque el rival esté vacío (basta con que el cupo tocado
  // tenga equipo).
  if (props.readonly || teamId == null) return
  if (props.pred.picks[num] === teamId) delete props.pred.picks[num]
  else props.pred.picks[num] = teamId
}

const leftCols = [
  { title: '16avos', nums: [74, 77, 73, 75, 83, 84, 81, 82] },
  { title: 'Octavos', nums: [89, 90, 93, 94] },
  { title: 'Cuartos', nums: [97, 98] },
  { title: 'Semis', nums: [101] },
]
const rightCols = [
  { title: 'Semis', nums: [102] },
  { title: 'Cuartos', nums: [99, 100] },
  { title: 'Octavos', nums: [91, 92, 95, 96] },
  { title: '16avos', nums: [76, 78, 79, 80, 86, 88, 85, 87] },
]

const championId = computed(() => m(FINAL.num)?.winner ?? null)
</script>

<template>
  <div class="bracket">
    <p class="hint">
      Dieciseisavos se llenan con los clasificados de grupos. Toca quién avanza
      (toca de nuevo para vaciar la llave).
    </p>

    <div class="board">
      <div v-for="(col, ci) in leftCols" :key="'l' + ci" class="col">
        <span class="col-title">{{ col.title }}</span>
        <div class="col-matches">
          <MatchBox
            v-for="num in col.nums"
            :key="num"
            :sides="sides(num)"
            :chosen="chosen(num)"
            :clickable="!readonly"
            @choose="choose(num, $event)"
          />
        </div>
      </div>

      <div class="col center">
        <span class="trophy" :class="{ won: championId != null }">🏆</span>
        <MatchBox
          big
          :sides="sides(FINAL.num)"
          :chosen="chosen(FINAL.num)"
          :clickable="!readonly"
          @choose="choose(FINAL.num, $event)"
        />
        <div v-if="championId != null" class="champ-name">
          {{ teamById(championId).flag }} {{ teamById(championId).name }}
        </div>
        <div class="third">
          <span class="col-title">3.º puesto</span>
          <MatchBox
            :sides="sides(THIRD_PLACE.num)"
            :chosen="chosen(THIRD_PLACE.num)"
            :clickable="!readonly"
            @choose="choose(THIRD_PLACE.num, $event)"
          />
        </div>
      </div>

      <div v-for="(col, ci) in rightCols" :key="'r' + ci" class="col">
        <span class="col-title">{{ col.title }}</span>
        <div class="col-matches">
          <MatchBox
            v-for="num in col.nums"
            :key="num"
            :sides="sides(num)"
            :chosen="chosen(num)"
            :clickable="!readonly"
            @choose="choose(num, $event)"
          />
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.bracket { padding-bottom: 2rem; }
.hint { text-align: center; color: var(--muted); font-size: 0.8rem; margin-bottom: 1rem; flex-shrink: 0; }

/* Las columnas reparten el ancho disponible y entran SIN scroll, tanto en
   móvil como en escritorio. */
.board {
  display: flex; align-items: stretch; gap: 2px; padding-bottom: 1rem;
  width: 100%; max-width: 100%; overflow: hidden;
}

/* En escritorio el bracket llena el alto disponible (app-shell sin scroll
   vertical): el tablero crece y space-around reparte los partidos. */
.col { display: flex; flex-direction: column; flex: 1 1 0; min-width: 0; }
.col-title {
  text-align: center; color: var(--green); font-size: 0.54rem; font-weight: 700;
  text-transform: uppercase; letter-spacing: 0.02em; margin-bottom: 0.3rem;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.col-matches {
  flex: 1; display: flex; flex-direction: column; justify-content: space-around; gap: 0.25rem;
}

.center { flex: 1.4 1 0; justify-content: center; align-items: center; gap: 0.4rem; }
.center > * { width: 100%; }
.trophy { font-size: 1.7rem; text-align: center; filter: grayscale(1) opacity(0.4); transition: filter 0.3s; }
.trophy.won { filter: none; text-shadow: 0 0 18px rgba(255, 207, 63, 0.6); }
.champ-name { color: var(--gold); font-weight: 800; font-size: 0.78rem; text-align: center; }
.third { margin-top: 0.6rem; }

@media (min-width: 760px) {
  /* Mismo reparto flexible, solo con más aire y tipografías mayores. */
  .board { gap: 0.5rem; }
  .center { flex: 1.6 1 0; }
  .trophy { font-size: 2.6rem; }
  .col-title { font-size: 0.7rem; }
}
</style>
