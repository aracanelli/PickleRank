<script setup lang="ts">
/**
 * A matchup drawn as a court seen from above: team one, the net, team two,
 * with the court number painted in the gutter. Used on the round board,
 * in the score sheet header, in event recaps and in history.
 */
import { computed } from 'vue'
import SaveStatus, { type CourtState } from './SaveStatus.vue'

const props = withDefaults(defineProps<{
  court: number
  team1: string[]
  team2: string[]
  score1?: number | null
  score2?: number | null
  state?: CourtState
  interactive?: boolean
  flash?: boolean
  caption?: string
  failedText?: string
}>(), { state: 'needs' })
defineEmits<{ select: [] }>()

const hasScore = computed(() => props.score1 != null && props.score2 != null)
const winner = computed(() => {
  if (!hasScore.value) return 0
  if (props.score1! > props.score2!) return 1
  if (props.score2! > props.score1!) return 2
  return 0
})
const isTie = computed(() => hasScore.value && props.score1 === props.score2)

</script>

<template>
  <!-- The accessible name is the visible text plus a few screen-reader-only joining words,
       so voice control users can say what they see ("tap court 2"). -->
  <component
    :is="interactive ? 'button' : 'div'"
    :type="interactive ? 'button' : undefined"
    class="court"
    :class="{ 'court--interactive': interactive, 'court--flash': flash, [`court--${state}`]: true }"
    :data-court="court"
    @click="interactive && $emit('select')"
  >
    <span class="court__gutter">
      <span class="court__word">Court</span>
      <span class="court__num num">{{ court }}</span>
    </span>
    <span class="court__body">
      <span v-if="caption" class="visually-hidden">, {{ caption }}.</span>
      <span class="side" :class="{ 'side--won': winner === 1 }">
        <span class="side__names">
          <span v-for="(n, i) in team1" :key="i" class="truncate"><span v-if="i" class="visually-hidden"> and </span>{{ n }}</span>
        </span>
        <span class="side__score num">
          <span v-if="hasScore">{{ score1 }}</span>
          <span v-else class="side__dash" aria-hidden="true">–</span>
        </span>
        <span v-if="winner === 1" class="visually-hidden"> won</span>
      </span>
      <span class="visually-hidden"> versus </span>
      <span class="net" aria-hidden="true"><span class="net__post" /><span class="net__post" /></span>
      <span class="side" :class="{ 'side--won': winner === 2 }">
        <span class="side__names">
          <span v-for="(n, i) in team2" :key="i" class="truncate"><span v-if="i" class="visually-hidden"> and </span>{{ n }}</span>
        </span>
        <span class="side__score num">
          <span v-if="hasScore">{{ score2 }}</span>
          <span v-else class="side__dash" aria-hidden="true">–</span>
        </span>
        <span v-if="winner === 2" class="visually-hidden"> won</span>
      </span>
      <span class="court__foot">
        <span class="visually-hidden">. </span>
        <SaveStatus :state="state" :failed-text="failedText" />
        <span v-if="isTie" class="court__tie">Tie</span>
        <span v-if="caption" class="court__caption" aria-hidden="true">{{ caption }}</span>
      </span>
    </span>
  </component>
</template>

<style scoped>
.court {
  display: grid;
  grid-template-columns: 56px minmax(0, 1fr);
  width: 100%;
  min-height: 132px;
  padding: 0;
  text-align: left;
  color: var(--ink);
  background: var(--court-tint);
  border: 2px solid transparent;
  border-radius: var(--r-tile);
  overflow: hidden;
  font: inherit;
}
.court--interactive { cursor: pointer; touch-action: manipulation; }
.court--interactive:hover { border-color: var(--line-strong); }
.court--interactive:active { transform: scale(0.995); }
.court--failed { border-color: var(--bad); }
.court--flash { animation: flash 1200ms var(--ease) 1; }
@keyframes flash {
  0%, 60% { border-color: var(--optic); box-shadow: 0 0 0 4px var(--optic); }
  100% { border-color: transparent; box-shadow: 0 0 0 0 transparent; }
}

.court__gutter {
  background: var(--court);
  color: var(--on-court);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0;
  padding: var(--s2) 0;
}
.court__word { font-size: 12px; font-weight: 700; }
.court__num { font-size: var(--num-lg); line-height: 1; }

.court__body {
  display: flex;
  flex-direction: column;
  padding: var(--s3) var(--s3) var(--s2) var(--s3);
  min-width: 0;
}
.side {
  display: flex;
  align-items: center;
  gap: var(--s3);
  min-height: 44px;
}
.side__names {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  font-size: var(--text-md);
  line-height: 1.25;
}
.side__score {
  font-size: var(--num-md);
  min-width: 2.2ch;
  text-align: right;
  line-height: 1;
  color: var(--ink);
}
.side__dash { color: var(--ink-2); }
.side--won .side__names { font-weight: 700; }
.side--won .side__score {
  font-weight: 700;
  position: relative;
}
.side--won .side__score::before {
  /* ball marker beside the winning score */
  content: '';
  position: absolute;
  left: -14px;
  top: 50%;
  width: 10px; height: 10px;
  margin-top: -5px;
  border-radius: 50%;
  background: var(--optic);
  box-shadow: 0 0 0 1.5px var(--on-optic);
}

.net {
  position: relative;
  display: block;
  height: 2px;
  margin: 6px 0;
  background: repeating-linear-gradient(90deg, var(--net) 0 6px, transparent 6px 10px);
}
.net__post {
  position: absolute;
  top: -3px;
  width: 8px; height: 8px;
  border-radius: 50%;
  background: var(--net);
}
.net__post:first-child { left: -4px; }
.net__post:last-child { right: -4px; }

.court__foot {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: var(--s2);
  margin-top: var(--s2);
}
.court__tie, .court__caption { font-size: var(--text-sm); color: var(--ink-2); font-weight: 700; }
</style>
