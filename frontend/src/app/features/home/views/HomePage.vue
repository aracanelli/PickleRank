<script setup lang="ts">
/** Landing for signed-out visitors (signed-in users are redirected by the router). */
import CourtTile from '@/app/core/ui/CourtTile.vue'
import UiButton from '@/app/core/ui/UiButton.vue'
</script>

<template>
  <div class="page home">
    <div class="home__brand">
      <img src="/favicon.svg" alt="" width="36" height="36" />
      <span>PickleRank</span>
    </div>

    <div class="stack-sm">
      <h1>Run your league night from one phone</h1>
      <p class="muted">
        PickleRank schedules courts and rounds so everyone gets a fair mix of partners and opponents.
        Scores go in courtside, and the ladder updates as soon as they’re saved.
      </p>
    </div>

    <!-- A sample round, drawn the way the app draws it. Not interactive. -->
    <figure class="home__round">
      <figcaption class="home__caption">Round 3 of 6</figcaption>
      <CourtTile :court="1" :team1="['Maya Chen', 'Luis Ortega']" :team2="['Priya Nair', 'Sam Becker']" :score1="11" :score2="7" state="final" />
      <CourtTile :court="2" :team1="['Dana Whitfield', 'Jordan Kim']" :team2="['Ana Silva', 'Tom Reyes']" />
    </figure>

    <div class="home__actions">
      <UiButton variant="primary" size="lg" block to="/signup">Create an account</UiButton>
      <UiButton variant="secondary" size="lg" block to="/login">Sign in</UiButton>
    </div>
  </div>
</template>

<style scoped>
.home__brand {
  display: flex;
  align-items: center;
  gap: var(--s2);
  min-height: var(--tap);
  margin-top: var(--safe-top);
  font-weight: 700;
  font-size: var(--text-md);
}
.home__brand img { border-radius: 8px; }
.home h1 { font-size: var(--text-xl); line-height: 1.15; }
.home__round {
  display: flex;
  flex-direction: column;
  gap: var(--s3);
  margin: 0;
}
.home__caption { font-weight: 700; color: var(--ink-2); }
.home__actions {
  display: flex;
  flex-direction: column;
  gap: var(--s3);
}
</style>
