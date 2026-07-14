// Group DTOs
export interface PaymentSettings {
  trackPayments: boolean
  subFeePerAttendance: number
  currency: string
}

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
  defaultRounds?: number
  paymentSettings?: PaymentSettings
}

export interface GroupDto {
  id: string
  ownerUserId: string
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
export type GroupRole = 'ORGANIZER' | 'PLAYER'

export interface PlayerDto {
  id: string
  displayName: string
  notes?: string
  userId?: string
  inviteToken?: string
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
  role: GroupRole
  userId?: string
  rating: number
  gamesPlayed: number
  wins: number
  losses: number
  ties: number
  winRate: number
  ratingDelta?: number
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
  groupId: string
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
  membershipType?: MembershipType
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
  gameId: string
  eventId: string
  eventName?: string
  date: string
  roundIndex: number
  courtIndex: number
  team1: string[]
  team2: string[]
  team1Ids: string[]
  team2Ids: string[]
  scoreTeam1?: number
  scoreTeam2?: number
  result: string
  team1Elo?: number
  team2Elo?: number
}

export interface MatchHistoryResponse {
  matches: MatchHistoryEntryDto[]
}





export interface RatingHistoryPoint {
  rating: number
  createdAt: string
  eventId?: string
  eventName?: string
  delta: number
}

export interface TeammateStat {
  playerId: string
  displayName: string
  gamesPlayed: number
  wins: number
  losses: number
  winRate: number
}

export interface AdvancedStats {
  highestRating: number
  lowestRating: number
  longestWinStreak: number
  longestLossStreak: number
  currentWinStreak: number
  currentLossStreak: number

  bestTeammates: TeammateStat[]
  worstTeammates: TeammateStat[]

  nemesis?: TeammateStat
  pigeon?: TeammateStat
}

export interface PlayerStats {
  player: GroupPlayerDto
  history: RatingHistoryPoint[]
  advanced?: AdvancedStats
}

// Payment DTOs
export type PaymentType = 'ATTENDANCE' | 'PAYMENT' | 'ADJUSTMENT'

export interface SubBalanceDto {
  groupPlayerId: string
  playerId: string
  displayName: string
  membershipType: MembershipType
  totalAttendances: number
  totalCharges: number
  totalPayments: number
  balance: number
  lastPaymentDate?: string
}

export interface SubBalanceListResponse {
  balances: SubBalanceDto[]
  totalOwed: number
}

export interface PaymentHistoryItemDto {
  id: string
  amount: number
  paymentType: PaymentType
  eventId?: string
  eventName?: string
  notes?: string
  createdAt: string
}

export interface PaymentHistoryResponse {
  groupPlayerId: string
  displayName: string
  history: PaymentHistoryItemDto[]
  currentBalance: number
}

export interface PaymentResponseDto {
  id: string
  amount: number
  paymentType: PaymentType
  newBalance: number
  createdAt: string
}

// Award DTOs
export type AwardEditionStatus = 'DRAFT' | 'VOTING_OPEN' | 'CLOSED'

/** Which player pool a stat award was computed over. */
export type AwardDivision = 'ALL' | 'PERMANENT'

/** A frozen stat-award winner, computed client-side at creation. Stored as
 *  JSONB on the edition and echoed back verbatim by the API. */
export interface StatAwardDto {
  key: string
  emoji: string
  title: string
  blurb: string
  winner: AwardWinnerRef
  /** Set for pairing awards (Dream Team, Biggest Upset) — the second player. */
  partner?: AwardWinnerRef
  /** Headline number (rating, wins, streak length, …). */
  value: number
  /** Optional secondary line (e.g. "24 wins · 68% win rate"). */
  detail?: string
  /** Player pool the award was computed over. Absent on old snapshots (treat as ALL). */
  division?: AwardDivision
}

export interface AwardWinnerRef {
  groupPlayerId: string
  playerId: string
  displayName: string
}

export interface AwardResultDto {
  nomineeGroupPlayerId: string
  displayName: string
  votes: number
}

export interface AwardCategoryDto {
  id: string
  title: string
  description?: string
  /** The caller's current pick (group-player id), if they've voted. */
  myVote?: string
  /** Present only when the edition is CLOSED. */
  results?: AwardResultDto[]
  totalVotes?: number
}

export interface AwardEditionDto {
  id: string
  title: string
  status: AwardEditionStatus
  statAwards: StatAwardDto[]
  categories: AwardCategoryDto[]
  /** True when status is VOTING_OPEN and the caller has a linked player. */
  canVote: boolean
  createdAt: string
}

/** GET awards returns the latest edition, or null when none exists yet. */
export type AwardsResponse = AwardEditionDto | null

// Spond integration DTOs
export interface SpondStatusDto {
  connected: boolean
  email?: string
}

export interface SpondGroupDto {
  spondGroupId: string
  name: string
  memberCount: number
}

export interface SpondGroupListResponse {
  groups: SpondGroupDto[]
}

export interface SpondGroupLinkDto {
  linked: boolean
  spondGroupId?: string
  spondGroupName?: string
}

export interface SpondEventDto {
  spondEventId: string
  name: string
  startsAt?: string
  acceptedCount: number
}

export interface SpondEventListResponse {
  events: SpondEventDto[]
}

export interface SpondResolvedAttendeeDto {
  spondMemberId: string
  name: string
  /** Set when a saved link already resolves this attendee to a roster player. */
  matchedGroupPlayerId?: string
  /** A best-guess roster match for an unmatched attendee (organizer confirms). */
  suggestedGroupPlayerId?: string
}

export interface SpondResolveResponse {
  attendees: SpondResolvedAttendeeDto[]
  matchedGroupPlayerIds: string[]
}

export interface SpondAttendeeLinkInput {
  spondMemberId: string
  /** Link to an existing group player... */
  groupPlayerId?: string
  /** ...or create a new player with this name and add them to the group. */
  createName?: string
}

export interface SpondConfirmLinksResponse {
  groupPlayerIds: string[]
}
