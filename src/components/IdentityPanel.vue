<script setup lang="ts">
import { ref, watch, computed } from 'vue'
import { useI18n } from 'vue-i18n'
import type { PeerInfo } from '@gatoseya/closer-click-identity'
import { getIdentity, type IdentityInstance } from '../lib/identity'
import { buildTrustMap, computeDerivedRating, shortKey } from '../lib/rating'
import { resolveTokenToIdentity, ProxyTokenError } from '../lib/proxy'

const { t } = useI18n()

const props = defineProps<{ open: boolean; focusPubkey?: string | null }>()
const emit = defineEmits<{ close: []; changed: [] }>()

type Tab = 'perfil' | 'contactos' | 'rankings'
const tab = ref<Tab>('perfil')

const id = ref<IdentityInstance | null>(null)
const unreachable = ref(false)
const myNick = ref('')
const nickDraft = ref('')
const savingNick = ref(false)

const contacts = ref<PeerInfo[]>([])
const peers = ref<PeerInfo[]>([])
const newToken = ref('')
const newNick = ref('')
const addError = ref('')
const addStatus = ref('')   // mensaje de progreso ("Buscando token…", éxito)
const adding = ref(false)

const trustMap = computed(() => buildTrustMap(peers.value))
const ranking = computed(() =>
  [...peers.value]
    .map((p) => ({ peer: p, r: computeDerivedRating(p, trustMap.value) }))
    .filter((x) => x.r.value != null)
    .sort((a, b) => (b.r.value ?? 0) - (a.r.value ?? 0)),
)

async function load () {
  const inst = await getIdentity()
  id.value = inst
  if (!inst) { unreachable.value = true; return }
  unreachable.value = false
  myNick.value = inst.me?.nickname ?? ''
  nickDraft.value = myNick.value
  await refresh()
  if (props.focusPubkey) {
    // Si nos enfocan en un pubkey concreto (p.ej. desde un pronóstico
    // firmado) abrimos directamente la pestaña de contactos. Ya no
    // prerrellenamos la clave: ahora los contactos se agregan por token.
    tab.value = 'contactos'
  }
}

async function refresh () {
  if (!id.value) return
  contacts.value = await id.value.listContacts().catch(() => [])
  peers.value = await id.value.listPeers().catch(() => [])
}

watch(() => props.open, (o) => { if (o) load() })

async function saveNick () {
  if (!id.value || !nickDraft.value.trim()) return
  savingNick.value = true
  try {
    await id.value.setMyNickname(nickDraft.value.trim())
    myNick.value = nickDraft.value.trim()
    emit('changed')
  } finally { savingNick.value = false }
}

async function addContact () {
  addError.value = ''
  addStatus.value = ''
  if (!id.value || adding.value) return

  // Normalizamos el token tal como hace el messenger: mayúsculas, sin espacios.
  const token = newToken.value.trim().toUpperCase()
  if (!/^[A-Z0-9]{4,8}$/.test(token)) {
    addError.value = t('identity.tokenInvalid')
    return
  }

  adding.value = true
  addStatus.value = t('identity.searchingToken')
  try {
    // Resolvemos el token → identidad real (clave pública) vía el proxy:
    // mandamos un challenge firmado y verificamos la respuesta del peer.
    const resolved = await resolveTokenToIdentity(token, id.value)

    if (resolved.publickey === id.value.me?.publickey) {
      addError.value = t('identity.tokenIsYours')
      addStatus.value = ''
      return
    }

    await id.value.addContact({
      publickey: resolved.publickey,
      // Preferimos el apodo que escribió el usuario; si no, el que anunció el peer.
      nickname: newNick.value.trim() || resolved.nickname || undefined,
      encryptionPubkey: resolved.encryptionPubkey || undefined,
      lastToken: token,
    })
    newToken.value = ''
    newNick.value = ''
    addStatus.value = t('identity.contactAdded')
    await refresh()
    emit('changed')
  } catch (e) {
    addStatus.value = ''
    if (e instanceof ProxyTokenError) {
      addError.value = e.message
    } else {
      addError.value = t('identity.addError')
    }
  } finally {
    adding.value = false
  }
}

async function removeContact (pk: string) {
  if (!id.value) return
  await id.value.removeContact(pk)
  await refresh(); emit('changed')
}

async function rate (pk: string, n: number) {
  if (!id.value) return
  await id.value.setRating(pk, n, '')
  await refresh(); emit('changed')
}

function myRatingOf (p: PeerInfo): number { return p.myRating?.rating ?? 0 }
</script>

<template>
  <div v-if="open" class="overlay" @click.self="emit('close')">
    <div class="panel">
      <button class="x" @click="emit('close')" :aria-label="t('common.close')">×</button>
      <h3>{{ t('identity.title') }}</h3>

      <nav class="ptabs">
        <button :class="{ on: tab === 'perfil' }" @click="tab = 'perfil'">{{ t('identity.tabProfile') }}</button>
        <button :class="{ on: tab === 'contactos' }" @click="tab = 'contactos'">{{ t('identity.tabContacts') }}</button>
        <button :class="{ on: tab === 'rankings' }" @click="tab = 'rankings'">{{ t('identity.tabRankings') }}</button>
      </nav>

      <i18n-t v-if="unreachable" keypath="identity.unreachable" tag="p" class="warn" scope="global">
        <template #vault><code>id.closer.click</code></template>
      </i18n-t>

      <!-- PERFIL -->
      <section v-show="tab === 'perfil'" class="body">
        <label class="lbl">{{ t('identity.nickLabel') }}</label>
        <div class="row">
          <input v-model="nickDraft" maxlength="40" :placeholder="t('identity.nickPlaceholder')" @keydown.stop />
          <button class="go" :disabled="savingNick || nickDraft.trim() === myNick" @click="saveNick">
            {{ savingNick ? '…' : t('common.save') }}
          </button>
        </div>
        <p class="hint">{{ t('identity.nickHint') }}</p>
      </section>

      <!-- CONTACTOS -->
      <section v-show="tab === 'contactos'" class="body">
        <div class="add">
          <input
            v-model="newToken"
            class="token"
            maxlength="8"
            :placeholder="t('identity.tokenPlaceholder')"
            :disabled="adding"
            @keydown.stop
            @keyup.enter="addContact"
          />
          <input v-model="newNick" :placeholder="t('identity.nickOptional')" :disabled="adding" @keydown.stop />
          <button class="go" :disabled="adding || !newToken.trim()" @click="addContact">
            {{ adding ? t('identity.searching') : t('identity.addContact') }}
          </button>
          <p v-if="addStatus" class="status">{{ addStatus }}</p>
          <p v-if="addError" class="err">{{ addError }}</p>
          <i18n-t keypath="identity.addContactHint" tag="p" class="hint" scope="global">
            <template #token><strong>{{ t('identity.tokenWord') }}</strong></template>
          </i18n-t>
        </div>
        <p v-if="!contacts.length" class="empty">{{ t('identity.noContacts') }}</p>
        <div v-for="c in contacts" :key="c.publickey" class="contact">
          <div class="ci">
            <span class="nm">{{ c.nickname || t('identity.noNick') }}</span>
            <span class="mono sm">{{ shortKey(c.publickey) }}</span>
          </div>
          <div class="stars">
            <button
              v-for="n in 5"
              :key="n"
              class="star"
              :class="{ on: n <= myRatingOf(c) }"
              @click="rate(c.publickey, n === myRatingOf(c) ? 0 : n)"
            >★</button>
          </div>
          <button class="del" :title="t('common.delete')" @click="removeContact(c.publickey)">🗑</button>
        </div>
      </section>

      <!-- RANKINGS -->
      <section v-show="tab === 'rankings'" class="body">
        <p class="hint">{{ t('identity.rankingsHint') }}</p>
        <p v-if="!ranking.length" class="empty">{{ t('identity.noRatings') }}</p>
        <div v-for="(x, i) in ranking" :key="x.peer.publickey" class="rank-row">
          <span class="pos">{{ i + 1 }}</span>
          <div class="ci">
            <span class="nm">{{ x.peer.nickname || t('identity.anon') }}</span>
            <span class="mono sm">{{ shortKey(x.peer.publickey) }}</span>
          </div>
          <span class="score">
            {{ x.r.value!.toFixed(1) }} <span class="star on">★</span>
            <small>{{ x.r.source === 'mine' ? t('identity.sourceMine') : `×${x.r.count}` }}</small>
          </span>
        </div>
      </section>
    </div>
  </div>
</template>

<style scoped>
.overlay {
  position: fixed; inset: 0; background: rgba(0, 0, 0, 0.66);
  display: flex; align-items: center; justify-content: center; z-index: 400; padding: 1rem;
}
.panel {
  background: var(--panel); border: 1px solid var(--line); border-radius: 16px;
  padding: 1.3rem; max-width: 420px; width: 100%; position: relative;
  box-shadow: var(--shadow); max-height: 88vh; display: flex; flex-direction: column;
}
.x { position: absolute; top: 0.5rem; right: 0.7rem; background: none; border: none; color: var(--muted); font-size: 1.5rem; cursor: pointer; }
h3 { color: var(--azure); margin-bottom: 0.8rem; }
.ptabs { display: flex; gap: 0.3rem; margin-bottom: 0.9rem; }
.ptabs button {
  flex: 1; background: transparent; border: 1px solid var(--line); color: var(--muted);
  padding: 0.5rem; border-radius: 8px; cursor: pointer; font-weight: 700; font-size: 0.85rem;
}
.ptabs button.on { background: var(--panel-2); color: var(--text); border-color: var(--azure); }
.warn { color: var(--gold); font-size: 0.82rem; margin-bottom: 0.6rem; }
.body { overflow-y: auto; }

.lbl { display: block; font-size: 0.75rem; color: var(--muted); text-transform: uppercase; letter-spacing: 0.04em; margin: 0.6rem 0 0.3rem; }
.row { display: flex; gap: 0.4rem; }
.row input, .add input, .add textarea {
  width: 100%; background: var(--bg); border: 1px solid var(--line); border-radius: 8px;
  color: var(--text); padding: 0.5rem; font-size: 0.85rem; font-family: inherit;
}
.add .token { font-family: monospace; text-transform: uppercase; letter-spacing: 0.18em; text-align: center; font-size: 1rem; }
.add input + input { margin-top: 0.4rem; }
.go {
  background: var(--azure); color: #042038; border: none; border-radius: 8px;
  padding: 0 0.9rem; font-weight: 800; cursor: pointer; white-space: nowrap;
}
.add .go { width: 100%; padding: 0.55rem; margin-top: 0.4rem; }
.go:disabled { opacity: 0.5; cursor: default; }
.key-box {
  display: flex; align-items: center; justify-content: space-between; gap: 0.5rem;
  background: var(--bg); border: 1px solid var(--line); border-radius: 8px; padding: 0.5rem 0.7rem; cursor: pointer;
}
.mono { font-family: monospace; font-size: 0.82rem; }
.mono.sm { font-size: 0.68rem; color: var(--muted); }
.copy { font-size: 0.75rem; color: var(--azure); }
.hint { font-size: 0.78rem; color: var(--muted); margin-top: 0.5rem; }
.err { color: #ff6b6b; font-size: 0.78rem; margin-top: 0.3rem; }
.status { color: var(--azure); font-size: 0.78rem; margin-top: 0.3rem; }
.empty { color: var(--muted); font-style: italic; font-size: 0.85rem; padding: 0.6rem 0; }

.add { border-bottom: 1px solid var(--line-soft); padding-bottom: 0.8rem; margin-bottom: 0.6rem; }
.contact, .rank-row {
  display: flex; align-items: center; gap: 0.5rem; padding: 0.5rem 0; border-top: 1px solid var(--line-soft);
}
.ci { flex: 1; min-width: 0; display: flex; flex-direction: column; }
.nm { font-weight: 700; font-size: 0.9rem; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.stars { display: flex; }
.star { background: none; border: none; cursor: pointer; color: rgba(255,255,255,0.22); font-size: 1rem; padding: 0 1px; }
.star.on { color: var(--gold); }
.del { background: none; border: none; color: var(--muted); cursor: pointer; font-size: 0.9rem; }
.del:hover { color: #ff6b6b; }
.pos { width: 1.4rem; text-align: center; font-family: var(--font-display); color: var(--muted); }
.score { font-weight: 800; color: var(--gold); font-size: 0.9rem; display: flex; align-items: center; gap: 0.2rem; }
.score small { color: var(--muted); font-weight: 400; }
</style>
