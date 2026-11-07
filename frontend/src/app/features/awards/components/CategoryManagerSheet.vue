<script setup lang="ts">
/** Organizer form for adding voting categories. Stays open so several can be added in a row. */
import { ref, watch } from 'vue'
import { awardsApi } from '../services/awards.api'
import UiSheet from '@/app/core/ui/UiSheet.vue'
import UiField from '@/app/core/ui/UiField.vue'
import UiButton from '@/app/core/ui/UiButton.vue'
import { toast } from '@/app/core/ui/feedback'

const props = defineProps<{
  open: boolean
  groupId: string
  editionId: string
  /** Count already on the edition, shown so organizers know where they stand. */
  count: number
}>()

const emit = defineEmits<{ close: []; changed: [] }>()

const title = ref('')
const description = ref('')
const titleError = ref('')
const adding = ref(false)

watch(() => props.open, isOpen => {
  if (isOpen) { title.value = ''; description.value = ''; titleError.value = '' }
})

async function add() {
  const t = title.value.trim()
  if (!t) { titleError.value = 'Enter a category title.'; return }
  if (adding.value) return
  titleError.value = ''
  adding.value = true
  try {
    await awardsApi.addCategory(props.groupId, props.editionId, { title: t, description: description.value.trim() || undefined })
    toast(`${t} added`)
    title.value = ''
    description.value = ''
    emit('changed')
  } catch (e) {
    toast((e as { message?: string }).message || 'Category not added. Try again.', 'bad')
  } finally {
    adding.value = false
  }
}
</script>

<template>
  <UiSheet
    :open="open"
    title="Add a voting category"
    :description="count ? `${count} ${count === 1 ? 'category' : 'categories'} so far.` : 'Members vote for one player in each category.'"
    @close="emit('close')"
  >
    <form id="cat-form" class="form" novalidate @submit.prevent="add">
      <UiField v-model="title" label="Category title" hint="For example, best comeback or most improved." :maxlength="200" :error="titleError" required />
      <UiField v-model="description" label="Description (optional)" hint="What should voters keep in mind?" :maxlength="1000" multiline />
    </form>
    <template #actions>
      <UiButton type="submit" form="cat-form" variant="primary" size="lg" block :loading="adding">Add category</UiButton>
      <UiButton variant="quiet" size="lg" block @click="emit('close')">Done</UiButton>
    </template>
  </UiSheet>
</template>

<style scoped>
.form { display: flex; flex-direction: column; gap: var(--s4); }
</style>
