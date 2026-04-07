<template>
  <div class="case-compare">
    <div class="breadcrumb">
      <router-link to="/">Evals</router-link>
      <span>/</span>
      <router-link :to="`/compare?runs=${runsParam}`">Compare</router-link>
      <span>/</span>
      <span>{{ caseName }}</span>
    </div>

    <div v-if="loading" class="loading">Loading...</div>
    <div v-else-if="error" class="error">{{ error }}</div>

    <template v-else>
      <header class="compare-header">
        <h1>{{ caseName }}</h1>
        <p class="subtitle">
          Comparison across {{ casesData.length }} runs
        </p>
      </header>

      <!-- Generic case-level score comparison (bar chart) -->
      <section class="scores-section">
        <div class="run-tabs">
          <div
            v-for="(caseData, idx) in casesData"
            :key="caseData.runName"
            class="run-tab"
            :style="{ borderColor: getRunColor(idx) }"
          >
            <span
              class="run-color"
              :style="{ background: getRunColor(idx) }"
            ></span>
            <span class="run-name">{{ caseData.runId }}</span>
            <span class="run-date">{{ formatDate(caseData.timestamp) }}</span>
          </div>
        </div>
        <div class="scores-comparison">
          <div
            v-for="evaluator in evaluatorKeys"
            :key="evaluator"
            class="evaluator-row"
          >
            <div class="evaluator-name">
              {{ formatEvaluatorName(evaluator) }}
            </div>
            <div class="score-bars">
              <div
                v-for="(caseData, idx) in casesData"
                :key="caseData.runName"
                class="score-bar-container"
              >
                <div class="score-bar-wrapper">
                  <div
                    class="score-bar"
                    :style="{
                      width: barWidth(caseData.scores?.[evaluator]),
                      background: getRunColor(idx),
                    }"
                  ></div>
                </div>
                <span
                  class="score-value"
                  :class="getScoreClass(caseData.scores?.[evaluator])"
                >
                  {{ formatPercent(caseData.scores?.[evaluator]) }}
                </span>
              </div>
            </div>
          </div>
        </div>
      </section>

      <!--
        Domain-specific comparison region.
        Apps may render anything here (e.g. per-question breakdowns) using the
        slot scope. Falls back to nothing if no slot is provided.
      -->
      <slot
        name="comparison"
        :cases-data="casesData"
        :get-run-color="getRunColor"
        :eval-type="evalType"
      />

      <!-- Generic per-run inspector tabs at the bottom -->
      <section class="comparison-section inspector-section">
        <h2>Detail Inspector</h2>
        <div class="inspector-tabs">
          <button
            v-for="(caseData, idx) in casesData"
            :key="caseData.runName"
            class="inspector-tab"
            :class="{ active: activeInspectorTab === idx }"
            :style="{
              borderBottomColor:
                activeInspectorTab === idx ? getRunColor(idx) : 'transparent',
            }"
            @click="activeInspectorTab = idx"
          >
            <span
              class="run-color"
              :style="{ background: getRunColor(idx) }"
            ></span>
            {{ caseData.runId }}
          </button>
        </div>
        <div class="inspector-content">
          <template
            v-for="(caseData, idx) in casesData"
            :key="caseData.runName"
          >
            <InspectorProvider
              v-if="activeInspectorTab === idx"
              :run-id="caseData.runId"
              :eval-name="evalType"
              :case-name="caseName"
              :case-data="caseData"
            >
              <component :is="inspectorComponent" />
            </InspectorProvider>
          </template>
        </div>
      </section>
    </template>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, watch } from "vue";
import { useRoute } from "vue-router";
import InspectorProvider from "./InspectorProvider.vue";
import { useInspectorRegistry } from "../registry.js";
import {
  formatEvaluatorName,
  formatPercent,
  getScoreClass,
  formatDate,
} from "../utils/evalHelpers.js";

const route = useRoute();
const registry = useInspectorRegistry();

const casesData = ref([]);
const loading = ref(true);
const error = ref(null);
const activeInspectorTab = ref(0);

const caseName = computed(() => route.params.caseName);
const runsParam = computed(() => route.query.runs || "");

const runEntries = computed(() => {
  if (!runsParam.value) return [];
  return runsParam.value.split(",").map((entry) => {
    const [runId, evalName] = entry.split(":");
    return { runId, evalName };
  });
});

const evalType = computed(() => runEntries.value[0]?.evalName || "");
const inspectorComponent = computed(() => registry.get(evalType.value));

const evaluatorKeys = computed(() => {
  const first = casesData.value[0];
  return first?.scores ? Object.keys(first.scores) : [];
});

const runColors = ["#3498db", "#e74c3c", "#27ae60", "#9b59b6", "#f39c12"];
function getRunColor(idx) {
  return runColors[idx % runColors.length];
}

function barWidth(score) {
  if (score === undefined || score === null) return "0%";
  return `${Math.round(score * 100)}%`;
}

async function fetchCasesData() {
  loading.value = true;
  error.value = null;
  try {
    const results = await Promise.all(
      runEntries.value.map(async ({ runId, evalName }) => {
        const response = await fetch(
          `/api/evals/${runId}/${evalName}/case/${caseName.value}`,
        );
        if (!response.ok)
          throw new Error(`Failed to fetch case from ${runId}/${evalName}`);
        const data = await response.json();
        const summaryRes = await fetch(
          `/api/evals/${runId}/${evalName}/summary`,
        );
        const summary = summaryRes.ok ? await summaryRes.json() : {};
        return {
          ...data,
          runName: `${runId}:${evalName}`,
          runId,
          timestamp: summary.timestamp,
        };
      }),
    );
    casesData.value = results;
  } catch (e) {
    error.value = e.message;
  } finally {
    loading.value = false;
  }
}

watch([runEntries, caseName], () => {
  if (runEntries.value.length > 0 && caseName.value) fetchCasesData();
});

onMounted(() => {
  if (runEntries.value.length > 0 && caseName.value) {
    fetchCasesData();
  } else {
    loading.value = false;
    error.value = "No runs or case specified";
  }
});
</script>

<style scoped>
.breadcrumb { margin-bottom: 1rem; font-size: 0.875rem; color: #666; }
.breadcrumb a { color: #3498db; }
.breadcrumb span { margin: 0 0.5rem; }

.compare-header { margin-bottom: 1.5rem; }
.compare-header h1 { margin-bottom: 0.25rem; }
.subtitle { color: #666; font-size: 0.875rem; }

.scores-section {
  background: white;
  border-radius: 8px;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
  padding: 1.5rem;
  margin-bottom: 1.5rem;
}
.run-tabs {
  display: flex;
  flex-wrap: wrap;
  gap: 1rem;
  margin-bottom: 1.5rem;
  padding-bottom: 1rem;
  border-bottom: 1px solid #eee;
}
.run-tab {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.5rem 0.75rem;
  border-left: 4px solid;
  background: #f8f9fa;
  border-radius: 0 6px 6px 0;
}
.run-color { width: 10px; height: 10px; border-radius: 50%; }
.run-name { font-weight: 600; font-size: 0.875rem; }
.run-date { color: #666; font-size: 0.75rem; }

.scores-comparison { display: flex; flex-direction: column; gap: 1rem; }
.evaluator-row { display: flex; align-items: center; gap: 1rem; }
.evaluator-name { width: 160px; flex-shrink: 0; font-weight: 600; font-size: 0.875rem; }
.score-bars { flex: 1; display: flex; flex-direction: column; gap: 0.375rem; }
.score-bar-container { display: flex; align-items: center; gap: 0.75rem; }
.score-bar-wrapper {
  flex: 1; height: 20px; background: #f0f0f0;
  border-radius: 4px; overflow: hidden;
}
.score-bar { height: 100%; border-radius: 4px; transition: width 0.3s ease; }
.score-value { width: 48px; text-align: right; font-weight: 600; font-size: 0.875rem; }
.score-value.score-high { color: #27ae60; }
.score-value.score-medium { color: #f39c12; }
.score-value.score-low { color: #c0392b; }
.score-value.score-unknown { color: #999; }

.inspector-section { margin-top: 2rem; }
.inspector-section h2 { font-size: 1.25rem; margin-bottom: 0; }
.inspector-tabs {
  display: flex; border-bottom: 2px solid #e0e0e0;
}
.inspector-tab {
  display: flex; align-items: center; gap: 0.5rem;
  padding: 0.75rem 1.25rem; border: none; background: none;
  cursor: pointer; font-size: 0.875rem; font-weight: 600;
  color: #666; border-bottom: 3px solid transparent;
  margin-bottom: -2px; transition: all 0.2s;
}
.inspector-tab:hover { color: #333; background: #f8f9fa; }
.inspector-tab.active { color: #333; }
.inspector-content { padding-top: 1.5rem; }

.loading, .error { padding: 2rem; text-align: center; }
.error { color: #c0392b; }
</style>
