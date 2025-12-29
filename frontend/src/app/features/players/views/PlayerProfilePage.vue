<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { 
  ArrowLeft, Activity, Target, Flame, Skull
} from 'lucide-vue-next'
import { groupsApi } from '@/app/features/groups/services/groups.api'
import type { PlayerStats } from '@/app/core/models/dto'
import BaseButton from '@/app/core/ui/components/BaseButton.vue'
import LoadingSpinner from '@/app/core/ui/components/LoadingSpinner.vue'
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

// Register ChartJS components
ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler
)

const route = useRoute()
const router = useRouter()
const groupId = computed(() => route.params.groupId as string)
const playerId = computed(() => route.params.playerId as string)

const stats = ref<PlayerStats | null>(null)
const isLoading = ref(true)
const error = ref('')

// Chart Data
// Sort history by date and add starting point
const sortedHistory = computed(() => {
  if (isDrillDown.value) {
      // Map drill down history to the format expected by the chart
      return drillDownHistory.value.map(h => ({
          rating: h.rating,
          createdAt: new Date().toISOString(), // Dummy date, we use labels
          eventName: h.label,
          delta: h.delta || 0,
          eventId: undefined, // No further drill down
          isDrillDown: true
      }))
  }

  if (!stats.value || !stats.value.history.length) return []
  
  const history = [...stats.value.history].sort((a, b) => 
    new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
  )

  // Calculate starting rating from first event
  if (history.length > 0) {
      const first = history[0]
      // rating_before = rating_after - delta
      const startRating = first.rating - (first.delta ?? 0)
      
      // Create a "start" point slightly before the first event
      const startDate = new Date(first.createdAt)
      startDate.setMinutes(startDate.getMinutes() - 1) 

      history.unshift({
          rating: startRating,
          createdAt: startDate.toISOString(),
          eventName: 'Start',
          delta: 0,
          eventId: undefined
      })
  }

  return history
})const chartData = computed(() => {
  if (sortedHistory.value.length === 0) return null
  
  return {
    labels: sortedHistory.value.map((h) => {
        if (isDrillDown.value) {
            return h.eventName // Use label (e.g., "Round 1")
        }
        const date = new Date(h.createdAt);
        return date.toLocaleDateString();
    }),
    datasets: [
      {
        label: 'Rating',
        backgroundColor: 'rgba(16, 185, 129, 0.1)',
        borderColor: '#10b981',
        pointBackgroundColor: '#10b981',
        pointBorderColor: '#fff',
        pointHoverBackgroundColor: '#fff',
        pointHoverBorderColor: '#10b981',
        pointRadius: 5,
        pointHoverRadius: 7,
        fill: true,
        tension: 0.3,
        data: sortedHistory.value.map(h => h.rating),
        // Custom property to access in tooltip/click
        historyData: sortedHistory.value 
      }
    ]
  }
})

const chartOptions = computed(() => ({
  responsive: true,
  maintainAspectRatio: false,
  onClick: (_e: any, elements: any[]) => {
      if (elements && elements.length > 0) {
          const index = elements[0].index
          const item = sortedHistory.value[index]
          handleChartClick(item)
      }
  },
  plugins: {
    legend: {
      display: false
    },
    tooltip: {
      mode: 'index',
      intersect: false,
      callbacks: {
        title: function(context: any) {
             const index = context[0].dataIndex;
             const historyItem = sortedHistory.value[index];
             const date = new Date(historyItem.createdAt).toLocaleDateString();
             return historyItem.eventName ? `${historyItem.eventName} (${date})` : date;
        },
        label: function(context: any) {
            return `Rating: ${context.parsed.y.toFixed(1)}`;
        },
        afterLabel: function(context: any) {
            const index = context.dataIndex;
            const historyItem = sortedHistory.value[index];
            const delta = historyItem.delta;
            // Don't show change for the artificial start point
            if (historyItem.eventName === 'Start') return 'Initial Rating'
            
            if (delta > 0) return `Change: +${delta.toFixed(1)}`;
            if (delta < 0) return `Change: ${delta.toFixed(1)}`;
            return 'Change: 0.0';
        }
      }
    }
  },
  scales: {
    x: {
      grid: {
        display: false,
        drawBorder: false
      },
      ticks: {
          maxRotation: 45,
          minRotation: 0,
          font: {
              size: 10
          }
      }
    },
    y: {
      grid: {
        color: 'rgba(0, 0, 0, 0.05)',
        drawBorder: false
      },
      ticks: {
          count: 5
      }
    }
  },
  interaction: {
      mode: 'nearest',
      axis: 'x',
      intersect: false
  }
}))// Drill Down Types
interface EventRatingHistoryItem {
  round: number
  rating: number
  delta?: number
  type: string
  label: string
}

// Drill Down State
const isDrillDown = ref(false)
const isChartLoading = ref(false)
const drillDownHistory = ref<EventRatingHistoryItem[]>([])
const drillDownEventName = ref('')
const chartError = ref('')

async function handleChartClick(item: any) {
    if (isDrillDown.value || isChartLoading.value) return 
    
    if (item && item.eventId) {
        try {
            isChartLoading.value = true
            chartError.value = '' // Clear any previous errors
            drillDownEventName.value = item.eventName || 'Event'
            
            // Fetch detailed history
            const historyMap = await groupsApi.getEventRatingHistory(item.eventId)
            
            // Validate historyMap is a non-null object
            if (!historyMap || typeof historyMap !== 'object' || Array.isArray(historyMap)) {
                chartError.value = 'Failed to load event history: Invalid response from server'
                return
            }
            
            // Validate playerId exists as a key in historyMap
            if (!playerId.value || !(playerId.value in historyMap)) {
                chartError.value = 'No rating history found for this player in this event'
                return
            }
            
            const playerHistory = historyMap[playerId.value]
            
            if (playerHistory && Array.isArray(playerHistory) && playerHistory.length > 0) {
                drillDownHistory.value = playerHistory
                isDrillDown.value = true
                chartError.value = '' // Ensure error is cleared on success
            } else {
                chartError.value = 'No detailed rating history available for this event'
            }
        } catch (e: any) {
            console.error("Failed to load event history", e)
            chartError.value = e?.message || 'Failed to load event history. Please try again.'
        } finally {
            isChartLoading.value = false
        }
    }
}

function exitDrillDown() {
    isDrillDown.value = false
    drillDownHistory.value = []
    drillDownEventName.value = ''
    chartError.value = '' // Clear error when exiting drill-down
}

onMounted(async () => {
  await loadStats()
})

async function loadStats() {
  isLoading.value = true
  error.value = ''
  try {
    stats.value = await groupsApi.getPlayerStats(groupId.value, playerId.value)
  } catch (e: any) {
    error.value = e.message || 'Failed to load player stats'
  } finally {
    isLoading.value = false
  }
}


function formatRating(rating: number): string {
  return rating.toFixed(1)
}
</script>

<template>
  <div class="player-profile container">
    <LoadingSpinner v-if="isLoading" text="Loading profile..." />

    <div v-else-if="error" class="error-state">
        <BaseButton variant="secondary" @click="router.back()" class="mb-4">
            <ArrowLeft :size="16" /> Back
        </BaseButton>
        <div class="error-box">{{ error }}</div>
    </div>

    <template v-else-if="stats">
      <!-- Header -->
      <div class="page-header">
        <router-link :to="`/groups/${groupId}`" class="back-link">
          <ArrowLeft :size="16" /> Back to Group
        </router-link>
        
        <div class="profile-header">
            <div class="avatar-large">
                {{ stats.player.displayName[0] }}
            </div>
            <div class="profile-info">
                <h1>{{ stats.player.displayName }}</h1>
                <div class="badges">
                    <span class="badge" :class="stats.player.membershipType.toLowerCase()">
                        {{ stats.player.membershipType }}
                    </span>
                    <span v-if="stats.player.role === 'ORGANIZER'" class="badge organizer">
                        Organizer
                    </span>
                    <span class="badge skill" v-if="stats.player.skillLevel">
                        {{ stats.player.skillLevel }}
                    </span>
                </div>
            </div>
        </div>
      </div>

      <!-- Key Stats Overview (Flat Design) -->
      <div class="key-stats-overview">
          <div class="stat-item">
             <div class="stat-label">Rating</div>
             <div class="stat-value">{{ formatRating(stats.player.rating) }}</div>
          </div>
          <div class="stat-item">
             <div class="stat-label">Win Rate</div>
             <div class="stat-value">{{ (stats.player.winRate * 100).toFixed(0) }}%</div>
          </div>
          <div class="stat-item">
             <div class="stat-label">Record</div>
             <div class="stat-value record">
                 <span class="wins">{{ stats.player.wins }}</span>-<span class="losses">{{ stats.player.losses }}</span>-<span class="ties">{{ stats.player.ties }}</span>
             </div>
          </div>
          <div class="stat-item">
             <div class="stat-label">Games</div>
             <div class="stat-value">{{ stats.player.gamesPlayed }}</div>
          </div>
      </div>

      <!-- Rating History Chart -->
      <section class="chart-section" v-if="chartData">
          <div class="chart-wrapper">
              <div v-if="isChartLoading" class="chart-overlay">
                  <LoadingSpinner size="md" text="Loading history..." />
              </div>
              <div class="chart-container-clean">
                  <div class="section-header-clean">
                      <div class="title-row">
                          <h2 v-if="!isDrillDown">Rating History</h2>
                          <h2 v-else>Event History: {{ drillDownEventName }}</h2>
                          
                          <BaseButton 
                              v-if="isDrillDown" 
                              variant="ghost" 
                              size="sm"
                              @click="exitDrillDown"
                              :disabled="isChartLoading"
                          >
                              Back
                          </BaseButton>
                      </div>
                  </div>
                  <div v-if="chartError" class="chart-error">
                      {{ chartError }}
                  </div>
                  <div class="chart-area">
                      <Line :data="chartData" :options="chartOptions as any" />
                  </div>
              </div>
          </div>
      </section>
      
      <!-- Advanced Analysis (List Style) -->
      <div v-if="stats.advanced" class="advanced-section">
          <h2>Insights</h2>
          
          <div class="insight-list">
              <!-- Elo Row -->
              <div class="insight-row">
                  <div class="insight-icon info">
                      <Activity :size="20" />
                  </div>
                  <div class="insight-content">
                      <span class="insight-label">Elo Range</span>
                      <span class="insight-sub">High / Low</span>
                  </div>
                  <div class="insight-value">
                      <span class="text-success">{{ formatRating(stats.advanced.highestRating) }}</span>
                      <span class="sep">/</span>
                      <span class="text-error">{{ formatRating(stats.advanced.lowestRating) }}</span>
                  </div>
              </div>

              <!-- Streak Row -->
              <div class="insight-row">
                  <div class="insight-icon primary">
                      <Flame :size="20" />
                  </div>
                  <div class="insight-content">
                      <span class="insight-label">Best Streak</span>
                      <span class="insight-sub">Current: {{ stats.advanced.currentWinStreak }}W / {{ stats.advanced.currentLossStreak }}L</span>
                  </div>
                  <div class="insight-value">
                      {{ stats.advanced.longestWinStreak }}W
                  </div>
              </div>

               <!-- Nemesis Row -->
              <div class="insight-row" v-if="stats.advanced.nemesis">
                  <div class="insight-icon error">
                      <Skull :size="20" />
                  </div>
                  <div class="insight-content">
                      <span class="insight-label">Nemesis</span>
                      <span class="insight-sub">{{ stats.advanced.nemesis.displayName }}</span>
                  </div>
                  <div class="insight-value text-error">
                      {{ stats.advanced.nemesis.wins }}W - {{ stats.advanced.nemesis.losses }}L
                  </div>
              </div>

               <!-- Pigeon Row -->
              <div class="insight-row" v-if="stats.advanced.pigeon">
                  <div class="insight-icon success">
                      <Target :size="20" />
                  </div>
                  <div class="insight-content">
                      <span class="insight-label">Pigeon</span>
                      <span class="insight-sub">{{ stats.advanced.pigeon.displayName }}</span>
                  </div>
                  <div class="insight-value text-success">
                      {{ stats.advanced.pigeon.wins }}W - {{ stats.advanced.pigeon.losses }}L
                  </div>
              </div>
          </div>

          <!-- Teammates Lists -->
          <div class="simple-lists-grid">
              <div class="list-column">
                  <h3>Best Teammates</h3>
                  <div class="simple-list">
                      <div v-for="tm in stats.advanced.bestTeammates" :key="tm.playerId" class="simple-list-item">
                          <span class="name">{{ tm.displayName }}</span>
                          <span class="stat text-success">{{ (tm.winRate * 100).toFixed(0) }}% ({{ tm.gamesPlayed }})</span>
                      </div>
                      <div v-if="stats.advanced.bestTeammates.length === 0" class="empty-text">No data</div>
                  </div>
              </div>
              
              <div class="list-column">
                  <h3>Worst Teammates</h3>
                  <div class="simple-list">
                      <div v-for="tm in stats.advanced.worstTeammates" :key="tm.playerId" class="simple-list-item">
                          <span class="name">{{ tm.displayName }}</span>
                          <span class="stat text-error">{{ (tm.winRate * 100).toFixed(0) }}% ({{ tm.gamesPlayed }})</span>
                      </div>
                      <div v-if="stats.advanced.worstTeammates.length === 0" class="empty-text">No data</div>
                  </div>
              </div>
          </div>
      </div>

    </template>

  </div>
</template>

<style scoped>
.player-profile {
    padding-bottom: var(--spacing-2xl);
    max-width: 800px;
    margin: 0 auto;
}

/* Header */
.page-header {
    margin-bottom: var(--spacing-xl);
}

.back-link {
    display: inline-flex;
    align-items: center;
    gap: var(--spacing-xs);
    padding: 6px 12px;
    background-color: var(--color-bg-secondary);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    color: var(--color-text-secondary);
    font-size: 0.875rem;
    font-weight: 500;
    text-decoration: none;
    transition: all var(--transition-fast);
    margin-bottom: var(--spacing-lg);
}

.back-link:hover {
    background-color: var(--color-bg-hover);
    color: var(--color-text-primary);
    border-color: var(--color-border-hover);
}

.profile-header {
    display: flex;
    align-items: center;
    gap: var(--spacing-lg);
}

.avatar-large {
    width: 72px;
    height: 72px;
    border-radius: var(--radius-full);
    background: var(--color-primary);
    color: white;
    font-size: 2rem;
    font-weight: 700;
    display: flex;
    align-items: center;
    justify-content: center;
    box-shadow: var(--shadow-sm);
}

.profile-info h1 {
    font-size: 1.75rem;
    margin-bottom: var(--spacing-xs);
    line-height: 1.2;
}

.badges {
    display: flex;
    gap: var(--spacing-xs);
    flex-wrap: wrap;
}

.badge {
    padding: 2px 8px;
    border-radius: var(--radius-full);
    font-size: 0.75rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.05em;
}

.badge.permanent { background: rgba(16, 185, 129, 0.1); color: var(--color-primary); }
.badge.sub { background: rgba(245, 158, 11, 0.1); color: #f59e0b; }
.badge.organizer { background: rgba(99, 102, 241, 0.1); color: #6366f1; }
.badge.skill { background: var(--color-bg-secondary); border: 1px solid var(--color-border); color: var(--color-text-secondary); }

/* Key Stats Overview - Flat */
.key-stats-overview {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: var(--spacing-md);
    margin-bottom: var(--spacing-xl);
    padding: var(--spacing-md) 0;
    border-top: 1px solid var(--color-border);
    border-bottom: 1px solid var(--color-border);
}

.stat-item {
    text-align: center;
}

.stat-item .stat-label {
    font-size: 0.75rem;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--color-text-muted);
    margin-bottom: 4px;
}

.stat-item .stat-value {
    font-size: 1.5rem;
    font-weight: 700;
    color: var(--color-text-primary);
    font-family: var(--font-mono);
}

.stat-value.record {
    font-size: 1.25rem;
}

.wins { color: var(--color-primary); }
.losses { color: var(--color-error); }
.ties { color: var(--color-text-muted); }

/* Chart Section */
.chart-section {
    margin-bottom: var(--spacing-xl);
}

.chart-wrapper {
    position: relative;
    background: var(--color-bg-surface);
    border-radius: var(--radius-lg);
    border: 1px solid var(--color-border);
    overflow: hidden;
}

.chart-container-clean {
    padding: var(--spacing-md);
}

.section-header-clean {
    margin-bottom: var(--spacing-md);
}

.title-row h2 {
    font-size: 1rem;
    font-weight: 600;
    color: var(--color-text-primary);
}

.title-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
}

.chart-overlay {
    position: absolute;
    inset: 0;
    background: rgba(255, 255, 255, 0.8);
    z-index: 10;
    display: flex;
    align-items: center;
    justify-content: center;
    backdrop-filter: blur(2px);
}

.chart-area {
    height: 250px;
    width: 100%;
}

.chart-error {
    padding: var(--spacing-sm) var(--spacing-md);
    margin-bottom: var(--spacing-sm);
    background-color: rgba(239, 68, 68, 0.1);
    border: 1px solid rgba(239, 68, 68, 0.3);
    border-radius: var(--radius-md);
    color: var(--color-error);
    font-size: 0.875rem;
    text-align: center;
}

/* Insights List */
.advanced-section h2, .simple-lists-grid h3 {
    font-size: 1rem;
    font-weight: 600;
    margin-bottom: var(--spacing-md);
    color: var(--color-text-secondary);
}

.insight-list {
    background: var(--color-bg-surface);
    border-radius: var(--radius-lg);
    border: 1px solid var(--color-border);
    overflow: hidden;
    margin-bottom: var(--spacing-xl);
}

.insight-row {
    display: flex;
    align-items: center;
    padding: var(--spacing-md);
    border-bottom: 1px solid var(--color-border);
    gap: var(--spacing-md);
}

.insight-row:last-child {
    border-bottom: none;
}

.insight-icon {
    width: 32px;
    height: 32px;
    border-radius: var(--radius-md);
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
}

.insight-icon.primary { background: rgba(16, 185, 129, 0.1); color: var(--color-primary); }
.insight-icon.info { background: rgba(99, 102, 241, 0.1); color: #6366f1; }
.insight-icon.success { background: rgba(59, 130, 246, 0.1); color: #3b82f6; }
.insight-icon.error { background: rgba(239, 68, 68, 0.1); color: #ef4444; }

.insight-content {
    flex: 1;
    display: flex;
    flex-direction: column;
}

.insight-label {
    font-size: 0.875rem;
    font-weight: 500;
    color: var(--color-text-primary);
}

.insight-sub {
    font-size: 0.75rem;
    color: var(--color-text-muted);
}

.insight-value {
    font-weight: 600;
    font-size: 0.875rem;
    font-family: var(--font-mono);
}

.sep {
    margin: 0 4px;
    color: var(--color-text-muted);
}

/* Simple Lists */
.simple-lists-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: var(--spacing-lg);
}

.simple-list {
    background: var(--color-bg-surface);
    border-radius: var(--radius-lg);
    border: 1px solid var(--color-border);
    overflow: hidden;
}

.simple-list-item {
    padding: var(--spacing-sm) var(--spacing-md);
    border-bottom: 1px solid var(--color-border);
    display: flex;
    justify-content: space-between;
    font-size: 0.875rem;
}

.simple-list-item:last-child {
    border-bottom: none;
}

.name {
    color: var(--color-text-primary);
}

.empty-text {
    padding: var(--spacing-md);
    text-align: center;
    color: var(--color-text-muted);
    font-size: 0.875rem;
}

.text-success { color: var(--color-success); }
.text-error { color: var(--color-error); }
.text-muted { color: var(--color-text-muted); }

/* Mobile Optimization */
@media (max-width: 640px) {
    .profile-header {
        flex-direction: column;
        text-align: center;
        gap: var(--spacing-md);
    }
    
    .badges {
        justify-content: center;
    }

    .key-stats-overview {
        grid-template-columns: 1fr 1fr;
        gap: var(--spacing-lg) var(--spacing-md);
    }

    .simple-lists-grid {
        grid-template-columns: 1fr;
    }
}


</style>
