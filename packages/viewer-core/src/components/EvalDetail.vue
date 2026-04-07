<template>
  <div class="eval-detail">
    <div class="breadcrumb">
      <router-link to="/">Evals</router-link>
      <span>/</span>
      <span>{{ runId }}</span>
      <span>/</span>
      <span>{{ evalName }}</span>
    </div>

    <div v-if="loading" class="loading">Loading...</div>
    <div v-else-if="error" class="error">{{ error }}</div>

    <template v-else>
      <header class="eval-header">
        <h1>{{ evalName }}</h1>
        <p v-if="summary.timestamp" class="timestamp">
          {{ formatDate(summary.timestamp) }}
        </p>
      </header>

      <section class="aggregates-section">
        <h2>Aggregate Scores</h2>
        <div class="aggregate-cards">
          <div
            v-for="(value, key) in summary.aggregates"
            :key="key"
            class="aggregate-card"
          >
            <div class="aggregate-name">{{ formatEvaluatorName(key) }}</div>
            <div class="aggregate-score" :class="getScoreClass(value.mean)">
              {{ (value.mean * 100).toFixed(1) }}%
            </div>
            <div class="aggregate-range">
              <span>Min: {{ (value.min * 100).toFixed(0) }}%</span>
              <span>Max: {{ (value.max * 100).toFixed(0) }}%</span>
            </div>
          </div>
        </div>
      </section>

      <section
        v-if="tokenTotals.input > 0 || tokenTotals.output > 0"
        class="token-summary-section"
      >
        <h2>Token Usage</h2>
        <div class="token-summary-cards">
          <div class="token-card">
            <div class="token-label">Total Input Tokens</div>
            <div class="token-value">
              {{ tokenTotals.input.toLocaleString() }}
            </div>
          </div>
          <div class="token-card">
            <div class="token-label">Total Output Tokens</div>
            <div class="token-value">
              {{ tokenTotals.output.toLocaleString() }}
            </div>
          </div>
          <div class="token-card">
            <div class="token-label">Avg Input / Case</div>
            <div class="token-value">
              {{ tokenTotals.avgInput.toLocaleString() }}
            </div>
          </div>
          <div class="token-card">
            <div class="token-label">Avg Output / Case</div>
            <div class="token-value">
              {{ tokenTotals.avgOutput.toLocaleString() }}
            </div>
          </div>
          <div v-if="tokenTotals.totalCost != null" class="token-card">
            <div class="token-label">Total Cost</div>
            <div class="token-value">
              ${{ tokenTotals.totalCost.toFixed(4) }}
            </div>
          </div>
          <div v-if="tokenTotals.avgCost != null" class="token-card">
            <div class="token-label">Avg Cost / Case</div>
            <div class="token-value">${{ tokenTotals.avgCost.toFixed(4) }}</div>
          </div>
        </div>
        <div
          v-if="Object.keys(tokenTotals.byModel).length > 0"
          class="token-by-model"
        >
          <h3>By Model</h3>
          <table class="model-usage-table">
            <thead>
              <tr>
                <th>Model</th>
                <th>Input Tokens</th>
                <th>Output Tokens</th>
                <th>Cost</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(usage, model) in tokenTotals.byModel" :key="model">
                <td class="model-name">{{ model }}</td>
                <td>{{ usage.input_tokens.toLocaleString() }}</td>
                <td>{{ usage.output_tokens.toLocaleString() }}</td>
                <td>
                  {{
                    usage.cost_usd != null
                      ? "$" + usage.cost_usd.toFixed(4)
                      : "–"
                  }}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <section class="cases-section">
        <h2>
          Cases ({{ summary.cases?.length || 0 }})
          <span v-if="errorCount" class="error-count">
            {{ errorCount }} error{{ errorCount > 1 ? "s" : "" }}
          </span>
        </h2>
        <table class="cases-table">
          <thead>
            <tr>
              <th>Case Name</th>
              <th v-for="col in summaryColumns" :key="col.key">
                {{ col.label }}
              </th>
              <th v-for="key in evaluatorKeys" :key="key">
                {{ formatEvaluatorName(key) }}
              </th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="c in summary.cases"
              :key="c.name"
              @click="goToCase(c.name)"
              class="case-row"
              :class="{ 'case-error': c.success === false }"
            >
              <td class="case-name">
                {{ c.name }}
                <span v-if="c.success === false" class="error-badge">
                  ERROR
                </span>
              </td>
              <td
                v-if="c.success === false"
                :colspan="summaryColumns.length + evaluatorKeys.length"
                class="error-message"
              >
                {{ c.error || "Unknown error" }}
              </td>
              <template v-else>
                <td v-for="col in summaryColumns" :key="col.key">
                  {{ c.output_summary?.[col.key] ?? "-" }}
                </td>
                <td v-for="key in evaluatorKeys" :key="key" class="score-cell">
                  <span
                    v-if="c.scores && c.scores[key] !== undefined"
                    class="score-badge"
                    :class="getScoreClass(c.scores[key])"
                  >
                    {{ (c.scores[key] * 100).toFixed(0) }}%
                  </span>
                  <span v-else>-</span>
                </td>
              </template>
            </tr>
          </tbody>
        </table>
      </section>
    </template>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from "vue";
import { useRoute, useRouter } from "vue-router";

const route = useRoute();
const router = useRouter();

const runId = computed(() => route.params.runId);
const evalName = computed(() => route.params.evalName);
const summary = ref({});
const loading = ref(true);
const error = ref(null);

const evaluatorKeys = computed(() => {
  if (!summary.value.aggregates) return [];
  return Object.keys(summary.value.aggregates);
});

const errorCount = computed(() => {
  const cases = summary.value.cases || [];
  return cases.filter((c) => c.success === false).length;
});

// Column labels for output_summary fields
const SUMMARY_COLUMN_LABELS = {
  total_questions: "Questions",
  questions_with_evidence: "With Evidence",
  mappings_count: "Mappings",
  quotes_count: "Quotes",
  strengths_count: "Strengths",
  weaknesses_count: "Weaknesses",
};

// Dynamically determine which output_summary columns to show
// based on what data is actually present across cases
const summaryColumns = computed(() => {
  const cases = summary.value.cases || [];
  if (cases.length === 0) return [];

  // Collect all keys that have non-null values in any case
  const keysWithData = new Set();
  for (const c of cases) {
    if (c.output_summary) {
      for (const [key, val] of Object.entries(c.output_summary)) {
        if (val !== null && val !== undefined) {
          keysWithData.add(key);
        }
      }
    }
  }

  // Return columns in a stable order, only for keys with data
  const orderedKeys = [
    "total_questions",
    "questions_with_evidence",
    "mappings_count",
    "quotes_count",
    "strengths_count",
    "weaknesses_count",
  ];

  return orderedKeys
    .filter((key) => keysWithData.has(key))
    .map((key) => ({
      key,
      label: SUMMARY_COLUMN_LABELS[key] || key,
    }));
});

const tokenTotals = computed(() => {
  const cases = summary.value.cases || [];
  let input = 0;
  let output = 0;
  let totalCost = 0;
  let anyCost = false;
  let count = 0;
  const byModel = {};
  for (const c of cases) {
    if (c.output_summary?.input_tokens != null) {
      input += c.output_summary.input_tokens;
      output += c.output_summary.output_tokens || 0;
      count++;
    }
    if (c.output_summary?.cost_usd != null) {
      totalCost += c.output_summary.cost_usd;
      anyCost = true;
    }
    const modelUsage = c.output_summary?.usage_by_model;
    if (modelUsage) {
      for (const [model, usage] of Object.entries(modelUsage)) {
        if (!byModel[model])
          byModel[model] = { input_tokens: 0, output_tokens: 0, cost_usd: 0 };
        byModel[model].input_tokens += usage.input_tokens || 0;
        byModel[model].output_tokens += usage.output_tokens || 0;
        if (usage.cost_usd != null) byModel[model].cost_usd += usage.cost_usd;
      }
    }
  }
  return {
    input,
    output,
    totalCost: anyCost ? totalCost : null,
    avgInput: count > 0 ? Math.round(input / count) : 0,
    avgOutput: count > 0 ? Math.round(output / count) : 0,
    avgCost: anyCost && count > 0 ? totalCost / count : null,
    byModel,
  };
});

async function fetchSummary() {
  try {
    const response = await fetch(
      `/api/evals/${runId.value}/${evalName.value}/summary`,
    );
    if (!response.ok) throw new Error("Failed to fetch eval summary");
    summary.value = await response.json();
  } catch (e) {
    error.value = e.message;
  } finally {
    loading.value = false;
  }
}

function formatDate(timestamp) {
  return new Date(timestamp).toLocaleString();
}

function formatEvaluatorName(name) {
  // snake_case: replace underscores with spaces and title-case
  if (name.includes("_")) {
    return name.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
  }
  // PascalCase: strip "Evaluator" suffix and add spaces
  return name
    .replace("Evaluator", "")
    .replace(/([A-Z])/g, " $1")
    .trim();
}

function getScoreClass(score) {
  if (score >= 0.8) return "score-high";
  if (score >= 0.5) return "score-medium";
  return "score-low";
}

function goToCase(caseName) {
  router.push(`/eval/${runId.value}/${evalName.value}/case/${caseName}`);
}

onMounted(fetchSummary);
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

.eval-header {
  margin-bottom: 2rem;
}

.eval-header h1 {
  margin-bottom: 0.5rem;
}

.timestamp {
  color: #666;
}

.aggregates-section {
  margin-bottom: 2rem;
}

.aggregates-section h2 {
  margin-bottom: 1rem;
  font-size: 1.25rem;
}

.aggregate-cards {
  display: flex;
  flex-wrap: wrap;
  gap: 1rem;
}

.aggregate-card {
  background: white;
  border-radius: 8px;
  padding: 1rem 1.5rem;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
  min-width: 150px;
}

.aggregate-name {
  font-size: 0.875rem;
  color: #666;
  margin-bottom: 0.5rem;
}

.aggregate-score {
  font-size: 2rem;
  font-weight: 700;
  margin-bottom: 0.5rem;
}

.aggregate-range {
  font-size: 0.75rem;
  color: #999;
  display: flex;
  gap: 1rem;
}

.token-summary-section {
  margin-bottom: 2rem;
}

.token-summary-section h2 {
  margin-bottom: 1rem;
  font-size: 1.25rem;
}

.token-summary-cards {
  display: flex;
  flex-wrap: wrap;
  gap: 1rem;
}

.token-card {
  background: white;
  border-radius: 8px;
  padding: 1rem 1.5rem;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
  min-width: 150px;
}

.token-label {
  font-size: 0.875rem;
  color: #666;
  margin-bottom: 0.5rem;
}

.token-value {
  font-size: 1.5rem;
  font-weight: 700;
  color: #2c3e50;
}

.token-by-model {
  margin-top: 1rem;
}

.token-by-model h3 {
  font-size: 1rem;
  margin-bottom: 0.5rem;
  color: #666;
}

.model-usage-table {
  background: white;
  border-radius: 8px;
  overflow: hidden;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
  border-collapse: collapse;
}

.model-usage-table th,
.model-usage-table td {
  padding: 0.5rem 1rem;
  text-align: left;
  border-bottom: 1px solid #eee;
}

.model-usage-table th {
  background: #f8f9fa;
  font-weight: 600;
  font-size: 0.8rem;
}

.model-usage-table .model-name {
  font-family: monospace;
  font-size: 0.85rem;
}

.cases-section h2 {
  margin-bottom: 1rem;
  font-size: 1.25rem;
}

.cases-table {
  width: 100%;
  background: white;
  border-radius: 8px;
  overflow: hidden;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
  border-collapse: collapse;
}

.cases-table th,
.cases-table td {
  padding: 0.75rem 1rem;
  text-align: left;
  border-bottom: 1px solid #eee;
}

.cases-table th {
  background: #f8f9fa;
  font-weight: 600;
  font-size: 0.875rem;
}

.case-row {
  cursor: pointer;
  transition: background 0.2s;
}

.case-row:hover {
  background: #f8f9fa;
}

.case-name {
  font-weight: 500;
}

.score-cell {
  text-align: center;
}

.score-badge {
  display: inline-block;
  padding: 0.25rem 0.5rem;
  border-radius: 4px;
  font-size: 0.875rem;
  font-weight: 600;
}

.error-count {
  background: #c0392b;
  color: white;
  padding: 0.15rem 0.5rem;
  border-radius: 3px;
  font-size: 0.75rem;
  font-weight: 600;
  margin-left: 0.5rem;
  vertical-align: middle;
}

.case-error {
  background: #fdf0ef;
}

.case-error:hover {
  background: #fbe3e0 !important;
}

.error-badge {
  background: #c0392b;
  color: white;
  padding: 0.1rem 0.35rem;
  border-radius: 3px;
  font-size: 0.7rem;
  font-weight: 600;
  margin-left: 0.5rem;
  vertical-align: middle;
}

.error-message {
  color: #721c24;
  font-size: 0.85rem;
  font-family: monospace;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 0;
}

.score-high {
  background: #d4edda;
  color: #155724;
}

.score-medium {
  background: #fff3cd;
  color: #856404;
}

.score-low {
  background: #f8d7da;
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
