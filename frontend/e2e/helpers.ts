import { expect, type Page, type APIRequestContext } from '@playwright/test'

export type Scenario = 'default' | 'live' | 'big' | 'empty' | 'payments'
export const LEAGUE = 'grp_1'

export async function reset(request: APIRequestContext, scenario: Scenario = 'default') {
  await request.post('/__fake/reset', { data: { scenario } })
}

export async function fakeConfig(request: APIRequestContext, cfg: Record<string, unknown>) {
  await request.post('/__fake/config', { data: cfg })
}

export async function scoreLog(request: APIRequestContext): Promise<Array<{ gameId: string; scoreTeam1?: number; scoreTeam2?: number }>> {
  return (await request.get('/__fake/log')).json()
}

/** Sign in as the fake organizer (default), the fake member, or nobody. */
export async function as(page: Page, user: 'user_org' | 'user_mem' | 'signed-out') {
  await page.addInitScript(u => { localStorage.setItem('e2e:user', u) }, user)
}

export async function noHorizontalOverflow(page: Page) {
  const r = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, w: window.innerWidth }))
  expect(r.sw, `page is ${r.sw}px wide in a ${r.w}px viewport`).toBeLessThanOrEqual(r.w)
}

/** Primary controls (buttons, nav and button-like links, form controls) are at least 44x44 CSS px. */
export async function tapTargets(page: Page, scope = 'body') {
  const small = await page.evaluate(sel => {
    const root = document.querySelector(sel) ?? document.body
    const els = root.querySelectorAll<HTMLElement>('button, [role="button"], input:not([type="hidden"]), select, textarea, a.btn, nav a, label.pick')
    const bad: string[] = []
    els.forEach(el => {
      // a checkbox or radio is hit through its whole label row
      const target = el.matches('input[type="radio"], input[type="checkbox"]') ? (el.closest('label') ?? el) : el
      const r = target.getBoundingClientRect()
      const style = getComputedStyle(el)
      if (r.width === 0 || r.height === 0 || style.visibility === 'hidden' || el.closest('[hidden], .visually-hidden, .offscreen')) return
      if (el.closest('dialog:not([open])')) return
      if (r.width < 43.5 || r.height < 43.5) bad.push(`${el.tagName.toLowerCase()} "${(el.getAttribute('aria-label') || el.textContent || '').trim().slice(0, 40)}" ${Math.round(r.width)}x${Math.round(r.height)}`)
    })
    return bad
  }, scope)
  expect(small, `controls under 44x44:\n${small.join('\n')}`).toEqual([])
}

export async function openCourt(page: Page, court: number) {
  await page.locator(`button[data-court="${court}"]`).click()
  await expect(page.getByRole('dialog')).toBeVisible()
  await expect(page.getByRole('dialog').getByRole('heading')).toContainText(`Court ${court}`)
}

export async function enterScore(page: Page, court: number, s1: number, s2: number) {
  await openCourt(page, court)
  const dialog = page.getByRole('dialog')
  const inputs = dialog.locator('input.score-in')
  await inputs.nth(0).fill(String(s1))
  await inputs.nth(1).fill(String(s2))
  await dialog.getByRole('button', { name: new RegExp(`(Save|Replace score on|Retry) court ${court}$`) }).click()
  await expect(page.getByRole('dialog')).toBeHidden()
}
