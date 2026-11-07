<script setup lang="ts">
import { computed, useId } from 'vue'
import type { GroupPlayerDto, SpondResolvedAttendeeDto } from '@/app/core/models/dto'

/** 'create' adds a new roster player, 'skip' leaves the person out, anything else is a group player id. */
export type LinkChoice = 'create' | 'skip' | (string & {})

const props = defineProps<{
  /** Spond attendees without a saved link to a roster player */
  attendees: SpondResolvedAttendeeDto[]
  matched: number
  total: number
  players: GroupPlayerDto[]
}>()
const choices = defineModel<Record<string, LinkChoice>>({ required: true })

const id = useId()
const sorted = computed(() => [...props.players].sort((a, b) => a.displayName.localeCompare(b.displayName)))
const likely = computed(() => props.attendees.filter(a => a.suggestedGroupPlayerId).length)
const notOnRoster = computed(() => props.attendees.length - likely.value)
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`
const summary = computed(() => [
  `${props.matched} of ${props.total} people who said yes are already linked to roster players.`,
  likely.value ? `${plural(likely.value, 'has a likely match', 'have a likely match')} picked below.` : '',
  notOnRoster.value ? `${plural(notOnRoster.value, "isn't", "aren't")} on your roster.` : ''
].filter(Boolean).join(' '))
</script>

<template>
  <div class="links">
    <p>{{ summary }}</p>
    <p class="muted small">Choose a player for each name, add them as a new player, or leave them out. PickleRank remembers your choices.</p>

    <ul role="list" class="list">
      <li v-for="(a, i) in attendees" :key="a.spondMemberId" class="row">
        <label :for="`${id}-${i}`" class="row__name truncate">{{ a.name }}</label>
        <span class="row__tag small" :class="{ 'row__tag--new': !a.suggestedGroupPlayerId }">
          {{ a.suggestedGroupPlayerId ? 'Likely match' : 'Not on roster' }}
        </span>
        <select :id="`${id}-${i}`" v-model="choices[a.spondMemberId]" class="row__select">
          <option value="create">Add as new player</option>
          <option value="skip">Leave out</option>
          <optgroup label="Roster players">
            <option v-for="p in sorted" :key="p.id" :value="p.id">{{ p.displayName }}</option>
          </optgroup>
        </select>
      </li>
    </ul>
  </div>
</template>

<style scoped>
.links { display: flex; flex-direction: column; gap: var(--s3); }
.small { font-size: var(--text-sm); }
.list { display: flex; flex-direction: column; gap: var(--s3); }
.row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: var(--s2);
  align-items: center;
  padding: var(--s3);
  border: 1px solid var(--line);
  border-radius: var(--r-tile);
}
.row__name { font-weight: 700; }
.row__tag { color: var(--ink-2); }
.row__tag--new { color: var(--ink); font-weight: 700; }
.row__select {
  grid-column: 1 / -1;
  width: 100%;
  min-height: var(--tap);
  padding: 0 var(--s3);
  border: 2px solid var(--line-strong);
  border-radius: var(--r-control);
  background: var(--surface);
  color: var(--ink);
  font-size: max(16px, var(--text-md));
}
.row__select:focus-visible { outline: 3px solid var(--focus); outline-offset: 1px; }
</style>
