<script setup lang="ts">
import { ref, watch } from 'vue'
import { Plus, Trash2 } from 'lucide-vue-next'
import type { AwardCategoryDto } from '@/app/core/models/dto'
import { awardsApi } from '../services/awards.api'
import Sheet from '@/app/core/ui/components/Sheet.vue'
import AppButton from '@/app/core/ui/components/AppButton.vue'
import AppInput from '@/app/core/ui/components/AppInput.vue'
import AppTextarea from '@/app/core/ui/components/AppTextarea.vue'
import IconButton from '@/app/core/ui/components/IconButton.vue'
import { useToast } from '@/app/core/ui/composables/useToast'
import { useConfirm } from '@/app/core/ui/composables/useConfirm'
import { getApiErrorMessage } from '@/app/core/ui/composables/useApiError'

const props = defineProps<{
  groupId: string
  editionId: string
  categories: AwardCategoryDto[]
}>()

const open = defineModel<boolean>({ required: true })
const emit = defineEmits<{ changed: [] }>()

const toast = useToast()
const { confirm } = useConfirm()

const title = ref('')
const description = ref('')
const isAdding = ref(false)
const deletingId = ref<string | null>(null)

watch(open, (isOpen) => {
  if (isOpen) {
    title.value = ''
    description.value = ''
  }
})

async function addCategory() {
  const trimmed = title.value.trim()
  if (!trimmed || isAdding.value) return
  isAdding.value = true
  try {
    await awardsApi.addCategory(props.groupId, props.editionId, {
      title: trimmed,
      description: description.value.trim() || undefined
    })
    toast.success('Category added')
    title.value = ''
    description.value = ''
    emit('changed')
  } catch (e) {
    toast.error(getApiErrorMessage(e, 'Failed to add category'))
  } finally {
    isAdding.value = false
  }
}

async function removeCategory(category: AwardCategoryDto) {
  const ok = await confirm({
    title: 'Delete category?',
    message: `Delete "${category.title}"? Any votes cast for it will be lost.`,
    confirmLabel: 'Delete',
    danger: true
  })
  if (!ok) return
  deletingId.value = category.id
  try {
    await awardsApi.deleteCategory(props.groupId, category.id)
    toast.success('Category deleted')
    emit('changed')
  } catch (e) {
    toast.error(getApiErrorMessage(e, 'Failed to delete category'))
  } finally {
    deletingId.value = null
  }
}
</script>

<template>
  <Sheet v-model="open" title="Voting categories" size="lg">
    <div class="flex flex-col gap-5">
      <div class="flex flex-col gap-3">
        <AppInput v-model="title" label="Category title" placeholder="e.g. Best Comeback" />
        <AppTextarea
          v-model="description"
          label="Description (optional)"
          :rows="2"
          placeholder="What should voters keep in mind?"
        />
        <AppButton :loading="isAdding" :disabled="!title.trim()" @click="addCategory">
          <Plus class="size-4" />
          Add category
        </AppButton>
      </div>

      <div v-if="categories.length" class="flex flex-col gap-2">
        <h3 class="eyebrow text-ink-faint">Categories</h3>
        <div
          v-for="category in categories"
          :key="category.id"
          class="flex items-center gap-3 rounded-[10px] border border-line bg-surface-2 p-3"
        >
          <div class="min-w-0 flex-1">
            <p class="truncate text-sm font-medium text-ink">{{ category.title }}</p>
            <p v-if="category.description" class="truncate text-xs text-ink-faint">
              {{ category.description }}
            </p>
          </div>
          <IconButton
            label="Delete category"
            variant="danger"
            :disabled="deletingId === category.id"
            @click="removeCategory(category)"
          >
            <Trash2 class="size-5" />
          </IconButton>
        </div>
      </div>
      <p v-else class="text-sm text-ink-faint">
        No categories yet. Add at least one before opening voting.
      </p>
    </div>
  </Sheet>
</template>
