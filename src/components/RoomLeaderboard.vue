<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import type { Room, RoomMember } from '../lib/roomStore'
import { isMemberSealed } from '../lib/roomStore'
import type { SavedPrediction } from '../lib/store'
import { scoreEntry } from '../lib/scoring'
import { shortKey } from '../lib/rating'

const { t } = useI18n()

const props = defineProps<{
  room: Room
  official: SavedPrediction | null
  myPubkey: string | null
}>()

// Adapta un miembro de la sala a la forma que espera scoreEntry().
function asEntry (m: RoomMember): SavedPrediction {
  return {
    id: m.publickey, name: m.nickname || '', code: m.code,
    mode: m.mode, results: m.results, updatedAt: m.updatedAt, mine: false,
  }
}

interface Row { member: RoomMember; sealed: boolean; total: number; isMe: boolean }

const rows = computed<Row[]>(() => {
  const out: Row[] = props.room.members.filter((m) => !m.deleted).map((m) => {
    const sealed = isMemberSealed(props.room, m, props.myPubkey)
    const total = sealed ? -1 : scoreEntry(asEntry(m), props.official).total
    return { member: m, sealed, total, isMe: m.publickey === props.myPubkey }
  })
  // Los sellados al final; el resto por puntaje descendente.
  return out.sort((a, b) => {
    if (a.sealed !== b.sealed) return a.sealed ? 1 : -1
    return b.total - a.total
  })
})

const hasOfficial = computed(() => !!props.official?.code)
const sealedActive = computed(() => props.room.sealedUntil > Date.now())
const sealedDate = computed(() => new Date(props.room.sealedUntil).toLocaleString())
</script>

<template>
  <div class="lb">
    <p v-if="!hasOfficial" class="note">{{ t('rooms.noOfficial') }}</p>
    <p v-if="sealedActive" class="note sealed">🔒 {{ t('rooms.sealedUntil', { date: sealedDate }) }}</p>
    <p v-if="!rows.length" class="empty">{{ t('rooms.noMembers') }}</p>

    <table v-else class="tbl">
      <thead>
        <tr>
          <th class="pos">#</th>
          <th>{{ t('rooms.member') }}</th>
          <th class="num">{{ t('rooms.points') }}</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="(r, i) in rows" :key="r.member.publickey" :class="{ me: r.isMe }">
          <td class="pos">{{ r.sealed ? '–' : i + 1 }}</td>
          <td class="who">
            <span class="nm">
              {{ r.member.nickname || t('common.anonymous') }}
              <span v-if="r.isMe" class="you">{{ t('rooms.you') }}</span>
            </span>
            <span class="vrow">
              <span class="badge" :class="{ ok: r.member.verified }">{{ r.member.verified ? '✓' : '⚠' }}</span>
              <span class="mono">{{ shortKey(r.member.publickey) }}</span>
            </span>
          </td>
          <td class="num">
            <span v-if="r.sealed" class="lock">🔒</span>
            <strong v-else>{{ r.total }}</strong>
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>

<style scoped>
.lb { padding: 0.2rem 0; }
.note { font-size: 0.8rem; color: var(--muted); margin-bottom: 0.6rem; }
.note.sealed { color: var(--gold); }
.empty { color: var(--muted); font-style: italic; font-size: 0.85rem; padding: 0.6rem 0; }
.tbl { width: 100%; border-collapse: collapse; }
.tbl th { text-align: left; font-size: 0.7rem; text-transform: uppercase; letter-spacing: 0.04em; color: var(--muted); padding: 0.4rem 0.5rem; border-bottom: 1px solid var(--line); }
.tbl td { padding: 0.5rem; border-bottom: 1px solid var(--line-soft); vertical-align: middle; }
.pos { width: 2rem; text-align: center; font-family: var(--font-display); color: var(--muted); }
.num { text-align: right; width: 4rem; }
.num strong { color: var(--azure); font-size: 1.05rem; }
.who { min-width: 0; }
.nm { font-weight: 700; font-size: 0.9rem; display: flex; align-items: center; gap: 0.4rem; }
.you { font-size: 0.65rem; background: var(--azure); color: #042038; border-radius: 5px; padding: 0 0.3rem; font-weight: 800; }
.vrow { display: flex; align-items: center; gap: 0.35rem; margin-top: 0.1rem; }
.badge { font-size: 0.7rem; color: #e0a; }
.badge.ok { color: var(--green); }
.mono { font-family: monospace; font-size: 0.66rem; color: var(--muted); }
.me { background: rgba(65, 180, 255, 0.06); }
.lock { opacity: 0.7; }
</style>
