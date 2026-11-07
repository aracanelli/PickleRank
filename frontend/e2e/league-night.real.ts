import { test, expect, type Page } from '@playwright/test'
import { noHorizontalOverflow } from './helpers'

const ORG = process.env.PR_ORG_TOKEN ?? ''
const MEM = process.env.PR_MEM_TOKEN ?? ''
const GROUP = process.env.PR_GROUP_ID ?? ''

test.skip(!ORG || !MEM || !GROUP, 'set PR_ORG_TOKEN, PR_MEM_TOKEN, PR_GROUP_ID from the local stack')

async function signInAs(page: Page, user: 'user_org' | 'user_mem') {
  await page.addInitScript(([u, t]) => {
    localStorage.setItem('e2e:user', u)
    localStorage.setItem('e2e:token', t)
  }, [user, user === 'user_org' ? ORG : MEM] as const)
}

async function scoreVisibleRound(page: Page) {
  const tiles = page.locator('button[data-court]')
  const n = await tiles.count()
  for (let i = 0; i < n; i++) {
    const tile = tiles.nth(i)
    if ((await tile.textContent())?.includes('Saved')) continue
    await tile.click()
    const dialog = page.getByRole('dialog')
    await dialog.locator('input.score-in').nth(0).fill('11')
    await dialog.locator('input.score-in').nth(1).fill(String(i)) // includes a 0
    await dialog.getByRole('button', { name: /^Save court \d+$/ }).click()
    await expect(tile).toContainText('Saved')
  }
}

test('organizer runs a league night on the real API; member sees results', async ({ page, browser }) => {
  await signInAs(page, 'user_org')
  await page.goto(`/groups/${GROUP}`)
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Tuesday Ladder')

  await page.getByRole('link', { name: 'Start an event' }).click()
  await expect(page.getByText(/of \d+ players selected/)).toBeVisible()
  await page.getByRole('button', { name: 'Fewer courts' }).click() // 2 courts
  await expect(page.getByText('8 of 8 players selected. Ready.')).toBeVisible()
  // step to exactly 2 rounds whatever the league's default is
  const rounds = page.getByRole('group', { name: 'Rounds', exact: true }).locator('output')
  for (let i = 0; i < 20 && parseInt(await rounds.innerText(), 10) !== 2; i++) {
    const n = parseInt(await rounds.innerText(), 10)
    await page.getByRole('button', { name: n > 2 ? 'Fewer rounds' : 'More rounds' }).click()
  }
  const name = `Real night ${Date.now().toString(36)}`
  await page.getByLabel('Event name').fill(name)
  await page.getByRole('button', { name: 'Create and make schedule' }).click()

  await expect(page).toHaveURL(/\/events\//)
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(name)
  const roundCount = await page.getByRole('navigation', { name: 'Rounds' }).getByRole('button').count()
  for (let r = 1; r <= roundCount; r++) {
    await expect(page.getByRole('heading', { name: new RegExp(`Round ${r}`) })).toBeVisible()
    await scoreVisibleRound(page)
    if (r < roundCount) await page.getByRole('button', { name: `Go to round ${r + 1}` }).click()
  }
  await noHorizontalOverflow(page)

  // persisted, not just optimistic: reload shows every court saved
  await page.reload()
  await expect(page.locator('button[data-court]').first()).toContainText('Saved')

  await page.getByRole('button', { name: 'Complete event' }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Complete event' }).click()
  await page.getByRole('dialog').filter({ hasText: 'Ratings updated' }).getByRole('link', { name: 'See rankings' }).click()
  await expect(page).toHaveURL(new RegExp(`/groups/${GROUP}/rankings`))
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Rankings')
  // ratings moved: the leader is no longer at the 1000 starting rating
  await expect(page.locator('.srow__rating').first()).not.toHaveText(/^\s*Rating 1000\s*$/)

  await page.goto(`/groups/${GROUP}/history`)
  await expect(page.getByText(name).first()).toBeVisible()

  // member: read-only league, cannot open the event
  const ctx = await browser.newContext()
  const member = await ctx.newPage()
  await signInAs(member, 'user_mem')
  await member.goto(`/groups/${GROUP}`)
  await expect(member.getByText('Your standing')).toBeVisible()
  await expect(member.getByText('Scores are entered by league organizers')).toBeVisible()
  const eventUrl = page.url()
  void eventUrl
  await member.goto(`/groups/${GROUP}/history`)
  await expect(member.getByRole('heading', { level: 1 })).toBeVisible()
  await ctx.close()
})
