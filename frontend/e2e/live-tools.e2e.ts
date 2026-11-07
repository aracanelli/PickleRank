import { test, expect, type Page } from '@playwright/test'
import { reset, as, openCourt, LEAGUE } from './helpers'

async function openLive(page: Page) {
  await page.goto(`/groups/${LEAGUE}`)
  await page.getByRole('link', { name: /Resume scoring/ }).click()
  await expect(page.getByRole('heading', { name: /Round 2/ })).toBeVisible()
}

test.describe('live event tools (organizer)', () => {
  test.beforeEach(async ({ page, request }) => {
    await reset(request, 'live')
    await as(page, 'user_org')
  })

  test('swap two players in the round', async ({ page }) => {
    await openLive(page)
    const before = await page.locator('ol.board').innerText()
    await page.getByRole('button', { name: 'Event options' }).click()
    await page.getByRole('button', { name: 'Swap two players in round 2' }).click()
    const sheet = page.getByRole('dialog').filter({ hasText: 'Swap two players' })
    const boxes = sheet.locator('input[type="checkbox"]')
    await boxes.nth(0).check({ force: true })
    await boxes.nth(5).check({ force: true })
    await sheet.getByRole('button', { name: /^Swap / }).click()
    await expect(page.locator('[aria-live="polite"]').filter({ hasText: 'Players swapped' })).toHaveCount(1)
    await expect.poll(async () => page.locator('ol.board').innerText()).not.toBe(before)
  })

  test('change players blocks someone already on another court', async ({ page }) => {
    await openLive(page)
    await openCourt(page, 2)
    await page.getByRole('dialog').getByRole('button', { name: 'Change players' }).click()
    const sheet = page.getByRole('dialog').filter({ hasText: 'Change players on court 2' })
    // pick, for team one's first seat, a player who is on court 1 this round
    const court1First = (await page.locator('button[data-court="1"] .side__names span').first().innerText()).trim()
    await sheet.getByLabel('Team one, first player').selectOption({ label: court1First })
    await sheet.getByRole('button', { name: 'Save court 2 players' }).click()
    await expect(sheet.getByRole('alert')).toContainText(`${court1First} is already on court 1 this round.`)
  })

  test('delete a game asks first and removes the court', async ({ page }) => {
    await openLive(page)
    await expect(page.locator('button[data-court]')).toHaveCount(3)
    await openCourt(page, 3)
    await page.getByRole('dialog').getByRole('button', { name: 'Delete game' }).click()
    const confirm = page.getByRole('dialog').filter({ hasText: 'Delete the court 3 game in round 2?' })
    await confirm.getByRole('button', { name: 'Delete game' }).click()
    await expect(page.locator('button[data-court]')).toHaveCount(2)
  })

  test("another organizer's score appears without reloading", async ({ page, request }) => {
    await openLive(page)
    const ev = await request.get(`/api/groups/${LEAGUE}/events`, { headers: { Authorization: 'Bearer e2e-user_org' } }).then(r => r.json())
    const full = await request.get(`/api/events/${ev.events[0].id}`, { headers: { Authorization: 'Bearer e2e-user_org' } }).then(r => r.json())
    const court3 = full.games.find((g: { roundIndex: number; courtIndex: number }) => g.roundIndex === 1 && g.courtIndex === 2)
    await request.patch(`/api/games/${court3.id}/score`, { headers: { Authorization: 'Bearer e2e-user_org' }, data: { scoreTeam1: 4, scoreTeam2: 11 } })
    await expect(page.locator('button[data-court="3"]')).toContainText('Saved', { timeout: 12_000 })
  })
})
