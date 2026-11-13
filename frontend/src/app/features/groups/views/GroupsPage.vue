<script setup lang="ts">
/**
 * Every league the user organizes or plays in. First stop after sign-in.
 */
import { ref, computed, onMounted } from 'vue'
import { useRouter, RouterLink } from 'vue-router'
import { ChevronRight, Plus } from 'lucide-vue-next'
import { groupsApi } from '../services/groups.api'
import type { GroupListItemDto } from '@/app/core/models/dto'
import PageHeader from '@/app/core/layout/PageHeader.vue'
import AccountButton from '@/app/core/layout/AccountButton.vue'
import UiButton from '@/app/core/ui/UiButton.vue'
import UiField from '@/app/core/ui/UiField.vue'
import UiSheet from '@/app/core/ui/UiSheet.vue'
import UiState from '@/app/core/ui/UiState.vue'
import LeagueCrest from '@/app/core/ui/LeagueCrest.vue'
import { toast } from '@/app/core/ui/feedback'
import { useAuthStore } from '@/stores/auth'
import { outbox } from '@/app/core/offline/sync'

const router = useRouter()
const auth = useAuthStore()

const organized = ref<GroupListItemDto[]>([])
const playing = ref<GroupListItemDto[]>([])
const loading = ref(true)
const loadError = ref('')

const createOpen = ref(false)
const newName = ref('')
const nameError = ref('')

const empty = computed(() => !organized.value.length && !playing.value.length)
// section titles only earn their place when there are two lists to tell apart
const bothLists = computed(() => organized.value.length > 0 && playing.value.length > 0)

function apply(owned: GroupListItemDto[], member: GroupListItemDto[]) {
  // leagues created on this phone that the server hasn't got yet stay listed
  const queued = outbox.ops
    .filter(o => o.key?.startsWith('group-create:') && !owned.some(g => g.id === (o.body as { id: string }).id))
    .map(o => { const b = o.body as { id: string; name: string }; return { id: b.id, name: b.name, sport: 'pickleball', playerCount: 0, createdAt: new Date(o.createdAt).toISOString() } })
  organized.value = [...queued, ...owned]
  const ownedIds = new Set(owned.map(g => g.id))
  playing.value = member.filter(g => !ownedIds.has(g.id))
}

async function load() {
  loadError.value = ''
  // Paint the lists kept on this phone at once; refresh behind them.
  let keptOwned: GroupListItemDto[] | null = null
  let keptMember: GroupListItemDto[] | null = null
  const showKept = () => {
    if (keptOwned && keptMember) { apply(keptOwned, keptMember); loading.value = false }
  }
  try {
    const [owned, member] = await Promise.all([
      groupsApi.list(r => { keptOwned = r.groups; showKept() }),
      groupsApi.listMemberGroups(r => { keptMember = r.groups; showKept() })
    ])
    apply(owned.groups, member.groups)
  } catch (e) {
    if (loading.value) loadError.value = (e as { message?: string }).message || 'Check your connection and try again.'
  } finally {
    loading.value = false
  }
}

onMounted(load)

function openCreate() {
  newName.value = ''
  nameError.value = ''
  createOpen.value = true
}

async function create() {
  const name = newName.value.trim()
  if (!name) {
    nameError.value = 'Enter a league name.'
    return
  }
  // Optimistic and offline-safe: the league exists on this phone now and syncs when it can.
  const { group, settled } = groupsApi.createQueued(name, auth.userId || '')
  createOpen.value = false
  await router.push(`/groups/${group.id}`)
  const res = await settled
  if (!res.ok) toast(`${name} was not created: ${res.error.message || 'the server refused it'}. Open the sync list to retry.`, 'bad')
}

const players = (n: number) => `${n} ${n === 1 ? 'player' : 'players'}`
const leagues = (n: number) => `${n} ${n === 1 ? 'league' : 'leagues'}`
const summary = computed(() => {
  const parts: string[] = []
  if (organized.value.length) parts.push(`You run ${leagues(organized.value.length)}`)
  if (playing.value.length) parts.push(`${parts.length ? 'play in' : 'You play in'} ${leagues(playing.value.length)}`)
  return parts.length ? `${parts.join(' and ')}.` : ''
})
const today = new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })
</script>

<template>
  <div class="page">
    <PageHeader title="Your leagues">
      <template #actions>
        <button type="button" class="icon-btn" aria-label="Create a league" @click="openCreate">
          <Plus :size="22" aria-hidden="true" />
        </button>
        <AccountButton />
      </template>
      <template #title>
        <p class="day">{{ today }}</p>
        <h1 class="title">Your leagues</h1>
        <p v-if="summary" class="summary">{{ summary }}</p>
      </template>
    </PageHeader>

    <UiState v-if="loading" kind="loading" title="Loading leagues" />
    <UiState v-else-if="loadError" kind="error" title="Leagues didn't load" :body="loadError" @retry="load" />

    <template v-else>
      <UiState v-if="empty" kind="empty" title="No leagues yet">
        <p><strong>Running a league?</strong> Create it here, then add your players.</p>
        <p><strong>Joining one?</strong> Open the invite link your organizer sent you. The league shows up here once it's linked.</p>
        <UiButton variant="primary" size="lg" block @click="openCreate">Create a league</UiButton>
      </UiState>

      <section v-if="organized.length" class="section" :aria-label="bothLists ? undefined : 'Leagues you run'" :aria-labelledby="bothLists ? 'org-h' : undefined">
        <h2 v-if="bothLists" id="org-h" class="list-title">You run</h2>
        <ul role="list" class="leagues">
          <li v-for="g in organized" :key="g.id">
            <RouterLink :to="`/groups/${g.id}`" class="league">
              <LeagueCrest :name="g.name" :logo="g" />
              <span class="league__text">
                <span class="league__name">{{ g.name }}</span>
                <span class="league__sub">{{ players(g.playerCount) }}</span>
              </span>
              <ChevronRight :size="20" aria-hidden="true" class="league__go" />
            </RouterLink>
          </li>
        </ul>
      </section>

      <section v-if="playing.length" class="section" :aria-label="bothLists ? undefined : 'Leagues you play in'" :aria-labelledby="bothLists ? 'play-h' : undefined">
        <h2 v-if="bothLists" id="play-h" class="list-title">You play in</h2>
        <ul role="list" class="leagues">
          <li v-for="g in playing" :key="g.id">
            <RouterLink :to="`/groups/${g.id}`" class="league">
              <LeagueCrest :name="g.name" :logo="g" />
              <span class="league__text">
                <span class="league__name">{{ g.name }}</span>
                <span class="league__sub">{{ players(g.playerCount) }}</span>
              </span>
              <ChevronRight :size="20" aria-hidden="true" class="league__go" />
            </RouterLink>
          </li>
        </ul>
      </section>
    </template>

    <UiSheet :open="createOpen" title="Create a league" @close="createOpen = false">
      <form id="create-league" novalidate @submit.prevent="create">
        <UiField
          v-model="newName"
          label="League name"
          placeholder="Tuesday night ladder"
          autocomplete="off"
          :maxlength="100"
          :error="nameError"
          hint="You can rename it later in settings."
        />
      </form>
      <template #actions>
        <UiButton variant="quiet" @click="createOpen = false">Cancel</UiButton>
        <UiButton type="submit" form="create-league" variant="primary">Create league</UiButton>
      </template>
    </UiSheet>
  </div>
</template>

<style scoped>
.day { margin-top: var(--s2); color: var(--ink-2); font-size: var(--text-sm); font-weight: 700; }
.title { font-size: 2.25rem; line-height: 1.05; letter-spacing: -0.02em; text-wrap: balance; }
.summary { margin-top: var(--s1); color: var(--ink-2); font-size: var(--text-sm); }

.list-title { font-size: var(--text-sm); color: var(--ink-2); }

.leagues { display: flex; flex-direction: column; gap: var(--s2); }
/* concentric corners: row radius 16 minus its 8px padding gives the crest's 8 */
.league {
  display: flex;
  align-items: center;
  gap: var(--s3);
  min-height: 68px;
  padding: var(--s2) var(--s3) var(--s2) var(--s2);
  border: 1px solid var(--line);
  border-radius: 16px;
  background: var(--surface);
  color: var(--ink);
  text-decoration: none;
  transition: box-shadow var(--dur) var(--ease), translate var(--dur) var(--ease), border-color var(--dur) var(--ease), scale 120ms var(--ease);
}
@media (hover: hover) {
  .league:hover { box-shadow: var(--shadow-lift); translate: 0 -1px; border-color: var(--line-strong); }
  .league:hover .league__go { translate: 2px 0; color: var(--ink); }
}
.league:active { opacity: 1; scale: 0.985; }
.league__text { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
.league__name {
  font-weight: 700;
  font-size: var(--text-md);
  line-height: 1.25;
  overflow-wrap: anywhere;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.league__sub { font-size: var(--text-sm); color: var(--ink-2); font-variant-numeric: tabular-nums; }
.league__go { flex: none; color: var(--ink-2); transition: translate var(--dur) var(--ease), color var(--dur) var(--ease); }
</style>
