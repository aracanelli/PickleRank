/**
 * Court Card brand values as plain hex, for consumers that cannot read CSS custom properties:
 * theme store (<meta theme-color>), chart fallbacks, confetti, and html2canvas share images.
 *
 * Source of truth is src/styles/tokens.css (contrast-tested by tokens.spec.ts).
 * HAND-SYNC when values change: index.html inline theme script, vite.config.ts PWA colors.
 */
export const BRAND = {
  dark: {
    surfacePage: '#0f1b2d',
    surface1: '#16263d',
    surface2: '#0b1524',
    surface3: '#1b3352',
    surfaceCourt: '#1b3352',
    ink: '#e8eef6',
    inkMuted: '#b4c1d2',
    inkFaint: '#b4c1d2',
    line: '#2c3f5a',
    lineStrong: '#8193ab',
    accentFill: '#ddf04a',
    accentText: '#ddf04a',
    accentContrast: '#13233a',
    court: '#7daef2',
    win: '#5cc98a',
    loss: '#ff8a80',
    tie: '#f2c14e',
    warn: '#f2c14e',
    info: '#7daef2',
    chartGrid: '#2c3f5a',
    chartTick: '#b4c1d2'
  },
  light: {
    surfacePage: '#f6f8fa',
    surface1: '#ffffff',
    surface2: '#edf1f5',
    surface3: '#e6eef8',
    surfaceCourt: '#e6eef8',
    ink: '#13233a',
    inkMuted: '#44546a',
    inkFaint: '#44546a',
    line: '#c9d2dd',
    lineStrong: '#6b7a8c',
    accentFill: '#ddf04a',
    accentText: '#1e5aa8',
    accentContrast: '#13233a',
    court: '#1e5aa8',
    win: '#1b7a43',
    loss: '#b3261e',
    tie: '#8a5a00',
    warn: '#8a5a00',
    info: '#1e5aa8',
    chartGrid: '#c9d2dd',
    chartTick: '#44546a'
  }
} as const

export const FONTS = {
  display: '"Barlow Condensed", "Atkinson Hyperlegible Next", system-ui, sans-serif',
  sans: '"Atkinson Hyperlegible Next", system-ui, -apple-system, sans-serif',
  mono: '"Barlow Condensed", system-ui, sans-serif'
} as const
