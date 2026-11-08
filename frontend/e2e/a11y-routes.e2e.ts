import { test, expect, type Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { reset, as, LEAGUE, noHorizontalOverflow, tapTargets, openCourt, type Scenario } from './helpers'

type Screen = { name: string; path: string; user: 'user_org' | 'user_mem' | 'signed-out'; scenario?: Scenario; ready: (p: Page) => Promise<void> }

const h1 = async (p: Page) => { await expect(p.getByRole('heading', { level: 1 }).first()).toBeVisible() }

const screens: Screen[] = [
  { name: 'landing', path: '/', user: 'signed-out', ready: h1 },
  { name: 'sign in', path: '/login', user: 'signed-out', ready: h1 },
  { name: 'sign up', path: '/signup', user: 'signed-out', ready: h1 },
  { name: 'leagues', path: '/groups', user: 'user_org', ready: h1 },
  { name: 'leagues (first use)', path: '/groups', user: 'user_org', scenario: 'empty', ready: h1 },
  { name: 'league home (organizer, live)', path: `/groups/${LEAGUE}`, user: 'user_org', scenario: 'live', ready: async p => { await expect(p.getByText('Round 2 of 4')).toBeVisible() } },
  { name: 'league home (member)', path: `/groups/${LEAGUE}`, user: 'user_mem', ready: async p => { await expect(p.getByRole('heading', { name: 'Last week' })).toBeVisible() } },
  { name: 'new event', path: `/groups/${LEAGUE}/events/new`, user: 'user_org', ready: async p => { await expect(p.getByText(/players selected/)).toBeVisible() } },
  { name: 'rankings', path: `/groups/${LEAGUE}/rankings`, user: 'user_org', ready: h1 },
  { name: 'rankings (member)', path: `/groups/${LEAGUE}/rankings`, user: 'user_mem', ready: h1 },
  { name: 'history', path: `/groups/${LEAGUE}/history`, user: 'user_org', ready: h1 },
  { name: 'history (member, own games)', path: `/groups/${LEAGUE}/history?playerId=pl_2`, user: 'user_mem', ready: h1 },
  { name: 'player profile', path: `/groups/${LEAGUE}/players/gp_2`, user: 'user_mem', ready: h1 },
  { name: 'roster (50 players)', path: `/groups/${LEAGUE}/players/manage`, user: 'user_org', scenario: 'big', ready: h1 },
  { name: 'roster (member denied)', path: `/groups/${LEAGUE}/players/manage`, user: 'user_mem', ready: h1 },
  { name: 'settings', path: `/groups/${LEAGUE}/settings`, user: 'user_org', ready: h1 },
  { name: 'settings (member denied)', path: `/groups/${LEAGUE}/settings`, user: 'user_mem', ready: h1 },
  { name: 'payments', path: `/groups/${LEAGUE}/payments`, user: 'user_org', scenario: 'payments', ready: h1 },
  { name: 'payments (tracking off)', path: `/groups/${LEAGUE}/payments`, user: 'user_org', ready: h1 },
  { name: 'player library', path: '/players', user: 'user_org', ready: h1 },
  { name: 'invite link (bad token)', path: '/link-player?token=nope', user: 'user_mem', ready: h1 },
  { name: 'awards (organizer)', path: `/groups/${LEAGUE}/awards`, user: 'user_org', ready: h1 },
  { name: 'awards (member)', path: `/groups/${LEAGUE}/awards`, user: 'user_mem', ready: h1 },
  { name: 'head to head', path: `/groups/${LEAGUE}/history?h2h=pl_1,pl_2`, user: 'user_mem', ready: h1 },
  { name: 'not found', path: '/no/such/page', user: 'user_org', ready: h1 }
]

async function axe(page: Page) {
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .exclude('.offscreen')
    // target-size (2.5.8, 24px) flags rows that scroll under the sticky action bar; tapTargets() enforces the stricter 44px project rule instead
    .disableRules(['target-size'])
    .analyze()
  const bad = results.violations.filter(v => v.impact === 'serious' || v.impact === 'critical')
  expect(bad.map(v => `${v.id} (${v.impact}): ${v.nodes.map(n => n.target.join(' ')).slice(0, 3).join(' | ')}`)).toEqual([])
}

test.describe('every screen: loads by direct link, one h1, no overflow, AA, 44px targets', () => {
  for (const s of screens) {
    test(s.name, async ({ page, request }) => {
      await reset(request, s.scenario ?? 'default')
      await as(page, s.user)
      await page.goto(s.path)
      await s.ready(page)
      await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1)
      await noHorizontalOverflow(page)
      await tapTargets(page, 'main')
      await axe(page)
      // refresh keeps you on the same screen
      await page.reload()
      await s.ready(page)
      expect(new URL(page.url()).pathname).toBe(s.path.split('?')[0])
    })
  }

  test('live scoring board and court sheet', async ({ page, request }) => {
    await reset(request, 'live')
    await as(page, 'user_org')
    await page.goto(`/groups/${LEAGUE}`)
    await page.getByRole('link', { name: /Resume scoring/ }).click()
    await expect(page.getByRole('heading', { name: /Round 2/ })).toBeVisible()
    await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1)
    await noHorizontalOverflow(page)
    await tapTargets(page, 'main')
    await axe(page)
    await openCourt(page, 2)
    await tapTargets(page, 'dialog[open]')
    await axe(page)
  })
})

test.describe('navigation', () => {
  test('back from an event returns to league home; tab bar hidden while scoring', async ({ page, request }) => {
    await reset(request, 'live')
    await as(page, 'user_org')
    await page.goto(`/groups/${LEAGUE}`)
    await expect(page.getByRole('navigation', { name: 'League' })).toBeVisible()
    await page.getByRole('link', { name: /Resume scoring/ }).click()
    await expect(page.getByRole('navigation', { name: 'League' })).toHaveCount(0)
    await page.goBack()
    await expect(page).toHaveURL(new RegExp(`/groups/${LEAGUE}$`))
    await page.getByRole('navigation', { name: 'League' }).getByRole('link', { name: 'Rankings' }).click()
    await expect(page).toHaveURL(/\/rankings$/)
    await page.goBack()
    await expect(page).toHaveURL(new RegExp(`/groups/${LEAGUE}$`))
  })

  test('signed-out deep link goes to sign in and keeps the destination', async ({ page }) => {
    await as(page, 'signed-out')
    await page.goto(`/groups/${LEAGUE}/rankings`)
    await expect(page).toHaveURL(/\/login\?redirect=/)
    expect(decodeURIComponent(page.url())).toContain(`/groups/${LEAGUE}/rankings`)
  })

  test('member sees Me, not Players, in the tab bar', async ({ page, request }) => {
    await reset(request, 'default')
    await as(page, 'user_mem')
    await page.goto(`/groups/${LEAGUE}`)
    const nav = page.getByRole('navigation', { name: 'League' })
    await expect(nav.getByRole('link', { name: 'Me', exact: true })).toBeVisible()
    await expect(nav.getByRole('link', { name: 'Players', exact: true })).toHaveCount(0)
    await expect(page.getByRole('link', { name: 'League settings' })).toHaveCount(0)
  })
})

test.describe('keyboard and preferences', () => {
  test('score a court with the keyboard only; focus returns to the court', async ({ page, request, browserName }) => {
    test.skip(browserName === 'webkit', 'WebKit Tab skips buttons unless the OS setting is on')
    await reset(request, 'live')
    await as(page, 'user_org')
    await page.goto(`/groups/${LEAGUE}`)
    await page.getByRole('link', { name: /Resume scoring/ }).click()
    const tile = page.locator('button[data-court="2"]')
    await tile.focus()
    await expect(tile).toBeFocused()
    await page.keyboard.press('Enter')
    const inputs = page.getByRole('dialog').locator('input.score-in')
    await expect(inputs.nth(0)).toBeFocused()
    await page.keyboard.type('11')
    await page.keyboard.press('Enter')
    await expect(inputs.nth(1)).toBeFocused()
    await page.keyboard.type('8')
    await page.keyboard.press('Enter')
    await expect(page.getByRole('dialog')).toBeHidden()
    await expect(tile).toBeFocused()
    await expect(tile).toContainText('Saved')
    // Esc closes without saving
    await page.keyboard.press('Enter')
    await page.keyboard.press('Escape')
    await expect(page.getByRole('dialog')).toBeHidden()
  })

  test('focused fields stay visible above the sticky action bar', async ({ page, request }) => {
    await reset(request, 'big')
    await as(page, 'user_org')
    await page.goto(`/groups/${LEAGUE}/events/new`)
    const search = page.getByLabel('Find a player')
    await page.evaluate(() => window.scrollTo(0, 0))
    await search.focus()
    const covered = await search.evaluate(el => {
      const r = el.getBoundingClientRect()
      const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2)
      return !(hit === el || el.contains(hit))
    })
    expect(covered).toBe(false)
  })

  test('200% text size: core screens still fit', async ({ page, request }) => {
    await reset(request, 'live')
    await as(page, 'user_org')
    for (const path of [`/groups/${LEAGUE}`, `/groups/${LEAGUE}/events/new`]) {
      await page.goto(path)
      await page.addStyleTag({ content: 'html { font-size: 200% !important }' })
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
      await noHorizontalOverflow(page)
    }
    await page.goto(`/groups/${LEAGUE}`)
    await page.getByRole('link', { name: /Resume scoring/ }).click()
    await page.addStyleTag({ content: 'html { font-size: 200% !important }' })
    await expect(page.getByRole('heading', { name: /Round 2/ })).toBeVisible()
    await noHorizontalOverflow(page)
  })

  test('reduced motion turns off the save flash', async ({ page, request }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await reset(request, 'live')
    await as(page, 'user_org')
    await page.goto(`/groups/${LEAGUE}`)
    await page.getByRole('link', { name: /Resume scoring/ }).click()
    const dur = await page.locator('button[data-court="1"]').evaluate(el => {
      el.classList.add('court--flash')
      return parseFloat(getComputedStyle(el).animationDuration)
    })
    expect(dur).toBeLessThan(0.05)
  })
})
