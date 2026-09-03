<template>
  <div
    class="card"
    :class="{
      'compare-mode': compareMode,
      selected: isSelected,
      disabled: compareMode && !canSelect,
    }"
    @click="$emit('click', $event)"
  >
    <div v-if="compareMode" class="checkbox-wrapper" @click.stop>
      <input
        type="checkbox"
        :checked="isSelected"
        :disabled="!canSelect"
        @change="$emit('toggle')"
      />
    </div>
    <div class="card-content">
      <h2 v-if="!showTimestampOnly">{{ item.name }}</h2>
      <p class="meta">
        <span class="cases">{{ item.case_count }} cases</span>
        <span v-if="item.error_count" class="error-count">
          {{ item.error_count }} error{{ item.error_count > 1 ? "s" : "" }}
        </span>
        <span v-if="showTimestampOnly && runTimestamp" class="timestamp">
          {{ formatDate(runTimestamp) }}
        </span>
        <span v-if="showTimestampOnly && gitCommit" class="git-ref">
          {{ gitCommit }}{{ gitDirty ? "*" : "" }}
        </span>
        <span v-if="showTimestampOnly && gitBranch" class="git-branch-badge">
          {{ gitBranch }}
        </span>
        <span v-if="showTimestampOnly && user" class="user-badge">
          <span v-if="shared" class="shared-icon" title="Shared run">☁</span>
          {{ user }}
        </span>
        <span v-for="tag in tags" :key="tag" class="tag-badge">{{ tag }}</span>
      </p>
      <div v-if="item.aggregates" class="aggregates">
        <div
          v-for="(value, key) in item.aggregates"
          :key="key"
          class="aggregate"
        >
          <span class="label">{{ formatEvaluatorName(key) }}</span>
          <span class="value" :class="getScoreClass(value.mean)">
            {{ (value.mean * 100).toFixed(0) }}%
          </span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
const props = defineProps({
  item: { type: Object, required: true },
  runId: { type: String, default: "" },
  runTimestamp: { type: String, default: null },
  gitCommit: { type: String, default: null },
  gitBranch: { type: String, default: null },
  gitDirty: { type: Boolean, default: false },
  user: { type: String, default: null },
  shared: { type: Boolean, default: false },
  tags: { type: Array, default: () => [] },
  compareMode: { type: Boolean, default: false },
  isSelected: { type: Boolean, default: false },
  canSelect: { type: Boolean, default: true },
  showTimestampOnly: { type: Boolean, default: false },
});

defineEmits(["click", "toggle"]);

function formatDate(timestamp) {
  return new Date(timestamp).toLocaleString();
}

function formatEvaluatorName(name) {
  if (name.includes("_")) {
    return name.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
  }
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
</script>

<style scoped>
.card {
  background: white;
  border-radius: 8px;
  padding: 1.5rem;
  text-decoration: none;
  color: inherit;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
  transition:
    transform 0.2s,
    box-shadow 0.2s,
    border-color 0.2s;
  cursor: pointer;
  display: flex;
  gap: 1rem;
  border: 2px solid transparent;
}

.card:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 8px rgba(0, 0, 0, 0.15);
}

.card.compare-mode {
  cursor: pointer;
}

.card.selected {
  border-color: #3498db;
  background: #f0f7ff;
}

.card.disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.card.disabled:hover {
  transform: none;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
}

.checkbox-wrapper {
  display: flex;
  align-items: flex-start;
  padding-top: 0.25rem;
}

.checkbox-wrapper input[type="checkbox"] {
  width: 1.25rem;
  height: 1.25rem;
  cursor: pointer;
}

.checkbox-wrapper input[type="checkbox"]:disabled {
  cursor: not-allowed;
}

.card-content {
  flex: 1;
}

.card-content h2 {
  font-size: 1.25rem;
  margin-bottom: 0.5rem;
}

.meta {
  color: #666;
  font-size: 0.875rem;
  margin-bottom: 0.5rem;
}

.meta .cases {
  margin-right: 1rem;
}

.error-count {
  background: #c0392b;
  color: white;
  padding: 0.1rem 0.4rem;
  border-radius: 3px;
  font-size: 0.75rem;
  font-weight: 600;
}

.git-ref {
  font-family: monospace;
  font-size: 0.75rem;
  background: #f0f0f0;
  padding: 0.1rem 0.3rem;
  border-radius: 3px;
  margin-left: 0.5rem;
}

.git-branch-badge {
  font-size: 0.7rem;
  font-family: monospace;
  color: #888;
  margin-left: 0.25rem;
}

.user-badge {
  font-size: 0.7rem;
  background: #e0edff;
  color: #1e40af;
  padding: 0.1rem 0.35rem;
  border-radius: 3px;
  font-weight: 600;
  margin-left: 0.35rem;
}

.user-badge .shared-icon {
  opacity: 0.7;
  margin-right: 0.1rem;
}

.tag-badge {
  font-size: 0.65rem;
  background: #e8d4f8;
  color: #6b21a8;
  padding: 0.1rem 0.35rem;
  border-radius: 3px;
  font-weight: 500;
  margin-left: 0.35rem;
}

.aggregates {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
}

.aggregate {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  background: #f5f5f5;
  padding: 0.25rem 0.5rem;
  border-radius: 4px;
  font-size: 0.75rem;
}

.aggregate .label {
  color: #666;
}

.aggregate .value {
  font-weight: 600;
  padding: 0.125rem 0.375rem;
  border-radius: 3px;
}

.score-high {
  background: #27ae60;
  color: white;
}

.score-medium {
  background: #f39c12;
  color: white;
}

.score-low {
  background: #c0392b;
  color: white;
}
</style>
