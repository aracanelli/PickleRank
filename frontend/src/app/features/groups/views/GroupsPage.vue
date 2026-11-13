<script setup lang="ts">
/**
 * Every league the user organizes or plays in. First stop after sign-in.
 */
import { ref, computed, onMounted } from 'vue'
import { useRouter, RouterLink } from 'vue-router'
import { ChevronRight } from 'lucide-vue-next'
import { groupsApi } from '../services/groups.api'
import type { GroupListItemDto } from '@/app/core/models/dto'
import PageHeader from '@/app/core/layout/PageHeader.vue'
import AccountButton from '@/app/core/layout/AccountButton.vue'
import UiButton from '@/app/core/ui/UiButton.vue'
import UiField from '@/app/core/ui/UiField.vue'
import UiSheet from '@/app/core/ui/UiSheet.vue'
import UiState from '@/app/core/ui/UiState.vue'
import ActionBar from '@/app/core/ui/ActionBar.vue'
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
      <template #actions><AccountButton /></template>
      <template #title>
        <div class="hero">
          <svg class="hero__court" viewBox="0 0 200 100" preserveAspectRatio="xMaxYMid slice" aria-hidden="true" focusable="false">
            <rect x="96" y="8" width="96" height="84" rx="2" />
            <line x1="144" y1="8" x2="144" y2="92" class="hero__net" />
            <line x1="124" y1="8" x2="124" y2="92" />
            <line x1="164" y1="8" x2="164" y2="92" />
            <line x1="96" y1="50" x2="124" y2="50" />
            <line x1="164" y1="50" x2="192" y2="50" />
          </svg>
          <span class="hero__ball" aria-hidden="true" />
          <p class="hero__day">{{ today }}</p>
          <h1 class="hero__title">Your leagues</h1>
          <p v-if="summary" class="hero__sub">{{ summary }}</p>
        </div>
      </template>
    </PageHeader>

    <UiState v-if="loading" kind="loading" title="Loading leagues" />
    <UiState v-else-if="loadError" kind="error" title="Leagues didn't load" :body="loadError" @retry="load" />

    <template v-else>
      <UiState v-if="empty" kind="empty" title="No leagues yet">
        <p><strong>Running a league?</strong> Create it here, then add your players.</p>
        <p><strong>Joining one?</strong> Open the invite link your organizer sent you. The league shows up here once it's linked.</p>
      </UiState>

      <section v-if="organized.length" class="section" aria-labelledby="org-h">
        <h2 id="org-h">Leagues you run</h2>
        <ul role="list" class="leagues">
          <li v-for="g in organized" :key="g.id">
            <RouterLink :to="`/groups/${g.id}`" class="league">
              <LeagueCrest :name="g.name" :logo="g" />
              <span class="league__text">
                <span class="league__name">{{ g.name }}</span>
                <span class="league__sub"><span class="league__role">Organizer</span>{{ players(g.playerCount) }}</span>
              </span>
              <ChevronRight :size="20" aria-hidden="true" class="league__go" />
            </RouterLink>
          </li>
        </ul>
      </section>

      <section v-if="playing.length" class="section" aria-labelledby="play-h">
        <h2 id="play-h">Leagues you play in</h2>
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


      <ActionBar above-tabs>
        <UiButton variant="primary" size="lg" @click="openCreate">Create a league</UiButton>
      </ActionBar>
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
/* header: the page title painted beside a half court */
.hero {
  position: relative;
  margin-top: var(--s2);
  padding: var(--s5) var(--s4) var(--s4);
  border-radius: var(--r-tile);
  background: var(--court);
  color: var(--on-court);
  overflow: hidden;
}
.hero__court {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  fill: none;
  stroke: var(--on-court);
  stroke-width: 1.5;
  opacity: 0.22;
}
.hero__net { stroke-width: 3; }
.hero__ball {
  position: absolute;
  top: 22%;
  right: 12%;
  width: 14px;
  height: 14px;
  border-radius: 50%;
  background: var(--optic);
}
.hero__day, .hero__title, .hero__sub { position: relative; margin: 0; }
.hero__day { font-size: var(--text-sm); font-weight: 700; }
.hero__title { font-size: var(--text-xl); line-height: 1.1; }
.hero__sub { margin-top: var(--s1); font-size: var(--text-sm); max-width: 26ch; }

.leagues { display: flex; flex-direction: column; gap: var(--s2); }
.league {
  display: flex;
  align-items: center;
  gap: var(--s3);
  min-height: 72px;
  padding: var(--s2) var(--s3) var(--s2) var(--s2);
  border: 1px solid var(--line);
  border-radius: var(--r-tile);
  background: var(--surface);
  color: var(--ink);
  text-decoration: none;
}
.league:hover { border-color: var(--court); }
.league__text { flex: 1; min-width: 0; display: flex; flex-direction: column; }
.league__name {
  font-weight: 700;
  font-size: var(--text-lg);
  line-height: 1.2;
  overflow-wrap: anywhere;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.league__sub { display: flex; flex-wrap: wrap; align-items: center; gap: var(--s2); margin-top: 2px; font-size: var(--text-sm); color: var(--ink-2); }
.league__role {
  padding: 2px var(--s2);
  border-radius: 999px;
  background: var(--court-tint);
  color: var(--ink);
  font-size: var(--text-xs);
  font-weight: 700;
}
.league__go { flex: none; color: var(--ink-2); }
</style>
