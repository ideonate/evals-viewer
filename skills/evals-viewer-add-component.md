---
name: evals-viewer-add-component
description: Use when the user wants to add a new custom inspector or compare view for an evals-viewer eval type. Triggers on phrases like "add an inspector for X eval," "create a custom view for Y," "I need a comparison view for Z," "scaffold a viewer for the new my_eval results."
---

# Adding an inspector or compare component

The user wants a new Vue component for displaying one specific eval's case data. Your job is to scaffold the wiring; the user fills in the actual rendering of their domain-specific output fields.

## Hard rules

1. **Confirm naming first.** The filename *is* the registration — `src/inspectors/foo_bar.vue` registers an inspector for the eval named `foo_bar`. The eval name must match exactly what the writer side produces (the directory name under `{resultsDir}/{runId}/`). If unsure, look at existing eval results on disk or ask.
2. **Don't invent the output schema.** You don't know what fields the user's eval emits. Scaffold the layout, leave clearly-marked TODOs in the template body, and ask the user to describe the schema if they want help filling it in.
3. **Check that the project is set up first.** Look for `src/registry.js` and `src/inspectors/` (or `src/compares/`). If they're missing, suggest running the `evals-viewer-init` skill first instead of creating these dirs ad hoc.

## Step 1: Discovery

Read or list:
- `src/registry.js` — confirm it uses `inspectorsFromGlob` and globs `./inspectors/*.vue` and `./compares/*.vue`. If not, the auto-registration won't work and you should fix `registry.js` (or alert the user).
- `src/inspectors/` and `src/compares/` — what's already there, so you don't clobber and can match the local style.
- If a sample case JSON is available (e.g. under `tests/test-results/evals/{some_run}/{eval_name}/outputs/{case}.json`), read one to learn the actual output shape. This is the single most useful thing you can do — it converts a guess into a concrete TODO.

## Step 2: Confirm with the user

Ask (in one message):
1. What's the **exact eval name** (snake_case, must match the directory name produced by the writer)?
2. Inspector, compare, or both?
3. Briefly: what does the case output look like? (Or: is there an example JSON I should read?)

## Step 3: Scaffold an inspector

Create `src/inspectors/{eval_name}.vue`:

```vue
<template>
  <CaseInspectorLayout v-bind="layoutProps">
    <template #meta>
      <span class="badge">{{ evalName }}</span>
    </template>

    <!-- TODO: render fields from caseData.output.
         Available on caseData:
           - output         (the case output JSON)
           - caseInput      (optional input fixture)
           - scores         (per-evaluator numeric scores)
           - judgeReasons   (per-evaluator LLM judge text)
           - questionScores (optional per-question scores)
           - integrity      (optional integrity check results)
    -->
    <pre class="placeholder">{{ caseData.output }}</pre>
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
  font-size: 0.8rem;
  font-weight: 600;
}
.placeholder {
  background: #f8f9fa;
  padding: 1rem;
  border-radius: 6px;
  font-size: 0.8rem;
  white-space: pre-wrap;
}
</style>
```

If the user described the output schema (or you read a sample JSON), replace the `<pre>` placeholder with a sketch of the rendering — but **leave clear TODO comments** marking anything you guessed at, so the user can verify before relying on it.

## Step 4: Scaffold a compare view (if requested)

Create `src/compares/{eval_name}.vue`:

```vue
<template>
  <CaseCompareView>
    <template #comparison="{ casesData, getRunColor, evalType }">
      <!-- TODO: render a per-question or per-section comparison across runs.
           casesData is an array of { runId, runName, output, scores, ... } —
           one entry per run being compared. getRunColor(idx) returns a stable
           colour for run idx. The default CaseCompareView already renders the
           top-level score bars and the per-run inspector tabs at the bottom;
           this slot is the middle "domain-specific" region. -->
      <div class="placeholder">
        TODO: render comparison for {{ evalType }} across
        {{ casesData.length }} runs.
      </div>
    </template>
  </CaseCompareView>
</template>

<script setup>
import { CaseCompareView } from "@evals-viewer/core";
</script>

<style scoped>
.placeholder {
  background: #fff3cd;
  border: 1px solid #ffc107;
  padding: 1rem;
  border-radius: 6px;
  margin-bottom: 1.5rem;
}
</style>
```

## Step 5: Confirm to user

Tell the user:

> Created `src/inspectors/{eval_name}.vue`. No registration step needed — the glob in `src/registry.js` picks it up automatically. Refresh the dev server and visit any case of the `{eval_name}` eval to see it.
>
> The current rendering is a placeholder. To wire up the real fields, [show me a sample case JSON / tell me the output schema] and I can fill in the template.

## Notes

- **Do not edit `src/registry.js`.** Auto-registration via glob means there's nothing to register. If you find yourself wanting to edit `registry.js`, you've misunderstood — stop and re-read this skill.
- **Inspector name must match the eval directory name exactly.** `interview_agent.vue` matches an eval named `interview_agent`. Camel-case, dashes, and typos all fail silently — the viewer will fall back to `GenericCaseInspector` and the user will be confused.
- **Don't extract reusable sub-components prematurely.** If the user later asks for a second inspector that wants a similar layout, *then* consider extracting. One-off duplication is cheaper than a wrong abstraction.
