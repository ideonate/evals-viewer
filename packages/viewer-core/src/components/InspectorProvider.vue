<template>
  <slot />
</template>

<script setup>
/**
 * Provides case inspector data to child inspector components via inject,
 * so they can be embedded outside their normal route context (e.g. in CaseCompareView).
 */
import { computed, provide } from "vue";
import { CASE_INSPECTOR_DATA } from "../composables/useCaseInspector.js";

const props = defineProps({
  runId: { type: String, required: true },
  evalName: { type: String, required: true },
  caseName: { type: String, required: true },
  caseData: { type: Object, required: true },
});

provide(CASE_INSPECTOR_DATA, {
  loading: computed(() => false),
  error: computed(() => null),
  caseData: computed(() => props.caseData),
  runId: computed(() => props.runId),
  evalName: computed(() => props.evalName),
  caseName: computed(() => props.caseName),
});
</script>
