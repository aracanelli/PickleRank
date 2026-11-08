import type { Body, FeatureRoutes, FixtureContext } from './fake-api'

/**
 * FIXTURE MODE ONLY: fake Awards endpoints mirroring backend/app/api/routers/awards.py and
 * award_service.py: organizer-only management (403), member-only reads, status transitions
 * DRAFT->VOTING_OPEN->CLOSED->VOTING_OPEN, at least one category to open voting, votes only while
 * open and only from a linked player, tallies only when CLOSED, publish/unpublish (members see an
 * unpublished edition only while voting is open, without stat awards). Return undefined for other paths.
 */
type Status = 'DRAFT' | 'VOTING_OPEN' | 'CLOSED'
interface Cat { id: string; title: string; description?: string; votes: Map<string, string> }
interface Edition { id: string; groupId: string; title: string; status: Status; statAwards: unknown[]; cats: Cat[]; publishedAt?: string; createdAt: string }

const NEXT: Record<Status, Status[]> = { DRAFT: ['VOTING_OPEN'], VOTING_OPEN: ['CLOSED'], CLOSED: ['VOTING_OPEN'] }

let editions: Edition[] = []
let seenEvents: unknown = null

// fake-api reset() replaces the events array, so a new identity means "start over".
function sync(ctx: FixtureContext) {
  const ev = ctx.events()
  if (ev !== seenEvents) { seenEvents = ev; editions = [] }
}

const voterId = (ctx: FixtureContext, groupId: string, user: string) => ctx.roster(groupId).find(p => p.userId === user)?.id

function dto(ctx: FixtureContext, e: Edition, user: string) {
  const me = voterId(ctx, e.groupId, user)
  const closed = e.status === 'CLOSED'
  return {
    id: e.id, title: e.title, status: e.status, statAwards: e.statAwards, createdAt: e.createdAt,
    ...(e.publishedAt ? { publishedAt: e.publishedAt } : {}),
    canVote: e.status === 'VOTING_OPEN' && !!me,
    categories: e.cats.map(c => {
      const out: Record<string, unknown> = { id: c.id, title: c.title }
      if (c.description) out.description = c.description
      const mine = me ? c.votes.get(me) : undefined
      if (mine) out.myVote = mine
      if (closed) {
        const tally = new Map<string, number>()
        for (const n of c.votes.values()) tally.set(n, (tally.get(n) ?? 0) + 1)
        const results = [...tally].map(([id, votes]) => ({ nomineeGroupPlayerId: id, displayName: ctx.gpById(id)?.displayName ?? 'Unknown', votes }))
          .sort((a, b) => b.votes - a.votes || a.displayName.localeCompare(b.displayName))
        out.results = results
        out.totalVotes = results.reduce((s, r) => s + r.votes, 0)
      }
      return out
    })
  }
}

function edition(ctx: FixtureContext, groupId: string, id: string) {
  return editions.find(e => e.id === id && e.groupId === groupId) ?? (() => { throw new ctx.HttpError(404, 'Award edition not found') })()
}
function category(ctx: FixtureContext, groupId: string, id: string) {
  for (const e of editions) {
    const c = e.groupId === groupId ? e.cats.find(x => x.id === id) : undefined
    if (c) return { e, c }
  }
  throw new ctx.HttpError(404, 'Award category not found')
}
function title(ctx: FixtureContext, v: unknown, max: number, required: boolean) {
  const s = typeof v === 'string' ? v : ''
  if (required && !s.trim()) throw new ctx.HttpError(422, 'Title is required')
  if (s.length > max) throw new ctx.HttpError(422, `Must be ${max} characters or fewer`)
  return s
}

export const awardsRoutes: FeatureRoutes = ({ method, path, body, user, ctx }) => {
  const m = path.match(/^\/api\/groups\/([\w-]+)\/awards(?:\/(.*))?$/)
  if (!m) return undefined
  sync(ctx)
  const g = ctx.group(m[1], user) // 404 / 403 for non-members
  const rest = m[2] ?? ''
  const org = () => { if (!ctx.isOrg(user, g)) throw new ctx.HttpError(403, 'Only owners and organizers can manage awards') }
  const b: Body = body
  let r: RegExpMatchArray | null

  if (rest === '' && method === 'GET') {
    const latest = editions.filter(e => e.groupId === g.id).at(-1)
    if (!latest) return null
    if (latest.publishedAt || ctx.isOrg(user, g)) return dto(ctx, latest, user)
    return latest.status === 'VOTING_OPEN' ? { ...dto(ctx, latest, user), statAwards: [] } : null
  }
  if (rest === '' && method === 'POST') {
    org()
    const e: Edition = { id: ctx.uid('awd'), groupId: g.id, title: title(ctx, b.title, 200, true), status: 'DRAFT', statAwards: Array.isArray(b.statAwards) ? b.statAwards : [], cats: [], createdAt: new Date().toISOString() }
    editions.push(e)
    return dto(ctx, e, user)
  }
  if ((r = rest.match(/^categories\/([\w-]+)\/vote$/)) && method === 'POST') {
    const { e, c } = category(ctx, g.id, r[1])
    if (e.status !== 'VOTING_OPEN') throw new ctx.HttpError(409, 'Voting is not open for this award edition')
    const me = voterId(ctx, g.id, user)
    if (!me) throw new ctx.HttpError(409, 'Link your player to vote')
    const nominee = String(b.nomineeGroupPlayerId ?? '')
    if (!ctx.roster(g.id).some(p => p.id === nominee)) throw new ctx.HttpError(400, 'Nominee is not a member of this group')
    c.votes.set(me, nominee)
    return { ok: true, myVote: nominee }
  }
  if ((r = rest.match(/^categories\/([\w-]+)$/)) && method === 'DELETE') {
    org()
    const { e, c } = category(ctx, g.id, r[1])
    e.cats = e.cats.filter(x => x !== c)
    return null
  }
  if ((r = rest.match(/^([\w-]+)\/(publish|unpublish)$/)) && method === 'POST') {
    org()
    const e = edition(ctx, g.id, r[1])
    e.publishedAt = r[2] === 'publish' ? e.publishedAt ?? new Date().toISOString() : undefined
    return dto(ctx, e, user)
  }
  if ((r = rest.match(/^([\w-]+)\/categories$/)) && method === 'POST') {
    org()
    const e = edition(ctx, g.id, r[1])
    const c: Cat = { id: ctx.uid('cat'), title: title(ctx, b.title, 200, true), votes: new Map() }
    const d = title(ctx, b.description, 1000, false)
    if (d) c.description = d
    e.cats.push(c)
    return { id: c.id, title: c.title, ...(c.description ? { description: c.description } : {}) }
  }
  if ((r = rest.match(/^([\w-]+)$/)) && method === 'PATCH') {
    org()
    const e = edition(ctx, g.id, r[1])
    if (b.title !== undefined) e.title = title(ctx, b.title, 200, true)
    const next = b.status as Status | undefined
    if (next && next !== e.status) {
      if (!NEXT[e.status].includes(next)) throw new ctx.HttpError(400, `Invalid status transition from ${e.status} to ${next}`)
      if (e.status === 'DRAFT' && !e.cats.length) throw new ctx.HttpError(400, 'Add at least one voting category before opening voting')
      e.status = next
    }
    return dto(ctx, e, user)
  }
  if ((r = rest.match(/^([\w-]+)$/)) && method === 'DELETE') {
    org()
    const e = edition(ctx, g.id, r[1])
    editions = editions.filter(x => x !== e)
    return null
  }
  return undefined
}
