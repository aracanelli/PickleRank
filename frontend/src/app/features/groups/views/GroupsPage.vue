<script setup lang="ts">
/**
 * Every league the user organizes or plays in. First stop after sign-in.
 */
import { ref, computed, onMounted } from 'vue'
import { useRouter, RouterLink } from 'vue-router'
import { ChevronRight, Users } from 'lucide-vue-next'
import { groupsApi } from '../services/groups.api'
import type { GroupListItemDto } from '@/app/core/models/dto'
import PageHeader from '@/app/core/layout/PageHeader.vue'
import AccountButton from '@/app/core/layout/AccountButton.vue'
import UiButton from '@/app/core/ui/UiButton.vue'
import UiField from '@/app/core/ui/UiField.vue'
import UiSheet from '@/app/core/ui/UiSheet.vue'
import UiState from '@/app/core/ui/UiState.vue'
import ActionBar from '@/app/core/ui/ActionBar.vue'
import { announce } from '@/app/core/ui/feedback'

const router = useRouter()

const organized = ref<GroupListItemDto[]>([])
const playing = ref<GroupListItemDto[]>([])
const loading = ref(true)
const loadError = ref('')

const createOpen = ref(false)
const newName = ref('')
const nameError = ref('')
const creating = ref(false)

const empty = computed(() => !organized.value.length && !playing.value.length)

async function load() {
  loading.value = true
  loadError.value = ''
  try {
    const [owned, member] = await Promise.all([groupsApi.list(), groupsApi.listMemberGroups()])
    organized.value = owned.groups
    const ownedIds = new Set(owned.groups.map(g => g.id))
    playing.value = member.groups.filter(g => !ownedIds.has(g.id))
  } catch (e) {
    loadError.value = (e as { message?: string }).message || 'Check your connection and try again.'
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
  creating.value = true
  nameError.value = ''
  try {
    const group = await groupsApi.create({ name })
    createOpen.value = false
    await router.push(`/groups/${group.id}`)
  } catch (e) {
    nameError.value = (e as { message?: string }).message || 'League not created. Check your connection and try again.'
    announce(nameError.value, true)
  } finally {
    creating.value = false
  }
}

const players = (n: number) => `${n} ${n === 1 ? 'player' : 'players'}`
</script>

<template>
  <div class="page">
    <PageHeader title="Your leagues">
      <template #actions><AccountButton /></template>
    </PageHeader>

    <UiState v-if="loading" kind="loading" title="Loading leagues" />
    <UiState v-else-if="loadError" kind="error" title="Leagues didn't load" :body="loadError" @retry="load" />

    <template v-else-if="empty">
      <UiState kind="empty" title="No leagues yet">
        <p><strong>Running a league?</strong> Create it here, then add your players.</p>
        <p><strong>Joining one?</strong> Open the invite link your organizer sent you. The league shows up here once it's linked.</p>
      </UiState>
      <ActionBar>
        <UiButton variant="primary" size="lg" @click="openCreate">Create a league</UiButton>
      </ActionBar>
    </template>

    <template v-else>
      <section v-if="organized.length" class="section" aria-labelledby="org-h">
        <h2 id="org-h">Leagues you organize</h2>
        <ul role="list" class="list">
          <li v-for="g in organized" :key="g.id">
            <RouterLink :to="`/groups/${g.id}`" class="row-link">
              <span class="row-link__text">
                <span class="row-link__title">{{ g.name }}</span>
                <span class="muted row-link__sub">{{ players(g.playerCount) }}</span>
              </span>
              <ChevronRight :size="20" aria-hidden="true" />
            </RouterLink>
          </li>
        </ul>
      </section>

      <section v-if="playing.length" class="section" aria-labelledby="play-h">
        <h2 id="play-h">Leagues you play in</h2>
        <ul role="list" class="list">
          <li v-for="g in playing" :key="g.id">
            <RouterLink :to="`/groups/${g.id}`" class="row-link">
              <Users :size="20" aria-hidden="true" class="row-link__icon" />
              <span class="row-link__text">
                <span class="row-link__title">{{ g.name }}</span>
                <span class="muted row-link__sub">{{ players(g.playerCount) }}</span>
              </span>
              <ChevronRight :size="20" aria-hidden="true" />
            </RouterLink>
          </li>
        </ul>
      </section>

      <ActionBar>
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
        <UiButton type="submit" form="create-league" variant="primary" :loading="creating">Create league</UiButton>
      </template>
    </UiSheet>
  </div>
</template>

<style scoped>
.list { display: flex; flex-direction: column; }
.row-link {
  display: flex;
  align-items: center;
  gap: var(--s3);
  min-height: 60px;
  padding: var(--s2) 0;
  border-bottom: 1px solid var(--line);
  color: var(--ink);
  text-decoration: none;
}
.row-link__icon { flex: none; color: var(--ink-2); }
.row-link__text { flex: 1; min-width: 0; display: flex; flex-direction: column; }
.row-link__title { font-weight: 700; overflow-wrap: anywhere; }
.row-link__sub { font-size: var(--text-sm); }
</style>
