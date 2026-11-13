import { test, expect } from '@playwright/test'
import { reset, as, fakeConfig, scoreLog, openCourt, enterScore, LEAGUE } from './helpers'

async function openLive(page: import('@playwright/test').Page) {
  await page.goto(`/groups/${LEAGUE}`)
  await page.getByRole('link', { name: /Resume scoring/ }).click()
  await expect(page.getByRole('heading', { name: /Round 2/ })).toBeVisible()
}

test.describe('scoring holds up courtside', () => {
  test.beforeEach(async ({ page, request }) => {
    await reset(request, 'live')
    await as(page, 'user_org')
  })

  test('rapid taps on save send one request', async ({ page, request }) => {
    await openLive(page)
    await openCourt(page, 2)
    const inputs = page.getByRole('dialog').locator('input.score-in')
    await inputs.nth(0).fill('11')
    await inputs.nth(1).fill('6')
    const save = page.getByRole('dialog').getByRole('button', { name: 'Save court 2' })
    await save.dblclick({ force: true }).catch(() => {})
    await page.keyboard.press('Enter').catch(() => {})
    await expect(page.locator('button[data-court="2"]')).toContainText('Saved')
    const log = await scoreLog(request)
    expect(log.filter(l => l.scoreTeam1 === 11 && l.scoreTeam2 === 6)).toHaveLength(1)
  })

  test('slow save shows saving, then saved, and announces it', async ({ page, request }) => {
    await openLive(page)
    await fakeConfig(request, { scoreLatencyMs: 2500 })
    await enterScore(page, 2, 11, 4)
    const tile = page.locator('button[data-court="2"]')
    await expect(tile).toContainText('Saving…')
    await expect(tile).toContainText('11')
    await expect(page.getByRole('button', { name: 'Complete event' })).toHaveCount(0)
    await expect(tile).toContainText('Saved', { timeout: 6000 })
    await expect(page.locator('[aria-live="polite"]').filter({ hasText: 'Court 2 saved, 11 to 4.' })).toHaveCount(1)
  })

  test('a server hiccup is retried on its own and the score lands', async ({ page, request }) => {
    await openLive(page)
    await fakeConfig(request, { failScores: 1 })
    await enterScore(page, 2, 11, 5)
    const tile = page.locator('button[data-court="2"]')
    await expect(tile).toContainText('11')
    await expect(tile).toContainText('Saved', { timeout: 8000 })
    const log = await scoreLog(request)
    expect(log.filter(l => l.scoreTeam1 === 11 && l.scoreTeam2 === 5).length).toBe(2)
  })

  test('a refused score keeps the numbers, survives reload, and retries', async ({ page, request }) => {
    await openLive(page)
    await fakeConfig(request, { refuseScores: 1 })
    await enterScore(page, 2, 11, 3)
    const tile = page.locator('button[data-court="2"]')
    await expect(tile).toContainText('Not saved. Tap to retry')
    await expect(tile).toContainText('11')
    await expect(page.locator('[aria-live="assertive"]')).toContainText('Court 2 score not saved')

    await expect(page.getByRole('button', { name: 'Retry court 2' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Complete event' })).toHaveCount(0)

    // the server refused it; the entry survives a reload
    await page.reload()
    await expect(page.locator('button[data-court="2"]')).toContainText('Not saved')

    await openCourt(page, 2)
    const dialog = page.getByRole('dialog')
    await expect(dialog).toContainText('Your numbers are kept below')
    await expect(dialog.locator('input.score-in').nth(0)).toHaveValue('11')
    await expect(dialog.locator('input.score-in').nth(1)).toHaveValue('3')
    await dialog.getByRole('button', { name: 'Retry court 2' }).click()
    await expect(page.locator('button[data-court="2"]')).toContainText('Saved')
  })

  test('the thumb-zone retry resends every unsaved court', async ({ page, request }) => {
    await openLive(page)
    await fakeConfig(request, { refuseScores: 2 })
    await enterScore(page, 2, 11, 1)
    await enterScore(page, 3, 11, 2)
    const retry = page.getByRole('button', { name: 'Retry 2 courts' })
    await expect(retry).toBeVisible()
    await retry.click()
    await expect(page.locator('button[data-court="2"]')).toContainText('Saved')
    await expect(page.locator('button[data-court="3"]')).toContainText('Saved')
    await expect(page.getByRole('button', { name: /Retry/ })).toHaveCount(0)
  })

  test('offline: scores are kept on the phone, survive leaving, and sync on reconnect', async ({ page, request, context }) => {
    await openLive(page)
    await context.setOffline(true)
    await enterScore(page, 3, 11, 9)
    const tile = page.locator('button[data-court="3"]')
    await expect(tile).toContainText('On phone · syncs later')
    await expect(tile).toContainText('11')
    await expect(page.getByText(/Offline · 1 change on this phone/)).toBeVisible()
    // leaving is safe: no prompt, the score stays queued
    await page.getByRole('link', { name: 'Tuesday Ladder' }).click()
    await expect(page.getByRole('dialog')).toHaveCount(0)
    expect((await scoreLog(request)).filter(l => l.scoreTeam2 === 9)).toHaveLength(0)
    await context.setOffline(false)
    await expect.poll(async () => (await scoreLog(request)).filter(l => l.scoreTeam1 === 11 && l.scoreTeam2 === 9).length, { timeout: 15000 }).toBe(1)
    await expect(page.getByText(/change on this phone|Syncing/)).toHaveCount(0)
  })

  test('a late offline replay never overwrites a newer score from another phone', async ({ page, request, context }) => {
    await openLive(page)
    await context.setOffline(true)
    await enterScore(page, 2, 11, 1) // typed now, queued
    // another organizer saves court 2 afterwards, straight to the server
    const ev = await (await request.get(page.url().replace(/.*\/events\//, '/api/events/'), { headers: { authorization: 'Bearer e2e-user_org' } })).json()
    const round = Number((await page.getByRole('heading', { name: /Round \d/ }).first().textContent())!.match(/Round (\d)/)![1]) - 1
    const target = ev.games.find((g: { roundIndex: number; courtIndex: number }) => g.roundIndex === round && g.courtIndex === 1)
    await request.patch(`/api/games/${target.id}/score`, { headers: { authorization: 'Bearer e2e-user_org' }, data: { scoreTeam1: 4, scoreTeam2: 11, editedAt: Date.now() + 1000 } })
    await context.setOffline(false)
    // the phone's older entry reaches the server, loses, and the newer score comes back
    await expect(page.locator('button[data-court="2"]')).toContainText('4', { timeout: 15000 })
    const after = await (await request.get(`/api/events/${ev.id}`, { headers: { authorization: 'Bearer e2e-user_org' } })).json()
    expect(after.games.find((g: { id: string }) => g.id === target.id)).toMatchObject({ scoreTeam1: 4, scoreTeam2: 11 })
  })

  test('invalid scores are caught in the sheet, not sent', async ({ page, request }) => {
    await openLive(page)
    await openCourt(page, 2)
    const dialog = page.getByRole('dialog')
    await dialog.locator('input.score-in').nth(0).fill('11')
    await dialog.getByRole('button', { name: 'Save court 2' }).click()
    await expect(dialog).toContainText('Enter a score')
    await expect(dialog.locator('input.score-in').nth(1)).toBeFocused()
    expect(await scoreLog(request)).toHaveLength(0)
  })

  test('editing a saved court shows the old score and replaces it', async ({ page }) => {
    await openLive(page)
    await openCourt(page, 1)
    const dialog = page.getByRole('dialog')
    await expect(dialog).toContainText(/Saved score was \d+–\d+/)
    await dialog.locator('input.score-in').nth(1).fill('5')
    await dialog.getByRole('button', { name: 'Replace score on court 1' }).click()
    await expect(page.locator('button[data-court="1"]')).toContainText('5')
  })

  test('shuffling the schedule says how many scores will be deleted', async ({ page }) => {
    await openLive(page)
    await page.getByRole('button', { name: 'Event options' }).click()
    await page.getByRole('button', { name: 'Shuffle schedule' }).click()
    const dialog = page.getByRole('dialog').filter({ hasText: 'Shuffle the schedule?' })
    await expect(dialog).toContainText('4 scores already entered are deleted')
    await dialog.getByRole('button', { name: 'Cancel' }).first().click()
    await expect(page.locator('button[data-court="1"]')).toContainText('Saved')
  })

  test('a failed completion keeps the event and says so', async ({ page, request }) => {
    await openLive(page)
    // score everything that is left
    for (let r = 2; r <= 4; r++) {
      for (const court of [1, 2, 3]) {
        const tile = page.locator(`button[data-court="${court}"]`)
        if (!(await tile.textContent())?.includes('Saved')) await enterScore(page, court, 11, court)
      }
      if (r < 4) await page.getByRole('button', { name: `Go to round ${r + 1}` }).click()
    }
    await fakeConfig(request, { refuseCompleteOnce: true })
    await page.getByRole('button', { name: 'Complete event' }).click()
    await page.getByRole('dialog').getByRole('button', { name: 'Complete event' }).click()
    await expect(page.locator('[aria-live="assertive"]')).toContainText('Your scores are saved')
    await expect(page).toHaveURL(/\/events\//)
    await expect(page.getByRole('button', { name: 'Complete event' })).toBeEnabled()
  })
})

test.describe('who can score', () => {
  test('a member who opens a live event link sees why it is read-only', async ({ page, request }) => {
    await reset(request, 'live')
    await as(page, 'user_mem')
    await page.goto(`/groups/${LEAGUE}`)
    await expect(page.getByText('Scores are entered by league organizers')).toBeVisible()
    await expect(page.getByRole('link', { name: /Resume scoring/ })).toHaveCount(0)
    const id = await request.get(`/api/groups/${LEAGUE}/events`, { headers: { Authorization: 'Bearer e2e-user_org' } }).then(r => r.json()).then(j => j.events[0].id)
    await page.goto(`/events/${id}`)
    await expect(page.getByRole('heading', { name: 'Only organizers can open live events' })).toBeVisible()
  })
})
