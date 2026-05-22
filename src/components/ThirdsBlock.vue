<script setup lang="ts">
import { computed } from 'vue'
import draggable from 'vuedraggable'
import { teamById, GROUP_LETTERS } from '../lib/teams'
import type { Prediction } from '../lib/prediction'

const props = defineProps<{ pred: Prediction; readonly?: boolean }>()

interface ThirdItem { group: number; teamId: number }

// Cada ítem se identifica por su grupo (estable aunque cambie el 3º del grupo).
const items = computed<ThirdItem[]>({
  get: () => props.pred.thirdsRank.map((g) => ({ group: g, teamId: props.pred.groupOrder[g]![2]! })),
  set: (list: ThirdItem[]) => { props.pred.thirdsRank = list.map((i) => i.group) },
})
</script>

<template>
  <div class="thirds">
    <div class="thirds-head">
      <h3>Mejores terceros</h3>
      <p>Ordena los 12 terceros: los <strong>8 de arriba</strong> clasifican a dieciseisavos.</p>
    </div>
    <draggable
      v-model="items"
      item-key="group"
      handle=".drag"
      :animation="160"
      ghost-class="ghost"
      :disabled="readonly"
      class="thirds-list"
    >
      <template #item="{ element, index }">
        <div class="third-row" :class="{ in: index < 8, out: index >= 8 }">
          <span class="rank">{{ index + 1 }}</span>
          <span class="flag">{{ teamById(element.teamId).flag }}</span>
          <span class="name">{{ teamById(element.teamId).name }}</span>
          <span class="grp">3º {{ GROUP_LETTERS[element.group] }}</span>
          <span v-if="!readonly" class="drag" aria-label="Reordenar">⋮⋮</span>
        </div>
      </template>
    </draggable>
    <div class="cut-note">— corte de clasificación —</div>
  </div>
</template>

<style scoped>
.thirds {
  background: var(--panel);
  border: 1px solid var(--line);
  border-radius: 12px;
  overflow: hidden;
  box-shadow: var(--shadow);
}
.thirds-head { padding: 0.7rem 0.9rem; background: var(--panel-2); }
.thirds-head h3 { color: var(--gold); font-size: 1.05rem; }
.thirds-head p { font-size: 0.82rem; color: var(--muted); margin-top: 0.2rem; }
.thirds-list { display: flex; flex-direction: column; position: relative; }
.third-row {
  display: flex; align-items: center; gap: 0.55rem;
  padding: 0.5rem 0.7rem; border-top: 1px solid var(--line);
}
.third-row.in { background: rgba(65, 180, 255, 0.14); }
.third-row.out { background: rgba(231, 76, 60, 0.08); opacity: 0.7; }
.rank { width: 1.5rem; text-align: center; font-weight: 700; font-size: 0.8rem; color: var(--muted); }
.flag { font-size: 1.3rem; }
.name { flex: 1; font-size: 0.95rem; }
.grp { font-size: 0.75rem; color: var(--muted); }
.drag { cursor: grab; color: var(--muted); padding: 0 0.2rem; touch-action: none; user-select: none; }
.ghost { opacity: 0.5; background: var(--panel-2); }
/* Línea de corte tras la 8ª fila */
.thirds-list :deep(.third-row:nth-child(8)) { border-bottom: 2px dashed var(--gold); }
.cut-note { display: none; }
</style>
