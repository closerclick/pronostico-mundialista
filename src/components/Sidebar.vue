<script setup lang="ts">
import { computed } from 'vue'
import type { SavedPrediction } from '../lib/store'

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
  share: [id: string]
  print: [id: string]
  pdf: [id: string]
}>()

const mine = computed(() => props.library.filter((p) => p.mine).sort((a, b) => b.updatedAt - a.updatedAt))
const imported = computed(() => props.library.filter((p) => !p.mine).sort((a, b) => b.updatedAt - a.updatedAt))
</script>

<template>
  <div class="drawer-root" :class="{ open }">
    <div class="scrim" @click="emit('close')"></div>
    <aside class="drawer">
      <header class="dh">
        <span>Pronósticos</span>
        <button class="x" @click="emit('close')" aria-label="Cerrar">×</button>
      </header>

      <div class="actions">
        <button class="act new" @click="emit('create')">➕ Nuevo</button>
        <button class="act imp" @click="emit('import')">📥 Importar</button>
      </div>

      <section class="group">
        <h4>Mis pronósticos</h4>
        <p v-if="!mine.length" class="empty">Aún no tienes ninguno.</p>
        <div
          v-for="p in mine"
          :key="p.id"
          class="item"
          :class="{ active: p.id === activeId }"
          @click="emit('select', p.id)"
        >
          <span class="nm">{{ p.name }}</span>
          <span class="tools">
            <button class="share-i" title="Compartir" @click.stop="emit('share', p.id)">
              <svg viewBox="0 0 24 24" width="15" height="15" fill="currentColor" aria-hidden="true">
                <path d="M18 16.08c-.76 0-1.44.3-1.96.77L8.91 12.7c.05-.23.09-.46.09-.7s-.04-.47-.09-.7l7.05-4.11c.54.5 1.25.81 2.04.81 1.66 0 3-1.34 3-3s-1.34-3-3-3-3 1.34-3 3c0 .24.04.47.09.7L8.04 9.81C7.5 9.31 6.79 9 6 9c-1.66 0-3 1.34-3 3s1.34 3 3 3c.79 0 1.5-.31 2.04-.81l7.12 4.16c-.05.21-.08.43-.08.65 0 1.61 1.31 2.92 2.92 2.92s2.92-1.31 2.92-2.92-1.31-2.92-2.92-2.92z" />
              </svg>
            </button>
            <button title="Imprimir" @click.stop="emit('print', p.id)">🖨</button>
            <button class="pdf-i" title="Descargar PDF" @click.stop="emit('pdf', p.id)">
              <img src="/pdf.svg" alt="PDF" class="pdf-img" />
            </button>
            <button title="Renombrar" @click.stop="emit('rename', p.id)">✎</button>
            <button title="Eliminar" @click.stop="emit('remove', p.id)">🗑</button>
          </span>
        </div>
      </section>

      <section class="group">
        <h4>Importados</h4>
        <p v-if="!imported.length" class="empty">Importa el enlace de alguien más.</p>
        <div
          v-for="p in imported"
          :key="p.id"
          class="item"
          :class="{ active: p.id === activeId }"
          @click="emit('select', p.id)"
        >
          <span class="nm">
            {{ p.name }}
            <small class="auth" :class="{ ok: p.author?.verified }">
              {{ p.author?.verified ? '✓' : '⚠' }} {{ p.author?.nickname || 'anónimo' }}
            </small>
          </span>
          <span class="tools">
            <button class="share-i" title="Compartir" @click.stop="emit('share', p.id)">
              <svg viewBox="0 0 24 24" width="15" height="15" fill="currentColor" aria-hidden="true">
                <path d="M18 16.08c-.76 0-1.44.3-1.96.77L8.91 12.7c.05-.23.09-.46.09-.7s-.04-.47-.09-.7l7.05-4.11c.54.5 1.25.81 2.04.81 1.66 0 3-1.34 3-3s-1.34-3-3-3-3 1.34-3 3c0 .24.04.47.09.7L8.04 9.81C7.5 9.31 6.79 9 6 9c-1.66 0-3 1.34-3 3s1.34 3 3 3c.79 0 1.5-.31 2.04-.81l7.12 4.16c-.05.21-.08.43-.08.65 0 1.61 1.31 2.92 2.92 2.92s2.92-1.31 2.92-2.92-1.31-2.92-2.92-2.92z" />
              </svg>
            </button>
            <button title="Imprimir" @click.stop="emit('print', p.id)">🖨</button>
            <button class="pdf-i" title="Descargar PDF" @click.stop="emit('pdf', p.id)">
              <img src="/pdf.svg" alt="PDF" class="pdf-img" />
            </button>
            <button title="Editar una copia" @click.stop="emit('copy', p.id)">⎘</button>
            <button title="Eliminar" @click.stop="emit('remove', p.id)">🗑</button>
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
.nm { display: flex; flex-direction: column; font-size: 0.9rem; min-width: 0; }
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
