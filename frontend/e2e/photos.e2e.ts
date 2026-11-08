import { test, expect } from '@playwright/test'
import { reset, as, LEAGUE } from './helpers'

// 2x2 red PNG
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAFklEQVR4nGP8z8DAwMDAxMDAwMDAAAANHQEDasKb6QAAAABJRU5ErkJggg==', 'base64')

test.describe('photos', () => {
  test('a member adds and removes their own photo; wrong types are refused', async ({ page, request }) => {
    await reset(request, 'default')
    await as(page, 'user_mem')
    await page.goto(`/groups/${LEAGUE}/players/gp_2`)
    const card = page.locator('.pcard__photo')
    await expect(card.locator('img')).toHaveCount(0)

    await page.getByTestId('photo-input').setInputFiles({ name: 'evil.svg', mimeType: 'image/svg+xml', buffer: Buffer.from('<svg onload="alert(1)"/>') })
    await expect(page.getByText('Use a JPEG, PNG or WebP image.')).toBeVisible()

    await page.getByTestId('photo-input').setInputFiles({ name: 'me.png', mimeType: 'image/png', buffer: PNG })
    await expect(card.locator('img')).toHaveAttribute('src', /^blob:/)
    await expect(page.getByRole('button', { name: 'Change photo' })).toBeVisible()

    await page.getByRole('button', { name: 'Remove photo' }).click()
    await page.getByRole('dialog').getByRole('button', { name: 'Remove photo' }).click()
    await expect(card.locator('img')).toHaveCount(0)
  })

  test("a member cannot change someone else's photo", async ({ page, request }) => {
    await reset(request, 'default')
    await as(page, 'user_mem')
    await page.goto(`/groups/${LEAGUE}/players/gp_1`)
    await expect(page.locator('.pcard')).toBeVisible()
    await expect(page.getByRole('button', { name: /Add photo|Change photo/ })).toHaveCount(0)
  })

  test('an organizer sets the league logo and it shows on the leagues list', async ({ page, request }) => {
    await reset(request, 'default')
    await as(page, 'user_org')
    await page.goto(`/groups/${LEAGUE}/settings`)
    await page.getByTestId('photo-input').setInputFiles({ name: 'logo.png', mimeType: 'image/png', buffer: PNG })
    await expect(page.getByRole('button', { name: 'Change logo' })).toBeVisible()
    await page.goto('/groups')
    await expect(page.locator('.crest__img').first()).toHaveAttribute('src', /^blob:/)
  })
})
