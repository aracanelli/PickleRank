/**
 * FIXTURE MODE ONLY. A stateful in-memory stand-in for the FastAPI backend, served by the
 * Vite dev server under `vite --mode e2e`. It is never part of a production build.
 *
 * It mirrors the real contracts the UI depends on: organizer-only event endpoints (403 for
 * members), per-game score PATCH with last-write-wins, generate wiping scores, completion
 * updating ratings and rankings. Rating math here is a simple Elo, not the product's.
 *
 * Test control:
 *   POST /__fake/reset   { scenario: 'default' | 'live' | 'big' | 'empty' | 'payments' }
 *   POST /__fake/config  { latencyMs?, scoreLatencyMs?, failScores?, failCompleteOnce? }
 *   GET  /__fake/log     -> recorded score PATCH bodies
 *
 * Photos and logos: PUT/GET/DELETE /api/groups/:id/players/:gp/photo and /api/groups/:id/logo.
 * Bytes are kept as uploaded (fixture only; the real API decodes and re-encodes them).
 */
import type { Plugin, Connect } from 'vite'
import type { ServerResponse } from 'node:http'
import { awardsRoutes } from './fake-awards'
import { spondRoutes } from './fake-spond'

type Membership = 'PERMANENT' | 'SUB'
type Role = 'ORGANIZER' | 'PLAYER'
export interface GP { ratingDelta?: number; id: string; playerId: string; displayName: string; membershipType: Membership; role: Role; userId?: string; rating: number; gamesPlayed: number; wins: number; losses: number; ties: number; skillLevel?: string; inviteToken?: string }
interface Game { id: string; roundIndex: number; courtIndex: number; t1: [string, string]; t2: [string, string]; s1?: number; s2?: number }
export interface Ev { id: string; groupId: string; name?: string; status: 'DRAFT' | 'GENERATED' | 'IN_PROGRESS' | 'COMPLETED'; startsAt: string; courts: number; rounds: number; participants: string[]; games: Game[]; seed: number }
export interface Group { id: string; ownerUserId: string; name: string; settings: Record<string, unknown>; createdAt: string; archived?: boolean }
interface Pay { id: string; gpId: string; amount: number; paymentType: 'ATTENDANCE' | 'PAYMENT' | 'ADJUSTMENT'; eventId?: string; notes?: string; createdAt: string }

export const ORGANIZER = 'user_org'
export const MEMBER = 'user_mem'

const LONG = 'Maximiliana Alexandrovna Konstantinopoulou-Smythe'
const NAMES = [
  'Ana Ruiz', 'Ben Cho', 'Cy Diaz', 'Dee Park', 'Eli Moss', 'Fay Gold', 'Gus Lee', 'Hana Ito',
  'Ivy Shaw', 'Jon Reyes', 'Kai Novak', 'Lu Chen', LONG, 'Nate Okafor', 'Ola Berg', 'Pia Russo'
]

let state: { groups: Group[]; gps: Map<string, GP[]>; events: Ev[]; pays: Pay[] }
let cfg = { latencyMs: 0, scoreLatencyMs: 0, failScores: 0, failCompleteOnce: false }
let scoreLog: unknown[] = []
const images = new Map<string, { mime: string; data: Buffer; v: number }>()
const version = (key: string) => images.get(key)?.v
let seq = 0
const uid = (p: string) => `${p}_${(++seq).toString(36)}`
const now = () => new Date().toISOString()
const daysAgo = (n: number) => new Date(Date.now() - n * 864e5).toISOString()

function settings(extra: Record<string, unknown> = {}) {
  return {
    ratingSystem: 'SERIOUS_ELO', initialRating: 1000, kFactor: 32, eloConst: 400, eloDiff: 0.05,
    noRepeatTeammateInEvent: true, noRepeatTeammateFromPreviousEvent: true, noRepeatOpponentInEvent: true,
    autoRelaxEloDiff: true, autoRelaxStep: 0.01, autoRelaxMaxEloDiff: 0.25, defaultRounds: 4,
    paymentSettings: { trackPayments: false, subFeePerAttendance: 5, currency: 'USD' },
    ...extra
  }
}

function makeRoster(n: number, subs: number): GP[] {
  const out: GP[] = []
  for (let i = 0; i < n + subs; i++) {
    const base = NAMES[i % NAMES.length]
    const name = i < NAMES.length ? base : `${base.split(' ')[0]} ${String.fromCharCode(65 + (i % 26))}${i}`
    out.push({
      id: `gp_${i + 1}`, playerId: `pl_${i + 1}`, displayName: name,
      membershipType: i < n ? 'PERMANENT' : 'SUB', role: 'PLAYER',
      rating: 1000 + ((i * 37) % 120) - 60, gamesPlayed: 0, wins: 0, losses: 0, ties: 0
    })
  }
  out[1].userId = MEMBER
  return out
}

function seedEvent(g: Group, roster: GP[], name: string, courts: number, rounds: number, scored: 'all' | 'partial' | 'none', days: number): Ev {
  const ev: Ev = {
    id: uid('ev'), groupId: g.id, name, status: 'DRAFT', startsAt: daysAgo(days), courts, rounds,
    participants: roster.filter(p => p.membershipType === 'PERMANENT').slice(0, courts * 4).map(p => p.id), games: [], seed: days
  }
  schedule(ev)
  ev.status = 'GENERATED'
  ev.games.forEach((gm, i) => {
    const doScore = scored === 'all' || (scored === 'partial' && (gm.roundIndex === 0 || (gm.roundIndex === 1 && gm.courtIndex === 0)))
    if (doScore) { gm.s1 = 11; gm.s2 = (i * 3) % 10 }
  })
  if (scored !== 'none') ev.status = 'IN_PROGRESS'
  return ev
}

export function reset(scenario = 'default') {
  seq = 0
  cfg = { latencyMs: 0, scoreLatencyMs: 0, failScores: 0, failCompleteOnce: false }
  scoreLog = []
  images.clear()
  const big = scenario === 'big'
  const g: Group = { id: 'grp_1', ownerUserId: ORGANIZER, name: 'Tuesday Ladder', settings: settings(scenario === 'payments' ? { paymentSettings: { trackPayments: true, subFeePerAttendance: 5, currency: 'USD' } } : {}), createdAt: daysAgo(90) }
  const g2: Group = { id: 'grp_2', ownerUserId: ORGANIZER, name: 'Saturday Open Play at Riverside Community Center', settings: settings(), createdAt: daysAgo(30) }
  const roster = makeRoster(big ? 44 : 12, big ? 6 : 4)
  state = { groups: scenario === 'empty' ? [] : [g, g2], gps: new Map([[g.id, roster], [g2.id, makeRoster(8, 0)]]), events: [], pays: [] }
  if (scenario === 'empty') return
  // two completed events build history and ratings
  for (const [name, days] of [['Week 4 ladder', 14], ['Week 5 ladder', 7]] as const) {
    const ev = seedEvent(g, roster, name, 3, 3, 'all', days)
    complete(ev)
  }
  if (scenario === 'live') state.events.push(seedEvent(g, roster, 'Week 6 ladder', 3, 4, 'partial', 0))
  if (scenario === 'payments') {
    for (const p of roster.filter(x => x.membershipType === 'SUB')) {
      state.pays.push({ id: uid('pay'), gpId: p.id, amount: -5, paymentType: 'ATTENDANCE', createdAt: daysAgo(7) })
    }
  }
}

function schedule(ev: Ev) {
  // deterministic rotation; good enough for fixtures, not the product's matchmaking
  const ids = [...ev.participants]
  ev.games = []
  for (let r = 0; r < ev.rounds; r++) {
    const rot = ids.map((_, i) => ids[(i * (2 * r + 1) + r + ev.seed) % ids.length])
    const uniq = Array.from(new Set(rot)).concat(ids.filter(x => !rot.includes(x))).slice(0, ids.length)
    for (let c = 0; c < ev.courts; c++) {
      const q = uniq.slice(c * 4, c * 4 + 4)
      ev.games.push({ id: uid('gm'), roundIndex: r, courtIndex: c, t1: [q[0], q[1]], t2: [q[2], q[3]] })
    }
  }
}

function roster(groupId: string) { return state.gps.get(groupId) ?? [] }
function gpById(id: string) {
  for (const list of state.gps.values()) { const f = list.find(p => p.id === id); if (f) return f }
  return undefined
}

function complete(ev: Ev) {
  const k = 32
  const before = new Map(ev.participants.map(id => [id, gpById(id)!.rating]))
  for (const gm of ev.games) {
    if (gm.s1 == null || gm.s2 == null) continue
    const a = gm.t1.map(id => gpById(id)!), b = gm.t2.map(id => gpById(id)!)
    const ra = (a[0].rating + a[1].rating) / 2, rb = (b[0].rating + b[1].rating) / 2
    const exp = 1 / (1 + 10 ** ((rb - ra) / 400))
    const act = gm.s1 > gm.s2 ? 1 : gm.s1 < gm.s2 ? 0 : 0.5
    const d = k * (act - exp)
    for (const p of a) { p.rating += d; p.gamesPlayed++; if (act === 1) p.wins++; else if (act === 0) p.losses++; else p.ties++ }
    for (const p of b) { p.rating -= d; p.gamesPlayed++; if (act === 0) p.wins++; else if (act === 1) p.losses++; else p.ties++ }
  }
  for (const [id, r0] of before) { const p = gpById(id)!; p.ratingDelta = p.rating - r0 }
  ev.status = 'COMPLETED'
  if (!state.events.includes(ev)) state.events.push(ev)
  const g = state.groups.find(x => x.id === ev.groupId)
  const ps = (g?.settings.paymentSettings as { trackPayments: boolean; subFeePerAttendance: number } | undefined)
  if (ps?.trackPayments) {
    for (const id of ev.participants) {
      const p = gpById(id)
      if (p?.membershipType === 'SUB') state.pays.push({ id: uid('pay'), gpId: id, amount: -ps.subFeePerAttendance, paymentType: 'ATTENDANCE', eventId: ev.id, createdAt: now() })
    }
  }
}

const result = (s1?: number, s2?: number) => (s1 == null || s2 == null ? 'UNSET' : s1 > s2 ? 'TEAM1_WIN' : s2 > s1 ? 'TEAM2_WIN' : 'TIE')
const info = (id: string) => ({ id, displayName: gpById(id)?.displayName ?? 'Unknown' })
const gameDto = (g: Game) => ({
  id: g.id, roundIndex: g.roundIndex, courtIndex: g.courtIndex,
  team1: g.t1.map(info), team2: g.t2.map(info), scoreTeam1: g.s1 ?? null, scoreTeam2: g.s2 ?? null, result: result(g.s1, g.s2)
})
const eventDto = (e: Ev) => ({
  id: e.id, groupId: e.groupId, name: e.name, status: e.status, startsAt: e.startsAt, courts: e.courts, rounds: e.rounds,
  participantCount: e.participants.length, games: e.games.map(gameDto)
})
const gpDto = (p: GP, groupId: string) => ({ ...p, groupId, winRate: p.gamesPlayed ? (p.wins + 0.5 * p.ties) / p.gamesPlayed : 0, photoVersion: version(`player:${p.playerId}`) })

function canSee(user: string, g: Group) { return g.ownerUserId === user || roster(g.id).some(p => p.userId === user) }
function isOrg(user: string, g: Group) { return g.ownerUserId === user || roster(g.id).some(p => p.userId === user && p.role === 'ORGANIZER') }

export class HttpError extends Error { constructor(public status: number, msg: string) { super(msg) } }
const deny = () => { throw new HttpError(403, 'Only league organizers can do that') }
const notFound = (what: string) => { throw new HttpError(404, `${what} not found`) }

function group(id: string, user: string) {
  const g = state.groups.find(x => x.id === id && !x.archived) ?? notFound('League')!
  if (!canSee(user, g)) deny()
  return g
}
function eventFor(id: string, user: string) {
  const e = state.events.find(x => x.id === id) ?? notFound('Event')!
  if (!isOrg(user, group(e.groupId, user))) deny()
  return e
}
function gameFor(id: string, user: string) {
  for (const e of state.events) {
    const g = e.games.find(x => x.id === id)
    if (g) { eventFor(e.id, user); return { e, g } }
  }
  return notFound('Game')!
}

function rankings(groupId: string) {
  return [...roster(groupId)].filter(p => p.gamesPlayed > 0).sort((a, b) => b.rating - a.rating).map((p, i) => ({
    rank: i + 1, playerId: p.playerId, displayName: p.displayName, membershipType: p.membershipType,
    rating: p.rating, gamesPlayed: p.gamesPlayed, wins: p.wins, losses: p.losses, ties: p.ties,
    winRate: p.gamesPlayed ? (p.wins + 0.5 * p.ties) / p.gamesPlayed : 0
  }))
}

function history(groupId: string, q: URLSearchParams) {
  const pid = q.get('playerId'), eid = q.get('eventId'), sid = q.get('secondaryPlayerId')
  const gp = pid ? roster(groupId).find(p => p.playerId === pid) : undefined
  const sp = sid ? roster(groupId).find(p => p.playerId === sid) : undefined
  const rel = q.get('relationship') === 'opponent' ? 'opponent' : 'teammate'
  const out = []
  for (const e of state.events.filter(x => x.groupId === groupId && x.status === 'COMPLETED').sort((a, b) => b.startsAt.localeCompare(a.startsAt))) {
    if (eid && e.id !== eid) continue
    const from = q.get('from'), to = q.get('to')
    if (from && e.startsAt < from) continue
    if (to && e.startsAt > to) continue
    for (const g of e.games) {
      if (pid && (!gp || ![...g.t1, ...g.t2].includes(gp.id))) continue
      if (sid) {
        if (!gp || !sp) continue
        const same = (g.t1.includes(gp.id) && g.t1.includes(sp.id)) || (g.t2.includes(gp.id) && g.t2.includes(sp.id))
        const opp = (g.t1.includes(gp.id) && g.t2.includes(sp.id)) || (g.t2.includes(gp.id) && g.t1.includes(sp.id))
        if (rel === 'teammate' ? !same : !opp) continue
      }
      out.push({
        gameId: g.id, eventId: e.id, eventName: e.name, date: e.startsAt, roundIndex: g.roundIndex, courtIndex: g.courtIndex,
        team1: g.t1.map(id => gpById(id)!.displayName), team2: g.t2.map(id => gpById(id)!.displayName),
        team1Ids: g.t1, team2Ids: g.t2, scoreTeam1: g.s1 ?? null, scoreTeam2: g.s2 ?? null, result: result(g.s1, g.s2)
      })
    }
  }
  const limit = Number(q.get('limit')) || 0
  return { matches: limit ? out.slice(0, limit) : out }
}

function balances(groupId: string) {
  const list = roster(groupId).filter(p => p.membershipType === 'SUB').map(p => {
    const mine = state.pays.filter(x => x.gpId === p.id)
    const charges = -mine.filter(x => x.paymentType === 'ATTENDANCE').reduce((s, x) => s + x.amount, 0)
    const paid = mine.filter(x => x.paymentType === 'PAYMENT').reduce((s, x) => s + x.amount, 0)
    const balance = mine.reduce((s, x) => s + x.amount, 0)
    return {
      groupPlayerId: p.id, playerId: p.playerId, displayName: p.displayName, membershipType: p.membershipType,
      totalAttendances: mine.filter(x => x.paymentType === 'ATTENDANCE').length, totalCharges: charges, totalPayments: paid, balance,
      lastPaymentDate: mine.filter(x => x.paymentType === 'PAYMENT').at(-1)?.createdAt
    }
  })
  return { balances: list, totalOwed: -list.filter(b => b.balance < 0).reduce((s, b) => s + b.balance, 0) }
}

export type Body = Record<string, any>
async function route(method: string, path: string, q: URLSearchParams, body: Body, user: string): Promise<unknown> {
  let m: RegExpMatchArray | null
  const is = (re: RegExp, verb: string) => method === verb && (m = path.match(re)) !== null

  if (is(/^\/api\/groups$/, 'GET')) return { groups: state.groups.filter(g => !g.archived && g.ownerUserId === user).map(g => ({ id: g.id, name: g.name, sport: 'pickleball', playerCount: roster(g.id).length, createdAt: g.createdAt, logoVersion: version(`group:${g.id}`) })) }
  if (is(/^\/api\/groups\/member$/, 'GET')) return { groups: state.groups.filter(g => !g.archived && g.ownerUserId !== user && canSee(user, g)).map(g => ({ id: g.id, name: g.name, sport: 'pickleball', playerCount: roster(g.id).length, createdAt: g.createdAt, logoVersion: version(`group:${g.id}`) })) }
  if (is(/^\/api\/groups$/, 'POST')) {
    if (!String(body.name ?? '').trim()) throw new HttpError(422, 'Name is required')
    const g: Group = { id: uid('grp'), ownerUserId: user, name: String(body.name).trim(), settings: settings(body.settings ?? {}), createdAt: now() }
    state.groups.push(g); state.gps.set(g.id, [])
    return { ...g, sport: 'pickleball' }
  }
  if (is(/^\/api\/groups\/([\w-]+)$/, 'GET')) { const g = group(m![1], user); return { ...g, sport: 'pickleball', logoVersion: version(`group:${g.id}`) } }
  if (is(/^\/api\/groups\/([\w-]+)$/, 'PATCH')) { const g = group(m![1], user); if (!isOrg(user, g)) deny(); g.name = body.name; return { ...g, sport: 'pickleball' } }
  if (is(/^\/api\/groups\/([\w-]+)\/settings$/, 'PATCH')) { const g = group(m![1], user); if (!isOrg(user, g)) deny(); g.settings = { ...g.settings, ...body }; return { ...g, sport: 'pickleball' } }
  if (is(/^\/api\/groups\/([\w-]+)\/archive$/, 'POST')) { const g = group(m![1], user); if (g.ownerUserId !== user) deny(); g.archived = true; return { success: true } }
  if (is(/^\/api\/groups\/([\w-]+)\/duplicate$/, 'POST')) { const g = group(m![1], user); const c = { ...g, id: uid('grp'), name: body.name || `${g.name} copy`, createdAt: now() }; state.groups.push(c); state.gps.set(c.id, roster(g.id).map(p => ({ ...p, id: uid('gp'), rating: 1000, gamesPlayed: 0, wins: 0, losses: 0, ties: 0 }))); return { ...c, sport: 'pickleball' } }
  if (is(/^\/api\/groups\/([\w-]+)\/recalculate-ratings$/, 'POST')) { const g = group(m![1], user); if (!isOrg(user, g)) deny(); return { success: true, eventsProcessed: state.events.filter(e => e.groupId === g.id && e.status === 'COMPLETED').length, playersUpdated: roster(g.id).length } }

  if (is(/^\/api\/groups\/([\w-]+)\/players$/, 'GET')) { const g = group(m![1], user); return { players: roster(g.id).map(p => gpDto(p, g.id)) } }
  if (is(/^\/api\/groups\/([\w-]+)\/players$/, 'POST')) {
    const g = group(m![1], user); if (!isOrg(user, g)) deny()
    const pl = globalPlayers().find(p => p.id === body.playerId) ?? notFound('Player')!
    const gp: GP = { id: uid('gp'), playerId: pl.id, displayName: pl.displayName, membershipType: body.membershipType ?? 'PERMANENT', role: 'PLAYER', rating: 1000, gamesPlayed: 0, wins: 0, losses: 0, ties: 0, skillLevel: body.skillLevel }
    roster(g.id).push(gp); return gpDto(gp, g.id)
  }
  if (is(/^\/api\/groups\/([\w-]+)\/players\/bulk$/, 'POST')) {
    const g = group(m![1], user); if (!isOrg(user, g)) deny()
    const added = []
    for (const item of body.players ?? []) {
      const pl = globalPlayers().find(p => p.id === item.playerId); if (!pl) continue
      const gp: GP = { id: uid('gp'), playerId: pl.id, displayName: pl.displayName, membershipType: item.membershipType ?? 'PERMANENT', role: 'PLAYER', rating: 1000, gamesPlayed: 0, wins: 0, losses: 0, ties: 0 }
      roster(g.id).push(gp); added.push(gpDto(gp, g.id))
    }
    return { added, skipped: [] }
  }
  if (is(/^\/api\/groups\/([\w-]+)\/players\/([\w-]+)\/stats$/, 'GET')) {
    const g = group(m![1], user); const p = roster(g.id).find(x => x.id === m![2]) ?? notFound('Player')!
    return { player: gpDto(p, g.id), history: [{ rating: 1000, createdAt: daysAgo(14), delta: 0 }, { rating: p.rating, createdAt: daysAgo(7), delta: p.rating - 1000, eventName: 'Week 5 ladder' }], advanced: { highestRating: Math.max(1000, p.rating), lowestRating: Math.min(1000, p.rating), longestWinStreak: 2, longestLossStreak: 1, currentWinStreak: 1, currentLossStreak: 0, bestTeammates: [], worstTeammates: [] } }
  }
  if (is(/^\/api\/groups\/([\w-]+)\/players\/([\w-]+)$/, 'PATCH')) { const g = group(m![1], user); if (!isOrg(user, g)) deny(); const p = roster(g.id).find(x => x.id === m![2]) ?? notFound('Player')!; Object.assign(p, body); return gpDto(p, g.id) }
  if (is(/^\/api\/groups\/([\w-]+)\/players\/([\w-]+)$/, 'DELETE')) { const g = group(m![1], user); if (!isOrg(user, g)) deny(); state.gps.set(g.id, roster(g.id).filter(x => x.id !== m![2])); return null }

  if (is(/^\/api\/groups\/([\w-]+)\/events$/, 'GET')) {
    const g = group(m![1], user); if (!isOrg(user, g)) deny()
    return { events: state.events.filter(e => e.groupId === g.id).sort((a, b) => b.startsAt.localeCompare(a.startsAt)).map(e => ({ id: e.id, name: e.name, status: e.status, startsAt: e.startsAt, courts: e.courts, rounds: e.rounds })) }
  }
  if (is(/^\/api\/groups\/([\w-]+)\/events$/, 'POST')) {
    const g = group(m![1], user); if (!isOrg(user, g)) deny()
    if ((body.participantIds ?? []).length !== body.courts * 4) throw new HttpError(400, `Exactly ${body.courts * 4} players are needed for ${body.courts} courts`)
    const e: Ev = { id: uid('ev'), groupId: g.id, name: body.name, status: 'DRAFT', startsAt: body.startsAt ?? now(), courts: body.courts, rounds: body.rounds, participants: body.participantIds, games: [], seed: 0 }
    state.events.push(e); return eventDto(e)
  }
  if (is(/^\/api\/events\/([\w-]+)$/, 'GET')) return eventDto(eventFor(m![1], user))
  if (is(/^\/api\/events\/([\w-]+)$/, 'PATCH')) { const e = eventFor(m![1], user); e.name = body.name; return eventDto(e) }
  if (is(/^\/api\/events\/([\w-]+)$/, 'DELETE')) { const e = eventFor(m![1], user); if (e.status === 'COMPLETED') throw new HttpError(400, 'Completed events cannot be deleted'); state.events = state.events.filter(x => x !== e); return null }
  if (is(/^\/api\/events\/([\w-]+)\/generate$/, 'POST')) {
    const e = eventFor(m![1], user); if (e.status === 'COMPLETED') throw new HttpError(400, 'Event is already completed')
    if (e.name === 'Impossible') throw new HttpError(400, 'No schedule satisfies the pairing rules even at the widest rating gap. Turn off a pairing rule or add players.')
    e.seed = body.newSeed ? e.seed + 7 : e.seed
    schedule(e); e.status = 'GENERATED'
    return { status: e.status, generationMeta: { seedUsed: String(e.seed), eloDiffConfigured: 0.05, eloDiffUsed: 0.05, relaxIterations: 0, attempts: 1, durationMs: 4, constraintToggles: {} }, games: e.games.map(gameDto) }
  }
  if (is(/^\/api\/events\/([\w-]+)\/complete$/, 'POST')) {
    const e = eventFor(m![1], user)
    if (cfg.failCompleteOnce) { cfg.failCompleteOnce = false; throw new HttpError(500, 'Server error while completing') }
    if (e.status === 'COMPLETED' || e.status === 'DRAFT') throw new HttpError(400, 'Event cannot be completed')
    const before = new Map(e.participants.map(id => [id, gpById(id)!.rating]))
    complete(e)
    return {
      status: e.status,
      ratingUpdates: e.participants.map(id => {
        const p = gpById(id)!
        const b = before.get(id)!
        return { playerId: p.id, displayName: p.displayName, ratingBefore: b, ratingAfter: p.rating, delta: p.rating - b }
      })
    }
  }
  if (is(/^\/api\/events\/([\w-]+)\/swap$/, 'POST')) {
    const e = eventFor(m![1], user); if (e.status === 'COMPLETED') throw new HttpError(400, 'Event is already completed')
    const games = e.games.filter(g => g.roundIndex === body.roundIndex)
    const a = String(body.player1Id), b = String(body.player2Id)
    const swapIn = (t: [string, string]) => t.map(id => (id === a ? b : id === b ? a : id)) as [string, string]
    for (const g of games) { g.t1 = swapIn(g.t1); g.t2 = swapIn(g.t2) }
    if (e.status === 'GENERATED') e.status = 'IN_PROGRESS'
    return { success: true, warnings: [] }
  }
  if (is(/^\/api\/events\/([\w-]+)\/rating-history$/, 'GET')) {
    // real shape: { [groupPlayerId]: [{ round, rating, delta?, type, label }] }
    const e = eventFor(m![1], user)
    const out: Record<string, unknown[]> = {}
    for (const id of e.participants) {
      const p = gpById(id)!
      const start = p.rating - (p.ratingDelta ?? 0)
      out[id] = [{ round: 0, rating: start, type: 'start', label: 'Start' }, { round: e.rounds, rating: p.rating, delta: p.ratingDelta ?? 0, type: 'round', label: `Round ${e.rounds}` }]
    }
    return out
  }
  if (is(/^\/api\/games\/([\w-]+)\/score$/, 'PATCH')) {
    if (cfg.scoreLatencyMs) await new Promise(r => setTimeout(r, cfg.scoreLatencyMs))
    const { e, g } = gameFor(m![1], user)
    scoreLog.push({ gameId: g.id, ...body, at: Date.now() })
    if (cfg.failScores > 0) { cfg.failScores--; throw new HttpError(503, 'Score service unavailable') }
    if ((body.scoreTeam1 != null && body.scoreTeam1 < 0) || (body.scoreTeam2 != null && body.scoreTeam2 < 0)) throw new HttpError(422, 'Scores must be 0 or more')
    g.s1 = body.scoreTeam1 ?? undefined; g.s2 = body.scoreTeam2 ?? undefined
    if (e.status === 'GENERATED') e.status = 'IN_PROGRESS'
    return gameDto(g)
  }
  if (is(/^\/api\/games\/([\w-]+)$/, 'DELETE')) { const { e, g } = gameFor(m![1], user); e.games = e.games.filter(x => x !== g); return null }
  if (is(/^\/api\/games\/([\w-]+)\/players$/, 'PATCH')) { const { g } = gameFor(m![1], user); g.t1 = [body.team1P1, body.team1P2]; g.t2 = [body.team2P1, body.team2P2]; return gameDto(g) }

  if (is(/^\/api\/groups\/([\w-]+)\/rankings$/, 'GET')) { const g = group(m![1], user); return { rankings: rankings(g.id) } }
  if (is(/^\/api\/groups\/([\w-]+)\/history$/, 'GET')) { const g = group(m![1], user); return history(g.id, q) }

  if (is(/^\/api\/groups\/([\w-]+)\/payments\/balances$/, 'GET')) { const g = paymentsGroup(m![1], user); return balances(g.id) }
  if (is(/^\/api\/groups\/([\w-]+)\/payments\/([\w-]+)\/history$/, 'GET')) {
    const g = paymentsGroup(m![1], user); const p = roster(g.id).find(x => x.id === m![2]) ?? notFound('Player')!
    const h = state.pays.filter(x => x.gpId === p.id)
    return { groupPlayerId: p.id, displayName: p.displayName, history: h.map(x => ({ ...x, eventName: state.events.find(e => e.id === x.eventId)?.name })), currentBalance: h.reduce((s, x) => s + x.amount, 0) }
  }
  if (is(/^\/api\/groups\/([\w-]+)\/payments$/, 'POST')) { paymentsGroup(m![1], user); return pay(body.groupPlayerId, Number(body.amount), 'PAYMENT', body.notes) }
  if (is(/^\/api\/groups\/([\w-]+)\/payments\/adjustment$/, 'POST')) { paymentsGroup(m![1], user); return pay(body.groupPlayerId, Number(body.amount), 'ADJUSTMENT', body.notes) }
  if (is(/^\/api\/groups\/([\w-]+)\/payments\/([\w-]+)\/mark-paid$/, 'POST')) {
    paymentsGroup(m![1], user); const bal = state.pays.filter(x => x.gpId === m![2]).reduce((s, x) => s + x.amount, 0)
    if (bal >= 0) throw new HttpError(400, 'Nothing is owed')
    return pay(m![2], -bal, 'PAYMENT', 'Marked paid')
  }
  if (is(/^\/api\/groups\/([\w-]+)\/payments\/backfill$/, 'POST')) { paymentsGroup(m![1], user); return { chargesCreated: 0, eventsProcessed: 0 } }

  if (is(/^\/api\/players$/, 'GET')) { const s = (q.get('search') ?? '').toLowerCase(); return { players: globalPlayers().filter(p => p.displayName.toLowerCase().includes(s)) } }
  if (is(/^\/api\/players$/, 'POST')) { const p = { id: uid('pl'), displayName: String(body.displayName).trim(), createdAt: now() }; extraPlayers.push(p); return p }
  if (is(/^\/api\/players\/bulk$/, 'POST')) { const created = (body.names ?? []).map((n: string) => { const p = { id: uid('pl'), displayName: n.trim(), createdAt: now() }; extraPlayers.push(p); return p }); return { created, skipped: [], errors: [] } }
  if (is(/^\/api\/players\/link$/, 'POST')) {
    const token = q.get('token')
    for (const list of state.gps.values()) for (const p of list) if (p.inviteToken && p.inviteToken === token) { p.userId = user; p.inviteToken = undefined; return { id: p.playerId, displayName: p.displayName, userId: user, createdAt: now() } }
    throw new HttpError(400, 'This invite link is invalid or was already used')
  }
  if (is(/^\/api\/players\/([\w-]+)\/invite$/, 'POST')) {
    const token = uid('tok')
    for (const list of state.gps.values()) for (const p of list) if (p.playerId === m![1]) p.inviteToken = token
    return token
  }
  if (is(/^\/api\/players\/([\w-]+)\/unlink$/, 'POST')) { for (const list of state.gps.values()) for (const p of list) if (p.playerId === m![1]) p.userId = undefined; return { id: m![1], displayName: 'x', createdAt: now() } }
  if (is(/^\/api\/players\/([\w-]+)$/, 'GET')) return globalPlayers().find(p => p.id === m![1]) ?? notFound('Player')
  if (is(/^\/api\/players\/([\w-]+)$/, 'PATCH')) {
    const found = globalPlayers().find(p => p.id === m![1]) ?? notFound('Player')!
    if (body.displayName != null && !String(body.displayName).trim()) throw new HttpError(422, 'Name is required')
    for (const list of state.gps.values()) for (const p of list) if (p.playerId === m![1] && body.displayName) p.displayName = String(body.displayName).trim()
    const extra = extraPlayers.find(p => p.id === m![1]); if (extra && body.displayName) extra.displayName = String(body.displayName).trim()
    notes.set(m![1], body.notes ?? notes.get(m![1]))
    return { ...found, displayName: body.displayName?.trim() || found.displayName, notes: notes.get(m![1]) }
  }

  // feature fixtures live in their own files (fake-awards.ts, fake-spond.ts)
  for (const ext of [awardsRoutes, spondRoutes]) {
    const out = await ext({ method, path, q, body, user, ctx: fixtureContext })
    if (out !== undefined) return out
  }
  throw new HttpError(404, `No fake route for ${method} ${path}`)
}

/** What feature fixture files may use. */
export interface FixtureContext {
  group: (id: string, user: string) => Group
  isOrg: (user: string, g: Group) => boolean
  roster: (groupId: string) => GP[]
  events: () => Ev[]
  gpById: (id: string) => GP | undefined
  HttpError: typeof HttpError
  uid: (prefix: string) => string
}
export type FeatureRoutes = (req: { method: string; path: string; q: URLSearchParams; body: Body; user: string; ctx: FixtureContext }) => unknown | Promise<unknown>
const fixtureContext: FixtureContext = { group, isOrg, roster, events: () => state.events, gpById, HttpError, uid }

const extraPlayers: Array<{ id: string; displayName: string; createdAt: string }> = []
const notes = new Map<string, string | undefined>()
function globalPlayers() {
  const seen = new Map<string, { id: string; displayName: string; userId?: string; createdAt: string }>()
  for (const list of state.gps.values()) for (const p of list) if (!seen.has(p.playerId)) seen.set(p.playerId, { id: p.playerId, displayName: p.displayName, userId: p.userId, createdAt: daysAgo(30) })
  for (const p of extraPlayers) seen.set(p.id, p)
  return [...seen.values()].map(p => ({ ...p, notes: notes.get(p.id) }))
}
function paymentsGroup(id: string, user: string) {
  const g = group(id, user); if (!isOrg(user, g)) deny()
  if (!(g.settings.paymentSettings as { trackPayments?: boolean })?.trackPayments) throw new HttpError(400, 'Payment tracking is off for this league')
  return g
}
function pay(gpId: string, amount: number, type: Pay['paymentType'], notes?: string) {
  if (type === 'PAYMENT' && !(amount > 0)) throw new HttpError(422, 'Amount must be more than 0')
  const p: Pay = { id: uid('pay'), gpId, amount, paymentType: type, notes, createdAt: now() }
  state.pays.push(p)
  return { id: p.id, amount, paymentType: type, newBalance: state.pays.filter(x => x.gpId === gpId).reduce((s, x) => s + x.amount, 0), createdAt: p.createdAt }
}

function send(res: ServerResponse, status: number, data: unknown) {
  res.statusCode = status
  if (data === null && status === 204) return res.end()
  res.setHeader('Content-Type', 'application/json')
  res.end(JSON.stringify(data))
}

function readBody(req: Connect.IncomingMessage): Promise<Body> {
  return new Promise(resolve => {
    let raw = ''
    req.on('data', c => { raw += c })
    req.on('end', () => { try { resolve(raw ? JSON.parse(raw) : {}) } catch { resolve({}) } })
  })
}

const MAGIC: Array<[string, (b: Buffer) => boolean]> = [
  ['image/jpeg', b => b[0] === 0xff && b[1] === 0xd8],
  ['image/png', b => b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))],
  ['image/webp', b => b.subarray(0, 4).toString() === 'RIFF' && b.subarray(8, 12).toString() === 'WEBP']
]
async function imageRoute(req: Connect.IncomingMessage, res: ServerResponse, groupId: string, gpId: string | undefined, user: string) {
  const g = group(groupId, user)
  if (gpId && !roster(g.id).some(p => p.id === gpId)) notFound('Player')
  // like the API: one photo per player (global id), shown in every league they play in
  const key = gpId ? `player:${roster(g.id).find(p => p.id === gpId)!.playerId}` : `group:${g.id}`
  if (req.method === 'GET') {
    const found = images.get(key) ?? notFound('Image')!
    res.statusCode = 200
    res.setHeader('Content-Type', found.mime)
    res.setHeader('X-Content-Type-Options', 'nosniff')
    return res.end(found.data)
  }
  const mine = gpId ? roster(g.id).find(p => p.id === gpId)?.userId === user : false
  if (!mine && !isOrg(user, g)) deny()
  if (req.method === 'DELETE') { images.delete(key); return send(res, 204, null) }
  if (req.method !== 'PUT') throw new HttpError(405, 'Method not allowed')
  const chunks: Buffer[] = []
  let size = 0
  for await (const c of req) { size += (c as Buffer).length; if (size > 2 * 1024 * 1024) throw new HttpError(413, 'Image is too big. The limit is 2 MB.'); chunks.push(c as Buffer) }
  const data = Buffer.concat(chunks)
  const mime = MAGIC.find(([, ok]) => ok(data))?.[0] ?? (() => { throw new HttpError(415, 'Use a JPEG, PNG or WebP image.') })()
  const v = Date.now()
  images.set(key, { mime, data, v })
  return send(res, 200, gpId ? { photoVersion: v } : { logoVersion: v })
}

export function fakeApiPlugin(): Plugin {
  reset('default')
  return {
    name: 'picklerank-fake-api',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const url = new URL(req.url ?? '/', 'http://x')
        if (url.pathname.startsWith('/__fake/')) {
          const body = await readBody(req)
          if (url.pathname === '/__fake/reset') { reset(body.scenario); return send(res, 200, { ok: true }) }
          if (url.pathname === '/__fake/config') { cfg = { ...cfg, ...body }; return send(res, 200, cfg) }
          if (url.pathname === '/__fake/log') return send(res, 200, scoreLog)
          return send(res, 404, {})
        }
        if (!url.pathname.startsWith('/api/')) return next()
        const auth = String(req.headers.authorization ?? '')
        const user = auth.startsWith('Bearer e2e-') ? auth.slice('Bearer e2e-'.length) : ''
        if (!user) return send(res, 401, { detail: 'Not signed in' })
        const img = url.pathname.match(/^\/api\/groups\/([\w-]+)\/(?:players\/([\w-]+)\/photo|logo)$/)
        if (img) {
          try { return await imageRoute(req, res, img[1], img[2], user) } catch (e) { const err = e as HttpError; return send(res, err.status ?? 500, { detail: err.message }) }
        }
        const body = await readBody(req)
        if (cfg.latencyMs) await new Promise(r => setTimeout(r, cfg.latencyMs))
        try {
          const data = await route(req.method ?? 'GET', url.pathname, url.searchParams, body, user)
          send(res, data === null ? 204 : 200, data)
        } catch (e) {
          const err = e as HttpError
          send(res, err.status ?? 500, { detail: err.message })
        }
      })
    }
  }
}
