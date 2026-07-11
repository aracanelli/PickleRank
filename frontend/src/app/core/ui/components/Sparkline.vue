<script setup lang="ts">
import { computed, ref, onMounted } from 'vue'
import { usePrefersReducedMotion } from '../composables/usePrefersReducedMotion'

// Minimal volt SVG sparkline with draw-on animation. Pure SVG — chart.js is
// reserved for the desktop full chart.
const props = withDefaults(
  defineProps<{
    points: number[]
    width?: number
    height?: number
    /** Animate the stroke draw when it enters the viewport. */
    animated?: boolean
  }>(),
  { width: 320, height: 72, animated: true }
)

const PAD = 6

const path = computed(() => {
  const pts = props.points
  if (pts.length < 2) return { line: '', area: '', lastX: 0, lastY: 0 }
  const min = Math.min(...pts)
  const max = Math.max(...pts)
  const span = max - min || 1
  const w = props.width - PAD * 2
  const h = props.height - PAD * 2
  const coords = pts.map((v, i) => ({
    x: PAD + (i / (pts.length - 1)) * w,
    y: PAD + (1 - (v - min) / span) * h
  }))
  const line = coords.map((c, i) => `${i === 0 ? 'M' : 'L'}${c.x.toFixed(1)},${c.y.toFixed(1)}`).join(' ')
  const area = `${line} L${coords[coords.length - 1].x.toFixed(1)},${props.height} L${coords[0].x.toFixed(1)},${props.height} Z`
  const last = coords[coords.length - 1]
  return { line, area, lastX: last.x, lastY: last.y }
})

const reduced = usePrefersReducedMotion()
const svgEl = ref<SVGSVGElement | null>(null)
const drawn = ref(false)

onMounted(() => {
  if (!props.animated || reduced.value) {
    drawn.value = true
    return
  }
  const observer = new IntersectionObserver(
    (entries) => {
      if (entries.some((e) => e.isIntersecting)) {
        drawn.value = true
        observer.disconnect()
      }
    },
    { threshold: 0.4 }
  )
  if (svgEl.value) observer.observe(svgEl.value)
})
</script>

<template>
  <svg
    ref="svgEl"
    :viewBox="`0 0 ${width} ${height}`"
    class="block w-full"
    fill="none"
    role="img"
    aria-label="Rating trend"
  >
    <template v-if="path.line">
      <path :d="path.area" class="fill-accent-soft" :class="drawn ? 'opacity-100' : 'opacity-0'" style="transition: opacity 400ms ease 400ms" />
      <path
        :d="path.line"
        class="stroke-accent-text"
        stroke-width="2.5"
        stroke-linecap="round"
        stroke-linejoin="round"
        pathLength="1"
        :style="{
          strokeDasharray: 1,
          strokeDashoffset: drawn ? 0 : 1,
          transition: 'stroke-dashoffset 800ms cubic-bezier(0.2, 0, 0, 1)'
        }"
      />
      <circle
        :cx="path.lastX"
        :cy="path.lastY"
        r="3.5"
        class="fill-accent-fill"
        :class="drawn ? 'opacity-100 scale-100' : 'opacity-0 scale-0'"
        style="transition: opacity 200ms ease 700ms, scale 200ms ease 700ms; transform-origin: center; transform-box: fill-box"
      />
    </template>
  </svg>
</template>
