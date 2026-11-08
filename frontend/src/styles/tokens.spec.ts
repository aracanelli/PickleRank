import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

// vitest stubs CSS imports, so read the file directly (tests run from frontend/)
const css = readFileSync(resolve(process.cwd(), 'src/styles/tokens.css'), 'utf8')

function block(selector: string): Record<string, string> {
  const start = css.indexOf(selector)
  const open = css.indexOf('{', start + selector.length - 1)
  // first block after selector up to its matching close (blocks are flat here)
  const close = css.indexOf('}', open)
  const out: Record<string, string> = {}
  for (const m of css.slice(open, close).matchAll(/--([\w-]+):\s*(#[0-9a-f]{6})/gi)) out[m[1]] = m[2]
  return out
}

function lum(hex: string) {
  const c = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map(v => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4))
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]
}
function ratio(a: string, b: string) {
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p)
  return (x + 0.05) / (y + 0.05)
}

const light = block(':root {')
const dark = { ...light, ...block(":root[data-theme='dark'] {") }

// [foreground, background, minimum]
const pairs: Array<[string, string, number]> = [
  ['ink', 'bg', 7], ['ink', 'surface', 7], ['ink', 'court-tint', 7], ['ink', 'surface-sunk', 7],
  ['ink-2', 'bg', 4.5], ['ink-2', 'surface', 4.5], ['ink-2', 'court-tint', 4.5],
  ['on-court', 'court', 4.5], ['court', 'surface', 4.5], ['court', 'bg', 4.5],
  ['on-optic', 'optic', 7],
  ['ok', 'surface', 4.5], ['ok', 'ok-tint', 4.5],
  ['bad', 'surface', 4.5], ['bad', 'bad-tint', 4.5],
  ['wait', 'surface', 4.5], ['wait', 'wait-tint', 4.5],
  ['line-strong', 'surface', 3], ['focus', 'surface', 3], ['focus', 'bg', 3], ['net', 'court-tint', 3]
]

describe.each([['light', light], ['dark', dark]] as const)('%s tokens', (_name, t) => {
  it.each(pairs)('%s on %s meets %s:1', (fg, bg, min) => {
    expect(t[fg], fg).toBeDefined()
    expect(t[bg], bg).toBeDefined()
    expect(ratio(t[fg], t[bg])).toBeGreaterThanOrEqual(min)
  })
  it('dark media block matches the explicit dark theme', () => {
    const media = block(":root:not([data-theme='light']) {")
    const explicit = block(":root[data-theme='dark'] {")
    expect(media).toEqual(explicit)
  })
})

describe('jersey colours', () => {
  it.each([1, 2, 3, 4, 5, 6, 7, 8])('white initials on jersey %s meet 4.5:1', n => {
    expect(ratio('#ffffff', light[`jersey-${n}`])).toBeGreaterThanOrEqual(4.5)
  })
})
