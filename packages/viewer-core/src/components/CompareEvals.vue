<template>
  <div class="compare-evals">
    <div class="breadcrumb">
      <router-link to="/">Evals</router-link>
      <span>/</span>
      <span>Compare</span>
    </div>

    <div v-if="loading" class="loading">Loading...</div>
    <div v-else-if="error" class="error">{{ error }}</div>

    <template v-else>
      <header class="compare-header">
        <h1>Compare Eval Runs</h1>
        <p class="subtitle">{{ evalType }} - {{ runNames.length }} runs</p>
      </header>

      <!-- Run selector tabs -->
      <div class="run-tabs">
        <div
          v-for="(run, idx) in summaries"
          :key="run.name"
          class="run-tab"
          :style="{ borderColor: getRunColor(idx) }"
        >
          <span
            class="run-color"
            :style="{ background: getRunColor(idx) }"
          ></span>
          <span class="run-name">{{ run.runId }}</span>
          <span class="run-date">{{ formatDate(run.timestamp) }}</span>
          <span v-if="getRunMeta(run.runId)?.git_commit" class="run-git">
            {{ getRunMeta(run.runId).git_commit
            }}{{ getRunMeta(run.runId).git_dirty ? "*" : "" }}
          </span>
          <span v-if="getRunMeta(run.runId)?.git_branch" class="run-branch">
            {{ getRunMeta(run.runId).git_branch }}
          </span>
          <span
            v-for="tag in getRunMeta(run.runId)?.tags || []"
            :key="tag"
            class="run-tag"
            >{{ tag }}</span
          >
        </div>
      </div>

      <!-- Aggregate Scores Comparison -->
      <section class="comparison-section">
        <h2>Aggregate Scores</h2>
        <div class="aggregate-comparison">
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
                v-for="(summary, idx) in summaries"
                :key="summary.name"
                class="score-bar-container"
              >
                <div class="score-bar-wrapper">
                  <div
                    class="score-bar"
                    :style="{
                      width: getBarWidth(summary.aggregates?.[evaluator]?.mean),
                      background: getRunColor(idx),
                    }"
                  ></div>
                </div>
                <span
                  class="score-value"
                  :class="getScoreClass(summary.aggregates?.[evaluator]?.mean)"
                >
                  {{ formatPercent(summary.aggregates?.[evaluator]?.mean) }}
                </span>
                <span class="score-range">
                  ({{ formatPercent(summary.aggregates?.[evaluator]?.min) }} -
                  {{ formatPercent(summary.aggregates?.[evaluator]?.max) }})
                </span>
              </div>
            </div>
          </div>
        </div>
      </section>

      <!-- Case-level Comparison -->
      <section class="comparison-section">
        <h2>Case Comparison</h2>
        <div class="case-selector">
          <label>Select case to compare:</label>
          <select v-model="selectedCase">
            <option value="">-- All cases overview --</option>
            <option
              v-for="caseName in commonCases"
              :key="caseName"
              :value="caseName"
            >
              {{ caseName }}
            </option>
          </select>
        </div>

        <!-- Overview table when no specific case selected -->
        <div v-if="!selectedCase" class="cases-overview">
          <table class="comparison-table">
            <thead>
              <tr>
                <th>Case</th>
                <th v-for="evaluator in evaluatorKeys" :key="evaluator">
                  {{ formatEvaluatorName(evaluator) }}
                </th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="caseName in commonCases" :key="caseName">
                <td class="case-name-cell">
                  <button class="case-link" @click="selectedCase = caseName">
                    {{ caseName }}
                  </button>
                </td>
                <td v-for="evaluator in evaluatorKeys" :key="evaluator">
                  <div class="score-comparison-cell">
                    <span
                      v-for="(summary, idx) in summaries"
                      :key="summary.name"
                      class="score-chip"
                      :style="{ borderColor: getRunColor(idx) }"
                    >
                      {{
                        formatPercent(
                          getCaseScore(summary, caseName, evaluator),
                        )
                      }}
                    </span>
                    <span
                      v-if="summaries.length === 2"
                      class="delta"
                      :class="getDeltaClass(caseName, evaluator)"
                    >
                      {{ formatDelta(caseName, evaluator) }}
                    </span>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <!-- Detailed case comparison -->
        <div v-else class="case-detail-comparison">
          <div class="case-detail-header">
            <h3>{{ selectedCase }}</h3>
            <button class="back-btn" @click="selectedCase = ''">
              Back to overview
            </button>
          </div>

          <!-- Case scores side by side -->
          <div class="case-scores-row">
            <div
              v-for="(summary, idx) in summaries"
              :key="summary.name"
              class="case-score-card"
              :style="{ borderTopColor: getRunColor(idx) }"
            >
              <div class="card-header">
                <span
                  class="run-indicator"
                  :style="{ background: getRunColor(idx) }"
                ></span>
                {{ summary.runId }}
              </div>
              <div class="score-grid">
                <div
                  v-for="evaluator in evaluatorKeys"
                  :key="evaluator"
                  class="score-item"
                >
                  <span class="score-label">{{
                    formatEvaluatorName(evaluator)
                  }}</span>
                  <span
                    class="score-value"
                    :class="
                      getScoreClass(
                        getCaseScore(summary, selectedCase, evaluator),
                      )
                    "
                  >
                    {{
                      formatPercent(
                        getCaseScore(summary, selectedCase, evaluator),
                      )
                    }}
                  </span>
                </div>
              </div>
            </div>
          </div>

          <!-- Question-level comparison button -->
          <div class="question-compare-section">
            <button class="compare-questions-btn" @click="goToQuestionCompare">
              Compare Questions Detail
            </button>
          </div>
        </div>
      </section>
    </template>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import {
  formatEvaluatorName,
  formatPercent,
  getScoreClass,
  formatDate,
} from "../utils/evalHelpers.js";

const route = useRoute();
const router = useRouter();

const summaries = ref([]);
const runMetas = ref({});
const loading = ref(true);
const error = ref(null);
const selectedCase = ref("");

// runs query param format: "runId:evalName,runId:evalName,..."
const runEntries = computed(() => {
  const runsParam = route.query.runs;
  if (!runsParam) return [];
  return runsParam.split(",").map((entry) => {
    const [runId, evalName] = entry.split(":");
    return { runId, evalName };
  });
});

const runNames = computed(() =>
  runEntries.value.map((e) => `${e.runId}:${e.evalName}`),
);

const evalType = computed(() => {
  if (runEntries.value.length === 0) return "";
  return runEntries.value[0].evalName;
});

const evaluatorKeys = computed(() => {
  if (summaries.value.length === 0) return [];
  const firstAggregates = summaries.value[0]?.aggregates;
  if (!firstAggregates) return [];
  return Object.keys(firstAggregates);
});

const commonCases = computed(() => {
  if (summaries.value.length === 0) return [];
  const caseSets = summaries.value.map(
    (s) => new Set((s.cases || []).map((c) => c.name)),
  );
  // Find intersection of all case names
  const first = caseSets[0];
  const common = [...first].filter((name) =>
    caseSets.every((set) => set.has(name)),
  );
  return common.sort();
});

// Color palette for runs
const runColors = ["#3498db", "#e74c3c", "#27ae60", "#9b59b6", "#f39c12"];

function getRunColor(idx) {
  return runColors[idx % runColors.length];
}

function getRunMeta(runId) {
  return runMetas.value[runId] || null;
}

async function fetchSummaries() {
  loading.value = true;
  error.value = null;

  try {
    // Fetch run metadata and summaries in parallel
    const [runsResponse, ...summaryResponses] = await Promise.all([
      fetch("/api/evals"),
      ...runEntries.value.map(({ runId, evalName }) =>
        fetch(`/api/evals/${runId}/${evalName}/summary`),
      ),
    ]);

    if (runsResponse.ok) {
      const allRuns = await runsResponse.json();
      const metaMap = {};
      for (const run of allRuns) {
        metaMap[run.run_id] = run;
      }
      runMetas.value = metaMap;
    }

    const results = await Promise.all(
      summaryResponses.map(async (response, i) => {
        const { runId, evalName } = runEntries.value[i];
        if (!response.ok)
          throw new Error(`Failed to fetch ${runId}/${evalName}`);
        const data = await response.json();
        return { ...data, name: `${runId}:${evalName}`, runId, evalName };
      }),
    );
    summaries.value = results;
  } catch (e) {
    error.value = e.message;
  } finally {
    loading.value = false;
  }
}

function getBarWidth(value) {
  if (value === undefined || value === null) return "0%";
  return `${value * 100}%`;
}

function getCaseScore(summary, caseName, evaluator) {
  const caseData = (summary.cases || []).find((c) => c.name === caseName);
  return caseData?.scores?.[evaluator];
}

function formatDelta(caseName, evaluator) {
  if (summaries.value.length !== 2) return "";
  const score1 = getCaseScore(summaries.value[0], caseName, evaluator);
  const score2 = getCaseScore(summaries.value[1], caseName, evaluator);
  if (score1 === undefined || score2 === undefined) return "";
  const delta = (score2 - score1) * 100;
  if (delta === 0) return "0";
  return delta > 0 ? `+${delta.toFixed(0)}` : delta.toFixed(0);
}

function getDeltaClass(caseName, evaluator) {
  if (summaries.value.length !== 2) return "";
  const score1 = getCaseScore(summaries.value[0], caseName, evaluator);
  const score2 = getCaseScore(summaries.value[1], caseName, evaluator);
  if (score1 === undefined || score2 === undefined) return "";
  const delta = score2 - score1;
  if (delta > 0.01) return "delta-positive";
  if (delta < -0.01) return "delta-negative";
  return "delta-neutral";
}

function goToQuestionCompare() {
  if (selectedCase.value && runEntries.value.length >= 2) {
    const runs = runEntries.value
      .map((e) => `${e.runId}:${e.evalName}`)
      .join(",");
    router.push(
      `/compare/case/${selectedCase.value}?runs=${encodeURIComponent(runs)}`,
    );
  }
}

watch(runNames, () => {
  if (runNames.value.length > 0) {
    fetchSummaries();
  }
});

onMounted(() => {
  if (runNames.value.length > 0) {
    fetchSummaries();
  } else {
    loading.value = false;
    error.value = "No runs specified for comparison";
  }
});
</script>

<style scoped>
.breadcrumb {
  margin-bottom: 1rem;
  font-size: 0.875rem;
  color: #666;
}

.breadcrumb a {
  color: #3498db;
}

.breadcrumb span {
  margin: 0 0.5rem;
}

.compare-header {
  margin-bottom: 1.5rem;
}

.compare-header h1 {
  margin-bottom: 0.25rem;
}

.subtitle {
  color: #666;
  font-size: 0.875rem;
}

.run-tabs {
  display: flex;
  flex-wrap: wrap;
  gap: 0.75rem;
  margin-bottom: 2rem;
}

.run-tab {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  background: white;
  padding: 0.75rem 1rem;
  border-radius: 8px;
  border-left: 4px solid;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
}

.run-color {
  width: 12px;
  height: 12px;
  border-radius: 50%;
}

.run-name {
  font-weight: 600;
}

.run-date {
  color: #666;
  font-size: 0.75rem;
}

.run-git {
  font-family: monospace;
  font-size: 0.7rem;
  background: #f0f0f0;
  padding: 0.1rem 0.35rem;
  border-radius: 3px;
  color: #555;
}

.run-branch {
  font-family: monospace;
  font-size: 0.7rem;
  color: #888;
}

.run-tag {
  font-size: 0.65rem;
  background: #e8d4f8;
  color: #6b21a8;
  padding: 0.1rem 0.35rem;
  border-radius: 3px;
  font-weight: 500;
}

.comparison-section {
  margin-bottom: 2rem;
}

.comparison-section h2 {
  font-size: 1.25rem;
  margin-bottom: 1rem;
  padding-bottom: 0.5rem;
  border-bottom: 1px solid #eee;
}

.aggregate-comparison {
  background: white;
  border-radius: 8px;
  padding: 1.5rem;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
}

.evaluator-row {
  margin-bottom: 1.5rem;
}

.evaluator-row:last-child {
  margin-bottom: 0;
}

.evaluator-name {
  font-weight: 600;
  margin-bottom: 0.5rem;
}

.score-bars {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.score-bar-container {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

.score-bar-wrapper {
  flex: 1;
  height: 24px;
  background: #f5f5f5;
  border-radius: 4px;
  overflow: hidden;
}

.score-bar {
  height: 100%;
  border-radius: 4px;
  transition: width 0.3s ease;
}

.score-value {
  font-weight: 600;
  min-width: 48px;
}

.score-range {
  color: #999;
  font-size: 0.75rem;
  min-width: 80px;
}

.case-selector {
  display: flex;
  align-items: center;
  gap: 1rem;
  margin-bottom: 1rem;
}

.case-selector label {
  font-weight: 500;
}

.case-selector select {
  padding: 0.5rem 1rem;
  border: 1px solid #ddd;
  border-radius: 6px;
  font-size: 0.875rem;
  min-width: 250px;
}

.cases-overview {
  background: white;
  border-radius: 8px;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
  overflow-x: auto;
}

.comparison-table {
  width: 100%;
  border-collapse: collapse;
}

.comparison-table th,
.comparison-table td {
  padding: 0.75rem 1rem;
  text-align: left;
  border-bottom: 1px solid #eee;
}

.comparison-table th {
  background: #f8f9fa;
  font-weight: 600;
  font-size: 0.875rem;
}

.comparison-table th:first-child,
.comparison-table td:first-child {
  position: sticky;
  left: 0;
  z-index: 1;
  background: white;
}

.comparison-table th:first-child {
  background: #f8f9fa;
}

.case-name-cell {
  font-weight: 500;
}

.case-link {
  background: none;
  border: none;
  color: #3498db;
  cursor: pointer;
  font-size: inherit;
  font-weight: inherit;
  padding: 0;
  text-align: left;
}

.case-link:hover {
  text-decoration: underline;
}

.score-comparison-cell {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.score-chip {
  display: inline-block;
  padding: 0.25rem 0.5rem;
  border-radius: 4px;
  font-size: 0.75rem;
  font-weight: 600;
  background: #f8f9fa;
  border: 2px solid;
}

.delta {
  font-size: 0.75rem;
  font-weight: 600;
  padding: 0.125rem 0.375rem;
  border-radius: 3px;
}

.delta-positive {
  background: #d4edda;
  color: #155724;
}

.delta-negative {
  background: #f8d7da;
  color: #721c24;
}

.delta-neutral {
  background: #f5f5f5;
  color: #666;
}

.case-detail-comparison {
  background: white;
  border-radius: 8px;
  padding: 1.5rem;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
}

.case-detail-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 1.5rem;
}

.case-detail-header h3 {
  margin: 0;
}

.back-btn {
  padding: 0.5rem 1rem;
  background: #f8f9fa;
  border: 1px solid #ddd;
  border-radius: 6px;
  cursor: pointer;
  font-size: 0.875rem;
}

.back-btn:hover {
  background: #e9ecef;
}

.case-scores-row {
  display: flex;
  gap: 1rem;
  flex-wrap: wrap;
}

.case-score-card {
  flex: 1;
  min-width: 250px;
  border-top: 4px solid;
  background: #f8f9fa;
  border-radius: 8px;
  padding: 1rem;
}

.card-header {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-weight: 600;
  margin-bottom: 1rem;
}

.run-indicator {
  width: 10px;
  height: 10px;
  border-radius: 50%;
}

.score-grid {
  display: grid;
  gap: 0.75rem;
}

.score-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.score-label {
  color: #666;
  font-size: 0.875rem;
}

.score-item .score-value {
  font-size: 1rem;
}

.question-compare-section {
  margin-top: 1.5rem;
  padding-top: 1.5rem;
  border-top: 1px solid #eee;
}

.compare-questions-btn {
  padding: 0.75rem 1.5rem;
  background: #3498db;
  color: white;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  font-size: 0.875rem;
  font-weight: 600;
}

.compare-questions-btn:hover {
  background: #2980b9;
}

.score-high {
  color: #155724;
}

.score-medium {
  color: #856404;
}

.score-low {
  color: #721c24;
}

.loading,
.error {
  padding: 2rem;
  text-align: center;
}

.error {
  color: #c0392b;
}
</style>
