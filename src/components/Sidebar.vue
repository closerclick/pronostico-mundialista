<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import type { SavedPrediction } from '../lib/store'
import { scoreEntry } from '../lib/scoring'
import { decodePrediction } from '../lib/codec'
import { completeness } from '../lib/prediction'

const { t } = useI18n()

// Etiqueta corta del tipo (modo) del pronóstico. Si el entry no lo guarda
// (importados), se lee del código.
function modeLabel (p: SavedPrediction): string {
  let m = p.mode
  if (!m) { try { m = decodePrediction(p.code).mode } catch { m = 'manual' } }
  return m === 'winlose' ? t('modes.medium') : m === 'score' ? t('modes.full') : t('modes.simple')
}

// % de llenado del pronóstico (para el chip de progreso).
function fillPct (p: SavedPrediction): number {
  try {
    const pred = decodePrediction(p.code)
    if (p.mode) pred.mode = p.mode
    if (p.results) pred.results = p.results
    return completeness(pred).pct
  } catch { return 0 }
}

const props = defineProps<{
  open: boolean
  library: SavedPrediction[]
  activeId: string | null
}>()
const emit = defineEmits<{
  close: []
  select: [id: string]
  create: []
  import: []
  remove: [id: string]
  rename: [id: string]
  copy: [id: string]
  clonetype: [id: string]
  share: [id: string]
  print: [id: string]
  pdf: [id: string]
  scoring: []
}>()

const mine = computed(() => props.library.filter((p) => p.mine && !p.official).sort((a, b) => b.updatedAt - a.updatedAt))
const imported = computed(() => props.library.filter((p) => !p.mine).sort((a, b) => b.updatedAt - a.updatedAt))
// Resultados REALES/oficiales: entradas marcadas con `official`.
const official = computed(() => props.library.filter((p) => p.official).sort((a, b) => b.updatedAt - a.updatedAt))

// Entrada oficial (base de comparación) y mapa id→puntaje total.
const officialEntry = computed<SavedPrediction | null>(() => props.library.find((p) => p.official) ?? null)
const scores = computed<Record<string, number>>(() => {
  const o = officialEntry.value
  const map: Record<string, number> = {}
  if (!o) return map
  for (const p of props.library) {
    if (p.official) continue
    map[p.id] = scoreEntry(p, o).total
  }
  return map
})
</script>

<template>
  <div class="drawer-root" :class="{ open }">
    <div class="scrim" @click="emit('close')"></div>
    <aside class="drawer">
      <header class="dh">
        <span>{{ t('sidebar.title') }}</span>
        <button class="x" @click="emit('close')" :aria-label="t('common.close')">×</button>
      </header>

      <div class="actions">
        <button class="act new" data-testid="sb-new" @click="emit('create')">{{ t('sidebar.new') }}</button>
        <button class="act imp" data-testid="sb-import" @click="emit('import')">{{ t('sidebar.import') }}</button>
      </div>

      <button class="scoring-btn" data-testid="sb-scoring" @click="emit('scoring')">{{ t('sidebar.scoring') }}</button>

      <section class="group" data-testid="sb-section-mine">
        <h4>{{ t('sidebar.mine') }}</h4>
        <p v-if="!mine.length" class="empty">{{ t('sidebar.emptyMine') }}</p>
        <div
          v-for="p in mine"
          :key="p.id"
          class="item"
          data-testid="pred-item"
          :data-id="p.id"
          :class="{ active: p.id === activeId }"
          @click="emit('select', p.id)"
        >
          <span class="nm">
            <span class="nm-row">{{ p.name }} <small class="mode-tag">{{ modeLabel(p) }}</small> <small class="fill-tag" :class="{ full: fillPct(p) >= 100 }">{{ fillPct(p) }}%</small></span>
            <span v-if="officialEntry" class="score-chip" :title="t('sidebar.pointsTitle')">▦ {{ t('sidebar.points', { n: scores[p.id] ?? 0 }) }}</span>
          </span>
          <span class="tools">
            <button class="share-i" :title="t('common.share')" @click.stop="emit('share', p.id)">
              <svg viewBox="0 0 24 24" width="15" height="15" fill="currentColor" aria-hidden="true">
                <path d="M18 16.08c-.76 0-1.44.3-1.96.77L8.91 12.7c.05-.23.09-.46.09-.7s-.04-.47-.09-.7l7.05-4.11c.54.5 1.25.81 2.04.81 1.66 0 3-1.34 3-3s-1.34-3-3-3-3 1.34-3 3c0 .24.04.47.09.7L8.04 9.81C7.5 9.31 6.79 9 6 9c-1.66 0-3 1.34-3 3s1.34 3 3 3c.79 0 1.5-.31 2.04-.81l7.12 4.16c-.05.21-.08.43-.08.65 0 1.61 1.31 2.92 2.92 2.92s2.92-1.31 2.92-2.92-1.31-2.92-2.92-2.92z" />
              </svg>
            </button>
            <button :title="t('common.print')" @click.stop="emit('print', p.id)">🖨</button>
            <button class="pdf-i" :title="t('common.pdf')" @click.stop="emit('pdf', p.id)">
              <img src="/pdf.svg" alt="PDF" class="pdf-img" />
            </button>
            <button :title="t('modes.cloneToType')" @click.stop="emit('clonetype', p.id)">
              <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor" aria-hidden="true">
                <path d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z" />
              </svg>
            </button>
            <button :title="t('common.rename')" @click.stop="emit('rename', p.id)">✎</button>
            <button :title="t('common.delete')" @click.stop="emit('remove', p.id)">🗑</button>
          </span>
        </div>
      </section>

      <section class="group" data-testid="sb-section-imported">
        <h4>{{ t('sidebar.friends') }}</h4>
        <p v-if="!imported.length" class="empty">{{ t('sidebar.emptyFriends') }}</p>
        <div
          v-for="p in imported"
          :key="p.id"
          class="item"
          data-testid="pred-item"
          :data-id="p.id"
          :class="{ active: p.id === activeId }"
          @click="emit('select', p.id)"
        >
          <span class="nm">
            <span class="nm-row">{{ p.name }} <small class="mode-tag">{{ modeLabel(p) }}</small> <small class="fill-tag" :class="{ full: fillPct(p) >= 100 }">{{ fillPct(p) }}%</small></span>
            <small class="auth" :class="{ ok: p.author?.verified }">
              {{ p.author?.verified ? '✓' : '⚠' }} {{ p.author?.nickname || t('common.anonymous') }}
            </small>
            <span v-if="officialEntry" class="score-chip" :title="t('sidebar.pointsTitle')">▦ {{ t('sidebar.points', { n: scores[p.id] ?? 0 }) }}</span>
          </span>
          <span class="tools">
            <button class="share-i" :title="t('common.share')" @click.stop="emit('share', p.id)">
              <svg viewBox="0 0 24 24" width="15" height="15" fill="currentColor" aria-hidden="true">
                <path d="M18 16.08c-.76 0-1.44.3-1.96.77L8.91 12.7c.05-.23.09-.46.09-.7s-.04-.47-.09-.7l7.05-4.11c.54.5 1.25.81 2.04.81 1.66 0 3-1.34 3-3s-1.34-3-3-3-3 1.34-3 3c0 .24.04.47.09.7L8.04 9.81C7.5 9.31 6.79 9 6 9c-1.66 0-3 1.34-3 3s1.34 3 3 3c.79 0 1.5-.31 2.04-.81l7.12 4.16c-.05.21-.08.43-.08.65 0 1.61 1.31 2.92 2.92 2.92s2.92-1.31 2.92-2.92-1.31-2.92-2.92-2.92z" />
              </svg>
            </button>
            <button :title="t('common.print')" @click.stop="emit('print', p.id)">🖨</button>
            <button class="pdf-i" :title="t('common.pdf')" @click.stop="emit('pdf', p.id)">
              <img src="/pdf.svg" alt="PDF" class="pdf-img" />
            </button>
            <button :title="t('modes.cloneToType')" @click.stop="emit('clonetype', p.id)">
              <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor" aria-hidden="true">
                <path d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z" />
              </svg>
            </button>
            <button :title="t('common.delete')" @click.stop="emit('remove', p.id)">🗑</button>
          </span>
        </div>
      </section>

      <section class="group" data-testid="sb-section-official">
        <h4>{{ t('sidebar.results') }}</h4>
        <p v-if="!official.length" class="empty">{{ t('sidebar.emptyOfficial') }}</p>
        <div
          v-for="p in official"
          :key="p.id"
          class="item"
          data-testid="pred-item"
          :data-id="p.id"
          :class="{ active: p.id === activeId }"
          @click="emit('select', p.id)"
        >
          <span class="nm">{{ p.name }}</span>
          <!-- No se elimina ni renombra; solo compartir/imprimir. -->
          <span class="tools">
            <button class="share-i" :title="t('common.share')" @click.stop="emit('share', p.id)">
              <svg viewBox="0 0 24 24" width="15" height="15" fill="currentColor" aria-hidden="true">
                <path d="M18 16.08c-.76 0-1.44.3-1.96.77L8.91 12.7c.05-.23.09-.46.09-.7s-.04-.47-.09-.7l7.05-4.11c.54.5 1.25.81 2.04.81 1.66 0 3-1.34 3-3s-1.34-3-3-3-3 1.34-3 3c0 .24.04.47.09.7L8.04 9.81C7.5 9.31 6.79 9 6 9c-1.66 0-3 1.34-3 3s1.34 3 3 3c.79 0 1.5-.31 2.04-.81l7.12 4.16c-.05.21-.08.43-.08.65 0 1.61 1.31 2.92 2.92 2.92s2.92-1.31 2.92-2.92-1.31-2.92-2.92-2.92z" />
              </svg>
            </button>
            <button :title="t('common.print')" @click.stop="emit('print', p.id)">🖨</button>
            <button class="pdf-i" :title="t('common.pdf')" @click.stop="emit('pdf', p.id)">
              <img src="/pdf.svg" alt="PDF" class="pdf-img" />
            </button>
          </span>
        </div>
      </section>
    </aside>
  </div>
</template>

<style scoped>
.drawer-root { position: fixed; inset: 0; z-index: 200; pointer-events: none; }
.drawer-root.open { pointer-events: auto; }
.scrim {
  position: absolute; inset: 0; background: rgba(0, 0, 0, 0.5);
  opacity: 0; transition: opacity 0.25s;
}
.drawer-root.open .scrim { opacity: 1; }
.drawer {
  position: absolute; top: 0; left: 0; height: 100%; width: 290px; max-width: 85vw;
  background: var(--bg-2); border-right: 1px solid var(--line);
  transform: translateX(-100%); transition: transform 0.25s ease;
  display: flex; flex-direction: column; box-shadow: var(--shadow);
}
.drawer-root.open .drawer { transform: translateX(0); }
.dh {
  display: flex; align-items: center; justify-content: space-between;
  padding: 1rem; font-weight: 700; background: var(--green-d);
}
.x { background: none; border: none; color: #fff; font-size: 1.5rem; cursor: pointer; line-height: 1; }
.actions { display: flex; gap: 0.5rem; padding: 0.8rem; }
.act { flex: 1; border: none; border-radius: 8px; padding: 0.6rem; font-weight: 700; cursor: pointer; }
.act.new { background: var(--green); color: #04210f; }
.act.imp { background: var(--panel-2); color: var(--text); border: 1px solid var(--line); }
.group { padding: 0.4rem 0.8rem; overflow-y: auto; }
.group h4 { color: var(--muted); font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.05em; margin: 0.6rem 0 0.4rem; }
.empty { color: var(--muted); font-size: 0.8rem; font-style: italic; padding: 0.3rem 0; }
.item {
  display: flex; align-items: center; justify-content: space-between; gap: 0.4rem;
  padding: 0.55rem 0.6rem; border-radius: 8px; cursor: pointer; margin-bottom: 0.3rem;
  background: var(--panel); border: 1px solid transparent;
}
.item:hover { background: var(--panel-2); }
.item.active { border-color: var(--green); background: var(--panel-2); }
.scoring-btn {
  margin: 0 0.8rem 0.2rem; padding: 0.5rem; border-radius: 8px; cursor: pointer;
  background: transparent; color: var(--azure); border: 1px solid var(--azure);
  font-weight: 700; font-size: 0.82rem;
}
.scoring-btn:hover { background: rgba(65, 180, 255, 0.12); }
.nm { display: flex; flex-direction: column; align-items: flex-start; font-size: 0.9rem; min-width: 0; }
.nm-row { display: inline-flex; align-items: center; gap: 0.35rem; flex-wrap: wrap; }
.mode-tag {
  font-size: 0.6rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.04em;
  color: var(--azure); border: 1px solid var(--line); border-radius: 5px; padding: 0 0.25rem;
}
.fill-tag { font-size: 0.62rem; font-weight: 700; color: var(--muted); }
.fill-tag.full { color: var(--green); }
.score-chip {
  margin-top: 0.2rem; align-self: flex-start; background: var(--azure); color: #04210f;
  font-weight: 800; font-size: 0.7rem; border-radius: 6px; padding: 0.05rem 0.4rem; white-space: nowrap;
}
.nm .auth { font-size: 0.68rem; color: #e0a; }
.nm .auth.ok { color: var(--green); }
.auth { color: var(--muted); }
.tools { display: flex; gap: 0.15rem; flex-shrink: 0; }
.tools button {
  background: none; border: none; color: var(--muted); cursor: pointer;
  font-size: 0.8rem; padding: 0.15rem 0.3rem; border-radius: 5px;
  display: inline-flex; align-items: center; justify-content: center;
}
.tools svg { display: block; }
.tools .pdf-img { display: block; width: 14px; height: 17px; }
.tools button:hover { background: rgba(255,255,255,0.1); color: var(--text); }
.tools .share-i { color: var(--azure); }
.tools .share-i:hover { background: rgba(65, 180, 255, 0.18); color: var(--azure); }

/* Escritorio: barra lateral fija, sin scrim ni animación */
@media (min-width: 960px) {
  .drawer-root {
    position: sticky; top: 0; inset: auto; height: 100vh;
    width: 290px; flex-shrink: 0; pointer-events: auto; z-index: 1;
  }
  .scrim { display: none; }
  .drawer {
    position: static; transform: none !important; height: 100vh;
    box-shadow: none; border-right: 1px solid var(--line); overflow-y: auto;
  }
  .dh .x { display: none; }
}
</style>
