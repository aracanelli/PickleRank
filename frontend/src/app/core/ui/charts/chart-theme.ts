import { computed } from 'vue'
import { useThemeStore } from '@/stores/theme'

/**
 * Theme-aware chart.js option fragments resolved from the CSS tokens in
 * styles/tailwind.css. Chart tokens are deliberately plain hex/rgb —
 * chart.js cannot parse oklch()/color-mix().
 *
 * chart.js captures options at mount, so consumers must remount on theme
 * change: bind `:key="chartTheme.resolved.value"` on the chart component.
 */
export function useChartTheme() {
  const themeStore = useThemeStore()

  const resolved = computed(() => themeStore.resolved)

  const colors = computed(() => {
    // Depend on resolved theme so this recomputes after data-theme flips
    void themeStore.resolved
    const style = getComputedStyle(document.documentElement)
    const read = (name: string, fallback: string) =>
      style.getPropertyValue(name).trim() || fallback
    return {
      grid: read('--chart-grid', '#334155'),
      tick: read('--chart-tick', '#94a3b8'),
      brand: read('--brand', '#10b981'),
      brandSoft: read('--brand-soft', 'rgba(16, 185, 129, 0.15)'),
      surface: read('--surface-1', '#1e293b'),
      ink: read('--ink', '#f8fafc'),
      line: read('--line', '#334155'),
      win: read('--win', '#4ade80'),
      loss: read('--loss', '#f87171')
    }
  })

  /** Common scale config for line/bar charts. */
  const scaleOptions = computed(() => ({
    grid: { color: colors.value.grid },
    ticks: { color: colors.value.tick }
  }))

  /** Themed tooltip + legend plugin options. */
  const pluginOptions = computed(() => ({
    legend: {
      labels: { color: colors.value.tick }
    },
    tooltip: {
      backgroundColor: colors.value.surface,
      titleColor: colors.value.ink,
      bodyColor: colors.value.tick,
      borderColor: colors.value.line,
      borderWidth: 1
    }
  }))

  return { resolved, colors, scaleOptions, pluginOptions }
}
