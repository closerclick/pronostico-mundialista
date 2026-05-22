<script setup lang="ts">
import { computed } from 'vue'
import { teamById } from '../lib/teams'
import { resolveMatches, type Prediction, type ResolvedMatch } from '../lib/prediction'
import { R32, R16, QF, SF, FINAL, THIRD_PLACE } from '../lib/bracket'

const props = defineProps<{ pred: Prediction }>()

const resolved = computed(() => resolveMatches(props.pred))

const rounds = computed(() => [
  { title: 'Dieciseisavos', nums: R32.map((m) => m.num) },
  { title: 'Octavos', nums: R16.map((m) => m.num) },
  { title: 'Cuartos', nums: QF.map((m) => m.num) },
  { title: 'Semifinales', nums: SF.map((m) => m.num) },
  { title: 'Final', nums: [FINAL.num] },
])

function m (num: number): ResolvedMatch | undefined { return resolved.value.get(num) }

const championId = computed(() => m(FINAL.num)?.winner ?? null)

function setPick (num: number, side: 0 | 1) {
  const match = m(num)
  if (!match || match.home == null || match.away == null) return
  props.pred.picks[num] = side
}

function pickedSide (num: number): 0 | 1 | null {
  const match = m(num)
  if (!match || match.home == null || match.away == null) return null
  return props.pred.picks[num] ?? 0
}
</script>

<template>
  <div class="bracket-wrap">
    <div v-if="championId != null" class="champion">
      <span class="trophy">🏆</span>
      <span class="champ-flag">{{ teamById(championId).flag }}</span>
      <span class="champ-name">{{ teamById(championId).name }}</span>
      <span class="champ-label">campeón</span>
    </div>

    <p class="hint">Toca el equipo que avanza en cada llave.</p>

    <div class="rounds">
      <div v-for="round in rounds" :key="round.title" class="round">
        <h4 class="round-title">{{ round.title }}</h4>
        <div class="round-matches">
          <div v-for="num in round.nums" :key="num" class="match">
            <button
              v-for="(teamId, idx) in [m(num)?.home, m(num)?.away]"
              :key="idx"
              class="side"
              :class="{
                picked: pickedSide(num) === idx,
                empty: teamId == null,
              }"
              :disabled="teamId == null"
              @click="setPick(num, idx as 0 | 1)"
            >
              <template v-if="teamId != null">
                <span class="flag">{{ teamById(teamId).flag }}</span>
                <span class="name">{{ teamById(teamId).name }}</span>
              </template>
              <template v-else>
                <span class="tbd">—</span>
              </template>
            </button>
            <span class="match-num">#{{ num }}</span>
          </div>
        </div>
      </div>
    </div>

    <div class="third-place">
      <h4 class="round-title">Tercer puesto</h4>
      <div class="match wide">
        <button
          v-for="(teamId, idx) in [m(THIRD_PLACE.num)?.home, m(THIRD_PLACE.num)?.away]"
          :key="idx"
          class="side"
          :class="{ picked: pickedSide(THIRD_PLACE.num) === idx, empty: teamId == null }"
          :disabled="teamId == null"
          @click="setPick(THIRD_PLACE.num, idx as 0 | 1)"
        >
          <template v-if="teamId != null">
            <span class="flag">{{ teamById(teamId).flag }}</span>
            <span class="name">{{ teamById(teamId).name }}</span>
          </template>
          <template v-else><span class="tbd">perdedor de semifinal</span></template>
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.bracket-wrap { padding-bottom: 2rem; }
.champion {
  display: flex; align-items: center; justify-content: center; gap: 0.6rem;
  background: linear-gradient(90deg, rgba(241,196,15,0.15), rgba(241,196,15,0.05));
  border: 1px solid var(--gold); border-radius: 12px;
  padding: 0.8rem 1rem; margin-bottom: 1rem; flex-wrap: wrap;
}
.trophy { font-size: 1.6rem; }
.champ-flag { font-size: 1.8rem; }
.champ-name { font-size: 1.3rem; font-weight: 800; color: var(--gold); }
.champ-label { font-size: 0.8rem; text-transform: uppercase; letter-spacing: 0.1em; color: var(--muted); }
.hint { text-align: center; color: var(--muted); font-size: 0.85rem; margin-bottom: 1rem; }

.rounds { display: flex; gap: 1rem; overflow-x: auto; padding-bottom: 1rem; }
.round { min-width: 180px; flex-shrink: 0; }
.round-title { text-align: center; color: var(--green); font-size: 0.9rem; margin-bottom: 0.6rem; text-transform: uppercase; letter-spacing: 0.05em; }
.round-matches { display: flex; flex-direction: column; gap: 0.7rem; }
.match {
  background: var(--panel); border: 1px solid var(--line); border-radius: 10px;
  overflow: hidden; position: relative;
}
.match.wide { max-width: 340px; margin: 0 auto; }
.side {
  display: flex; align-items: center; gap: 0.5rem; width: 100%;
  background: transparent; border: none; color: var(--text);
  padding: 0.5rem 0.6rem; cursor: pointer; text-align: left;
  border-top: 1px solid var(--line);
}
.side:first-child { border-top: none; }
.side:hover:not(:disabled) { background: var(--panel-2); }
.side.picked { background: rgba(46, 204, 113, 0.22); font-weight: 700; }
.side.picked .name { color: var(--green); }
.side:disabled { cursor: default; opacity: 0.5; }
.side .flag { font-size: 1.2rem; }
.side .name { font-size: 0.88rem; }
.tbd { font-size: 0.8rem; color: var(--muted); font-style: italic; }
.match-num {
  position: absolute; top: 2px; right: 4px; font-size: 0.6rem; color: var(--muted);
}
.third-place { margin-top: 1.5rem; }
</style>
