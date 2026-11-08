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
      <component :is="item.icon" :size="24" aria-hidden="true" />
      <span>{{ item.label }}</span>
    </RouterLink>
  </nav>
</template>

<style scoped>
.tabbar {
  position: fixed;
  inset: auto 0 0 0;
  z-index: 20;
  display: grid;
  grid-auto-flow: column;
  grid-auto-columns: minmax(0, 1fr);
  height: calc(var(--tabbar-h) + var(--safe-bottom));
  padding: 0 var(--safe-right) var(--safe-bottom) var(--safe-left);
  background: var(--surface);
  border-top: 1px solid var(--line);
}
.tab {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 2px;
  min-height: var(--tap);
  color: var(--ink-2);
  text-decoration: none;
  font-size: var(--text-xs);
  font-weight: 700;
  position: relative;
  min-width: 0;
}
.tab span { max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; padding: 0 2px; }
.tab[aria-current='page'] { color: var(--court); }
.tab[aria-current='page']::before {
  content: '';
  position: absolute;
  top: 0;
  left: 25%;
  right: 25%;
  height: 3px;
  border-radius: 0 0 3px 3px;
  background: var(--court);
}

@media (min-width: 720px) {
  .tabbar {
    position: sticky;
    top: 0;
    inset: auto;
    height: var(--topbar-h);
    padding: 0;
    border-top: 0;
    border-bottom: 1px solid var(--line);
    max-width: var(--content-max);
    margin: 0 auto;
    background: var(--bg);
  }
  .tab { flex-direction: row; gap: var(--s2); font-size: var(--text-sm); }
  .tab[aria-current='page']::before { top: auto; bottom: 0; border-radius: 3px 3px 0 0; }
}
</style>
