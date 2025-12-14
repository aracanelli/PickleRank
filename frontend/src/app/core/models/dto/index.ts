// Group DTOs
export interface GroupSettings {
  ratingSystem: 'SERIOUS_ELO' | 'CATCH_UP' | 'RACS_ELO'
  initialRating: number
  kFactor: number
  eloConst?: number
  eloDiff: number
  noRepeatTeammateInEvent: boolean
  noRepeatTeammateFromPreviousEvent: boolean
  noRepeatOpponentInEvent: boolean
  autoRelaxEloDiff: boolean
  autoRelaxStep: number
  autoRelaxMaxEloDiff: number
}

export interface GroupDto {
  id: string
  name: string
  sport: string
  settings: GroupSettings
  createdAt: string
  updatedAt?: string
}

export interface GroupListItemDto {
  id: string
  name: string
  sport: string
  playerCount: number
  createdAt: string
}

export interface GroupListResponse {
  groups: GroupListItemDto[]
}

// Player DTOs
export type MembershipType = 'PERMANENT' | 'SUB'

export interface PlayerDto {
  id: string
  displayName: string
  notes?: string
  createdAt: string
}

export interface PlayerListResponse {
  players: PlayerDto[]
}

export interface GroupPlayerDto {
  id: string
  playerId: string
  groupId: string
  displayName: string
  membershipType: MembershipType
  skillLevel?: SkillLevel
  rating: number
  gamesPlayed: number
  wins: number
  losses: number
  ties: number
  winRate: number
}

export type SkillLevel = 'ADVANCED' | 'INTERMEDIATE' | 'BEGINNER'

export interface GroupPlayerListResponse {
  players: GroupPlayerDto[]
}

export interface BulkAddPlayerItem {
  playerId: string
  membershipType: MembershipType
  skillLevel?: SkillLevel
}

export interface BulkAddPlayersToGroupRequest {
  players: BulkAddPlayerItem[]
}

export interface BulkAddPlayersToGroupResponse {
  added: GroupPlayerDto[]
  skipped: string[]
}

// Event DTOs
export type EventStatus = 'DRAFT' | 'GENERATED' | 'IN_PROGRESS' | 'COMPLETED'
export type GameResult = 'TEAM1_WIN' | 'TEAM2_WIN' | 'TIE' | 'UNSET'

export interface PlayerInfo {
  id: string
  displayName: string
}

export interface GameDto {
  id: string
  roundIndex: number
  courtIndex: number
  team1: PlayerInfo[]
  team2: PlayerInfo[]
  scoreTeam1?: number
  scoreTeam2?: number
  team1Elo?: number
  team2Elo?: number
  result: GameResult
}

export interface GenerationMeta {
  seedUsed: string
  eloDiffConfigured: number
  eloDiffUsed: number
  relaxIterations: number
  attempts: number
  durationMs: number
  constraintToggles: Record<string, boolean>
}

export interface EventDto {
  id: string
  name?: string
  status: EventStatus
  startsAt?: string
  courts: number
  rounds: number
  participantCount: number
  generationMeta?: GenerationMeta
  games: GameDto[]
}

export interface EventListItemDto {
  id: string
  name?: string
  status: EventStatus
  startsAt?: string
  courts: number
  rounds: number
}

export interface EventListResponse {
  events: EventListItemDto[]
}

export interface GenerateResponse {
  status: EventStatus
  generationMeta: GenerationMeta
  games: GameDto[]
}

export interface SwapResponse {
  success: boolean
  warnings: string[]
}

export interface RatingUpdateDto {
  playerId: string
  displayName: string
  ratingBefore: number
  ratingAfter: number
  delta: number
}

export interface CompleteResponse {
  status: EventStatus
  ratingUpdates: RatingUpdateDto[]
}

// Ranking DTOs
export interface RankingEntryDto {
  rank: number
  playerId: string
  displayName: string
  rating: number
  gamesPlayed: number
  wins: number
  losses: number
  ties: number
  winRate: number
}

export interface RankingsResponse {
  rankings: RankingEntryDto[]
}

export interface MatchHistoryEntryDto {
  eventId: string
  eventName?: string
  date: string
  roundIndex: number
  courtIndex: number
  team1: string[]
  team2: string[]
  scoreTeam1?: number
  scoreTeam2?: number
  result: string
  team1Elo?: number
  team2Elo?: number
}

export interface MatchHistoryResponse {
  matches: MatchHistoryEntryDto[]
}



