import type { GroupDto, GroupSettings } from '@/app/core/models/dto'
import type { UpdateGroupSettingsRequest } from '../services/groups.api'

export type RatingSystem = GroupSettings['ratingSystem']

export const CURRENCIES = ['USD', 'EUR', 'GBP', 'CAD', 'AUD'] as const
export const ROUNDS_MIN = 1
export const ROUNDS_MAX = 10

/**
 * Editable copy of a league's settings. Numeric inputs stay as strings so a half-typed
 * value ("", "0.") can be shown and validated instead of silently becoming NaN.
 * Rating gaps are edited as percentages (5 = 0.05) because that is how organizers think of them.
 */
export interface SettingsForm {
  name: string
  ratingSystem: RatingSystem
  initialRating: string
  kFactor: string
  eloConst: string
  eloDiffPct: string
  noRepeatTeammateInEvent: boolean
  noRepeatTeammateFromPreviousEvent: boolean
  noRepeatOpponentInEvent: boolean
  autoRelaxEloDiff: boolean
  autoRelaxStepPct: string
  autoRelaxMaxPct: string
  defaultRounds: number
  trackPayments: boolean
  subFee: string
  currency: string
}

export type SettingsErrors = Partial<Record<keyof SettingsForm, string>>

const pct = (v: number) => String(Number((v * 100).toFixed(2)))

/** Rating defaults that go with each system (same values the old settings screen applied). */
export function systemDefaults(system: RatingSystem): { kFactor: number; eloConst: number } {
  return system === 'RACS_ELO' ? { kFactor: 100, eloConst: 0.3 } : { kFactor: 32, eloConst: 400 }
}

export function toForm(group: GroupDto): SettingsForm {
  const s = group.settings
  const pay = s.paymentSettings
  return {
    name: group.name,
    ratingSystem: s.ratingSystem,
    initialRating: String(s.initialRating),
    kFactor: String(s.kFactor),
    eloConst: String(s.eloConst ?? systemDefaults(s.ratingSystem).eloConst),
    eloDiffPct: pct(s.eloDiff),
    noRepeatTeammateInEvent: s.noRepeatTeammateInEvent,
    noRepeatTeammateFromPreviousEvent: s.noRepeatTeammateFromPreviousEvent,
    noRepeatOpponentInEvent: s.noRepeatOpponentInEvent,
    autoRelaxEloDiff: s.autoRelaxEloDiff,
    autoRelaxStepPct: pct(s.autoRelaxStep),
    autoRelaxMaxPct: pct(s.autoRelaxMaxEloDiff),
    defaultRounds: Math.min(ROUNDS_MAX, Math.max(ROUNDS_MIN, s.defaultRounds || 1)),
    trackPayments: !!pay?.trackPayments,
    subFee: String(pay?.subFeePerAttendance ?? 5),
    currency: pay?.currency || 'USD'
  }
}

function num(raw: string): number | null {
  const t = raw.trim()
  if (!t) return null
  const n = Number(t)
  return Number.isFinite(n) ? n : null
}

function range(raw: string, min: number, max: number, what: string, unit = ''): string | undefined {
  const n = num(raw)
  if (n === null) return `Enter ${what}.`
  if (n < min || n > max) return `Use a number from ${min}${unit} to ${max}${unit}.`
  return undefined
}

export function validate(f: SettingsForm): SettingsErrors {
  const e: SettingsErrors = {}
  const name = f.name.trim()
  if (!name) e.name = 'Enter a league name.'
  else if (name.length > 100) e.name = 'Use 100 characters or fewer.'
  e.initialRating = range(f.initialRating, 0, 3000, 'a starting rating')
  e.kFactor = range(f.kFactor, 1, 200, 'a K-factor')
  e.eloConst = f.ratingSystem === 'RACS_ELO'
    ? range(f.eloConst, 0.1, 1, 'a rating constant')
    : range(f.eloConst, 100, 800, 'a rating constant')
  e.eloDiffPct = range(f.eloDiffPct, 1, 50, 'a rating gap', '%')
  if (f.autoRelaxEloDiff) {
    e.autoRelaxStepPct = range(f.autoRelaxStepPct, 0.5, 10, 'a step', '%')
    e.autoRelaxMaxPct = range(f.autoRelaxMaxPct, 10, 50, 'a widest gap', '%')
    const gap = num(f.eloDiffPct)
    const max = num(f.autoRelaxMaxPct)
    if (!e.autoRelaxMaxPct && !e.eloDiffPct && gap !== null && max !== null && max < gap) {
      e.autoRelaxMaxPct = 'Use a widest gap at least as large as the starting gap.'
    }
  }
  if (f.trackPayments) e.subFee = range(f.subFee, 0, 1000, 'a fee')
  for (const k of Object.keys(e) as (keyof SettingsForm)[]) if (!e[k]) delete e[k]
  return e
}

/** Settings payload for PATCH /settings. Call only when validate() returned no errors. */
export function toRequest(f: SettingsForm): UpdateGroupSettingsRequest {
  return {
    ratingSystem: f.ratingSystem,
    initialRating: Number(f.initialRating),
    kFactor: Number(f.kFactor),
    eloConst: Number(f.eloConst),
    eloDiff: Number(f.eloDiffPct) / 100,
    noRepeatTeammateInEvent: f.noRepeatTeammateInEvent,
    noRepeatTeammateFromPreviousEvent: f.noRepeatTeammateFromPreviousEvent,
    noRepeatOpponentInEvent: f.noRepeatOpponentInEvent,
    autoRelaxEloDiff: f.autoRelaxEloDiff,
    autoRelaxStep: Number(f.autoRelaxStepPct) / 100,
    autoRelaxMaxEloDiff: Number(f.autoRelaxMaxPct) / 100,
    defaultRounds: f.defaultRounds,
    paymentSettings: {
      trackPayments: f.trackPayments,
      subFeePerAttendance: Number(f.subFee),
      currency: f.currency
    }
  }
}

/** What a save has to send: a rename, a settings patch, both, or nothing. */
export function diff(saved: SettingsForm, current: SettingsForm): { rename: boolean; settings: boolean } {
  const { name: a, ...restA } = saved
  const { name: b, ...restB } = current
  return {
    rename: a.trim() !== b.trim(),
    settings: JSON.stringify(toRequest({ ...restA, name: '' })) !== JSON.stringify(toRequest({ ...restB, name: '' }))
  }
}
