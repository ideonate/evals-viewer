# @ideonate/evals-viewer-core

Reusable Vue 3 components, composables, and a router/registry factory for the [**evals-viewer**](https://github.com/ideonate/evals-viewer) framework — a lightweight, configurable viewer for LLM evaluation results.

This package contains the JS/Vue side of the framework. Pair it with [`@ideonate/evals-viewer-server`](https://www.npmjs.com/package/@ideonate/evals-viewer-server) for the filesystem-backed Vite plugin that serves eval result data, and (optionally) the Python [`evals-viewer-io`](https://github.com/ideonate/evals-viewer/tree/main/packages/pydantic-evals-io) package for writing those results from your test suite.

## Install

```sh
npm install @ideonate/evals-viewer-core @ideonate/evals-viewer-server vue vue-router
npm install -D vite @vitejs/plugin-vue
```

## Quickstart

```js
// src/main.js
import { createApp, h } from "vue";
import {
  AppShell,
  createEvalsRouter,
  installInspectors,
  installCompares,
} from "@ideonate/evals-viewer-core";
import { inspectors, compares } from "./registry.js";

const app = createApp({
  render: () => h(AppShell, { title: "Evals Viewer" }),
});

app.use(createEvalsRouter());
installInspectors(app, inspectors);
installCompares(app, compares);
app.mount("#app");
```

```js
// src/registry.js — auto-discover inspectors and compares from folders
import { inspectorsFromGlob } from "@ideonate/evals-viewer-core";

export const inspectors = inspectorsFromGlob(
  import.meta.glob("./inspectors/*.vue", { eager: true }),
);
export const compares = inspectorsFromGlob(
  import.meta.glob("./compares/*.vue", { eager: true }),
);
```

Drop a file at `src/inspectors/{eval_name}.vue` and it auto-registers as the custom viewer for the `{eval_name}` eval. Same for `src/compares/{eval_name}.vue`. No registration step needed.

## Writing a custom inspector

```vue
<template>
  <CaseInspectorLayout v-bind="layoutProps">
    <template #meta><span>my badge</span></template>
    <pre>{{ caseData.output }}</pre>
  </CaseInspectorLayout>
</template>

<script setup>
import { computed } from "vue";
import { CaseInspectorLayout, useCaseInspector } from "@ideonate/evals-viewer-core";

const { loading, error, caseData, runId, evalName, caseName } = useCaseInspector();
const layoutProps = computed(() => ({
  runId: runId.value,
  evalName: evalName.value,
  caseName: caseName.value,
  loading: loading.value,
  error: error.value,
  caseData: caseData.value,
}));
</script>
```

`caseData` exposes `output`, `caseInput`, `scores`, `judgeReasons`, `questionScores`, `integrity`, plus any extras returned by your `caseDataLoader` hook on the server side.

## Public API

```js
import {
  // App shell + routing
  AppShell,
  createEvalsRouter,

  // Registry installation
  installInspectors,
  installCompares,
  inspectorsFromGlob,

  // Composable for inspector components
  useCaseInspector,
  CASE_INSPECTOR_DATA,

  // Layouts and base components
  CaseInspectorLayout,
  GenericCaseInspector,
  InspectorProvider,
  CaseCompareView,

  // Generic views
  EvalsList,
  EvalDetail,
  CompareEvals,

  // Helpers
  formatEvaluatorName,
  formatPercent,
  getScoreClass,
  formatDate,
} from "@ideonate/evals-viewer-core";
```

## Documentation

- **Full README + repo:** https://github.com/ideonate/evals-viewer
- **On-disk data contract:** [`docs/data-layout.md`](https://github.com/ideonate/evals-viewer/blob/main/docs/data-layout.md)
- **Claude Code skills** for scaffolding consumer projects: [`skills/`](https://github.com/ideonate/evals-viewer/tree/main/skills)

## License

MIT
