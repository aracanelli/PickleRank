import { test, expect } from '@playwright/test'
import { reset, as, LEAGUE } from './helpers'

/**
 * Courtside connections drop. These run with the browser context offline (the dev server has
 * no service worker, so each test first visits the screens it needs while online and then moves
 * by client-side navigation, keeping their code loaded; in production the service worker precaches it).
 */
test.describe('offline', () => {
  test.beforeEach(async ({ page, request }) => {
    await reset(request, 'default')
    await as(page, 'user_org')
  })

  test('a league created offline opens at once and is created on the server on reconnect', async ({ page, request, context }) => {
    await page.goto(`/groups/${LEAGUE}`)
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Tuesday Ladder')
    // client-side navigation keeps the loaded screens' code in memory
    await page.getByRole('link', { name: 'All leagues' }).click()
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Your leagues')

    await context.setOffline(true)
    await page.getByRole('button', { name: 'Create a league' }).click()
    await page.getByLabel('League name').fill('Gym Wifi League')
    await page.getByRole('button', { name: 'Create league' }).click()
    await expect(page).toHaveURL(/\/groups\/[0-9a-f-]{36}$/)
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Gym Wifi League')
    await expect(page.getByText(/Offline · 1 change on this phone/)).toBeVisible()

    const id = page.url().split('/').pop()!
    const auth = { authorization: 'Bearer e2e-user_org' }
    expect((await request.get(`/api/groups/${id}`, { headers: auth })).status()).toBe(404)

    await context.setOffline(false)
    await expect.poll(async () => (await request.get(`/api/groups/${id}`, { headers: auth })).status(), { timeout: 15000 }).toBe(200)
    const created = await (await request.get(`/api/groups/${id}`, { headers: auth })).json()
    expect(created.name).toBe('Gym Wifi League')
    // replays are idempotent: exactly one league with that name
    const list = await (await request.get('/api/groups', { headers: auth })).json()
    expect(list.groups.filter((g: { name: string }) => g.name === 'Gym Wifi League')).toHaveLength(1)
  })

  test('screens opened before keep showing their last data offline, without a blank loader', async ({ page, context }) => {
    await page.goto(`/groups/${LEAGUE}`)
    await expect(page.getByRole('heading', { name: 'Standings' })).toBeVisible()
    // client-side navigation keeps the loaded screens' code in memory
    await page.getByRole('link', { name: 'All leagues' }).click()
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Your leagues')
    await context.setOffline(true)
    await page.getByRole('link', { name: /Tuesday Ladder/ }).first().click()
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Tuesday Ladder')
    await expect(page.getByRole('heading', { name: 'Standings' })).toBeVisible()
    await expect(page.getByRole('status').filter({ hasText: /Loading/ })).toHaveCount(0)
  })
})
