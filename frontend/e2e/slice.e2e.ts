import { test, expect } from '@playwright/test'
import { reset, as, LEAGUE, enterScore, noHorizontalOverflow } from './helpers'

test.describe('league night, start to finish (organizer)', () => {
  test.beforeEach(async ({ page, request }) => {
    await reset(request, 'default')
    await as(page, 'user_org')
  })

  test('create event, score every court, complete, see rankings and history', async ({ page }) => {
    await page.goto(`/groups/${LEAGUE}`)
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Tuesday Ladder')
    await expect(page.getByText('No event in progress')).toBeVisible()
    await noHorizontalOverflow(page)

    await page.getByRole('link', { name: 'Start an event' }).click()
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('New event')
    // 12 regulars -> 3 courts, all 12 preselected; the count sits beside the action
    await expect(page.getByText('12 of 12 players selected. Ready.')).toBeVisible()
    await page.getByRole('button', { name: 'Fewer courts' }).click()
    await expect(page.getByText('8 of 8 players selected. Ready.')).toBeVisible()
    await page.getByRole('button', { name: 'Fewer rounds' }).click()
    await page.getByRole('button', { name: 'Fewer rounds' }).click()
    await page.getByLabel('Event name').fill('Week 6 ladder')
    await noHorizontalOverflow(page)
    await page.getByRole('button', { name: 'Create and make schedule' }).click()

    await expect(page).toHaveURL(/\/events\//)
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Week 6 ladder')
    await expect(page.getByText('Schedule ready.')).toBeVisible()
    await noHorizontalOverflow(page)

    // round 1, both courts
    await enterScore(page, 1, 11, 7)
    await expect(page.locator('button[data-court="1"]')).toContainText('Saved')
    await enterScore(page, 2, 9, 11)
    await page.getByRole('button', { name: 'Go to round 2' }).click()
    await expect(page.getByRole('heading', { name: /Round 2/ })).toBeVisible()
    await enterScore(page, 1, 11, 0)
    // complete only appears once every game is saved
    await expect(page.getByRole('button', { name: 'Complete event' })).toHaveCount(0)
    await enterScore(page, 2, 10, 10)

    await page.getByRole('button', { name: 'Complete event' }).click()
    const dialog = page.getByRole('dialog')
    await expect(dialog).toContainText('Ratings update for 8 players')
    await dialog.getByRole('button', { name: 'Complete event' }).click()

    await expect(page).toHaveURL(new RegExp(`/groups/${LEAGUE}/rankings`))
    await expect(page.getByText('Event completed. Rankings updated.').first()).toBeAttached()
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()

    await page.goto(`/groups/${LEAGUE}/history`)
    await expect(page.getByText('Week 6 ladder').first()).toBeVisible()
    await noHorizontalOverflow(page)
  })

  test('resume an in-progress event from league home', async ({ page, request }) => {
    await reset(request, 'live')
    await page.goto(`/groups/${LEAGUE}`)
    await expect(page.getByText('Round 2 of 4')).toBeVisible()
    await page.getByRole('link', { name: 'Resume scoring, round 2' }).click()
    await expect(page.getByRole('heading', { name: /Round 2/ })).toBeVisible()
    await expect(page.locator('button[data-court="1"]')).toContainText('Saved')
    await expect(page.locator('button[data-court="2"]')).toContainText('Needs score')
  })
})
