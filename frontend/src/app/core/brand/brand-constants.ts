/**
 * COURTSIDE brand — single TypeScript source of plain-hex brand values.
 *
 * Consumers that cannot read CSS custom properties import from here:
 * theme store (<meta theme-color>), Clerk appearance, chart-theme fallbacks,
 * and the html2canvas shareable frames (which must stay hex-only).
 *
 * HAND-SYNC CHECKLIST — these cannot import TS and must be updated manually
 * whenever values here change:
 *   1. index.html — inline theme script + <meta name="theme-color">
 *   2. vite.config.ts — PWA manifest theme_color / background_color
 *   3. src/styles/tailwind.css — the CSS token layer itself (source of truth
 *      for everything rendered via Tailwind)
 */
export const BRAND = {
  dark: {
    surfacePage: '#0a0c10',
    surface1: '#12151c',
    surface2: '#1a1f29',
    surface3: '#242b38',
    surfaceCourt: '#0e1613',
    ink: '#f2f5f9',
    inkMuted: '#98a2b3',
    inkFaint: '#5b6472',
    line: '#20242e',
    lineStrong: '#333a48',
    accentFill: '#d4ff3d',
    accentText: '#d4ff3d',
    accentContrast: '#0a0c10',
    win: '#34d399',
    loss: '#ff5d5d',
    tie: '#ffc53d',
    warn: '#ffb224',
    info: '#4cc2ff',
    chartGrid: '#20242e',
    chartTick: '#98a2b3'
  },
  light: {
    surfacePage: '#f4f6f8',
    surface1: '#ffffff',
    surface2: '#edf0f4',
    surface3: '#e2e6ec',
    surfaceCourt: '#e9efe7',
    ink: '#101319',
    inkMuted: '#4c5666',
    inkFaint: '#8a93a3',
    line: '#e2e6ec',
    lineStrong: '#c9d0db',
    accentFill: '#c9f53a',
    accentText: '#4d7c0f',
    accentContrast: '#0a0c10',
    win: '#0e9f6e',
    loss: '#dc2626',
    tie: '#b45309',
    warn: '#b45309',
    info: '#0e7cc2',
    chartGrid: '#e2e6ec',
    chartTick: '#4c5666'
  }
} as const

export const FONTS = {
  display: 'Archivo, "Arial Narrow", system-ui, sans-serif',
  sans: 'Inter, system-ui, -apple-system, sans-serif',
  mono: '"JetBrains Mono", monospace'
} as const
