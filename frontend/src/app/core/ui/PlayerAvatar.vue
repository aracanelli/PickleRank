<script setup lang="ts">
/**
 * A player's "jersey": initials on a colour that is always the same for that
 * player, so people learn each other's colour across screens.
 * Decorative by default (the name is always printed next to it).
 */
import { computed } from 'vue'
import { jerseyFor, initialsOf } from './jersey'

const props = withDefaults(defineProps<{
  name: string
  /** stable key for the colour; player id preferred, falls back to name */
  seed?: string
  size?: 'sm' | 'md' | 'lg' | 'xl'
  /** podium ring */
  medal?: 1 | 2 | 3
}>(), { size: 'md' })

const jersey = computed(() => jerseyFor(props.seed || props.name))
const initials = computed(() => initialsOf(props.name))
</script>

<template>
  <span
    class="avatar num"
    :class="[`avatar--${size}`, medal ? `avatar--medal${medal}` : '']"
    :style="{ '--jersey': `var(--jersey-${jersey})` }"
    aria-hidden="true"
  >{{ initials }}</span>
</template>

<style scoped>
.avatar {
  --size: 36px;
  flex: none;
  display: inline-grid;
  place-items: center;
  width: var(--size);
  height: var(--size);
  border-radius: 50%;
  background: var(--jersey);
  color: #fff;
  font-weight: 700;
  font-size: calc(var(--size) * 0.42);
  line-height: 1;
  letter-spacing: 0.02em;
  user-select: none;
}
.avatar--sm { --size: 28px; }
.avatar--md { --size: 36px; }
.avatar--lg { --size: 56px; }
.avatar--xl { --size: 88px; }
.avatar--medal1 { box-shadow: 0 0 0 3px var(--bg), 0 0 0 6px var(--medal-1); }
.avatar--medal2 { box-shadow: 0 0 0 3px var(--bg), 0 0 0 6px var(--medal-2); }
.avatar--medal3 { box-shadow: 0 0 0 3px var(--bg), 0 0 0 6px var(--medal-3); }
</style>
