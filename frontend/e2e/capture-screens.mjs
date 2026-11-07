// Release screenshots: fixture data, 375x812 @2x, light and dark. Run with the fixture server up:
//   node e2e/capture-screens.mjs
import { chromium } from '@playwright/test'
import { mkdirSync } from 'node:fs'

const base = 'http://localhost:5199'
const out = new URL('../../docs/release/screenshots/', import.meta.url)
const shots = [
  { file: '01-league-home-organizer', scenario: 'live', user: 'user_org', path: '/groups/grp_1' },
  { file: '02-new-event', scenario: 'default', user: 'user_org', path: '/groups/grp_1/events/new' },
  { file: '03-round-board', scenario: 'live', user: 'user_org', path: '/groups/grp_1', act: async p => { await p.getByRole('link', { name: /Resume scoring/ }).click(); await p.getByRole('heading', { name: /Round 2/ }).waitFor() } },
  { file: '04-court-sheet', scenario: 'live', user: 'user_org', path: '/groups/grp_1', act: async p => { await p.getByRole('link', { name: /Resume scoring/ }).click(); await p.locator('button[data-court="2"]').click(); await p.locator('input.score-in').nth(0).fill('11'); await p.locator('input.score-in').nth(1).fill('7') } },
  { file: '05-saved-and-failed', scenario: 'live', user: 'user_org', path: '/groups/grp_1', act: async p => {
    await p.getByRole('link', { name: /Resume scoring/ }).click()
    for (const [court, a, b] of [[2, 11, 7], [3, 9, 11]]) {
      if (court === 3) await p.request.post(`${base}/__fake/config`, { data: { failScores: 1 } })
      await p.locator(`button[data-court="${court}"]`).click()
      await p.locator('input.score-in').nth(0).fill(String(a)); await p.locator('input.score-in').nth(1).fill(String(b))
      await p.getByRole('dialog').getByRole('button', { name: new RegExp(`Save court ${court}`) }).click()
    }
    await p.getByText('Not saved. Tap to retry').waitFor(); await p.waitForTimeout(1400)
  } },
  { file: '06-league-home-player', scenario: 'default', user: 'user_mem', path: '/groups/grp_1' },
  { file: '07-rankings', scenario: 'default', user: 'user_org', path: '/groups/grp_1/rankings' },
  { file: '08-history', scenario: 'default', user: 'user_org', path: '/groups/grp_1/history' },
  { file: '09-player-profile', scenario: 'default', user: 'user_mem', path: '/groups/grp_1/players/gp_2' },
  { file: '10-roster-50', scenario: 'big', user: 'user_org', path: '/groups/grp_1/players/manage' },
  { file: '11-settings', scenario: 'default', user: 'user_org', path: '/groups/grp_1/settings' },
  { file: '12-payments', scenario: 'payments', user: 'user_org', path: '/groups/grp_1/payments' },
  { file: '13-leagues', scenario: 'default', user: 'user_org', path: '/groups' },
  { file: '14-landing', scenario: 'default', user: 'signed-out', path: '/' },
  { file: '15-saving', scenario: 'live', user: 'user_org', path: '/groups/grp_1', act: async p => {
    await p.getByRole('link', { name: /Resume scoring/ }).click()
    await p.request.post(`${base}/__fake/config`, { data: { scoreLatencyMs: 8000 } })
    await p.locator('button[data-court="2"]').click()
    await p.locator('input.score-in').nth(0).fill('11'); await p.locator('input.score-in').nth(1).fill('4')
    await p.getByRole('dialog').getByRole('button', { name: 'Save court 2' }).click()
    await p.getByText('Saving…').first().waitFor()
  } },
  { file: '16-replace-saved-score', scenario: 'live', user: 'user_org', path: '/groups/grp_1', act: async p => {
    await p.getByRole('link', { name: /Resume scoring/ }).click(); await p.locator('button[data-court="1"]').click(); await p.getByText(/Saved score was/).waitFor()
  } },
  { file: '17-round-done', scenario: 'live', user: 'user_org', path: '/groups/grp_1', act: async p => {
    await p.getByRole('link', { name: /Resume scoring/ }).click()
    for (const c of [2, 3]) {
      await p.locator(`button[data-court="${c}"]`).click()
      await p.locator('input.score-in').nth(0).fill('11'); await p.locator('input.score-in').nth(1).fill(String(c))
      await p.getByRole('dialog').getByRole('button', { name: `Save court ${c}` }).click()
      await p.locator(`button[data-court="${c}"]`).getByText('Saved').waitFor()
    }
    await p.getByRole('button', { name: 'Go to round 3' }).waitFor(); await p.waitForTimeout(1400)
  } },
  { file: '18-member-opens-event', scenario: 'live', user: 'user_mem', path: '/events/ev_l' },
  { file: '19-not-found', scenario: 'default', user: 'user_org', path: '/nope' }
]
const narrow = ['01-league-home-organizer', '03-round-board', '04-court-sheet', '02-new-event', '07-rankings', '10-roster-50']

const browser = await chromium.launch()
const runs = [
  { dir: 'light', scheme: 'light', width: 375, height: 812, only: null },
  { dir: 'dark', scheme: 'dark', width: 375, height: 812, only: null },
  { dir: 'light-320', scheme: 'light', width: 320, height: 568, only: narrow }
]
for (const run of runs) {
  const scheme = run.scheme
  mkdirSync(new URL(`${run.dir}/`, out), { recursive: true })
  for (const s of shots.filter(x => !run.only || run.only.includes(x.file))) {
    const ctx = await browser.newContext({ viewport: { width: run.width, height: run.height }, deviceScaleFactor: 2, colorScheme: scheme, isMobile: true, hasTouch: true })
    await ctx.addInitScript(u => localStorage.setItem('e2e:user', u), s.user)
    const page = await ctx.newPage()
    await page.request.post(`${base}/__fake/reset`, { data: { scenario: s.scenario } })
    await page.goto(base + s.path)
    await page.getByRole('heading', { level: 1 }).first().waitFor()
    await page.waitForLoadState('networkidle')
    if (s.act) await s.act(page)
    await page.waitForTimeout(300)
    await page.screenshot({ path: new URL(`${run.dir}/${s.file}.png`, out).pathname.replace(/^\/([A-Z]:)/, '$1') })
    await ctx.close()
  }
}
await browser.close()
console.log('done')
