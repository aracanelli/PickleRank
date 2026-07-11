/**
 * Editable copy of a group's settings, shared between GroupSettingsPage and
 * its section components. Sections mutate this reactive object; the page owns
 * the dirty check and the single save call.
 */
export interface SettingsForm {
  ratingSystem: 'SERIOUS_ELO' | 'CATCH_UP' | 'RACS_ELO'
  initialRating: number
  kFactor: number
  eloConst: number | undefined
  eloDiff: number
  noRepeatTeammateInEvent: boolean
  noRepeatTeammateFromPreviousEvent: boolean
  noRepeatOpponentInEvent: boolean
  autoRelaxEloDiff: boolean
  autoRelaxStep: number
  autoRelaxMaxEloDiff: number
  defaultRounds: number
  trackPayments: boolean
  subFeePerAttendance: number
  paymentCurrency: string
}
