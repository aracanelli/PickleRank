import { computed } from 'vue'
import { useThemeStore } from '@/stores/theme'
import { BRAND, FONTS } from '@/app/core/brand/brand-constants'

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
    const fallback = BRAND[themeStore.resolved]
    const style = getComputedStyle(document.documentElement)
    const read = (name: string, fb: string) => style.getPropertyValue(name).trim() || fb
    return {
      grid: read('--chart-grid', fallback.chartGrid),
      tick: read('--chart-tick', fallback.chartTick),
      brand: read('--accent-text', fallback.accentText),
      brandSoft: read('--accent-soft', 'rgba(212, 255, 61, 0.12)'),
      surface: read('--surface-1', fallback.surface1),
      ink: read('--ink', fallback.ink),
      line: read('--line', fallback.line),
      win: read('--win', fallback.win),
      loss: read('--loss', fallback.loss)
    }
  })

  /** Common scale config for line/bar charts. */
  const scaleOptions = computed(() => ({
    grid: { color: colors.value.grid },
    ticks: { color: colors.value.tick, font: { family: FONTS.sans } }
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
