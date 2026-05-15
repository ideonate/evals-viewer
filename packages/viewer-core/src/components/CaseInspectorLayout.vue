<template>
  <div class="case-inspector">
    <div v-if="!embedded" class="breadcrumb">
      <router-link to="/">Evals</router-link>
      <span>/</span>
      <router-link :to="`/eval/${runId}/${evalName}`">{{
        evalName
      }}</router-link>
      <span>/</span>
      <span>{{ caseName }}</span>
    </div>

    <div v-if="loading" class="loading">Loading...</div>
    <div v-else-if="error" class="error">{{ error }}</div>

    <template v-else>
      <header class="case-header">
        <div class="header-left">
          <h1>{{ caseName }}</h1>
          <div class="case-meta">
            <div v-if="caseData.caseInput?.description" class="case-description">
              {{ caseData.caseInput.description }}
            </div>
            <div v-if="tags.length" class="meta-tags">
              <span
                v-for="tag in tags"
                :key="tag.label"
                class="meta-tag"
                :class="tag.class"
              >{{ tag.label }}</span>
            </div>
            <slot name="meta" />
          </div>
          <div
            v-if="
              caseData.output?.input_tokens != null ||
              caseData.output?.output_tokens != null
            "
            class="token-usage"
          >
            {{ (caseData.output?.input_tokens || 0).toLocaleString() }} in /
            {{ (caseData.output?.output_tokens || 0).toLocaleString() }} out
            tokens
            <span v-if="caseData.output?.cost_usd != null" class="token-cost">
              &middot; ${{ caseData.output.cost_usd.toFixed(4) }}
            </span>
            <span
              v-if="modelKeys.length"
              class="token-by-model-inline"
            >
              &middot;
              <template v-if="multipleModels">(</template
              ><span
                v-for="(usage, model, idx) in caseData.output.usage_by_model"
                :key="model"
                >{{ idx > 0 ? ", " : "" }}{{ model }}<template v-if="usage.cost_usd != null && multipleModels">
                  ${{ usage.cost_usd.toFixed(4) }}</template
                ></span
              ><template v-if="multipleModels">)</template>
            </span>
          </div>
          <div v-if="logfireTraceUrl" class="logfire-link-row">
            <a :href="logfireTraceUrl" target="_blank" rel="noopener" class="logfire-link">
              Logfire ↗
            </a>
          </div>
        </div>
        <div v-if="caseData.scores" class="stats-bar">
          <div
            v-for="(value, key) in caseData.scores"
            :key="key"
            class="stat-card"
          >
            <div class="stat-name">{{ formatEvaluatorName(key) }}</div>
            <div
              class="stat-value"
              :class="getScoreClass(typeof value === 'number' ? value : 0)"
            >
              {{
                typeof value === "number" ? (value * 100).toFixed(0) + "%" : "-"
              }}
            </div>
          </div>
        </div>
      </header>

      <slot />

      <!-- Judge Reasoning — shown for any eval type with LLM judge reasons -->
      <div v-if="caseData.judgeReasons" class="panel judges-panel">
        <h2>Judge Reasoning</h2>
        <div class="judges-grid">
          <div
            v-for="(reason, evaluator) in caseData.judgeReasons"
            :key="evaluator"
            class="judge-card"
          >
            <div class="judge-header">
              <span class="judge-name">{{
                formatEvaluatorName(evaluator)
              }}</span>
              <span
                v-if="caseData.scores && caseData.scores[evaluator] != null"
                class="judge-score"
                :class="getScoreClass(caseData.scores[evaluator])"
              >
                {{ (caseData.scores[evaluator] * 100).toFixed(0) }}%
              </span>
            </div>
            <p class="judge-reason">{{ reason }}</p>
          </div>
        </div>
      </div>
    </template>
  </div>
</template>

<script setup>
import { inject, computed } from "vue";
import { formatEvaluatorName, getScoreClass } from "../utils/evalHelpers.js";
import { CASE_INSPECTOR_DATA } from "../composables/useCaseInspector.js";

const props = defineProps({
  runId: { type: String, required: true },
  evalName: { type: String, required: true },
  caseName: { type: String, required: true },
  loading: { type: Boolean, default: false },
  error: { type: String, default: null },
  caseData: { type: Object, default: () => ({}) },
  tags: { type: Array, default: () => [] },
});

const embedded = inject(CASE_INSPECTOR_DATA, null) !== null;
const modelKeys = computed(() => {
  const ubm = props.caseData?.output?.usage_by_model;
  return ubm ? Object.keys(ubm) : [];
});

const multipleModels = computed(() => modelKeys.value.length > 1);

const logfireTraceUrl = computed(() => {
  const traceId = props.caseData?.output?.logfire_trace_id;
  const projectUrl = props.caseData?.logfireProjectUrl;
  if (!traceId || !projectUrl) return null;
  const spanId = props.caseData?.output?.logfire_span_id;
  const params = new URLSearchParams({ traceId });
  if (spanId) params.set("spanId", spanId);
  return `${projectUrl}?${params}`;
});
</script>

<style>
/* Shared case inspector styles — unscoped so child components inherit them */

.breadcrumb {
  margin-bottom: 1rem;
  font-size: 0.875rem;
  color: #666;
}
.breadcrumb a { color: #3498db; }
.breadcrumb span { margin: 0 0.5rem; }

.case-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 1rem;
  gap: 1rem;
}
.header-left h1 { margin-bottom: 0.25rem; font-size: 1.5rem; }
.case-meta { color: #666; font-size: 0.875rem; }
.token-usage { font-size: 0.75rem; color: #666; margin-top: 0.25rem; }
.token-by-model-inline { color: #999; }

/* Description + tag pills — shared across all inspectors */
.case-description {
  font-size: 0.8rem;
  color: #6c757d;
  font-style: italic;
  margin-bottom: 0.25rem;
}
.meta-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 0.375rem;
  margin-top: 0.125rem;
}
.meta-tag {
  display: inline-block;
  font-size: 0.7rem;
  font-weight: 600;
  padding: 0.15rem 0.5rem;
  border-radius: 3px;
}
.tag-info    { background: #cce5ff; color: #004085; }
.tag-neutral { background: #e9ecef; color: #495057; }
.tag-warning { background: #fff3cd; color: #856404; }
.tag-good    { background: #d4edda; color: #155724; }
.tag-danger  { background: #f8d7da; color: #721c24; }
.tag-error   { background: #f8d7da; color: #721c24; }

.stats-bar { display: flex; flex-wrap: wrap; gap: 0.75rem; }
.stat-card {
  background: white;
  border-radius: 8px;
  padding: 0.75rem 1.25rem;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
  min-width: 120px;
}
.stat-name { font-size: 0.75rem; color: #666; margin-bottom: 0.25rem; }
.stat-value { font-size: 1.5rem; font-weight: 700; }

.panel {
  background: white;
  border-radius: 8px;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
.panel h2 {
  padding: 0.75rem 1rem;
  border-bottom: 1px solid #eee;
  font-size: 1rem;
  margin: 0;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.score-high { color: #155724; }
.score-medium { color: #856404; }
.score-low { color: #721c24; }
.score-unknown { color: #999; }

.logfire-link-row { margin-top: 0.25rem; }
.logfire-link {
  display: inline-block;
  font-size: 0.7rem;
  font-weight: 600;
  color: #e76e39;
  text-decoration: none;
  padding: 0.1rem 0.4rem;
  border: 1px solid #f3b48a;
  border-radius: 3px;
  background: #fff7f3;
}
.logfire-link:hover { background: #fde9d9; border-color: #e76e39; }

.loading, .error { padding: 2rem; text-align: center; }
.error { color: #c0392b; }
.empty-state { padding: 2rem; text-align: center; color: #999; }

.judges-panel { margin-top: 1.5rem; }
.judges-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
  gap: 1rem;
  padding: 1rem;
}
.judge-card { border: 1px solid #e0e0e0; border-radius: 6px; padding: 0.75rem 1rem; }
.judge-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.5rem; }
.judge-name { font-weight: 600; font-size: 0.875rem; }
.judge-score { font-weight: 700; font-size: 0.875rem; }
.judge-reason { font-size: 0.8125rem; color: #444; line-height: 1.5; margin: 0; white-space: pre-wrap; }
</style>
