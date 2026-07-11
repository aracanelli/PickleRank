<script setup lang="ts">
import { ref, computed } from 'vue'
import { Loader2 } from 'lucide-vue-next'
import { groupsApi } from '@/app/features/groups/services/groups.api'
import type { RatingHistoryPoint } from '@/app/core/models/dto'
import { useChartTheme } from '@/app/core/ui/charts/chart-theme'
import AppButton from '@/app/core/ui/components/AppButton.vue'
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler
} from 'chart.js'
import { Line } from 'vue-chartjs'

// Register ChartJS components (ported from the legacy profile page)
ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend, Filler)

const props = defineProps<{
  history: RatingHistoryPoint[]
  playerId: string
}>()

const chartTheme = useChartTheme()

interface ChartPoint {
  rating: number
  createdAt?: string
  eventName?: string
  delta: number
  eventId?: string
  isDrillDown?: boolean
}

// Drill-down state: clicking an event point replays that event's per-round ratings
const isDrillDown = ref(false)
const isChartLoading = ref(false)
const drillDownHistory = ref<Array<{ round: number; rating: number; delta?: number; type: string; label: string }>>([])
const drillDownEventName = ref('')
const drillDownError = ref('')

// Sort history by date and add an artificial starting point (ported logic)
const sortedHistory = computed<ChartPoint[]>(() => {
  if (isDrillDown.value) {
    return drillDownHistory.value.map((h) => ({
      rating: h.rating,
      createdAt: undefined,
      eventName: h.label,
      delta: h.delta || 0,
      eventId: undefined,
      isDrillDown: true
    }))
  }

  if (!props.history.length) return []

  const history: ChartPoint[] = [...props.history].sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
  )

  // Calculate the starting rating from the first event: before = after - delta
  const first = history[0]
  const startRating = first.rating - (first.delta ?? 0)
  const startDate = new Date(first.createdAt!)
  startDate.setMinutes(startDate.getMinutes() - 1)

  history.unshift({
    rating: startRating,
    createdAt: startDate.toISOString(),
    eventName: 'Start',
    delta: 0,
    eventId: undefined
  })

  return history
})

const chartData = computed(() => {
  const colors = chartTheme.colors.value
  return {
    labels: sortedHistory.value.map((h) => {
      if (isDrillDown.value) return h.eventName
      const date = h.createdAt ? new Date(h.createdAt) : new Date()
      return date.toLocaleDateString()
    }),
    datasets: [
      {
        label: 'Rating',
        backgroundColor: colors.brandSoft,
        borderColor: colors.brand,
        pointBackgroundColor: colors.brand,
        pointBorderColor: colors.surface,
        pointHoverBackgroundColor: colors.surface,
        pointHoverBorderColor: colors.brand,
        pointRadius: 5,
        pointHoverRadius: 7,
        fill: true,
        tension: 0.3,
        data: sortedHistory.value.map((h) => h.rating)
      }
    ]
  }
})

const chartOptions = computed(() => ({
  responsive: true,
  maintainAspectRatio: false,
  onClick: (_e: unknown, elements: Array<{ index: number }>) => {
    if (elements && elements.length > 0) {
      const item = sortedHistory.value[elements[0].index]
      handleChartClick(item)
    }
  },
  plugins: {
    legend: { display: false },
    tooltip: {
      ...chartTheme.pluginOptions.value.tooltip,
      mode: 'index' as const,
      intersect: false,
      callbacks: {
        title: (context: Array<{ dataIndex: number }>) => {
          const historyItem = sortedHistory.value[context[0].dataIndex]
          if (historyItem.isDrillDown || !historyItem.createdAt) {
            return historyItem.eventName || ''
          }
          const date = new Date(historyItem.createdAt).toLocaleDateString()
          return historyItem.eventName ? `${historyItem.eventName} (${date})` : date
        },
        label: (context: { parsed: { y: number } }) => `Rating: ${context.parsed.y.toFixed(1)}`,
        afterLabel: (context: { dataIndex: number }) => {
          const historyItem = sortedHistory.value[context.dataIndex]
          const delta = historyItem.delta
          // Don't show change for the artificial start point
          if (historyItem.eventName === 'Start') return 'Initial Rating'
          if (delta > 0) return `Change: +${delta.toFixed(1)}`
          if (delta < 0) return `Change: ${delta.toFixed(1)}`
          return 'Change: 0.0'
        }
      }
    }
  },
  scales: {
    x: {
      grid: { display: false },
      ticks: {
        ...chartTheme.scaleOptions.value.ticks,
        maxRotation: 45,
        minRotation: 0,
        font: { size: 10 }
      }
    },
    y: {
      ...chartTheme.scaleOptions.value,
      ticks: { ...chartTheme.scaleOptions.value.ticks, count: 5 }
    }
  },
  interaction: {
    mode: 'nearest' as const,
    axis: 'x' as const,
    intersect: false
  }
}))

async function handleChartClick(item: ChartPoint) {
  if (isDrillDown.value || isChartLoading.value) return
  if (!item || !item.eventId) return

  try {
    isChartLoading.value = true
    drillDownError.value = ''
    drillDownEventName.value = item.eventName || 'Event'

    const historyMap = await groupsApi.getEventRatingHistory(item.eventId)
    const playerHistory = historyMap[props.playerId]

    if (playerHistory) {
      drillDownHistory.value = playerHistory
      isDrillDown.value = true
    }
  } catch (e: any) {
    console.error('Failed to load event history', e)
    drillDownError.value = e?.message || 'Failed to load event history'
  } finally {
    isChartLoading.value = false
  }
}

function exitDrillDown() {
  isDrillDown.value = false
  drillDownHistory.value = []
  drillDownEventName.value = ''
  drillDownError.value = ''
}
</script>

<template>
  <section class="relative overflow-hidden rounded-xl border border-line bg-surface-1 p-4">
    <div
      v-if="isChartLoading"
      class="absolute inset-0 z-10 flex items-center justify-center bg-surface-1/70 backdrop-blur-[2px]"
    >
      <Loader2 class="size-6 animate-spin text-brand" />
    </div>

    <div class="mb-3 flex items-center justify-between gap-3">
      <h2 class="truncate text-sm font-semibold text-ink">
        {{ isDrillDown ? `Event history: ${drillDownEventName}` : 'Rating history' }}
      </h2>
      <AppButton v-if="isDrillDown" variant="ghost" size="sm" :disabled="isChartLoading" @click="exitDrillDown">
        Back
      </AppButton>
    </div>

    <p
      v-if="drillDownError"
      class="mb-2 rounded-xl bg-loss/10 px-3 py-2 text-center text-sm text-loss"
    >
      {{ drillDownError }}
    </p>

    <p v-if="!isDrillDown" class="mb-2 text-xs text-ink-faint">Tap a point to replay that event round by round.</p>

    <div class="h-64 w-full">
      <Line :key="chartTheme.resolved.value" :data="chartData" :options="chartOptions as any" />
    </div>
  </section>
</template>
