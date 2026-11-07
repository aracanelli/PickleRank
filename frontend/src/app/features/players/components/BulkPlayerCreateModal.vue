<script setup lang="ts">
/**
 * Create one or many players by typing names, one per line.
 * With `groupId`, the new players are also added to that league as regulars or subs.
 */
import { ref, computed, watch } from 'vue'
import { playersApi } from '../services/players.api'
import { groupsApi } from '@/app/features/groups/services/groups.api'
import type { MembershipType } from '@/app/core/models/dto'
import UiSheet from '@/app/core/ui/UiSheet.vue'
import UiField from '@/app/core/ui/UiField.vue'
import UiButton from '@/app/core/ui/UiButton.vue'
import { toast } from '@/app/core/ui/feedback'
import { parseNames, count } from '../roster'

const props = defineProps<{ open: boolean; groupId?: string }>()
const emit = defineEmits<{ 'update:open': [value: boolean]; success: [] }>()

const text = ref('')
const membership = ref<MembershipType>('PERMANENT')
const saving = ref(false)
const error = ref('')
const skipped = ref<string[]>([])

const names = computed(() => parseNames(text.value))

watch(() => props.open, open => {
  if (!open) return
  text.value = ''
  error.value = ''
  skipped.value = []
  membership.value = 'PERMANENT'
})

function close() {
  emit('update:open', false)
}

async function create() {
  if (!names.value.length || saving.value) return
  saving.value = true
  error.value = ''
  try {
    const res = await playersApi.bulkCreate({ names: names.value })
    if (props.groupId && res.created.length) {
      await groupsApi.bulkAddPlayers(props.groupId, {
        players: res.created.map(p => ({ playerId: p.id, membershipType: membership.value }))
      })
    }
    if (res.created.length) {
      toast(props.groupId ? `${count(res.created.length)} added to the league` : `${count(res.created.length)} created`)
      emit('success')
    }
    if (res.skipped.length) {
      skipped.value = res.skipped
      text.value = ''
    } else {
      close()
    }
  } catch (e) {
    error.value = (e as { message?: string }).message || 'Players not created. Check your connection and try again.'
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <UiSheet
    :open="open"
    :title="groupId ? 'Create new players' : 'Add several players'"
    description="Type one name per line. Names already in your player list are skipped."
    @close="close"
  >
    <div class="body">
      <UiField
        v-model="text"
        label="Player names"
        multiline
        :hint="names.length ? `${count(names.length, 'name')} ready` : 'For example: Ana Ruiz, then Ben Cho on the next line.'"
        :error="error || undefined"
        :disabled="saving"
      />

      <fieldset v-if="groupId" class="as">
        <legend>Add to this league as</legend>
        <div class="seg" role="group" aria-label="Membership">
          <button type="button" class="seg__btn" :aria-pressed="membership === 'PERMANENT'" @click="membership = 'PERMANENT'">Regulars</button>
          <button type="button" class="seg__btn" :aria-pressed="membership === 'SUB'" @click="membership = 'SUB'">Subs</button>
        </div>
      </fieldset>

      <div v-if="skipped.length" class="skipped" role="status">
        <p><strong>Already in your player list, so not created:</strong></p>
        <ul>
          <li v-for="n in skipped" :key="n" class="truncate">{{ n }}</li>
        </ul>
        <p v-if="groupId" class="muted">Add them with Add players instead.</p>
      </div>
    </div>

    <template #actions>
      <UiButton variant="primary" size="lg" block :loading="saving" :disabled="!names.length" @click="create">
        {{ names.length ? (groupId ? `Create and add ${count(names.length)}` : `Create ${count(names.length)}`) : 'Create players' }}
      </UiButton>
      <UiButton v-if="skipped.length" variant="quiet" size="lg" block @click="close">Done</UiButton>
    </template>
  </UiSheet>
</template>

<style scoped>
.body { display: flex; flex-direction: column; gap: var(--s4); }
.body :deep(textarea) { min-height: 9rem; resize: vertical; }
.as { border: 0; padding: 0; margin: 0; min-width: 0; }
legend { font-weight: 700; font-size: var(--text-sm); padding: 0; margin-bottom: var(--s1); }
.seg {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 4px;
  padding: 4px;
  border-radius: var(--r-control);
  background: var(--surface-sunk);
}
.seg__btn {
  min-height: var(--tap);
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: var(--ink-2);
  font-weight: 700;
}
.seg__btn[aria-pressed='true'] { background: var(--surface); color: var(--ink); box-shadow: 0 1px 2px rgb(0 0 0 / 0.12); }
.skipped {
  display: flex; flex-direction: column; gap: var(--s1);
  padding: var(--s3);
  border-radius: var(--r-control);
  background: var(--wait-tint);
  color: var(--ink);
  font-size: var(--text-sm);
}
.skipped ul { margin: 0; padding-left: var(--s4); min-width: 0; }
</style>
