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

    // cancelling the crop uploads nothing
    await page.getByTestId('photo-input').setInputFiles({ name: 'me.png', mimeType: 'image/png', buffer: PNG })
    await page.getByRole('dialog').getByRole('button', { name: 'Cancel' }).click()
    await expect(page.getByRole('dialog')).toBeHidden()
    await expect(card.locator('img')).toHaveCount(0)

    await page.getByTestId('photo-input').setInputFiles({ name: 'me.png', mimeType: 'image/png', buffer: PNG })
    const crop = page.getByRole('dialog', { name: 'Position your photo' })
    const frame = crop.getByTestId('crop-frame')
    await expect(frame).toBeFocused()
    await crop.getByRole('slider', { name: 'Zoom' }).fill('2.5')
    await frame.press('ArrowRight')
    await frame.press('+')
    await expect(crop.getByRole('slider', { name: 'Zoom' })).toHaveValue('2.75')
    await crop.getByRole('button', { name: 'Use photo' }).click()
    await expect(card.locator('img')).toHaveAttribute('src', /^blob:/)
    // what was saved is the 512px cropped square as WebP, or JPEG where WebP can't be encoded; never the original PNG
    const saved = await card.locator('img').evaluate(async (img: HTMLImageElement) => {
      await img.decode()
      const head = new Uint8Array(await (await fetch(img.src)).arrayBuffer()).slice(0, 12)
      return { w: img.naturalWidth, h: img.naturalHeight, webp: String.fromCharCode(...head.slice(8, 12)) === 'WEBP', png: head[0] === 0x89 && head[1] === 0x50 }
    })
    expect(saved).toMatchObject({ w: 512, h: 512 })
    expect(saved.webp || saved.png).toBe(true)
    // one button on the page; Remove lives inside Edit
    await expect(page.getByRole('button', { name: 'Remove photo' })).toHaveCount(0)

    // the photo follows the player to league home and rankings
    await page.goto(`/groups/${LEAGUE}`)
    await expect(page.locator('img.avatar__img').first()).toHaveAttribute('src', /^blob:/)
    await page.goto(`/groups/${LEAGUE}/rankings`)
    await expect(page.locator('img.avatar__img').first()).toHaveAttribute('src', /^blob:/)

    await page.goto(`/groups/${LEAGUE}/players/gp_2`)
    await page.getByRole('button', { name: 'Edit photo' }).click()
    const edit = page.getByRole('dialog', { name: 'Position your photo' })
    await expect(edit.getByRole('button', { name: 'Choose another' })).toBeVisible()
    await edit.getByRole('button', { name: 'Remove photo' }).click()
    await page.getByRole('dialog').getByRole('button', { name: 'Remove photo' }).click()
    await expect(card.locator('img')).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Add photo' })).toBeVisible()
  })

  test("a member cannot change someone else's photo", async ({ page, request }) => {
    await reset(request, 'default')
    await as(page, 'user_mem')
    await page.goto(`/groups/${LEAGUE}/players/gp_1`)
    await expect(page.locator('.pcard')).toBeVisible()
    await expect(page.getByRole('button', { name: /Add photo|Edit photo/ })).toHaveCount(0)
  })

  test('an organizer sets the league logo and it shows on the leagues list', async ({ page, request }) => {
    await reset(request, 'default')
    await as(page, 'user_org')
    await page.goto(`/groups/${LEAGUE}/settings`)
    await page.getByTestId('photo-input').setInputFiles({ name: 'logo.png', mimeType: 'image/png', buffer: PNG })
    await page.getByRole('dialog', { name: 'Position the logo' }).getByRole('button', { name: 'Use logo' }).click()
    await expect(page.getByRole('button', { name: 'Edit logo' })).toBeVisible()
    await page.goto('/groups')
    await expect(page.locator('.crest__img').first()).toHaveAttribute('src', /^blob:/)
  })
})
