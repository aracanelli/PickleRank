<script setup lang="ts">
// Views place page-specific header buttons with:
//   <HeaderActions><IconButton .../></HeaderActions>
// Content teleports into the slot AppHeader renders (#header-actions).
// `defer` waits for the target to exist (header mounts in the same tick).
</script>

<template>
  <Teleport defer to="#header-actions">
    <slot />
  </Teleport>
</template>
