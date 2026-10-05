<script setup lang="ts">
import { onMounted, ref } from 'vue';

const props = defineProps<{ fast?: boolean }>();
const emit = defineEmits<{ (e: 'complete'): void }>();

const phase = ref<0 | 1 | 2 | 3 | 4>(0);

onMounted(() => {
  const fast = Boolean(props.fast);
  const dur1 = fast ? 200 : 400;
  const dur2 = fast ? 250 : 500;
  const dur3 = fast ? 0 : 600;

  // Phase 1: ignition (horizontal line fades in)
  phase.value = 1;
  setTimeout(() => {
    // Phase 2: vertical expansion
    phase.value = 2;
    setTimeout(() => {
      if (dur3 > 0) {
        // Phase 3: stabilization (brightness surge + screen shake)
        phase.value = 3;
        setTimeout(() => {
          phase.value = 4;
          emit('complete');
        }, dur3);
      } else {
        phase.value = 4;
        emit('complete');
      }
    }, dur2);
  }, dur1);
});
</script>

<template>
  <div
    v-if="phase < 4"
    class="crt-boot"
    :class="[`phase-${phase}`, { fast }]"
  >
    <div class="ignition" />
  </div>
</template>
