import type { FeatureRoutes, FixtureContext, Group } from './fake-api'

/**
 * FIXTURE MODE ONLY: fake Spond endpoints, mirroring backend/app/api/routers/spond.py and
 * spond_service.py. Return undefined for paths this file doesn't handle.
 *
 * Seed: the organizer is connected; grp_1 is not linked yet (so the link step shows); the
 * Spond group has one upcoming event whose attendees are two saved links, a few roster names
 * (name suggestions), and one person who is not on the roster.
 */

interface SpondState {
  accounts: Map<string, string> // userId -> Spond email
  groupLinks: Map<string, { spondGroupId: string; spondGroupName: string }>
  memberLinks: Map<string, Map<string, string>> // groupId -> spondMemberId -> global playerId
}

const SPOND_GROUPS = [
  { spondGroupId: 'sg_tue', name: 'Tuesday Pickleball', memberCount: 24 },
  { spondGroupId: 'sg_sat', name: 'Saturday Social', memberCount: 41 }
]
const NOT_ON_ROSTER = 'Quinn Harper'

// shortcut: state is keyed by grp_1's object so /__fake/reset (which rebuilds groups) clears it;
// upgrade to a reset hook in FixtureContext if more feature fixtures need resettable state.
const states = new WeakMap<Group, SpondState>()
let orphan: SpondState | undefined
function stateFor(ctx: FixtureContext): SpondState {
  let anchor: Group | undefined
  try { anchor = ctx.group('grp_1', 'user_org') } catch { anchor = undefined }
  const make = (): SpondState => ({ accounts: new Map([['user_org', 'organizer@example.com']]), groupLinks: new Map(), memberLinks: new Map() })
  if (!anchor) return (orphan ??= make())
  let s = states.get(anchor)
  if (!s) {
    s = make()
    // two attendees already linked from an earlier import
    const r = ctx.roster('grp_1')
    s.memberLinks.set('grp_1', new Map([['sm_0', r[0].playerId], ['sm_1', r[1].playerId]]))
    states.set(anchor, s)
  }
  return s
}

/** Upcoming event attendees for a Spond group, built from the current roster's names. */
function attendees(ctx: FixtureContext, groupId: string) {
  const regulars = ctx.roster(groupId).filter(p => p.membershipType === 'PERMANENT').slice(0, 9)
  return [...regulars.map((p, i) => ({ spondMemberId: `sm_${i}`, name: p.displayName })), { spondMemberId: 'sm_x', name: NOT_ON_ROSTER }]
}

const norm = (s: string) => s.trim().toLowerCase().split(/\s+/).join(' ')

export const spondRoutes: FeatureRoutes = ({ method, path, body, user, ctx }) => {
  if (!path.startsWith('/api/spond/')) return undefined
  const s = stateFor(ctx)
  const bad = (msg: string): never => { throw new ctx.HttpError(400, msg) }
  const account = () => s.accounts.get(user) ?? bad('No Spond account is connected. Connect one in account settings first.')
  const manager = (groupId: string) => {
    const g = ctx.group(groupId, user)
    if (!ctx.isOrg(user, g)) throw new ctx.HttpError(403, 'Only owners and organizers can use Spond for this group')
    return g
  }
  const linked = (groupId: string) => s.groupLinks.get(groupId) ?? bad('This group is not linked to a Spond group yet.')
  let m: RegExpMatchArray | null = null
  const is = (re: RegExp, verb: string) => method === verb && (m = path.match(re)) !== null
  const arg = (i: number) => (m as RegExpMatchArray)[i]

  if (is(/^\/api\/spond\/status$/, 'GET')) {
    const email = s.accounts.get(user)
    return email ? { connected: true, email } : { connected: false, email: null }
  }
  if (is(/^\/api\/spond\/connect$/, 'POST')) {
    const email = String(body.email ?? '').trim()
    if (email.length < 3 || !body.password) throw new ctx.HttpError(422, 'Enter your Spond email and password')
    // Fixture convention: the password "wrong" fails like a rejected Spond login.
    if (body.password === 'wrong') bad('Spond rejected that email and password. Check them and try again.')
    s.accounts.set(user, email)
    return { connected: true, email }
  }
  if (is(/^\/api\/spond\/disconnect$/, 'DELETE')) { s.accounts.delete(user); return null }
  if (is(/^\/api\/spond\/groups$/, 'GET')) { account(); return { groups: SPOND_GROUPS } }

  if (is(/^\/api\/spond\/groups\/([\w-]+)\/link$/, 'GET')) {
    const g = manager(arg(1))
    const link = s.groupLinks.get(g.id)
    return link ? { linked: true, ...link } : { linked: false, spondGroupId: null, spondGroupName: null }
  }
  if (is(/^\/api\/spond\/groups\/([\w-]+)\/link$/, 'PUT')) {
    const g = manager(arg(1)); account()
    const sg = SPOND_GROUPS.find(x => x.spondGroupId === body.spondGroupId) ?? bad('That Spond group was not found in your account.')
    const link = { spondGroupId: sg.spondGroupId, spondGroupName: sg.name }
    s.groupLinks.set(g.id, link)
    return { linked: true, ...link }
  }
  if (is(/^\/api\/spond\/groups\/([\w-]+)\/events$/, 'GET')) {
    const g = manager(arg(1)); account(); linked(g.id)
    const start = new Date(); start.setDate(start.getDate() + 2); start.setHours(18, 30, 0, 0)
    return { events: [{ spondEventId: 'se_1', name: 'Tuesday ladder night', startsAt: start.toISOString(), acceptedCount: attendees(ctx, g.id).length }] }
  }
  if (is(/^\/api\/spond\/groups\/([\w-]+)\/events\/([\w-]+)\/resolve$/, 'GET')) {
    const g = manager(arg(1)); account(); linked(g.id)
    if (arg(2) !== 'se_1') throw new ctx.HttpError(404, 'Spond event not found')
    const roster = ctx.roster(g.id)
    const links = s.memberLinks.get(g.id) ?? new Map<string, string>()
    const matchedIds: string[] = []
    const resolved = attendees(ctx, g.id).map(a => {
      const linkedGp = roster.find(p => p.playerId === links.get(a.spondMemberId))
      if (linkedGp) { matchedIds.push(linkedGp.id); return { ...a, matchedGroupPlayerId: linkedGp.id, suggestedGroupPlayerId: null } }
      const suggestion = roster.find(p => norm(p.displayName) === norm(a.name))
      return { ...a, matchedGroupPlayerId: null, suggestedGroupPlayerId: suggestion?.id ?? null }
    })
    return { attendees: resolved, matchedGroupPlayerIds: matchedIds }
  }
  if (is(/^\/api\/spond\/groups\/([\w-]+)\/events\/([\w-]+)\/confirm$/, 'POST')) {
    const g = manager(arg(1))
    const roster = ctx.roster(g.id)
    const links = s.memberLinks.get(g.id) ?? new Map<string, string>()
    s.memberLinks.set(g.id, links)
    const out: string[] = []
    for (const l of (body.links ?? []) as Array<{ spondMemberId: string; groupPlayerId?: string; createName?: string }>) {
      let gp = l.groupPlayerId ? roster.find(p => p.id === l.groupPlayerId) : undefined
      if (l.groupPlayerId && !gp) bad(`Selected player is not in this group (attendee ${l.spondMemberId}).`)
      if (!gp) {
        const name = l.createName?.trim() || bad(`Each attendee must map to a player or provide a new name (attendee ${l.spondMemberId}).`)
        gp = {
          id: ctx.uid('gp'), playerId: ctx.uid('pl'), displayName: name, membershipType: 'PERMANENT', role: 'PLAYER',
          rating: Number(g.settings.initialRating ?? 1000), gamesPlayed: 0, wins: 0, losses: 0, ties: 0
        }
        roster.push(gp)
      }
      links.set(l.spondMemberId, gp.playerId)
      out.push(gp.id)
    }
    return { groupPlayerIds: out }
  }
  return undefined
}
