import { test, expect } from '@playwright/test'
import { reset, as, LEAGUE, noHorizontalOverflow } from './helpers'

test.describe('awards', () => {
  test('organizer creates awards, adds a category, opens voting; member votes', async ({ page, request, browser }) => {
    await reset(request, 'default')
    await as(page, 'user_org')
    await page.goto(`/groups/${LEAGUE}/awards`)
    await page.getByRole('button', { name: 'Create awards' }).click()
    await expect(page.getByRole('button', { name: 'Open voting' })).toBeDisabled()

    await page.getByRole('button', { name: /Add categor/ }).first().click()
    const sheet = page.getByRole('dialog')
    await sheet.getByRole('textbox').first().fill('Best sportsmanship')
    await sheet.getByRole('button', { name: /^Add/ }).last().click()
    await sheet.getByRole('button', { name: /Close|Done/ }).first().click()

    await page.getByRole('button', { name: 'Open voting' }).click()
    await page.getByRole('dialog').getByRole('button', { name: 'Open voting' }).click()
    await expect(page.getByRole('button', { name: 'Close voting and show results' })).toBeVisible()
    await noHorizontalOverflow(page)

    const ctx = await browser.newContext()
    const member = await ctx.newPage()
    await as(member, 'user_mem')
    await member.goto(`/groups/${LEAGUE}/awards`)
    await member.getByRole('button', { name: /Best sportsmanship/ }).click()
    const vote = member.getByRole('dialog')
    await vote.getByRole('button').filter({ hasText: /Ana Ruiz/ }).first().click()
    await expect(member.getByText(/1 of 1/)).toBeVisible()
    await ctx.close()
  })
})

test.describe('spond', () => {
  test('import attendees selects roster players and says who was left out', async ({ page, request }) => {
    await reset(request, 'default')
    await as(page, 'user_org')
    await page.goto(`/groups/${LEAGUE}/events/new`)
    await page.getByRole('button', { name: 'Import from Spond' }).click()
    const sheet = page.getByRole('dialog')
    // first run: link this league to a Spond group
    await expect(sheet.getByText('Which Spond group is this league?')).toBeVisible()
    await sheet.getByRole('radio', { name: /Tuesday Pickleball/ }).check({ force: true })
    await sheet.getByRole('button', { name: 'Link Spond group' }).click()
    await sheet.getByRole('button').filter({ hasText: 'Tuesday ladder night' }).first().click()
    await sheet.getByRole('button', { name: 'Select these players' }).click()
    await expect(page.getByRole('dialog')).toBeHidden()
    await expect(page.getByText(/matched/)).toBeVisible()
    await expect(page.getByText(/players selected/).first()).toBeVisible()
    await noHorizontalOverflow(page)
  })
})
