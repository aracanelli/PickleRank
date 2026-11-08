<script setup lang="ts">
/**
 * Crop a picked photo or logo to a square before it uploads.
 * The frame shows exactly what will be saved; the round (or rounded-square) edge is visual only,
 * the upload is the full square. Drag or arrow keys move, pinch, slider or +/- zoom.
 */
import { ref, reactive, watch, nextTick, useId } from 'vue'
import UiSheet from './UiSheet.vue'
import UiButton from './UiButton.vue'
import { cropRect, clampPan, encodeCrop, photoErrorMessage, ZOOM_MIN, ZOOM_MAX, type Pan } from './photo'
import { toast } from './feedback'

const props = defineProps<{ bitmap: ImageBitmap | null; kind: 'photo' | 'logo' }>()
const emit = defineEmits<{ cancel: []; use: [image: Blob] }>()

const VIEW = 240 // frame side in CSS px; fits a 320px-wide phone inside the sheet
const STEP = 10
const hintId = useId()
const canvas = ref<HTMLCanvasElement | null>(null)
const zoom = ref(1)
const pan = reactive<Pan>({ x: 0, y: 0 })
const busy = ref(false)

function setView(z: number, p: Pan) {
  const b = props.bitmap
  if (!b) return
  const nz = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, z))
  Object.assign(pan, clampPan(b.width, b.height, nz, p, VIEW))
  zoom.value = nz
}

/** Zoom about the frame centre: the point in the middle stays put. */
function zoomTo(z: number) {
  const nz = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, z))
  const k = nz / zoom.value
  setView(nz, { x: pan.x * k, y: pan.y * k })
}

function draw() {
  const c = canvas.value
  const b = props.bitmap
  const ctx = c?.getContext('2d')
  if (!c || !b || !ctx) return
  const dpr = window.devicePixelRatio || 1
  const px = Math.round(VIEW * dpr)
  if (c.width !== px) c.width = c.height = px
  const r = cropRect(b.width, b.height, zoom.value, pan, VIEW)
  ctx.clearRect(0, 0, px, px)
  ctx.drawImage(b, r.sx, r.sy, r.size, r.size, 0, 0, px, px)
}

let frame = 0
watch([zoom, pan], () => { cancelAnimationFrame(frame); frame = requestAnimationFrame(draw) })
watch(() => props.bitmap, b => {
  if (!b) return
  zoom.value = 1
  Object.assign(pan, { x: 0, y: 0 })
  nextTick(draw)
}, { immediate: true })

// Drag with one pointer, pinch with two. Pointer events cover mouse, touch and pen alike.
const pointers = new Map<number, { x: number; y: number }>()
const spread = () => { const [a, b] = [...pointers.values()]; return Math.hypot(a.x - b.x, a.y - b.y) }
const middle = () => { const ps = [...pointers.values()]; return { x: ps.reduce((s, p) => s + p.x, 0) / ps.length, y: ps.reduce((s, p) => s + p.y, 0) / ps.length } }

function down(e: PointerEvent) {
  ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY })
}
function move(e: PointerEvent) {
  if (!pointers.has(e.pointerId)) return
  const before = middle()
  const was = pointers.size === 2 ? spread() : 0
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY })
  const after = middle()
  if (was) zoomTo(zoom.value * (spread() / was))
  setView(zoom.value, { x: pan.x + after.x - before.x, y: pan.y + after.y - before.y })
}
function up(e: PointerEvent) { pointers.delete(e.pointerId) }

function key(e: KeyboardEvent) {
  const step = e.shiftKey ? STEP * 4 : STEP
  const moves: Record<string, Pan> = { ArrowLeft: { x: -step, y: 0 }, ArrowRight: { x: step, y: 0 }, ArrowUp: { x: 0, y: -step }, ArrowDown: { x: 0, y: step } }
  const m = moves[e.key]
  if (m) setView(zoom.value, { x: pan.x + m.x, y: pan.y + m.y })
  else if (e.key === '+' || e.key === '=') zoomTo(zoom.value + 0.25)
  else if (e.key === '-' || e.key === '_') zoomTo(zoom.value - 0.25)
  else return
  e.preventDefault()
}

async function use() {
  const b = props.bitmap
  if (!b) return
  busy.value = true
  try {
    emit('use', await encodeCrop(b, cropRect(b.width, b.height, zoom.value, pan, VIEW)))
  } catch (e) {
    toast(photoErrorMessage(e), 'bad')
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <UiSheet :open="!!bitmap" :title="kind === 'photo' ? 'Position your photo' : 'Position the logo'" @close="emit('cancel')">
    <div class="crop">
      <div
        class="crop__frame"
        :class="`crop__frame--${kind}`"
        :style="{ '--view': `${VIEW}px` }"
        role="application"
        tabindex="0"
        data-autofocus
        :aria-label="`${kind === 'photo' ? 'Photo' : 'Logo'} position`"
        :aria-describedby="hintId"
        data-testid="crop-frame"
        @pointerdown="down"
        @pointermove="move"
        @pointerup="up"
        @pointercancel="up"
        @keydown="key"
      >
        <canvas ref="canvas" class="crop__canvas" aria-hidden="true" />
      </div>
      <p :id="hintId" class="muted crop__hint">Drag to move. Pinch or use the slider to zoom. Arrow keys move, plus and minus zoom.</p>
      <label class="crop__zoom">
        <span>Zoom</span>
        <input
          type="range"
          :value="zoom"
          :min="ZOOM_MIN"
          :max="ZOOM_MAX"
          step="0.01"
          :aria-valuetext="`${zoom.toFixed(1)} times`"
          @input="zoomTo(Number(($event.target as HTMLInputElement).value))"
        >
      </label>
    </div>
    <template #actions>
      <UiButton variant="primary" size="lg" block :loading="busy" @click="use">Use {{ kind }}</UiButton>
      <UiButton size="lg" block :disabled="busy" @click="emit('cancel')">Cancel</UiButton>
    </template>
  </UiSheet>
</template>

<style scoped>
.crop { display: flex; flex-direction: column; align-items: center; gap: var(--s3); }
.crop__frame {
  width: var(--view);
  height: var(--view);
  overflow: hidden;
  background: var(--surface-sunk);
  /* a ring outside the frame, so the preview keeps the full frame size */
  box-shadow: 0 0 0 2px var(--line-strong);
  touch-action: none;
  cursor: grab;
  user-select: none;
}
.crop__frame:active { cursor: grabbing; }
.crop__frame:focus-visible { outline: 3px solid var(--focus); outline-offset: 4px; }
.crop__frame--photo { border-radius: 50%; }
/* LeagueCrest's corner radius (10px at 52px) scaled to the frame */
.crop__frame--logo { border-radius: calc(var(--view) * 10 / 52); }
.crop__canvas { display: block; width: 100%; height: 100%; }
.crop__hint { font-size: var(--text-sm); text-align: center; }
.crop__zoom { display: flex; align-items: center; gap: var(--s3); width: 100%; font-weight: 700; font-size: var(--text-sm); }
.crop__zoom input { flex: 1; min-height: var(--tap); accent-color: var(--court); }
</style>
