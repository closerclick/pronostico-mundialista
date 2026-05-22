<script setup lang="ts">
import { reactive, ref, watch, onMounted } from 'vue'
import { GROUPS } from './lib/teams'
import {
  defaultPrediction, champion, type Prediction,
} from './lib/prediction'
import { encodePrediction, decodePrediction } from './lib/codec'
import { parseShareFragment } from './lib/share'
import { teamById } from './lib/teams'
import GroupCard from './components/GroupCard.vue'
import ThirdsBlock from './components/ThirdsBlock.vue'
import BracketTab from './components/BracketTab.vue'
import ShareModal from './components/ShareModal.vue'

const STORAGE_KEY = 'mundial.prediction.v1'

const pred = reactive<Prediction>(defaultPrediction())
const tab = ref<'grupos' | 'llaves'>('grupos')
const shareOpen = ref(false)

// Cuando se abre un enlace compartido: pronóstico de otra persona.
const incoming = ref<{ nickname?: string; verified: boolean } | null>(null)

function applyPrediction (p: Prediction) {
  pred.groupOrder = p.groupOrder
  pred.thirdsRank = p.thirdsRank
  pred.picks = p.picks
}

function persist () {
  if (incoming.value) return // no pisar lo guardado mientras se ve uno ajeno
  try { localStorage.setItem(STORAGE_KEY, encodePrediction(pred)) } catch { /* */ }
}

watch(pred, persist, { deep: true })

function useAsBase () {
  // Tomar el pronóstico visto como punto de partida y volver a edición.
  incoming.value = null
  history.replaceState(null, '', location.pathname + location.search)
  persist()
}

function shareCode (): string { return encodePrediction(pred) }

onMounted(async () => {
  const frag = location.hash.replace(/^#/, '')
  if (frag) {
    const parsed = await parseShareFragment(frag)
    if (parsed) {
      try {
        applyPrediction(decodePrediction(parsed.code))
        incoming.value = { nickname: parsed.nickname, verified: parsed.verified }
        tab.value = 'llaves'
        return
      } catch (e) { console.warn('Código inválido en el enlace:', e) }
    }
  }
  const saved = localStorage.getItem(STORAGE_KEY)
  if (saved) {
    try { applyPrediction(decodePrediction(saved)) } catch { /* ignora corrupto */ }
  }
})
</script>

<template>
  <div class="app">
    <header class="topbar">
      <div class="brand">
        <span class="ball">⚽</span>
        <div>
          <h1>Pronóstico Mundialista</h1>
          <span class="sub">Mundial 2026 · 48 selecciones</span>
        </div>
      </div>
      <button class="share-btn" @click="shareOpen = true">Compartir</button>
    </header>

    <div v-if="incoming" class="incoming-banner">
      <span>
        Viendo el pronóstico de <strong>{{ incoming.nickname || 'identidad anónima' }}</strong>
        <span class="badge" :class="{ ok: incoming.verified }">
          {{ incoming.verified ? '✓ firma verificada' : '⚠ sin verificar' }}
        </span>
      </span>
      <button @click="useAsBase">Usar como base</button>
    </div>

    <nav class="tabs">
      <button :class="{ active: tab === 'grupos' }" @click="tab = 'grupos'">Fase de grupos</button>
      <button :class="{ active: tab === 'llaves' }" @click="tab = 'llaves'">Llaves</button>
    </nav>

    <main class="content">
      <section v-show="tab === 'grupos'">
        <p class="tab-hint">Arrastra para ordenar cada grupo (1º y 2º clasifican directo).</p>
        <div class="groups-grid">
          <GroupCard
            v-for="(g, i) in GROUPS"
            :key="g.letter"
            :pred="pred"
            :group="i"
            :letter="g.letter"
          />
        </div>
        <ThirdsBlock :pred="pred" class="thirds-wrap" />
      </section>

      <section v-show="tab === 'llaves'">
        <BracketTab :pred="pred" />
      </section>
    </main>

    <footer class="footer">
      <span v-if="champion(pred) != null">
        Tu campeón: {{ teamById(champion(pred)!).flag }} {{ teamById(champion(pred)!).name }}
      </span>
      <span class="eco">Parte del ecosistema <a href="https://closer.click" target="_blank" rel="noopener">Closer Click</a></span>
    </footer>

    <ShareModal :code="shareCode()" :open="shareOpen" @close="shareOpen = false" />

    <button class="fab" @click="shareOpen = true" aria-label="Compartir">📤</button>
  </div>
</template>

<style scoped>
.app { max-width: 1100px; margin: 0 auto; min-height: 100vh; display: flex; flex-direction: column; }

.topbar {
  display: flex; align-items: center; justify-content: space-between;
  padding: 0.9rem 1rem; gap: 1rem;
  background: var(--green-d); position: sticky; top: 0; z-index: 50;
  box-shadow: 0 2px 14px rgba(0, 0, 0, 0.35);
}
.brand { display: flex; align-items: center; gap: 0.6rem; }
.ball { font-size: 1.8rem; }
.brand h1 { font-size: 1.15rem; line-height: 1.1; }
.brand .sub { font-size: 0.72rem; color: rgba(255, 255, 255, 0.75); }
.share-btn {
  background: var(--gold); color: #3a2e00; border: none; font-weight: 700;
  padding: 0.5rem 1.1rem; border-radius: 50px; cursor: pointer; white-space: nowrap;
}
.share-btn:hover { filter: brightness(1.05); }

.incoming-banner {
  display: flex; align-items: center; justify-content: space-between; gap: 0.8rem;
  flex-wrap: wrap; background: var(--panel-2); padding: 0.6rem 1rem;
  border-bottom: 1px solid var(--line); font-size: 0.85rem;
}
.badge { font-size: 0.72rem; padding: 0.1rem 0.5rem; border-radius: 50px; background: rgba(231,76,60,0.25); margin-left: 0.4rem; }
.badge.ok { background: rgba(46, 204, 113, 0.25); color: var(--green); }
.incoming-banner button {
  background: var(--green); color: #04210f; border: none; font-weight: 700;
  padding: 0.4rem 0.9rem; border-radius: 8px; cursor: pointer;
}

.tabs { display: flex; gap: 0.5rem; padding: 0.8rem 1rem 0; }
.tabs button {
  flex: 1; max-width: 220px; background: var(--panel); color: var(--muted);
  border: 1px solid var(--line); border-bottom: none;
  padding: 0.7rem; border-radius: 10px 10px 0 0; cursor: pointer; font-weight: 600;
}
.tabs button.active { background: var(--panel-2); color: var(--text); border-color: var(--green); }

.content { flex: 1; padding: 1rem; }
.tab-hint { color: var(--muted); font-size: 0.85rem; margin-bottom: 0.9rem; text-align: center; }

.groups-grid {
  display: grid; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); gap: 0.9rem;
}
.thirds-wrap { display: block; margin-top: 1.2rem; max-width: 520px; }

.footer {
  display: flex; flex-direction: column; gap: 0.3rem; align-items: center;
  padding: 1.2rem; color: var(--muted); font-size: 0.82rem; text-align: center;
}
.footer a { color: var(--green); }

.fab {
  position: fixed; right: 1rem; bottom: 1rem; width: 54px; height: 54px;
  border-radius: 50%; border: none; background: var(--gold); font-size: 1.4rem;
  cursor: pointer; box-shadow: var(--shadow); z-index: 40;
}
@media (min-width: 700px) { .fab { display: none; } }

@media (max-width: 480px) {
  .brand h1 { font-size: 1rem; }
}
</style>
