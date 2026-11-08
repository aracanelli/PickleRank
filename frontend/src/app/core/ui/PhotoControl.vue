<script setup lang="ts">
/**
 * "Change photo" / "Remove photo" buttons for a player photo or league logo.
 * A pick opens the crop sheet first; only the cropped square uploads.
 * Emits the new version (or null after removal) so the caller can update its DTO.
 */
import { ref, shallowRef, computed } from 'vue'
import { Camera } from 'lucide-vue-next'
import UiButton from './UiButton.vue'
import PhotoCropSheet from './PhotoCropSheet.vue'
import { confirm, toast } from './feedback'
import { ACCEPT, decodePick, uploadImage, removeImage, photoErrorMessage } from './photo'

const props = defineProps<{ path: string; has: boolean; kind: 'photo' | 'logo' }>()
const emit = defineEmits<{ changed: [version: number | null] }>()

const input = ref<HTMLInputElement | null>(null)
const busy = ref(false)
const picked = shallowRef<ImageBitmap | null>(null)
const noun = computed(() => props.kind)
const Noun = computed(() => (props.kind === 'photo' ? 'Photo' : 'Logo'))

async function pick() {
  const file = input.value?.files?.[0]
  if (input.value) input.value.value = ''
  if (!file) return
  try {
    picked.value = await decodePick(file)
  } catch (e) {
    toast(photoErrorMessage(e), 'bad')
  }
}

function closeCrop() {
  picked.value?.close()
  picked.value = null
}

async function upload(image: Blob) {
  closeCrop()
  busy.value = true
  try {
    emit('changed', await uploadImage(props.path, image))
    toast(`${Noun.value} saved`)
  } catch (e) {
    toast(photoErrorMessage(e), 'bad')
  } finally {
    busy.value = false
  }
}

async function remove() {
  const ok = await confirm({ title: `Remove the ${noun.value}?`, body: 'Initials show instead. You can add a new one any time.', confirmLabel: `Remove ${noun.value}`, danger: true })
  if (!ok) return
  busy.value = true
  try {
    await removeImage(props.path)
    emit('changed', null)
    toast(`${Noun.value} removed`)
  } catch (e) {
    toast(photoErrorMessage(e), 'bad')
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <div class="photo-ctl">
    <input ref="input" type="file" :accept="ACCEPT" hidden data-testid="photo-input" @change="pick">
    <UiButton :loading="busy" @click="input?.click()">
      <Camera :size="18" aria-hidden="true" /> {{ has ? `Change ${noun}` : `Add ${noun}` }}
    </UiButton>
    <UiButton v-if="has" variant="quiet" :disabled="busy" @click="remove">Remove {{ noun }}</UiButton>
    <PhotoCropSheet :bitmap="picked" :kind="kind" @cancel="closeCrop" @use="upload" />
  </div>
</template>

<style scoped>
.photo-ctl { display: flex; flex-wrap: wrap; gap: var(--s2); }
</style>
