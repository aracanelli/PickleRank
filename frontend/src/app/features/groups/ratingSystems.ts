import type { GroupSettings } from '@/app/core/models/dto'

type RatingSystem = GroupSettings['ratingSystem']

/** One name per rating system, shared by settings and every screen that names the system. */
export const RATING_SYSTEMS: { value: RatingSystem; label: string; desc: string }[] = [
  { value: 'SERIOUS_ELO', label: 'Standard Elo', desc: 'Steady, competitive ratings. Every game counts the same.' },
  { value: 'CATCH_UP', label: 'Catch-up', desc: 'Lower-rated players climb faster. Good for social leagues.' },
  { value: 'RACS_ELO', label: "Rac's Elo", desc: 'Bigger swings, and the score margin matters. Blowouts move ratings more.' }
]

export const ratingSystemLabel = (system?: string) =>
  (RATING_SYSTEMS.find(s => s.value === system) ?? RATING_SYSTEMS[0]).label
