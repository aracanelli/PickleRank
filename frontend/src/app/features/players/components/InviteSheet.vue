<script setup lang="ts">
/**
 * Shows a player's invite link with copy and (where the device supports it) share.
 * Opening the link signs the player in and ties their account to this profile.
 */
import { ref, computed } from 'vue'
import { Copy, Share2 } from 'lucide-vue-next'
import UiSheet from '@/app/core/ui/UiSheet.vue'
import UiButton from '@/app/core/ui/UiButton.vue'
import { toast } from '@/app/core/ui/feedback'

const props = defineProps<{ link: string | null; name: string }>()
const emit = defineEmits<{ close: [] }>()

const input = ref<HTMLInputElement | null>(null)
const canShare = computed(() => typeof navigator !== 'undefined' && typeof navigator.share === 'function')

async function copy() {
  if (!props.link) return
  try {
    await navigator.clipboard.writeText(props.link)
    toast('Invite link copied')
  } catch {
    // clipboard blocked (http, permissions): select it so the user can copy by hand
    input.value?.select()
    toast('Link selected. Copy it from the field.', 'bad')
  }
}

async function share() {
  if (!props.link) return
  try {
    await navigator.share({ title: 'PickleRank invite', text: `${props.name}, open this to link your PickleRank account.`, url: props.link })
  } catch { /* user cancelled */ }
}
</script>

<template>
  <UiSheet
    :open="!!link"
    title="Invite link"
    :description="`Send this to ${name}. Opening it links their account to this player, so they see their own stats.`"
    @close="emit('close')"
  >
    <label class="lbl" for="invite-link">Link for {{ name }}</label>
    <input id="invite-link" ref="input" class="link" type="text" readonly :value="link ?? ''" @focus="input?.select()">
    <p class="muted note">Each link works once. Make a new one if it was lost.</p>
    <template #actions>
      <UiButton variant="primary" size="lg" block data-autofocus @click="copy">
        <Copy :size="18" aria-hidden="true" /> Copy link
      </UiButton>
      <UiButton v-if="canShare" size="lg" block @click="share">
        <Share2 :size="18" aria-hidden="true" /> Share
      </UiButton>
    </template>
  </UiSheet>
</template>

<style scoped>
.lbl { display: block; font-weight: 700; font-size: var(--text-sm); margin-bottom: var(--s1); }
.lbl, .link { overflow-wrap: anywhere; }
.link {
  width: 100%;
  min-height: var(--tap);
  padding: var(--s2) var(--s3);
  border: 2px solid var(--line-strong);
  border-radius: var(--r-control);
  background: var(--surface-sunk);
  color: var(--ink);
}
.note { font-size: var(--text-sm); margin-top: var(--s2); }
</style>
