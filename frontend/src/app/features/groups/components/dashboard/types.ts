/** One podium slot, pre-resolved by the page so id spaces never mix:
 *  `playerId` is the GLOBAL id (avatar seed), `groupPlayerId` the GROUP-PLAYER
 *  id (profile route). */
export interface PodiumItem {
  rank: number
  playerId: string
  groupPlayerId?: string
  name: string
  rating: number
  delta?: number
}
