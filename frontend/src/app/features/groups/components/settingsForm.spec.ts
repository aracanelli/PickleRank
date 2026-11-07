import { describe, it, expect } from 'vitest'
import { toForm, validate, toRequest, diff, systemDefaults } from './settingsForm'
import { importErrorMessage } from './historyImport'
import type { GroupDto } from '@/app/core/models/dto'

const group: GroupDto = {
  id: 'g', ownerUserId: 'u', name: 'Tuesday Ladder', sport: 'pickleball', createdAt: '',
  settings: {
    ratingSystem: 'SERIOUS_ELO', initialRating: 1000, kFactor: 32, eloDiff: 0.05,
    noRepeatTeammateInEvent: true, noRepeatTeammateFromPreviousEvent: true, noRepeatOpponentInEvent: true,
    autoRelaxEloDiff: true, autoRelaxStep: 0.01, autoRelaxMaxEloDiff: 0.25, defaultRounds: 4
  }
}

describe('settingsForm', () => {
  it('round-trips settings without changes', () => {
    const f = toForm(group)
    expect(f.eloDiffPct).toBe('5')
    expect(f.eloConst).toBe('400')
    expect(validate(f)).toEqual({})
    expect(diff(f, toForm(group))).toEqual({ rename: false, settings: false })
    const r = toRequest(f)
    expect(r.eloDiff).toBe(0.05)
    expect(r.autoRelaxMaxEloDiff).toBe(0.25)
    expect(r.paymentSettings).toEqual({ trackPayments: false, subFeePerAttendance: 5, currency: 'USD' })
  })
  it('treats equivalent numbers as unchanged and real edits as dirty', () => {
    const saved = toForm(group)
    expect(diff(saved, { ...saved, kFactor: '32.0' }).settings).toBe(false)
    expect(diff(saved, { ...saved, kFactor: '40' }).settings).toBe(true)
    expect(diff(saved, { ...saved, name: ' Tuesday Ladder ' }).rename).toBe(false)
    expect(diff(saved, { ...saved, name: 'Wed' })).toEqual({ rename: true, settings: false })
  })
  it('flags bad numbers inline', () => {
    const f = { ...toForm(group), name: '  ', kFactor: '', initialRating: '5000', eloDiffPct: 'x' }
    const e = validate(f)
    expect(Object.keys(e).sort()).toEqual(['eloDiffPct', 'initialRating', 'kFactor', 'name'])
  })
  it('uses the rating constant range of the chosen system', () => {
    const f = { ...toForm(group), ratingSystem: 'RACS_ELO' as const }
    expect(validate(f).eloConst).toBeTruthy()
    expect(validate({ ...f, eloConst: '0.3' }).eloConst).toBeUndefined()
    expect(systemDefaults('RACS_ELO')).toEqual({ kFactor: 100, eloConst: 0.3 })
  })
  it('requires widest gap >= starting gap only when auto-relax is on', () => {
    const f = { ...toForm(group), eloDiffPct: '30', autoRelaxMaxPct: '20' }
    expect(validate(f).autoRelaxMaxPct).toMatch(/at least/)
    expect(validate({ ...f, autoRelaxEloDiff: false })).toEqual({})
  })
  it('validates the fee only when tracking payments', () => {
    const f = { ...toForm(group), subFee: '-1' }
    expect(validate(f)).toEqual({})
    expect(validate({ ...f, trackPayments: true }).subFee).toBeTruthy()
  })
})

describe('importErrorMessage', () => {
  it('explains a missing endpoint', () => {
    expect(importErrorMessage(404, 'Not Found', 'x')).toMatch(/isn't available/)
  })
  it('uses the server detail or the fallback', () => {
    expect(importErrorMessage(400, 'Row 3: unknown player', 'x')).toBe('Row 3: unknown player')
    expect(importErrorMessage(422, [{ msg: 'file required' }], 'x')).toBe('file required')
    expect(importErrorMessage(500, undefined, 'fallback')).toBe('fallback')
  })
})
