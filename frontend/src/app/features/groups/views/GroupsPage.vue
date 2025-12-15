<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { groupsApi } from '../services/groups.api'
import type { GroupListItemDto } from '@/app/core/models/dto'
import BaseButton from '@/app/core/ui/components/BaseButton.vue'
import BaseCard from '@/app/core/ui/components/BaseCard.vue'
import BaseInput from '@/app/core/ui/components/BaseInput.vue'
import LoadingSpinner from '@/app/core/ui/components/LoadingSpinner.vue'
import EmptyState from '@/app/core/ui/components/EmptyState.vue'
import Modal from '@/app/core/ui/components/Modal.vue'

const router = useRouter()
const groups = ref<GroupListItemDto[]>([])
const isLoading = ref(true)
const error = ref('')
const showCreateModal = ref(false)
const newGroupName = ref('')
const isCreating = ref(false)

onMounted(async () => {
  await loadGroups()
})

async function loadGroups() {
  isLoading.value = true
  error.value = ''
  try {
    const response = await groupsApi.list()
    groups.value = response.groups
  } catch (e: any) {
    error.value = e.message || 'Failed to load groups'
  } finally {
    isLoading.value = false
  }
}

async function createGroup() {
  if (!newGroupName.value.trim()) return

  isCreating.value = true
  try {
    const group = await groupsApi.create({ name: newGroupName.value })
    showCreateModal.value = false
    newGroupName.value = ''
    router.push(`/groups/${group.id}`)
  } catch (e: any) {
    error.value = e.message || 'Failed to create group'
  } finally {
    isCreating.value = false
  }
}

function formatDate(dateStr: string): string {
  if (!dateStr) return 'N/A'
  try {
    const date = new Date(dateStr)
    if (isNaN(date.getTime())) return 'N/A'
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    })
  } catch (e) {
    return 'N/A'
  }
}
</script>

<template>
  <div class="groups-page container">
    <div class="page-header">
      <div>
        <h1>Your Groups</h1>
        <p class="subtitle">Manage your pickleball leagues and teams</p>
      </div>
      <BaseButton @click="showCreateModal = true">
        + New Group
      </BaseButton>
    </div>

    <LoadingSpinner v-if="isLoading" text="Loading groups..." />

    <div v-else-if="error" class="error-message">
      {{ error }}
    </div>

    <EmptyState
      v-else-if="groups.length === 0"
      icon="📋"
      title="No groups yet"
      description="Create your first group to start organizing pickleball events and tracking rankings."
    >
      <template #action>
        <BaseButton @click="showCreateModal = true">Create Your First Group</BaseButton>
      </template>
    </EmptyState>

    <div v-else class="groups-grid">
      <BaseCard
        v-for="group in groups"
        :key="group.id"
        clickable
        @click="router.push(`/groups/${group.id}`)"
      >
        <div class="group-card-content">
          <div class="group-icon">📋</div>
          <div class="group-info">
            <h3>{{ group.name }}</h3>
            <div class="group-meta">
              <span class="meta-item">
                <span class="meta-icon">👥</span>
                {{ group.playerCount }} players
              </span>
              <span class="meta-item">
                <span class="meta-icon">📅</span>
                {{ formatDate(group.createdAt) }}
              </span>
            </div>
          </div>
          <div class="group-arrow">→</div>
        </div>
      </BaseCard>
    </div>

    <!-- Create Group Modal -->
    <Modal :open="showCreateModal" title="Create New Group" @close="showCreateModal = false">
      <form @submit.prevent="createGroup">
        <BaseInput
          v-model="newGroupName"
          label="Group Name"
          placeholder="e.g., Friday Night Picklers"
        />
      </form>
      <template #footer>
        <BaseButton variant="secondary" @click="showCreateModal = false">Cancel</BaseButton>
        <BaseButton :loading="isCreating" @click="createGroup">Create Group</BaseButton>
      </template>
    </Modal>
  </div>
</template>

<style scoped>
.page-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: var(--spacing-xl);
}

.page-header h1 {
  font-size: 2rem;
  margin-bottom: var(--spacing-xs);
}

.subtitle {
  color: var(--color-text-secondary);
}

.groups-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(350px, 1fr));
  gap: var(--spacing-lg);
}

.group-card-content {
  display: flex;
  align-items: center;
  gap: var(--spacing-md);
}

.group-icon {
  font-size: 2rem;
  width: 56px;
  height: 56px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--color-bg-secondary);
  border-radius: var(--radius-lg);
}

.group-info {
  flex: 1;
}

.group-info h3 {
  font-size: 1.125rem;
  font-weight: 600;
  margin-bottom: var(--spacing-xs);
}

.group-meta {
  display: flex;
  gap: var(--spacing-md);
}

.meta-item {
  display: flex;
  align-items: center;
  gap: var(--spacing-xs);
  font-size: 0.875rem;
  color: var(--color-text-secondary);
}

.meta-icon {
  font-size: 0.875rem;
}

.group-arrow {
  color: var(--color-text-muted);
  font-size: 1.25rem;
  transition: transform var(--transition-fast);
}

.group-card-content:hover .group-arrow {
  transform: translateX(4px);
  color: var(--color-primary);
}

.error-message {
  padding: var(--spacing-lg);
  background: rgba(239, 68, 68, 0.1);
  border: 1px solid rgba(239, 68, 68, 0.3);
  border-radius: var(--radius-md);
  color: var(--color-error);
  text-align: center;
}

@media (max-width: 768px) {
  .page-header {
    flex-direction: column;
    gap: var(--spacing-md);
  }

  .groups-grid {
    grid-template-columns: 1fr;
  }
}
</style>




