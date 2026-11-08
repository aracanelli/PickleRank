<script setup lang="ts">
/**
 * One button for a player photo or league logo: "Add photo", or "Edit photo" when one is saved.
 * Edit opens the crop sheet on the saved image, where Choose another and Remove live.
 * A pick opens the crop sheet first; only the cropped square uploads.
 * Emits the new version (or null after removal) so the caller can update its DTO.
 */
import { ref, shallowRef, computed } from 'vue'
import { Camera } from 'lucide-vue-next'
import UiButton from './UiButton.vue'
import PhotoCropSheet from './PhotoCropSheet.vue'
import { confirm, toast } from './feedback'
import { ACCEPT, decodePick, savedBitmap, uploadImage, removeImage, photoErrorMessage } from './photo'

const props = defineProps<{ path: string; version?: number | null; kind: 'photo' | 'logo' }>()
const emit = defineEmits<{ changed: [version: number | null] }>()

const input = ref<HTMLInputElement | null>(null)
const busy = ref(false)
const picked = shallowRef<ImageBitmap | null>(null)
const editing = ref(false)
const noun = computed(() => props.kind)
const Noun = computed(() => (props.kind === 'photo' ? 'Photo' : 'Logo'))

async function pick() {
  const file = input.value?.files?.[0]
  if (input.value) input.value.value = ''
  if (!file) return
  try {
    const bmp = await decodePick(file)
    picked.value?.close()
    editing.value = false
    picked.value = bmp
  } catch (e) {
    toast(photoErrorMessage(e), 'bad')
  }
}

async function open() {
  if (!props.version) return input.value?.click()
  busy.value = true
  try {
    picked.value = await savedBitmap(props.path, props.version)
    editing.value = true
  } catch (e) {
    toast(photoErrorMessage(e), 'bad')
    input.value?.click()
  } finally {
    busy.value = false
  }
}

function closeCrop() {
  picked.value?.close()
  picked.value = null
  editing.value = false
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
  closeCrop()
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
    <UiButton :loading="busy" @click="open">
      <Camera :size="18" aria-hidden="true" /> {{ version ? `Edit ${noun}` : `Add ${noun}` }}
    </UiButton>
    <PhotoCropSheet :bitmap="picked" :kind="kind" :editing="editing" @cancel="closeCrop" @use="upload" @pick="input?.click()" @remove="remove" />
  </div>
</template>

<style scoped>
/* the wrapper takes the caller's row sizing and the button fills it, so it matches its neighbours */
.photo-ctl { display: flex; }
.photo-ctl > :deep(.btn) { flex: 1; }
</style>
