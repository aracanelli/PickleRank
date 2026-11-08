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
    // voting works before publish, but season awards stay hidden
    await expect(member.getByText('Season awards show here once the organizer publishes them.')).toBeVisible()
    await ctx.close()
  })

  test('members see awards only after publish; organizer can unpublish and start over', async ({ page, request, browser }) => {
    await reset(request, 'default')
    await as(page, 'user_org')
    await page.goto(`/groups/${LEAGUE}/awards`)
    await page.getByRole('button', { name: 'Create awards' }).click()
    await expect(page.getByText('Only organizers can see these.')).toBeVisible()

    const ctx = await browser.newContext()
    const member = await ctx.newPage()
    await as(member, 'user_mem')
    await member.goto(`/groups/${LEAGUE}/awards`)
    await expect(member.getByText('No awards yet')).toBeVisible()

    // publish with zero categories while still in draft
    await page.getByRole('button', { name: 'Publish awards' }).click()
    await expect(page.getByText('Members can see these awards.')).toBeVisible()
    await noHorizontalOverflow(page)

    await member.reload()
    await expect(member.getByRole('heading', { name: 'Season awards' })).toBeVisible()
    await expect(member.getByText('No awards yet')).toBeHidden()
    await expect(member.getByRole('button', { name: 'Publish awards' })).toBeHidden()

    await page.getByRole('button', { name: 'Unpublish' }).click()
    await page.getByRole('dialog').getByRole('button', { name: 'Unpublish' }).click()
    await expect(page.getByText('Only organizers can see these.')).toBeVisible()
    await member.reload()
    await expect(member.getByText('No awards yet')).toBeVisible()
    await ctx.close()

    await page.getByRole('button', { name: 'Delete awards' }).click()
    await page.getByRole('dialog').getByRole('button', { name: 'Delete awards' }).click()
    await expect(page.getByRole('button', { name: 'Create awards' })).toBeVisible()
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
