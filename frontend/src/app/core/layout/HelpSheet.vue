<script setup lang="ts">
import { ref } from 'vue'
import UiSheet from '@/app/core/ui/UiSheet.vue'

// Static how-to guide, opened from the account sheet.
defineProps<{ open: boolean }>()
const emit = defineEmits<{ close: [] }>()

const audience = ref<'organizers' | 'players'>('organizers')

const organizerSteps = [
  { title: 'Make a league', text: 'A league holds your players, events and rankings.' },
  { title: 'Add your players', text: 'Open Players to add regulars and subs. Send a player their invite link so they can sign in and see their own stats.' },
  { title: 'Start an event', text: 'Pick courts and rounds, then choose who is playing. Each court needs 4 players. If you use Spond, import who said yes.' },
  { title: 'Make the schedule', text: 'PickleRank builds balanced doubles games and avoids repeat partners. Regenerate if you want a different set.' },
  { title: 'Score each court', text: 'On the night, tap a court to enter its score. Scores save as you go.' },
  { title: 'Complete the event', text: 'When every game has a score, complete the event. Ratings and rankings update straight away.' }
]

const organizerTips = [
  'Rating system and matchmaking rules are in league Settings.',
  'Turn on payments in Settings to track sub fees under Payments.',
  'Connect Spond from your account menu to import who said yes when you start an event.'
]

const playerTabs = [
  { title: 'Home', text: 'Tonight\'s event or the next one, and recent results.' },
  { title: 'Rankings', text: 'Everyone\'s rating and how it changed after each event.' },
  { title: 'History', text: 'Every past event and its scores.' },
  { title: 'Me', text: 'Your rating history, form, partners and opponents.' }
]

const playerTips = [
  'Got an invite link from your organizer? Open it and sign in. That links your account to your player.',
  'Add PickleRank to your home screen to open it like an app.'
]
</script>

<template>
  <UiSheet :open="open" title="How PickleRank works" @close="emit('close')">
    <div class="help">
      <div class="seg" role="group" aria-label="Show help for">
        <button type="button" class="seg__btn" :aria-pressed="audience === 'organizers'" @click="audience = 'organizers'">Organizers</button>
        <button type="button" class="seg__btn" :aria-pressed="audience === 'players'" @click="audience = 'players'">Players</button>
      </div>

      <template v-if="audience === 'organizers'">
        <ol class="steps" role="list">
          <li v-for="(step, i) in organizerSteps" :key="step.title" class="step">
            <span class="step__n num" aria-hidden="true">{{ i + 1 }}</span>
            <div>
              <h3>{{ step.title }}</h3>
              <p class="muted">{{ step.text }}</p>
            </div>
          </li>
        </ol>
        <h3>Good to know</h3>
        <ul class="tips">
          <li v-for="tip in organizerTips" :key="tip">{{ tip }}</li>
        </ul>
      </template>

      <template v-else>
        <h3>Finding your way around</h3>
        <dl class="tabs">
          <div v-for="t in playerTabs" :key="t.title">
            <dt>{{ t.title }}</dt>
            <dd class="muted">{{ t.text }}</dd>
          </div>
        </dl>
        <h3>Tips</h3>
        <ul class="tips">
          <li v-for="tip in playerTips" :key="tip">{{ tip }}</li>
        </ul>
      </template>
    </div>
  </UiSheet>
</template>

<style scoped>
.help { display: flex; flex-direction: column; gap: var(--s4); }
h3 { font-size: var(--text-md); }

.seg {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 4px;
  padding: 4px;
  border-radius: var(--r-control);
  background: var(--surface-sunk);
}
.seg__btn {
  min-height: var(--tap);
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: var(--ink-2);
  font-weight: 700;
}
.seg__btn[aria-pressed='true'] { background: var(--surface); color: var(--ink); box-shadow: 0 1px 2px rgb(0 0 0 / 0.12); }

.steps { display: flex; flex-direction: column; gap: var(--s3); padding: 0; margin: 0; }
.step { display: flex; gap: var(--s3); align-items: flex-start; }
.step__n {
  flex: none;
  width: 32px; height: 32px;
  display: grid; place-items: center;
  border-radius: var(--r-control);
  background: var(--court);
  color: var(--on-court);
  font-size: var(--text-lg);
}
.step p, .tabs dd { font-size: var(--text-sm); }

.tips { display: flex; flex-direction: column; gap: var(--s2); padding-left: var(--s5); margin: 0; }
.tips li { font-size: var(--text-sm); }

.tabs { display: flex; flex-direction: column; gap: var(--s3); margin: 0; }
.tabs dt { font-weight: 700; }
.tabs dd { margin: 0; }
</style>
