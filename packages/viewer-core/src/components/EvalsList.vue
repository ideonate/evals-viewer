<template>
  <div class="evals-list">
    <div class="header-row">
      <h1>Eval Runs</h1>
      <div v-if="!loading" class="header-controls">
        <div v-if="runs.length > 0" class="group-controls">
          <button
            class="group-btn"
            :class="{ active: groupBy === 'timestamp' }"
            @click="groupBy = 'timestamp'"
          >
            By Time
          </button>
          <button
            class="group-btn"
            :class="{ active: groupBy === 'eval' }"
            @click="groupBy = 'eval'"
          >
            By Eval
          </button>
        </div>
        <div class="compare-controls">
          <button
            v-if="remote.enabled"
            class="refresh-btn"
            :disabled="refreshing"
            :title="`Shared store: ${remote.url}`"
            @click="refreshShared"
          >
            {{ refreshing ? "Syncing…" : "↻ Shared" }}
          </button>
          <template v-if="runs.length > 0">
            <button
              class="toggle-compare-btn"
              :class="{ active: compareMode }"
              @click="toggleCompareMode"
            >
              {{ compareMode ? "Cancel" : "Compare Runs" }}
            </button>
            <button
              v-if="compareMode && selectedForCompare.length >= 2"
              class="compare-btn"
              @click="goToCompare"
            >
              Compare ({{ selectedForCompare.length }})
            </button>
          </template>
        </div>
      </div>
    </div>

    <div v-if="remote.error" class="remote-warning">
      Shared runs unavailable — showing local runs only.
      <span class="remote-detail">{{ remote.error }}</span>
    </div>

    <div v-if="compareMode" class="compare-hint">
      Select 2 or more evals of the same type to compare. Selected:
      {{ selectedForCompare.length }}
    </div>

    <div v-if="loading" class="loading">Loading...</div>
    <div v-else-if="error" class="error">{{ error }}</div>
    <div v-else-if="runs.length === 0" class="empty">
      No eval runs found
      <span v-if="remote.enabled" class="empty-hint">
        Nothing local, and nothing in {{ remote.url }} — run some evals, or hit
        ↻ Shared to check the store again.
      </span>
    </div>

    <template v-else>
      <!-- By Time: each run is a group -->
      <template v-if="groupBy === 'timestamp'">
        <div v-for="run in runs" :key="run.run_id" class="eval-group">
          <div class="group-header">
            <span class="group-title">{{ formatDate(run.timestamp) }}</span>
            <span
              v-if="run.git_commit"
              class="git-badge"
              :title="run.git_branch || ''"
            >
              <span class="git-icon">⎇</span>
              {{ run.git_commit }}{{ run.git_dirty ? "*" : "" }}
              <span v-if="run.git_branch" class="git-branch">{{
                run.git_branch
              }}</span>
            </span>
            <span v-if="run.user" class="user-badge">
              <span v-if="run.shared" class="shared-icon" title="Shared run"
                >☁</span
              >
              {{ run.user }}
            </span>
            <span
              v-for="tag in run.tags"
              :key="tag"
              class="tag-badge"
              :class="{ 'user-tag': (run.user_tags || []).includes(tag) }"
            >
              {{ tag }}
              <button
                v-if="(run.user_tags || []).includes(tag)"
                class="tag-remove"
                title="Remove tag"
                @click.stop="removeTag(run, tag)"
              >
                &times;
              </button>
            </span>
            <span v-if="taggingRunId === run.run_id" class="tag-input-wrap">
              <input
                ref="tagInputEl"
                v-model="tagInput"
                class="tag-input"
                placeholder="tag name"
                @keydown.enter="submitTag(run)"
                @keydown.escape="cancelTagging"
                @blur="submitTag(run)"
              />
            </span>
            <button
              v-else
              class="add-tag-btn"
              title="Add tag"
              @click.stop="startTagging(run)"
            >
              +
            </button>
            <button
              v-if="run.can_share"
              class="share-run-btn"
              :disabled="sharingRunId === run.run_id"
              :title="`Push this run to ${remote.url} so colleagues can see it`"
              @click.stop="shareRun(run)"
            >
              {{ sharingRunId === run.run_id ? "Sharing…" : "↑ Share" }}
            </button>
            <button
              v-else-if="run.can_unshare"
              class="share-run-btn"
              :disabled="sharingRunId === run.run_id"
              title="Remove this run from the shared store, keeping your copy"
              @click.stop="unshareRun(run)"
            >
              {{ sharingRunId === run.run_id ? "Unsharing…" : "Unshare" }}
            </button>
            <button
              v-if="run.can_delete !== false"
              class="delete-run-btn"
              title="Delete this run"
              @click.stop="confirmDelete(run)"
            >
              &times;
            </button>
          </div>
          <div class="cards">
            <eval-card
              v-for="ev in run.evals"
              :key="ev.name"
              :item="ev"
              :run-id="run.run_id"
              :compare-mode="compareMode"
              :is-selected="isSelected(run.run_id, ev.name)"
              :can-select="canSelect(ev)"
              @click="handleCardClick(run, ev, $event)"
              @toggle="toggleSelection(run.run_id, ev)"
            />
          </div>
        </div>
      </template>

      <!-- By Eval: group across runs by eval name -->
      <template v-else>
        <div
          v-for="group in groupedByEval"
          :key="group.evalName"
          class="eval-group"
        >
          <div class="group-header">
            <span class="group-title">{{ group.evalName }}</span>
          </div>
          <div class="cards">
            <eval-card
              v-for="entry in group.entries"
              :key="`${entry.runId}/${entry.eval.name}`"
              :item="entry.eval"
              :run-id="entry.runId"
              :run-timestamp="entry.timestamp"
              :git-commit="entry.gitCommit"
              :git-branch="entry.gitBranch"
              :git-dirty="entry.gitDirty"
              :user="entry.user"
              :shared="entry.shared"
              :tags="entry.tags"
              show-timestamp-only
              :compare-mode="compareMode"
              :is-selected="isSelected(entry.runId, entry.eval.name)"
              :can-select="canSelect(entry.eval)"
              @click="
                handleCardClick({ run_id: entry.runId }, entry.eval, $event)
              "
              @toggle="toggleSelection(entry.runId, entry.eval)"
            />
          </div>
        </div>
      </template>
    </template>

    <!-- Delete confirmation modal -->
    <Teleport to="body">
      <div
        v-if="runToDelete"
        class="modal-overlay"
        @click.self="runToDelete = null"
      >
        <div class="modal-box">
          <div class="modal-header">
            <h3>Delete Run</h3>
            <button class="modal-close" @click="runToDelete = null">
              &times;
            </button>
          </div>
          <div class="modal-body">
            <p>
              Delete run from
              <strong>{{ formatDate(runToDelete.timestamp) }}</strong
              >?
            </p>
            <p class="modal-detail">
              {{ evalCountLabel(runToDelete) }} will be removed permanently.
            </p>
            <!-- A shared run is deleted for the whole team, which the run list
                 gives no hint of. Say so before it happens, not after. -->
            <p v-if="runToDelete.shared" class="modal-warning">
              This run is shared. Deleting removes it from
              <code>{{ remote.url }}</code> for everyone — colleagues lose their
              copy at their next refresh — as well as deleting yours.
            </p>
            <p v-if="runToDelete.shared" class="modal-detail">
              To take it out of the shared store but keep your own results, use
              <strong>Unshare</strong> instead.
            </p>
            <p v-else class="modal-detail">
              This run is local — only your copy goes.
            </p>
          </div>
          <div class="modal-footer">
            <button class="modal-cancel" @click="runToDelete = null">
              Cancel
            </button>
            <button class="modal-confirm" @click="deleteRun">Delete</button>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<script>
// Module-level: survives component unmount/remount within the SPA session
let rememberedGroupBy = "timestamp";
</script>

<script setup>
import { ref, computed, onMounted, nextTick, watch } from "vue";
import { useRouter } from "vue-router";
import EvalCard from "./EvalCard.vue";
import { useRemoteStatus } from "../composables/useRemoteStatus.js";

const router = useRouter();

const runs = ref([]);
const loading = ref(true);
const error = ref(null);
const compareMode = ref(false);
// Each entry is "runId:evalName"
const selectedForCompare = ref([]);
const groupBy = ref(rememberedGroupBy);
watch(groupBy, (v) => (rememberedGroupBy = v));
const runToDelete = ref(null);
const sharingRunId = ref(null);
// Shared object store, when the server has one configured. `enabled: false`
// keeps every v-if in the template quiet for a purely local setup. Shared with
// the app header, which shows the same identity.
const {
  status: remote,
  refresh: refreshRemoteStatus,
  syncNow,
} = useRemoteStatus();
const refreshing = ref(false);

async function fetchRuns() {
  try {
    const response = await fetch("/api/evals");
    if (!response.ok) throw new Error("Failed to fetch evals");
    runs.value = await response.json();
  } catch (e) {
    error.value = e.message;
  } finally {
    loading.value = false;
  }
}

async function refreshShared() {
  refreshing.value = true;
  try {
    await syncNow();
    await fetchRuns();
  } catch (e) {
    error.value = e.message;
  } finally {
    refreshing.value = false;
  }
}

const groupedByEval = computed(() => {
  const groups = {};
  for (const run of runs.value) {
    for (const ev of run.evals) {
      if (!groups[ev.name]) {
        groups[ev.name] = [];
      }
      groups[ev.name].push({
        runId: run.run_id,
        timestamp: run.timestamp,
        gitCommit: run.git_commit,
        gitBranch: run.git_branch,
        gitDirty: run.git_dirty,
        user: run.user,
        shared: run.shared,
        tags: run.tags,
        eval: ev,
      });
    }
  }
  // Sort entries within each group by run timestamp (newest first)
  for (const entries of Object.values(groups)) {
    entries.sort((a, b) => {
      if (a.timestamp && b.timestamp) {
        return new Date(b.timestamp) - new Date(a.timestamp);
      }
      return b.runId.localeCompare(a.runId);
    });
  }
  // Sort groups by most recent entry
  return Object.entries(groups)
    .map(([evalName, entries]) => ({ evalName, entries }))
    .sort((a, b) => {
      const aTime = a.entries[0]?.timestamp;
      const bTime = b.entries[0]?.timestamp;
      if (aTime && bTime) return new Date(bTime) - new Date(aTime);
      return a.evalName.localeCompare(b.evalName);
    });
});

function evalCountLabel(run) {
  const n = run.evals.length;
  return `${n} eval${n === 1 ? "" : "s"}`;
}

function formatDate(timestamp) {
  if (!timestamp) return "Unknown date";
  return new Date(timestamp).toLocaleString();
}

function makeKey(runId, evalName) {
  return `${runId}:${evalName}`;
}

const selectedEvalType = computed(() => {
  if (selectedForCompare.value.length === 0) return null;
  return selectedForCompare.value[0].split(":")[1];
});

function canSelect(ev) {
  if (selectedForCompare.value.length === 0) return true;
  return ev.name === selectedEvalType.value;
}

function isSelected(runId, evalName) {
  return selectedForCompare.value.includes(makeKey(runId, evalName));
}

function toggleSelection(runId, ev) {
  const key = makeKey(runId, ev.name);
  const idx = selectedForCompare.value.indexOf(key);
  if (idx === -1) {
    if (canSelect(ev)) {
      selectedForCompare.value.push(key);
    }
  } else {
    selectedForCompare.value.splice(idx, 1);
  }
}

function toggleCompareMode() {
  compareMode.value = !compareMode.value;
  if (!compareMode.value) {
    selectedForCompare.value = [];
  }
}

function handleCardClick(run, ev, event) {
  if (compareMode.value) {
    if (canSelect(ev)) {
      toggleSelection(run.run_id, ev);
    }
  } else {
    router.push(`/eval/${run.run_id}/${ev.name}`);
  }
}

function goToCompare() {
  if (selectedForCompare.value.length >= 2) {
    const params = selectedForCompare.value.join(",");
    router.push(`/compare?runs=${encodeURIComponent(params)}`);
  }
}

const taggingRunId = ref(null);
const tagInput = ref("");
const tagInputEl = ref(null);

async function startTagging(run) {
  taggingRunId.value = run.run_id;
  tagInput.value = "";
  await nextTick();
  if (tagInputEl.value) {
    const el = Array.isArray(tagInputEl.value)
      ? tagInputEl.value[0]
      : tagInputEl.value;
    el?.focus();
  }
}

function cancelTagging() {
  taggingRunId.value = null;
  tagInput.value = "";
}

async function submitTag(run) {
  const tag = tagInput.value.trim();
  taggingRunId.value = null;
  tagInput.value = "";
  if (!tag) return;

  try {
    const response = await fetch(
      `/api/evals/${encodeURIComponent(run.run_id)}/tags`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tag }),
      },
    );
    if (!response.ok) throw new Error("Failed to add tag");
    const { tags: userTags } = await response.json();
    // Update the run in place
    if (!run.user_tags) run.user_tags = [];
    run.user_tags = userTags;
    if (!run.tags.includes(tag)) {
      run.tags.push(tag);
    }
  } catch (e) {
    error.value = e.message;
  }
}

async function removeTag(run, tag) {
  try {
    const response = await fetch(
      `/api/evals/${encodeURIComponent(run.run_id)}/tags/${encodeURIComponent(tag)}`,
      { method: "DELETE" },
    );
    if (!response.ok) throw new Error("Failed to remove tag");
    const { tags: userTags } = await response.json();
    run.user_tags = userTags;
    run.tags = run.tags.filter((t) => t !== tag);
  } catch (e) {
    error.value = e.message;
  }
}

async function shareRun(run) {
  sharingRunId.value = run.run_id;
  try {
    const response = await fetch(
      `/api/evals/${encodeURIComponent(run.run_id)}/share`,
      { method: "POST" },
    );
    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      throw new Error(body.error || "Failed to share run");
    }
    // Re-list rather than patching the row: sharing flips can_share/can_delete
    // and the shared badge, all of which the server decides.
    await fetchRuns();
  } catch (e) {
    error.value = e.message;
  } finally {
    sharingRunId.value = null;
  }
}

async function unshareRun(run) {
  sharingRunId.value = run.run_id;
  try {
    const response = await fetch(
      `/api/evals/${encodeURIComponent(run.run_id)}/share`,
      { method: "DELETE" },
    );
    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      throw new Error(body.error || "Failed to unshare run");
    }
    await fetchRuns();
  } catch (e) {
    error.value = e.message;
  } finally {
    sharingRunId.value = null;
  }
}

function confirmDelete(run) {
  runToDelete.value = run;
}

async function deleteRun() {
  const run = runToDelete.value;
  if (!run) return;
  runToDelete.value = null;
  try {
    const response = await fetch(
      `/api/evals/${encodeURIComponent(run.run_id)}`,
      {
        method: "DELETE",
      },
    );
    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      throw new Error(body.error || "Failed to delete run");
    }
    runs.value = runs.value.filter((r) => r.run_id !== run.run_id);
  } catch (e) {
    error.value = e.message;
  }
}

onMounted(async () => {
  // Listing the runs is what refreshes the shared-store index, so re-read the
  // status afterwards — otherwise it always reports zero runs on first paint.
  await fetchRuns();
  await refreshRemoteStatus({ force: true });
});
</script>

<style scoped>
.header-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 1.5rem;
}

.header-row h1 {
  margin: 0;
}

.header-controls {
  display: flex;
  gap: 1rem;
  align-items: center;
}

.group-controls {
  display: flex;
  border: 1px solid #ccc;
  border-radius: 6px;
  overflow: hidden;
}

.group-btn {
  padding: 0.4rem 0.75rem;
  border: none;
  background: white;
  color: #666;
  cursor: pointer;
  font-size: 0.8rem;
  transition: all 0.2s;
}

.group-btn:not(:last-child) {
  border-right: 1px solid #ccc;
}

.group-btn.active {
  background: #3498db;
  color: white;
}

.group-btn:hover:not(.active) {
  background: #f0f7ff;
}

.compare-controls {
  display: flex;
  gap: 0.5rem;
}

.toggle-compare-btn {
  padding: 0.5rem 1rem;
  border: 1px solid #3498db;
  background: white;
  color: #3498db;
  border-radius: 6px;
  cursor: pointer;
  font-size: 0.875rem;
  transition: all 0.2s;
}

.toggle-compare-btn:hover {
  background: #f0f7ff;
}

.toggle-compare-btn.active {
  background: #3498db;
  color: white;
}

.compare-btn {
  padding: 0.5rem 1rem;
  border: none;
  background: #27ae60;
  color: white;
  border-radius: 6px;
  cursor: pointer;
  font-size: 0.875rem;
  font-weight: 600;
  transition: all 0.2s;
}

.compare-btn:hover {
  background: #219a52;
}

.refresh-btn {
  padding: 0.5rem 0.75rem;
  border: 1px solid #ccc;
  background: white;
  color: #555;
  border-radius: 6px;
  cursor: pointer;
  font-size: 0.875rem;
  transition: all 0.2s;
}

.refresh-btn:hover:not(:disabled) {
  background: #f5f5f5;
}

.refresh-btn:disabled {
  opacity: 0.6;
  cursor: default;
}

.remote-warning {
  background: #fff8e1;
  border: 1px solid #ffe082;
  color: #7a5c00;
  padding: 0.6rem 1rem;
  border-radius: 6px;
  margin-bottom: 1rem;
  font-size: 0.85rem;
}

.remote-detail {
  display: block;
  margin-top: 0.2rem;
  font-family: monospace;
  font-size: 0.75rem;
  opacity: 0.8;
}

.user-badge {
  display: inline-flex;
  align-items: center;
  gap: 0.2rem;
  font-size: 0.75rem;
  background: #e0edff;
  color: #1e40af;
  padding: 0.15rem 0.45rem;
  border-radius: 4px;
  font-weight: 600;
}

.user-badge .shared-icon {
  opacity: 0.7;
}

.compare-hint {
  background: #e8f4fd;
  border: 1px solid #bee5eb;
  color: #0c5460;
  padding: 0.75rem 1rem;
  border-radius: 6px;
  margin-bottom: 1rem;
  font-size: 0.875rem;
}

.loading,
.error,
.empty {
  padding: 2rem;
  text-align: center;
  color: #666;
}

.empty-hint {
  display: block;
  margin-top: 0.5rem;
  font-size: 0.85rem;
  color: #999;
}

.error {
  color: #c0392b;
}

.eval-group {
  margin-bottom: 2rem;
}

.group-header {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  margin-bottom: 0.75rem;
  padding-bottom: 0.5rem;
  border-bottom: 2px solid #e0e0e0;
}

.group-title {
  font-size: 1.1rem;
  font-weight: 600;
  color: #333;
}

.git-badge {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  font-size: 0.75rem;
  font-family: monospace;
  background: #f0f0f0;
  padding: 0.2rem 0.5rem;
  border-radius: 4px;
  color: #555;
}

.git-icon {
  font-size: 0.875rem;
}

.git-branch {
  color: #888;
  margin-left: 0.25rem;
}

.tag-badge {
  display: inline-flex;
  align-items: center;
  gap: 0.2rem;
  font-size: 0.7rem;
  background: #e8d4f8;
  color: #6b21a8;
  padding: 0.15rem 0.4rem;
  border-radius: 3px;
  font-weight: 500;
}

.tag-badge.user-tag {
  background: #d1fae5;
  color: #065f46;
}

.tag-remove {
  background: none;
  border: none;
  color: inherit;
  font-size: 0.8rem;
  line-height: 1;
  cursor: pointer;
  padding: 0;
  opacity: 0.5;
}

.tag-remove:hover {
  opacity: 1;
}

.add-tag-btn {
  background: none;
  border: 1px dashed #ccc;
  color: #999;
  font-size: 0.75rem;
  line-height: 1;
  cursor: pointer;
  padding: 0.1rem 0.35rem;
  border-radius: 3px;
  transition: all 0.15s;
}

.add-tag-btn:hover {
  border-color: #6b21a8;
  color: #6b21a8;
  background: #f5f0ff;
}

.tag-input-wrap {
  display: inline-flex;
}

.tag-input {
  font-size: 0.7rem;
  padding: 0.15rem 0.4rem;
  border: 1px solid #6b21a8;
  border-radius: 3px;
  outline: none;
  width: 80px;
  font-family: inherit;
}

.cards {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
  gap: 1rem;
}

.share-run-btn {
  margin-left: auto;
  background: none;
  border: 1px solid #b8c6d4;
  color: #4a6a8a;
  font-size: 0.7rem;
  line-height: 1;
  cursor: pointer;
  padding: 0.2rem 0.5rem;
  border-radius: 4px;
  transition: all 0.15s;
}

.share-run-btn:hover:not(:disabled) {
  border-color: #3498db;
  color: #1e6fa8;
  background: #f0f7ff;
}

.share-run-btn:disabled {
  opacity: 0.6;
  cursor: default;
}

/* When Share is present it takes the spacer role, so Delete sits next to it. */
.share-run-btn + .delete-run-btn {
  margin-left: 0;
}

.delete-run-btn {
  margin-left: auto;
  background: none;
  border: 1px solid transparent;
  color: #999;
  font-size: 1.1rem;
  line-height: 1;
  cursor: pointer;
  padding: 0.1rem 0.4rem;
  border-radius: 4px;
  transition: all 0.15s;
}

.delete-run-btn:hover {
  color: #c0392b;
  border-color: #c0392b;
  background: #fdf0ef;
}

.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.4);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.modal-box {
  background: #fff;
  border-radius: 8px;
  width: min(90vw, 400px);
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.2);
}

.modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.75rem 1rem;
  border-bottom: 1px solid #e0e0e0;
}

.modal-header h3 {
  margin: 0;
  font-size: 1rem;
}

.modal-close {
  background: none;
  border: none;
  font-size: 1.5rem;
  cursor: pointer;
  color: #666;
  line-height: 1;
}

.modal-body {
  padding: 1rem;
}

.modal-body p {
  margin: 0 0 0.5rem;
}

.modal-detail {
  color: #666;
  font-size: 0.875rem;
}

.modal-warning {
  background: #fff5f5;
  border: 1px solid #f3c9c4;
  color: #8a2a20;
  padding: 0.6rem 0.75rem;
  border-radius: 6px;
  font-size: 0.85rem;
  margin: 0 0 0.5rem;
}

.modal-warning code {
  font-size: 0.8rem;
  background: rgba(0, 0, 0, 0.05);
  padding: 0.05rem 0.25rem;
  border-radius: 3px;
  word-break: break-all;
}

.modal-footer {
  display: flex;
  justify-content: flex-end;
  gap: 0.5rem;
  padding: 0.75rem 1rem;
  border-top: 1px solid #e0e0e0;
}

.modal-cancel {
  padding: 0.4rem 0.75rem;
  border: 1px solid #ccc;
  background: white;
  border-radius: 4px;
  cursor: pointer;
  font-size: 0.85rem;
}

.modal-cancel:hover {
  background: #f5f5f5;
}

.modal-confirm {
  padding: 0.4rem 0.75rem;
  border: none;
  background: #c0392b;
  color: white;
  border-radius: 4px;
  cursor: pointer;
  font-size: 0.85rem;
  font-weight: 600;
}

.modal-confirm:hover {
  background: #a93226;
}
</style>
