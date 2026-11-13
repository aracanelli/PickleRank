<script setup lang="ts">
import { computed } from 'vue'
import { useRoute, RouterLink } from 'vue-router'
import { Home, Trophy, History, Users, UserRound, LayoutList, Contact } from 'lucide-vue-next'
import { useLeagueStore } from '@/stores/league'

const route = useRoute()
const league = useLeagueStore()

const items = computed(() => {
  // outside a league: your leagues and the players you've added across them
  if (route.meta.chrome === 'home') {
    return [
      { key: 'leagues', label: 'Leagues', to: '/groups', icon: LayoutList, match: (p: string) => p === '/groups' },
      { key: 'library', label: 'Players', to: '/players', icon: Contact, match: (p: string) => p === '/players' }
    ]
  }
  const g = league.groupId
  if (!g) return []
  const base = `/groups/${g}`
  const list = [
    { key: 'home', label: 'Home', to: base, icon: Home, match: (p: string) => p === base },
    { key: 'rankings', label: 'Rankings', to: `${base}/rankings`, icon: Trophy, match: (p: string) => p.startsWith(`${base}/rankings`) },
    { key: 'history', label: 'History', to: `${base}/history`, icon: History, match: (p: string) => p.startsWith(`${base}/history`) }
  ]
  // organizers who also play get both tabs; Me wins on your own profile
  const mine = league.me ? `${base}/players/${league.me.id}` : null
  if (league.isOrganizer) {
    list.push({ key: 'players', label: 'Players', to: `${base}/players/manage`, icon: Users, match: (p: string) => p.startsWith(`${base}/players`) && p !== mine })
  }
  if (mine) {
    list.push({ key: 'me', label: 'Me', to: mine, icon: UserRound, match: (p: string) => (league.isOrganizer ? p === mine : p.startsWith(`${base}/players`)) })
  }
  return list
})
</script>

<template>
  <nav v-if="items.length" class="tabbar" aria-label="League">
    <RouterLink
      v-for="item in items"
      :key="item.key"
      :to="item.to"
      class="tab"
      :aria-current="item.match(route.path) ? 'page' : undefined"
    >
      <component :is="item.icon" :size="22" :stroke-width="2" aria-hidden="true" />
      <span>{{ item.label }}</span>
    </RouterLink>
  </nav>
</template>

<style scoped>
/*
 * A floating pill, the same shape on every screen and at every width. Tabs have a fixed width, so a
 * two-tab bar and a five-tab bar use the same tab size and only the pill's length changes.
 * Concentric radii: pill radius (h/2) minus its padding is the active tab's radius.
 */
.tabbar {
  --pad: 4px;
  position: fixed;
  inset-inline: 0;
  bottom: calc(var(--safe-bottom) + var(--tabbar-inset));
  width: fit-content;
  margin-inline: auto;
  z-index: 20;
  display: flex;
  gap: 2px;
  height: var(--tabbar-h);
  max-width: calc(100vw - 2 * var(--gutter) - var(--safe-left) - var(--safe-right));
  padding: var(--pad);
  border: 1px solid var(--line);
  border-radius: calc(var(--tabbar-h) / 2);
  background: var(--surface);
  box-shadow: var(--shadow-float);
}
.tab {
  flex: 0 1 76px;
  width: 76px;
  min-width: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 2px;
  border-radius: calc(var(--tabbar-h) / 2 - var(--pad));
  color: var(--ink-2);
  text-decoration: none;
  font-size: 0.75rem;
  font-weight: 700;
  line-height: 1;
  transition: background-color var(--dur) var(--ease), color var(--dur) var(--ease), scale 120ms var(--ease);
}
.tab span { max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; padding: 0 2px; }
.tab:hover { color: var(--ink); }
.tab[aria-current='page'] { background: var(--court-tint); color: var(--court); }
.tab[aria-current='page'] svg { animation: tab-pop 220ms var(--ease); }
@keyframes tab-pop { 40% { scale: 1.12; } }
</style>
