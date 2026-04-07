<template>
  <CaseInspectorLayout v-bind="layoutProps">
    <template #meta>
      <span class="badge">hello</span>
    </template>

    <div class="hello-panel">
      <h2>Greeting</h2>
      <p class="greeting">{{ caseData.output?.greeting }}</p>
      <p class="who">to <strong>{{ caseData.output?.recipient }}</strong></p>
    </div>
  </CaseInspectorLayout>
</template>

<script setup>
import { computed } from "vue";
import { CaseInspectorLayout, useCaseInspector } from "@evals-viewer/core";

const { loading, error, caseData, runId, evalName, caseName } =
  useCaseInspector();

const layoutProps = computed(() => ({
  runId: runId.value,
  evalName: evalName.value,
  caseName: caseName.value,
  loading: loading.value,
  error: error.value,
  caseData: caseData.value,
}));
</script>

<style scoped>
.badge {
  background: #e8f4f8;
  color: #2980b9;
  padding: 0.125rem 0.5rem;
  border-radius: 4px;
  font-weight: 600;
  font-size: 0.8rem;
}
.hello-panel {
  background: white;
  padding: 1.5rem;
  border-radius: 8px;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
}
.greeting { font-size: 1.5rem; margin: 0.5rem 0; }
.who { color: #666; }
</style>
