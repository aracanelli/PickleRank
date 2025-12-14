<script setup lang="ts">
import BaseButton from '@/app/core/ui/components/BaseButton.vue'
</script>

<template>
  <div class="not-found container">
    <div class="content">
      <span class="icon">🏓</span>
      <h1>404</h1>
      <p>Oops! Looks like this ball went out of bounds.</p>
      <router-link to="/">
        <BaseButton>Back to Home</BaseButton>
      </router-link>
    </div>
  </div>
</template>

<style scoped>
.not-found {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 60vh;
}

.content {
  text-align: center;
}

.icon {
  font-size: 4rem;
  display: block;
  margin-bottom: var(--spacing-lg);
  animation: bounce 2s ease-in-out infinite;
}

h1 {
  font-size: 6rem;
  font-weight: 700;
  background: linear-gradient(135deg, var(--color-primary), var(--color-secondary));
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
  margin-bottom: var(--spacing-md);
}

p {
  color: var(--color-text-secondary);
  font-size: 1.25rem;
  margin-bottom: var(--spacing-xl);
}

@keyframes bounce {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-10px); }
}
</style>



