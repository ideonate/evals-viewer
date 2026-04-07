<template>
  <CaseInspectorLayout v-bind="layoutProps">
    <template #meta>
      <span class="eval-type-badge">{{ evalType }}</span>
      <span v-if="caseData.dataset" class="meta-item"
        >Dataset: {{ caseData.dataset }}</span
      >
    </template>

    <div class="notice">
      No custom viewer for
      <strong>{{ evalType }}</strong> evals. Showing raw data below.
    </div>

    <div class="panels">
      <div v-if="caseData.caseInput" class="panel">
        <h2>Case Input</h2>
        <div class="panel-body">
          <pre class="yaml-display">{{ formatData(caseData.caseInput) }}</pre>
        </div>
      </div>

      <div v-if="caseData.output" class="panel">
        <h2>Output</h2>
        <div class="panel-body">
          <pre class="yaml-display">{{ formatData(caseData.output) }}</pre>
        </div>
      </div>

      <div v-if="caseData.questionScores || caseData.integrity" class="panel">
        <h2>Evaluator Details</h2>
        <div class="panel-body">
          <div v-if="caseData.integrity" class="section">
            <h3>Integrity</h3>
            <pre class="yaml-display">{{ formatData(caseData.integrity) }}</pre>
          </div>
          <div v-if="caseData.questionScores" class="section">
            <h3>Question Scores</h3>
            <pre class="yaml-display">{{
              formatData(caseData.questionScores)
            }}</pre>
          </div>
        </div>
      </div>
    </div>
  </CaseInspectorLayout>
</template>

<script setup>
import { computed } from "vue";
import { stringify as yamlStringify } from "yaml";
import CaseInspectorLayout from "./CaseInspectorLayout.vue";
import { useCaseInspector } from "../composables/useCaseInspector.js";

const { loading, error, caseData, runId, evalName, caseName, evalType } =
  useCaseInspector();

const layoutProps = computed(() => ({
  runId: runId.value,
  evalName: evalName.value,
  caseName: caseName.value,
  loading: loading.value,
  error: error.value,
  caseData: caseData.value,
}));

function formatData(data) {
  return yamlStringify(data, { lineWidth: 120 });
}
</script>

<style scoped>
.case-meta { display: flex; align-items: center; gap: 0.75rem; }
.eval-type-badge {
  background: #e8f4f8;
  color: #2980b9;
  padding: 0.125rem 0.5rem;
  border-radius: 4px;
  font-weight: 600;
  font-size: 0.8rem;
}
.notice {
  background: #fff3cd;
  border: 1px solid #ffc107;
  color: #856404;
  padding: 0.75rem 1rem;
  border-radius: 6px;
  margin-bottom: 1rem;
  font-size: 0.875rem;
}
.panels { display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; }
.panel { max-height: calc(100vh - 280px); }
.panel h3 { font-size: 0.875rem; margin: 0 0 0.5rem 0; color: #555; }
.panel-body { flex: 1; overflow-y: auto; padding: 1rem; }
.section { margin-bottom: 1.5rem; }
.section:last-child { margin-bottom: 0; }
.yaml-display {
  margin: 0;
  font-size: 0.8rem;
  line-height: 1.5;
  white-space: pre-wrap;
  word-break: break-word;
  background: #f8f9fa;
  padding: 0.75rem;
  border-radius: 4px;
  border: 1px solid #eee;
}
</style>
