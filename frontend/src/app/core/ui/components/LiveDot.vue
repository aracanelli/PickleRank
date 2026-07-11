<template>
  <!-- Pulsing live indicator; solid under reduced motion -->
  <span class="relative inline-flex size-1.5 shrink-0" aria-hidden="true">
    <span class="live-ring absolute inline-flex h-full w-full rounded-full bg-accent-fill" />
    <span class="live-core relative inline-flex size-1.5 rounded-full bg-accent-fill" />
  </span>
</template>

<style scoped>
@media (prefers-reduced-motion: no-preference) {
  .live-ring {
    animation: live-ring 2s cubic-bezier(0.2, 0, 0, 1) infinite;
  }
  .live-core {
    animation: live-core 2s ease-in-out infinite;
  }
}
@keyframes live-ring {
  0% {
    transform: scale(1);
    opacity: 0.6;
  }
  70%,
  100% {
    transform: scale(1.9);
    opacity: 0;
  }
}
@keyframes live-core {
  0%,
  100% {
    opacity: 1;
  }
  50% {
    opacity: 0.5;
  }
}
</style>
